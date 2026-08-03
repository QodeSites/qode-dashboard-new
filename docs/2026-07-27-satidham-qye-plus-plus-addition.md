# Satidham — Scheme QYE++ Addition (2026-07-27)

This document explains all the changes made to `app/lib/sarla-utils.ts` (and minimal `app/dashboard/page.tsx`) to add the new active Scheme QYE++ for Satidham while retiring the old one.

---

## Background

Satidham (`QAC00046`) previously had a scheme called "Scheme QYE++" which was inactive and stored as hardcoded data. A new active "Scheme QYE++" was incepted on 2026-07-24, running on `QAC00066` via `bifurcated_master_sheet_test` — the same account and pattern as Scheme QAW++.

The challenge: both old and new share the same display name. Internally we must keep them as separate keys for data routing, but on the dashboard they should both appear as "Scheme QYE++", distinguished only by the "(Inactive)" marker.

---

## What Changed

### 1. Old Scheme Renamed to "Scheme QYE++ (Old)"

The inactive hardcoded scheme was renamed from `"Scheme QYE++"` to `"Scheme QYE++ (Old)"` in every place it appeared:
- `PORTFOLIO_MAPPING` (the scheme config object)
- `SATIDHAM_SYSTEM_TAGS` (system tag lookup map)
- Hardcoded data block (`strategyName`, `icode`, `metadata.strategyName`)

The hardcoded entry `-51,041,445.53` cash flow (dated 2026-01-06) was commented out as it was an incorrect/unwanted entry.

### 2. New Active "Scheme QYE++" Added

Added to:
- **`PORTFOLIO_MAPPING`** — `isActive: true`, routes to `Zerodha Total Portfolio` tag on `QAC00066`
- **`SATIDHAM_SYSTEM_TAGS`** — maps to `"Zerodha Total Portfolio"` (same as QAW++ before tag rewriting)
- **`SCHEME_QCODE_OVERRIDE`** — `"Scheme QYE++": "QAC00066"` so all queries fetch from the right account
- **`SCHEME_BIFURCATED_SOURCE`** — with tag rewrites and a `startDate`:

```typescript
"Scheme QYE++": {
  tagRewrite: {
    "Zerodha Total Portfolio": "QYE++ Zerodha Total Portfolio",
    "Total Portfolio Value":   "QYE++ Total Portfolio Value",
  },
  startDate: new Date("2026-07-24"),
},
```

### 3. `prevDay()` Helper Added

```typescript
private static prevDay(d: Date): Date {
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}
```

All DB queries that use `startDate` filter with `date >= prevDay(startDate)` (i.e. T-1) so that the inception day's row is included in results (DB rows are end-of-day dated).

### 4. Date Filter Applied to All QYE++ DB Queries

Every DB query for "Scheme QYE++" now applies `date >= prevDay(2026-07-24)` = `date >= 2026-07-23`:
- `getHistoricalData` — NAV curve and drawdown
- `getAmountDeposited` (individual scheme path)
- `getTotalProfit`
- `getCashFlows` fallthrough path (viewing QYE++ individually)
- `calculateQuarterlyPnLWithDailyPL` — the `portfolioValues` guard query

This prevents pre-inception data (which exists under the same tag for historical reasons) from polluting the results.

### 5. Inception Date Metadata Fix

Previously `inceptionDate` in the API response was derived from `historicalData[0].date` — which after the T-1 filter was `2026-07-23` (one day before inception). Fixed to read directly from `SCHEME_BIFURCATED_SOURCE[scheme].startDate` when available:

```typescript
inceptionDate: PortfolioApi.SCHEME_BIFURCATED_SOURCE[scheme]?.startDate
  ? PortfolioApi.SCHEME_BIFURCATED_SOURCE[scheme]!.startDate!.toISOString().split("T")[0]
  : historicalData.length > 0 ? PortfolioApi.normalizeDate(historicalData[0].date)! : "2022-09-14",
```

This ensures the dashboard header shows `Inception Date: 24/07/2026` not `23/07/2026`.

### 6. Total Portfolio Aggregation — Combined QAC00066 Fetch

**Before:** Total Portfolio `getAmountDeposited` and `getCashFlows` had two separate bifurcated fetches — one for QAW++ (tag: `QAW++ Zerodha Total Portfolio`) and one for QYE++ (tag: `QYE++ Zerodha Total Portfolio`, date filtered).

**After:** Both are replaced with a single combined fetch from `bifurcated_master_sheet_test`:

```typescript
qcode:      "QAC00066"
system_tag: "Zerodha Total Portfolio"   // the plain combined tag, not scheme-prefixed
date:       >= prevDay(new Date("2026-01-07"))  // QAW++ inception date
```

This single query covers both QAW++ and QYE++ deposits/cash flows together, starting from when QAW++ first went live. The scheme list for the Total Portfolio loop was updated to remove `"Scheme QAW++"` and `"Scheme QYE++"` and the combined fetch runs separately after the loop.

The entry with `capital_in_out = -51,041,445.53` is excluded from both the sum and the table rows:
```typescript
.filter(r => Math.abs(r.capital_in_out!.toNumber() - (-51041445.53)) > 0.01)
```

### 7. Zero Cash Flow Entries Filtered

`.filter(cf => cf.amount !== 0)` added to both return paths in `getCashFlows()` in `sarla-utils.ts`. Done at the data layer so the frontend never receives zero-amount rows.

### 8. Equity Curve & Drawdown Baseline Prepend Extended

For QAW++ and QYE++, a `nav=100` / `drawdown=0` baseline point is prepended one day before the first data row (so the chart starts from a clean 100 baseline). This was extended to also include `"Scheme QYE++ (Old)"`:

```typescript
if ((scheme === "Scheme QAW++" || scheme === "Scheme QYE++" || scheme === "Scheme QYE++ (Old)") && rawCurve.length > 0)
```

### 9. `initialNav = 100` for Returns Calculation

The since-inception returns card uses `initialNav = 100` (forcing the baseline to 100 rather than whatever the first DB row says). This was extended to include `"Scheme QYE++"` alongside `"Scheme QAW++"`.

### 10. Quarterly & Monthly P&L — QYE++ (Old) Wired In

- `"Scheme QYE++ (Old)"` added to the Total Portfolio quarterly P&L sum (`schemeQYEOldQuarterlyPnl`), reading from hardcoded `data.quarterlyPnl`
- `"Scheme QYE++ (Old)"` historical data now fetched and merged into `allData` for monthly P&L calculation

### 11. Display Name — "Scheme QYE++ (Old)" Shows as "Scheme QYE++"

The internal key must stay `"Scheme QYE++ (Old)"` for data routing. To display it as `"Scheme QYE++"` on the dashboard (so both active and inactive show the same name, distinguished only by the "(Inactive)" suffix):

**`sarla-utils.ts`** — added `displayName` to the hardcoded metadata block:
```typescript
metadata: {
  strategyName: "Scheme QYE++ (Old)",
  displayName: "Scheme QYE++",   // ← overrides display only
  isActive: false,
  ...
}
```

**`page.tsx`** — 3 display-only lines read `metadata.displayName` with fallback:
```typescript
// dropdown:
{(sarlaData[strategy]?.metadata as any)?.displayName || strategy}

// badge (Sarla + Satidham sections):
{(strategyData?.metadata as any)?.displayName || selectedStrategy}
```

No logic, no routing, no state changes — purely display. All `sarlaData[selectedStrategy]` lookups still use the original key `"Scheme QYE++ (Old)"`.

---

## Scheme Routing Summary (Satidham after changes)

| Scheme | Table | qcode | Tag | Notes |
|--------|-------|-------|-----|-------|
| Scheme A | `bifurcated_master_sheet_test` | QAC00046 | `Total Portfolio Value A` | Active |
| Scheme B | `bifurcated_master_sheet_test` | QAC00046 | `Total Portfolio Value B` | Active |
| Scheme A (Old) | Hardcoded | — | — | Inactive |
| Scheme PMS QAW | `pms_master_sheet` | QAC00046 | `PMS QAW Portfolio` | Active |
| Scheme QAW++ | `bifurcated_master_sheet_test` | QAC00066 | `QAW++ Zerodha Total Portfolio` | Active, inception 2026-01-07 |
| Scheme QYE++ | `bifurcated_master_sheet_test` | QAC00066 | `QYE++ Zerodha Total Portfolio` | Active, inception 2026-07-24, date filtered |
| Scheme QYE++ (Old) | Hardcoded | — | — | Inactive, displayed as "Scheme QYE++" |
| Total Portfolio (QAW++ + QYE++ combined) | `bifurcated_master_sheet_test` | QAC00066 | `Zerodha Total Portfolio` | Single combined query from 2026-01-06, excludes -51,041,445.53 |

---

## Files Changed

| File | Nature of change |
|------|-----------------|
| `app/lib/sarla-utils.ts` | All data logic — scheme config, date filters, aggregation, display name in metadata |
| `app/dashboard/page.tsx` | 3 display-only lines reading `metadata.displayName` for dropdown and badge |
