# Loyalty Data Anomaly Rules (Mapping_id_Calc_of_points_OL — Step 1)

This document is the authoritative description of the 9 anomaly checks run by the
platform. It is used both as human documentation and as a knowledge source for the
RAG pipeline that powers the AI explanation/Q&A agents.

Each rule below lists: what it validates, the sheets/columns involved, why it matters,
how an anomaly is detected, and how to remediate it.

---

## C1 — Column Completeness Check
- **Sheet:** `Order_line_item`
- **Columns:** `order_line_number`, `member_id`, `order_line_step_code`, `points_left_to_redeem`, `total_redeemable_points`, `load_date`
- **Rule:** None of these critical columns may contain a blank or NULL value.
- **Why it matters:** These columns are mandatory keys/measures for downstream points
  calculation. A missing key (e.g. `member_id`, `order_line_number`) breaks joins; a
  missing measure breaks point totals.
- **Detection:** For every row, each critical column is tested with `isBlank` (null,
  undefined, empty string, or the literal text "null"). Each violation is reported with
  its exact row and column (A1 cell reference).
- **Remediation:** Backfill the missing value at source, or exclude the record if it is
  invalid. Investigate the ETL step that produced the NULL.

## C2 — Manual vs System Points Match
- **Sheets:** `Order_line_item` (manual) vs `Transaction_History` (system)
- **Columns:** `total_redeemable_points`, keyed by `member_id`
- **Rule:** The manually-entered `total_redeemable_points` in `Order_line_item` must equal
  the system-calculated total for the same `member_id` from `Transaction_History`.
- **Why it matters:** A mismatch means the member's redeemable balance shown to the
  business differs from what the system computed — a financial/points integrity risk.
- **Detection:** Build a map of `member_id -> total_redeemable_points` from
  `Transaction_History`, then compare each `Order_line_item` row's value to it.
- **Remediation:** Reconcile the calculation logic; determine whether the manual figure or
  the system figure is correct, and correct the erroneous source.

## C3 — Order Line Step Code Validation
- **Sheet:** `Order_line_item`
- **Column:** `order_line_step_code`
- **Rule:** Value must be exactly one of `post`, `cncl`, or `open` (case-insensitive).
- **Why it matters:** Step code drives lifecycle logic (posted/cancelled/open). An unknown
  code can cause records to be skipped or mis-handled downstream.
- **Detection:** Normalize to lowercase and check membership in the allowed set.
- **Remediation:** Map the offending value to a valid code or fix the upstream enumeration.

## C4 — Points Left to Redeem Match
- **Sheets:** `Order_line_item` vs `Transaction_History`
- **Column:** `points_left_to_redeem`, keyed by `order_line_number`
- **Rule:** `points_left_to_redeem` on the order line must equal the value in
  `Transaction_History` for the same `order_line_number`.
- **Why it matters:** PLTR is the remaining redeemable balance; a mismatch indicates the
  ledger and the order line have diverged.
- **Detection:** Map `order_line_number -> points_left_to_redeem` from
  `Transaction_History` and compare against the order line value.
- **Remediation:** Investigate redemption postings; reconcile the two systems.

## C5 — Business Unit Description Check
- **Sheet:** `Order_line_item`
- **Columns:** `business_unit_description`, `order_line_step_code`, `gl_cost_center_code`
- **Rule:** For posted orders (`order_line_step_code = post`) that have a
  `gl_cost_center_code`, `business_unit_description` must not be blank. (It may legitimately
  be blank for `open`/`cncl` lines with a blank `gl_cost_center_code`.)
- **Why it matters:** Posted financial lines need a business unit for cost allocation and
  reporting.
- **Detection:** For each posted row with a non-blank GL code, flag a blank
  `business_unit_description`.
- **Remediation:** Populate the business unit description from the GL/cost-center mapping.

## C6 — Non-Earning Records Dormant Check
- **Sheets:** `Loyalty_Account` (dormant flags) and `Transaction_History` (non-earning flags)
- **Columns:** `mktcls_modified`, `dormant_account_flag`, keyed by `member_id`/`loyalty_id`
- **Rule:** Non-earning records (`mktcls_modified = 1`) should only be mapped to dormant
  accounts (`dormant_account_flag = 1`). For non-dormant accounts, `mktcls_modified` should
  be 0 or NULL.
- **Why it matters:** Marking active accounts as non-earning suppresses point accrual they
  are entitled to.
- **Detection:** Build `loyalty_id -> dormant_account_flag` from `Loyalty_Account`; for each
  non-earning transaction, verify the mapped account is dormant.
- **Remediation:** Re-evaluate the non-earning classification for the flagged accounts.

## C7 — Date of Transaction NULL Check (informational)
- **Sheet:** `Order_line_item`
- **Column:** `date_of_transaction`
- **Rule:** Records with NULL `date_of_transaction` are *ineligible*; NOT NULL are
  *eligible/mapped*. The identity B − C = D should hold (Total − Ineligible = Eligible).
- **Why it matters:** Confirms the eligible/ineligible split reconciles with the totals.
- **Detection:** Count NULL vs NOT NULL; list the ineligible rows with cell references.
- **Remediation:** Informational — use to validate the eligibility split.

## C8 — Scheduler Count vs Output Count (informational)
- **Sheet:** `Transaction_History`
- **Column:** `scheduler_processed` (if present)
- **Rule:** The count from scheduler logs (A) should equal the output count (D); B − C = D.
- **Why it matters:** Detects records that were produced outside a scheduled run.
- **Detection:** If `scheduler_processed` exists, count linked vs unlinked rows; otherwise
  reports that the column is not present.
- **Remediation:** Investigate unlinked records / scheduler configuration.

## C9 — Run Date Consistency Check
- **Sheet:** `Order_line_item`
- **Column:** `load_date`
- **Rule:** All records should share the same load/run date (the previous day's job run
  date). Rows whose `load_date` differs from the most recent date are flagged.
- **Why it matters:** A single daily run should produce one load date; stragglers indicate
  late or duplicated loads.
- **Detection:** Determine the latest `load_date`; flag any row with a different non-blank
  `load_date`.
- **Remediation:** Investigate late-arriving or back-dated records.

---

## Status semantics
- **pass** — no violations found.
- **fail** — one or more hard violations (C1–C6).
- **warning** — a soft inconsistency or missing prerequisite sheet (e.g. C9, or required
  sheet absent).
- **info** — informational reconciliation output (C7, C8).
