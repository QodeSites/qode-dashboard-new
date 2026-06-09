# Holdings Strategy Dropdown — Show Only for Multi-Strategy Clients

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation plan
**Scope:** All clients on the holdings summary page (`app/holding-summary/page.tsx`)

## Goal

On the holdings summary, show the strategy filter **dropdown** only when a client
has more than one strategy. Single-strategy clients (e.g. Sarla `QYE+`, Satidham
`QAW++`, GRD, Deepti) should not see a dropdown with a single useless option.

The Strategy **column** (in the table and in CSV/Excel/PDF exports) is **kept** for
single-strategy clients — it stays informational, showing the one value per row.

## Decision (user-approved)

Hide **only** the dropdown for single-strategy clients. Do **not** hide the
Strategy column or the export column.

## Current behavior

All three strategy surfaces gate on `availableStrategies.length > 0`:
- Dropdown render: `app/holding-summary/page.tsx:2076` — `{availableStrategies.length > 0 && (<Select…/>)}`
- Table column: `showStrategy={availableStrategies.length > 0}` (≈ line 2152, on both the Stock and Mutual Fund `HoldingsTable` instances)
- Exports: `const hasStrategy = availableStrategies.length > 0;` in `handleDownloadCSV` / `handleDownloadExcel` / `handleDownloadPDF` (≈ lines 940 / 1080 / 1360)

So a single-strategy client currently sees a dropdown with `Total Portfolio` (`ALL`) + one strategy option.

## Change

Introduce a named boolean and use it **only** for the dropdown gate; leave the
column and export gates at `> 0`.

In `app/holding-summary/page.tsx`, where `availableStrategies` /
`selectedStrategy` are in scope (near the other derived render values), add:
```ts
// Dropdown is only useful when the client has more than one strategy to filter
// between. The Strategy column + exports stay at length > 0 (single value is
// still shown); only the interactive filter is suppressed for single-strategy.
const isMultiStrategy = availableStrategies.length > 1;
```

Then change the dropdown gate (line 2076) from:
```tsx
{availableStrategies.length > 0 && (
```
to:
```tsx
{isMultiStrategy && (
```

No other gate changes. The table `showStrategy` props and the three export
`hasStrategy` constants remain `availableStrategies.length > 0`.

## Why it is safe

- When the dropdown is hidden, `selectedStrategy` keeps its default `"ALL"`, so
  the filtered holdings list and `filteredTotals` compute over all holdings —
  the correct "no filter" result.
- The 0-strategy case is unchanged (`> 1` is false, exactly as `> 0` was false).
- Multi-strategy clients (Dinesh `QAC00053`, Arwani `QAC00071`, Ashwin
  `QAC00083` — `QAW++` + `QYE++`) keep the dropdown.

## Out of scope / unaffected

- No backend, no DB, no API changes. Frontend-only.
- No change to the Strategy column or export column.
- No change to filtering logic, totals, or the managed/special fetch paths.

## Verification plan

1. **Build passes:** `npm run build` exits 0.
2. **Static check:** the dropdown block (line ~2076) gates on `isMultiStrategy`;
   the two `showStrategy` props and the three `hasStrategy` constants still read
   `availableStrategies.length > 0`.
3. **Manual (browser):**
   - Single-strategy client (Sarla `QUS0007` / Satidham `QUS0010` / GRD `QUS00106`):
     **no** dropdown; Strategy column still present in table + Excel/PDF export.
   - Multi-strategy client (Ashwin `QUS00097`): dropdown **present** with
     `Total Portfolio` + `QAW++` + `QYE++`; filtering works.
