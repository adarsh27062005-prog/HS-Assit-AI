# Master Tables — Data Dictionary

Reference for the sheets and columns in `Master_Tables.xlsx`, used by the anomaly checks
and the RAG knowledge base. Note: the Transaction History sheet is sometimes spelled
`Traansaction_History` (double "a") in source files; the platform accepts both spellings.

## Sheet: `Order_line_item` (OLI)
The manual/order-side table. One row per order line.

| Column | Meaning |
|---|---|
| `order_line_number` | Unique identifier of the order line. Join key to Transaction_History. |
| `member_id` | Loyalty member identifier. Join key to Transaction_History / Loyalty_Account. |
| `order_line_step_code` | Lifecycle code: `post` (posted), `cncl` (cancelled), `open`. |
| `points_left_to_redeem` | Remaining redeemable points (PLTR) on this line. |
| `total_redeemable_points` | Manually-entered total redeemable points. |
| `date_of_transaction` | Transaction date; NULL means an ineligible record. |
| `business_unit_description` | Business unit / cost-center description for posted lines. |
| `gl_cost_center_code` | GL cost center code; present on posted financial lines. |
| `order_type` | Order classification. |
| `load_date` | ETL load / job run date (expected to equal the previous day). |

## Sheet: `Transaction_History` (TH)  (a.k.a. `Traansaction_History`)
The system-side ledger. Source of system-calculated values.

| Column | Meaning |
|---|---|
| `member_id` | Loyalty member identifier. |
| `transaction_id` | Unique transaction identifier. |
| `order_line_number` | Join key back to Order_line_item. |
| `points` | Points for the transaction. |
| `points_left_to_redeem` | System-calculated remaining redeemable points. |
| `total_redeemable_points` | System-calculated total redeemable points (per member). |
| `date_of_transaction` | Transaction date. |
| `business_unit_description` | Business unit description. |
| `mktcls_modified` | Non-earning flag (1 = non-earning record). |
| `dormant_account_flag` | Dormant account flag (mirrored from Loyalty_Account). |
| `scheduler_processed` | Marker linking the row to a scheduler run (optional). |

## Sheet: `Loyalty_Account` (LA)
Account master, source of dormancy status.

| Column | Meaning |
|---|---|
| `loyalty_id` | Loyalty account identifier (maps to member_id). |
| `mktcls_modified` | Non-earning flag (1 = non-earning). |
| `dormant_account_flag` | 1 = dormant account, 0 = active. |
| `business_unit_description` | Business unit description. |

## Row/Cell referencing
- Data rows start at Excel row 2 (row 1 is the header). The platform reports each anomaly
  with a 1-based Excel row number and an A1-style cell reference such as
  `Order_line_item!D45` (sheet name + column letter + row number).
