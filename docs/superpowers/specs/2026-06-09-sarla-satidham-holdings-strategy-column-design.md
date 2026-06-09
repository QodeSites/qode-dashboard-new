# Sarla/Satidham Holdings — Strategy Column

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation plan
**Clients:** Sarla (`QUS0007` / `QAC00041`), Satidham (`QUS0010` / `QAC00046` + `QAC00066`)

## Goal

Make the Sarla/Satidham holdings summary show a **Strategy** column (and strategy
filter + strategy in PDF/Excel/CSV exports), consistent with the managed clients
that already use the bifurcated holdings tables via `/api/bifurcated-holdings`.

This is a follow-up to the prior fix (`fdbed22`) that repointed Sarla/Satidham
holdings from the frozen legacy tables to `bifurcated_equity_holding_test` /
`bifurcated_mutual_fund_holding_sheet_test`. Those bifurcated tables carry a
`strategy` column that the Sarla/Satidham code path currently discards.

## Constraints

- **READ-ONLY** dashboard code. No `create`/`update`/`delete`/`upsert`, no raw
  SQL writes. Adheres to the Database Safety Rules in `CLAUDE.md`.
- **Additive** — no change to existing holdings values, portfolio/NAV/return
  logic, managed-client behavior, or the export layout beyond gaining one column.
- **Minimal footprint** in the ~3000-line critical file `sarla-utils.ts`
  (changes confined to the `Holding` interface and `getHoldings`).

## Confirmed facts

### Data reality (read-only DB probe)
All of each client's holdings in the bifurcated tables carry a **single** strategy
tag:

| Client | Source qcode | Equity strategy | MF strategy |
|---|---|---|---|
| Sarla | QAC00041 | `QYE+` | `QYE+` |
| Satidham | QAC00066 (QAC00046 is empty) | `QAW++` | — |

So the Strategy column will show one repeated value per client. **Decision
(user-approved): show the raw tag (`QYE+` / `QAW++`), matching how single-strategy
managed clients (e.g. GRD, Deepti) display — no label mapping.**

### Existing strategy infrastructure (already built, just not wired for Sarla/Satidham)
In `app/holding-summary/page.tsx`:
- `HoldingsTable` renders a Strategy column via `showStrategy={availableStrategies.length > 0}` (≈ lines 2140/2148), reading `holding.strategy`.
- Strategy filter dropdown shows when `availableStrategies.length > 0` (≈ line 2064); filters by `holding.strategy` (≈ line 763).
- `handleDownloadCSV` / `handleDownloadExcel` / `handleDownloadPDF` each include the Strategy column when `const hasStrategy = availableStrategies.length > 0` (≈ lines 928 / 1068 / 1348).
- The page's `Holding` type already has `strategy?: string` (≈ line 31).
- The managed path (`fetchAccounts`) sets these from the API: `setAvailableStrategies(data.availableStrategies)`.

Why Sarla/Satidham are blank today:
1. `sarla-utils.ts` `Holding` interface (≈ line 34) has no `strategy` field.
2. `getHoldings` (≈ line 3539) never selects/maps the `strategy` column.
3. `fetchHoldingsForSpecialAccounts` (≈ lines 590–635) never calls `setAvailableStrategies`.

`processHoldingsSummary` (≈ line 3679) only **filters** holdings into
equity/debt/MF buckets — it does not strip fields — so `strategy` flows through
once populated.

## Approach (selected: A — frontend-derived `availableStrategies`)

Backend populates `holding.strategy`; the frontend derives `availableStrategies`
from the holdings it already collects. Smallest change, identical end result,
avoids restructuring the per-scheme `sarla-api` response shape.

(Rejected: **B** — backend returns `availableStrategies`: the sarla-api response
is keyed per-scheme with no clean top-level slot; more invasive for an identical
result. **C** — reuse `/api/bifurcated-holdings`: that route is single-qcode +
`pooled_account_users` auth and does not handle Satidham's dual-qcode merge or
Sarla's MF ISIN-dedup; repurposing pollutes the clean managed route.)

## File changes

### 1. `app/lib/sarla-utils.ts` (backend — only data change)

**a. `Holding` interface (≈ line 34):** add
```ts
strategy?: string;
```

**b. `getHoldings` equity query/mapping:** the query is already `SELECT e.*`
(returns `strategy`). Add `strategy` to the raw-row TS type, and map it in
`processedEquityHoldings`:
```ts
strategy: holding.strategy || undefined,
```

**c. `getHoldings` MF query/mapping:** the MF query is a `GROUP BY isin` dedup.
Add `MAX(strategy) as strategy` to the `SELECT` (carries the strategy of the
kept row; preserves the exact ISIN-dedup behavior — does not change grouping
granularity). Add `strategy` to the raw-row TS type, and map it in the
`isinMap` MF mapping:
```ts
strategy: holding.strategy || undefined,
```

All queries remain `SELECT` (`$queryRaw`) — read-only.

### 2. `app/holding-summary/page.tsx` (frontend — one wiring addition)

In `fetchHoldingsForSpecialAccounts`, after the holdings array is assembled
(the same `allHoldings` it builds from `equityHoldings + debtHoldings +
mutualFundHoldings`), derive and set:
```ts
setAvailableStrategies(
  [...new Set(allHoldings.map(h => h.strategy).filter(Boolean))].sort() as string[]
);
```
No other frontend change: the page's `Holding` type already has `strategy`, and
the table/filter/exports already key off `availableStrategies.length > 0`.

### 3. Export (PDF / Excel / CSV) — no code change

All three exports already include the Strategy column when
`availableStrategies.length > 0`. Once step 2 sets it, Sarla/Satidham exports
gain the column automatically. **The plan must verify there is no
Sarla/Satidham-specific export branch** (expected: the export functions operate
generically on `holdingsData` + `availableStrategies` + `selectedStrategy`
state, independent of client type).

## Out of scope / unaffected

- `processHoldingsSummary` — no change (preserves fields).
- Managed clients (`/api/bifurcated-holdings`) — untouched.
- Sarla/Satidham portfolio / NAV / return / cashflow logic — untouched.
- No label mapping for strategy tags (raw tags shown, per decision).
- `components/generateExcelReport.ts` — this is a separate report (portfolio /
  quarterly-fees), not the holdings-summary export; confirm it is not the
  holdings export path during implementation.

## Verification plan

1. **Build passes:** `npm run build` exits 0.
2. **Read-only audit:** the change adds no write op; `getHoldings` queries remain
   `SELECT` only.
3. **Data flow:** Sarla holdings carry `strategy = "QYE+"`; Satidham holdings
   carry `strategy = "QAW++"`; `availableStrategies` resolves to `["QYE+"]` /
   `["QAW++"]` respectively.
4. **UI:** login as Sarla (`QUS0007`) and Satidham (`QUS0010`) → holdings table
   shows a Strategy column with the tag, and the strategy filter dropdown appears.
5. **Export:** Excel/PDF/CSV downloads include the Strategy column for both.
6. **Regression:** a managed multi-strategy client (e.g. Ashwin `QUS00097`) still
   shows `QAW++` + `QYE++` correctly; a managed single-strategy client unchanged.

## Risks & notes

- **MF dedup semantics:** `MAX(strategy)` over a `GROUP BY isin` row that is
  already deduped to `rn = 1` simply carries that row's strategy. For a
  hypothetical ISIN spanning two strategies it shows the larger-quantity row's
  strategy — acceptable, and preserves the current dedup behavior exactly. Not a
  concern for current data (single strategy per client).
- **Single-value column:** for these clients the column is one repeated value;
  this matches single-strategy managed clients and is the approved behavior.
