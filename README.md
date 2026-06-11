# Anomaly Intelligence — Loyalty Data Anomaly Checker

AI-powered data-quality platform for the `Mapping_id_Calc_of_points_OL` (Step 1) Master
Tables workbook. Upload the daily `.xlsx`, run all 9 anomaly checks, see the **exact row,
column, and cell** of every problem, and ask an **AI assistant** (Groq + local RAG) to
explain and remediate findings — all inside a WebGL-driven UI.

## What's inside

1. **Cell-level anomaly detection** — every issue reports the sheet, column, A1 cell
   reference (e.g. `Order_line_item!F47`), the offending value, and a plain-English issue.
2. **AI agents + RAG** — a retrieval-augmented pipeline grounded in `knowledge/*.md`:
   - **Explainer agent** (`/api/explain`) — root cause, business impact, and fix per check.
   - **Chat assistant** (`/api/chat`) — streaming Q&A about your report and the rules.
   - **Embeddings run locally** (Transformers.js, no key); **Groq** powers generation.
3. **High-graphics UI** — animated Three.js shader background, Framer Motion transitions,
   Lenis smooth scrolling, a custom cursor, animated counters, and glassmorphism.

## Tech stack

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- `xlsx` for parsing · `three` for WebGL · `framer-motion` · `lenis`
- `groq-sdk` (LLM) · `@huggingface/transformers` (local embeddings)

## Prerequisites

- Node.js 18.18+ (or 20+ recommended)
- A free Groq API key: https://console.groq.com/keys

## Run locally in VS Code

```powershell
# 1. From the project root
cd C:\project\anomaly-checker

# 2. Install dependencies (already done if you followed setup)
npm install

# 3. Configure your key
#    Copy .env.example to .env.local and paste your Groq key:
#    GROQ_API_KEY=gsk_...
#    (.env.local is git-ignored)

# 4. Start the dev server
npm run dev
```

Open http://localhost:3000 and upload your `Master_Tables.xlsx`.

> **First AI call note:** the first time you use "Explain with AI" or the chat, the local
> embedding model (~90 MB) downloads once and is cached. That first request can take
> 10–60s; subsequent calls are fast. If the model can't load, retrieval automatically
> falls back to keyword search so chat still works.

Recommended VS Code extensions: **ESLint**, **Tailwind CSS IntelliSense**, **Prettier**.

## Project structure

```
app/
  page.tsx                # Orchestrates hero, upload, report, chat
  layout.tsx              # Mounts WebGL background, smooth scroll, cursor
  globals.css             # Dark theme, glass, cursor, scrollbar
  api/
    analyze/route.ts      # Parse xlsx + run 9 checks
    explain/route.ts      # AI explanation for one check
    chat/route.ts         # Streaming RAG chat
components/
  UploadZone, ReportView, ChatPanel, CustomCursor, SmoothScroll, AnimatedCounter
  webgl/ShaderBackground.tsx
lib/
  parseExcel.ts           # xlsx -> rows + column-letter maps
  anomalyChecks.ts        # The 9 checks (C1–C9)
  rag/                    # embeddings, vectorStore, knowledge loader, retriever
  agents/                 # groq client, prompts, explain + chat agents
knowledge/                # RAG source: anomaly-rules.md, data-dictionary.md
types/index.ts            # Shared types
```

## The 9 checks

| ID | Check | Sheet(s) |
|----|-------|----------|
| C1 | Column completeness (no blank/NULL) | Order_line_item |
| C2 | Manual vs system total redeemable points | OLI vs Transaction_History |
| C3 | Step code ∈ {post, cncl, open} | Order_line_item |
| C4 | Points-left-to-redeem match | OLI vs Transaction_History |
| C5 | Business unit description for posted orders | Order_line_item |
| C6 | Non-earning records only for dormant accounts | Loyalty_Account / TH |
| C7 | Date-of-transaction NULL split (info) | Order_line_item |
| C8 | Scheduler vs output count (info) | Transaction_History |
| C9 | Run-date consistency | Order_line_item |

See `knowledge/anomaly-rules.md` for full definitions and remediation guidance.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `GROQ_API_KEY` | Groq API key (required for AI features) | — |
| `GROQ_MODEL` | Groq chat model | `llama-3.3-70b-versatile` |
| `EMBEDDING_MODEL` | Local embedding model | `Xenova/all-MiniLM-L6-v2` |
| `VECTOR_STORE_PATH` | Persisted vector index path | `.rag/index.json` |
