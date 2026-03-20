# Pre-computed PnL Cache — Design Plan

## Problem

Today, every time a client opens their dashboard, the system scans **all daily rows** from `master_sheet` for that account, then calculates monthly, quarterly, and yearly P&L on the fly. This is slow, repetitive, and doesn't scale.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CURRENT FLOW (slow)                          │
│                                                                      │
│  Client opens       App scans ALL         Calculates M/Q/Y          │
│  dashboard    ───►  daily rows from  ───► PnL from scratch    ───►  │
│                     master_sheet          on every request       UI  │
│                     (no indexes!)                                    │
│                                                                      │
│  ⚠ ~1500+ rows per account per year × multiple system_tags          │
│  ⚠ Recalculated identically every time — wasted compute             │
└──────────────────────────────────────────────────────────────────────┘
```

## Solution

Pre-compute the results **once** (after daily data sync) and store them in a dedicated cache table. The dashboard reads from this table directly — a single indexed lookup instead of scanning thousands of daily rows.

```
┌──────────────────────────────────────────────────────────────────────┐
│                       PROPOSED FLOW (fast)                           │
│                                                                      │
│                                                                      │
│  DATA PIPELINE (runs once daily, after master_sheet sync)            │
│  ┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐  │
│  │ master_sheet │────►│ Compute monthly, │────►│ precomputed_pnl  │  │
│  │ (daily rows) │     │ quarterly, yearly│     │ (cache table)    │  │
│  └─────────────┘     └──────────────────┘     └──────────────────┘  │
│                                                        │             │
│                                                        │             │
│  DASHBOARD (serves clients)                            │             │
│  ┌─────────────┐     ┌──────────────────┐              │             │
│  │   Client     │────►│ SELECT * FROM    │◄─────────────┘             │
│  │   request    │     │ precomputed_pnl  │                           │
│  └─────────────┘     └──────────────────┘                           │
│                                                                      │
│  ✓ Single indexed query — instant response                           │
│  ✓ No recalculation — results are pre-built                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## What Gets Computed

Three time granularities, all stored in **one table** with a `period_type` column:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   MONTHLY               QUARTERLY             YEARLY                │
│   ───────               ─────────             ──────                │
│   Jan 2025: +2.5%       Q1 2025: +4.1%        2025: +12.3%         │
│   Feb 2025: +1.8%       Q2 2025: +3.6%        2026: +8.7%          │
│   Mar 2025: -0.3%       Q3 2025: +5.2%                             │
│   ...                   Q4 2025: -0.8%                              │
│                                                                     │
│   period = 1-12         period = 1-4           period = 0           │
│   period_type =         period_type =          period_type =        │
│     'monthly'             'quarterly'            'yearly'           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Columns per period type

| Column | Monthly | Quarterly | Yearly | Description |
|--------|:-------:|:---------:|:------:|-------------|
| `identifier` | ✓ | ✓ | ✓ | Client icode (e.g. `QUS0001`) |
| `scheme_or_strategy` | ✓ | ✓ | ✓ | Strategy name or scheme name |
| `year` | ✓ | ✓ | ✓ | Calendar year |
| `period` | 1–12 | 1–4 | 0 | Month, quarter, or 0 for yearly |
| `percent` | ✓ | ✓ | ✓ | Return % (compounded) |
| `cash` | ✓ | ✓ | ✓ | Cash P&L in rupees |
| `capital_in_out` | ✓ | — | ✓ | Capital inflows/outflows |

---

## Account Coverage

The computation covers **all account types** in the system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   REGULAR ACCOUNTS (35)          SPECIAL ACCOUNTS (3)               │
│   ─────────────────────          ────────────────────               │
│                                                                     │
│   ┌─────────────────┐           ┌──────────────────────┐           │
│   │ PMS Strategy    │           │ Sarla (QUS0007)      │           │
│   │ e.g. QUS0020    │           │ 8 schemes:           │           │
│   │ 1 strategy      │           │ Total Portfolio,     │           │
│   └─────────────────┘           │ Scheme A, B, C, D,   │           │
│                                 │ E, F, QAW, PMS QAW   │           │
│   ┌─────────────────┐           └──────────────────────┘           │
│   │ Zerodha Managed │                                               │
│   │ e.g. QUS0001    │           ┌──────────────────────┐           │
│   │ 1 strategy      │           │ Satidham (QUS0010)   │           │
│   └─────────────────┘           │ 7 schemes:           │           │
│                                 │ Total Portfolio,     │           │
│   ┌─────────────────┐           │ Scheme A, B, A(Old), │           │
│   │ Jainam Managed  │           │ PMS QAW, QAW++,      │           │
│   │ e.g. QUS0006    │           │ QYE++                │           │
│   │ 1 strategy      │           └──────────────────────┘           │
│   └─────────────────┘                                               │
│                                 ┌──────────────────────┐           │
│   Uses:                         │ Dinesh (QUS00072)    │           │
│   calculatePortfolioMetrics()   │ 3 schemes:           │           │
│   from portfolio-utils.ts       │ Total Portfolio,     │           │
│                                 │ Scheme QAW++,        │           │
│                                 │ Scheme QTF           │           │
│                                 └──────────────────────┘           │
│                                                                     │
│                                 Uses:                               │
│                                 sarla-utils.ts                      │
│                                 dinesh-utils.ts                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Table Schema

A single table with a `period_type` discriminator — simpler than maintaining three separate tables.

```sql
CREATE TABLE precomputed_pnl (
    identifier          VARCHAR(20)    NOT NULL,   -- client icode (e.g. QUS0001)
    scheme_or_strategy  VARCHAR(100)   NOT NULL,   -- e.g. "Qode Yield Enhancer++" or "Scheme B"
    period_type         VARCHAR(10)    NOT NULL,   -- 'monthly', 'quarterly', or 'yearly'
    year                INT            NOT NULL,   -- calendar year (e.g. 2025)
    period              INT            NOT NULL,   -- month (1-12), quarter (1-4), or 0 for yearly
    percent             DECIMAL(12,4),             -- return % for the period
    cash                DECIMAL(20,2),             -- cash P&L in rupees
    capital_in_out      DECIMAL(20,2),             -- capital inflows/outflows (nullable for quarterly)
    computed_at         TIMESTAMP DEFAULT NOW(),   -- when this row was last computed

    PRIMARY KEY (identifier, scheme_or_strategy, period_type, year, period)
);

-- Index for the most common dashboard query pattern
CREATE INDEX idx_precomputed_pnl_lookup
    ON precomputed_pnl (identifier, period_type, year);
```

### Why one table instead of three?

| Approach | Pros | Cons |
|----------|------|------|
| **One table + period_type** | Single schema to maintain, one upsert script, flexible queries | Extra column |
| **Three tables** | Slightly "cleaner" per-table | 3x schema maintenance, 3x migration effort, 3x query logic |

One table wins — the data volume is tiny and the query pattern is identical across all three.

---

## Data Volume

Current snapshot (38 accounts, as of March 2026):

| Period Type | Rows | Growth Rate |
|-------------|------|-------------|
| Monthly | 490 | ~15 rows / account / year |
| Quarterly | 324 | ~4–8 rows / account / year |
| Yearly | 79 | ~1–2 rows / account / year |
| **Total** | **~893** | **~20 rows / account / year** |

At 100 accounts, this table would hold ~5,000 rows after 2 years. **Very small** — no partitioning or archiving needed.

---

## Refresh Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DAILY REFRESH CYCLE                               │
│                                                                     │
│   ┌──────────┐         ┌──────────────┐        ┌────────────────┐  │
│   │ External │  sync   │ master_sheet │ script │ precomputed_pnl│  │
│   │ data     │────────►│ (daily rows  │───────►│ (cache table)  │  │
│   │ pipeline │  daily  │  updated)    │  runs  │                │  │
│   └──────────┘         └──────────────┘ after  └────────────────┘  │
│                                         sync                        │
│                                                                     │
│   Key properties:                                                   │
│                                                                     │
│   • Idempotent — re-running produces the same result               │
│   • Only current month/quarter/year values change                   │
│   • Historical rows are stable (Jan 2025 won't change in Mar 2026) │
│   • Uses UPSERT (INSERT ON CONFLICT UPDATE) — safe to re-run       │
│   • Same calculation functions as the live dashboard — guaranteed   │
│     to match what clients see                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### What changes on each run?

```
                    Historical (frozen)              Current (updated)
                    ───────────────────              ─────────────────
  Monthly:          Jan 2025 ✓  Feb 2025 ✓  ...     Mar 2026 ↻
  Quarterly:        Q1 2025 ✓   Q2 2025 ✓   ...     Q1 2026 ↻
  Yearly:           2024 ✓      2025 ✓               2026 ↻

  ✓ = will not change     ↻ = updated on each run
```

---

## Example Dashboard Queries

Once the table exists, the dashboard API becomes simple indexed lookups:

```sql
-- Monthly PnL for a client
SELECT year, period AS month, percent, cash, capital_in_out
FROM precomputed_pnl
WHERE identifier = 'QUS0001'
  AND scheme_or_strategy = 'Qode Yield Enhancer++'
  AND period_type = 'monthly'
ORDER BY year, period;

-- Quarterly PnL for a client
SELECT year, period AS quarter, percent, cash
FROM precomputed_pnl
WHERE identifier = 'QUS0001'
  AND scheme_or_strategy = 'Qode Yield Enhancer++'
  AND period_type = 'quarterly'
ORDER BY year, period;

-- Yearly summary for all clients (admin view)
SELECT identifier, scheme_or_strategy, year, percent, cash
FROM precomputed_pnl
WHERE period_type = 'yearly'
ORDER BY identifier, year;
```

---

## Sample Data (from current export)

### Monthly — QUS0001, Qode Yield Enhancer++

| Year | Month | Return % | Cash P&L | Capital In/Out |
|------|-------|----------|----------|----------------|
| 2024 | 10 | +1.31% | 8,41,810 | 1,63,00,085 |
| 2024 | 11 | +6.02% | 38,90,915 | -1,10,624 |
| 2024 | 12 | -0.68% | -3,64,588 | 0 |
| 2025 | 1 | +1.89% | 12,45,299 | 0 |
| 2025 | 2 | +3.02% | 18,27,028 | 0 |
| ... | ... | ... | ... | ... |

### Quarterly — QUS0001, Qode Yield Enhancer++

| Year | Quarter | Return % | Cash P&L |
|------|---------|----------|----------|
| 2024 | Q4 | +6.68% | 43,68,137 |
| 2025 | Q1 | +6.26% | 38,53,484 |
| 2025 | Q2 | +15.28% | 90,41,465 |
| 2025 | Q3 | +5.18% | 43,28,399 |
| 2025 | Q4 | +4.03% | 32,55,540 |
| 2026 | Q1 | +18.29% | 1,53,96,921 |

### Yearly — QUS0001, Qode Yield Enhancer++

| Year | Return % | Cash P&L | Capital In/Out |
|------|----------|----------|----------------|
| 2024 | +6.68% | 43,68,137 | 1,61,89,462 |
| 2025 | +34.03% | 2,04,78,886 | -2,07,39,777 |
| 2026 | +18.29% | 1,53,96,921 | -1,02,69,186 |

---

## Validation

A validation script already exists and has been run successfully:

- **Script**: `scripts/export-pnl.ts`
- **Run command**: `npm run export-pnl`
- **Runtime**: ~14 seconds for all 38 accounts
- **Output**: CSV files at `data/pnl-export/` (monthly, quarterly, yearly)
- **Safety**: READ-ONLY — no database writes

The CSVs can be compared against the live dashboard to verify correctness before switching the frontend to read from the database table.

---

## Implementation Steps

```
  Step 1                Step 2                Step 3               Step 4
  ──────                ──────                ──────               ──────
  Create table    ───►  Modify export   ───►  Update dashboard ──► Schedule
  in Postgres           script to write       API to read from    daily refresh
  + add to Prisma       to DB (upsert)        precomputed_pnl     after data sync
  schema                instead of CSV        instead of computing
```

| Step | Description | Risk |
|------|-------------|------|
| 1. Create table | Add `precomputed_pnl` to Prisma schema, run `db push` | None — new table, no existing data affected |
| 2. Upsert script | Modify `export-pnl.ts` to write to DB via upsert | None — additive, CSV export can remain as backup |
| 3. Switch dashboard reads | Update API routes to query `precomputed_pnl` instead of recalculating | Low — can feature-flag, fall back to live calculation |
| 4. Schedule daily run | Trigger script after `master_sheet` sync completes | Low — script is idempotent, safe to re-run |
