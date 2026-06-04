# Design: Bifurcated-client system-tag-wise override on the Total Portfolio page

**Date:** 2026-06-04
**Branch:** `feature/systag-wise` (post-merge of `krish-bifurcation-generalize`)
**Status:** Approved — ready for implementation plan

## Background

After merging `krish-bifurcation-generalize` into `feature/systag-wise`, bifurcated
clients (Dinesh, Arwani, etc.) are registry-driven and read from
`bifurcated_master_sheet_test` via `BifurcatedPortfolioEngine`. The merge also
carried the per-strategy **system-tag-wise override** dropdowns (Deposit/Value,
Returns/P&L, Cash Flow), which let an admin re-point a strategy's calculations at a
different `system_tag`.

As merged, those dropdowns:
- render on **individual scheme** pages and are **hidden on Total Portfolio**
  (`showDineshTagDropdowns = … && !isTotalPortfolio`), and
- the engine's Total Portfolio branches **ignore** overrides entirely (they read the
  authoritative `Qode Total Portfolio` curve / aggregate sub-schemes).

This is the opposite of the desired behavior.

## Goal

For bifurcated clients, the system-tag-wise dropdowns should:

1. Appear **only on the Total Portfolio page** — never on individual scheme pages.
2. Contain **all** system tags available for the client's qcode (already provided by
   `/api/system-tags`).
3. When a tag is selected, drive the corresponding Total Portfolio data using that
   tag's data **for the period it exists in the mastersheet** (its full natural date
   range).
4. Preserve, with dropdowns untouched, the exact Total Portfolio numbers produced by
   the `krish-bifurcation-generalize` branch.

This is an admin-only inspection tool (gated by `isImpersonating`); it is read-only
and per-request.

## Requirements (resolved during brainstorming)

- **Per-metric independence.** The three dropdowns act independently. Overriding one
  (e.g. Returns = `QYE++ NLONG2`) switches only that metric's cards to the selected
  tag's data; the other cards keep the default authoritative Total Portfolio
  aggregate. Different cards may therefore reflect different date windows.
- **Date window.** A selected tag uses its **full natural range** in the mastersheet
  (its own first → last date). No scheme `startDate` filter, no dashboard date-filter
  coupling.
- **NAV baseline = `prev_nav`.** The first row of a tag is guaranteed (per the data
  team) to carry `prev_nav = 100`. Returns/curve use that first row's `prev_nav` as
  the baseline, with `?? 100` as a safety fallback. This matches the existing Total
  Portfolio returns code (`initialNav = firstNavRecord.prev_nav ?? 100`) and correctly
  captures the day-1 return that an explicit rebase-to-100 would drop. For display,
  prepend a `{ date: day-before, nav: 100 }` point so the chart visually starts at 100
  (same as the authoritative branch).

## Approach (selected)

**Per-metric override short-circuit in each Total Portfolio branch.**

Each engine read/calc method already has an `if (scheme === "Total Portfolio") { … }`
block. We add, at the **top** of that block, an additive guard:

```
if (<the override that drives this metric> is set) {
  return <raw single-tag read for that tag, full natural range>;
}
// …existing authoritative aggregate path unchanged…
```

Rejected alternatives:
- **Virtual-scheme reuse** (synthesize a temp scheme and route through the
  individual-scheme path): conflicts with per-metric independence and entangles with
  the scheme `startDate` / "fresh scheme" baseline logic.
- **Centralized raw-tag helper**: clean separation but adds a parallel computation
  path and still needs per-field wiring.

The selected approach keeps the default path byte-identical (override code only runs
when a tag is chosen), makes per-metric independence fall out naturally, and reuses the
existing `prev_nav` pattern.

## Design

### Frontend — `app/dashboard/page.tsx`

Invert the bifurcated dropdown visibility (this is the only frontend change; regular
managed-account dropdowns and all other logic are untouched):

```js
// before:
//   const showDineshTagDropdowns =
//     isImpersonating && availableSystemTags.length > 1 && isActive && !isTotalPortfolio;
// after:
const showDineshTagDropdowns =
  isImpersonating && availableSystemTags.length > 1 && isTotalPortfolio;
```

The override refetch effect already sends `scheme=${selectedStrategy}`, which equals
`"Total Portfolio"` on this page, so no other frontend change is required. The
`/api/bifurcated-portfolio` request therefore arrives as
`?qcode=…&scheme=Total Portfolio&navTag=…` (and/or `depositTag`, `cashflowTag`).

### Backend — `app/lib/bifurcated-portfolio-utils.ts`

`handleGET` already parses the overrides and builds `tagOverrides` when
`scheme === overrideScheme`. With `overrideScheme === "Total Portfolio"`, `tagOverrides`
is now passed into the Total Portfolio iteration (it already is, via the existing
threaded calls). Each TP branch gains an additive override path:

| Dropdown (override) | Drives on Total Portfolio | Override behavior (full natural range) |
|---|---|---|
| **Deposit / Value** (`depositTag`) | Amount Invested, Current Value | `getAmountDeposited` TP: `_sum(capital_in_out)` where `system_tag = depositTag`. `getLatestExposure` TP: latest `portfolio_value`/`drawdown`/`nav` where `system_tag = depositTag`. |
| **Returns / P&L** (`navTag`) | Return %, Total Profit, equity chart, drawdown, trailing returns, monthly & quarterly PnL | `getHistoricalData` TP: raw series where `system_tag = navTag`, ordered by date, prepend `{day-before, nav:100}`. `getTotalProfit` TP: `_sum(pnl)` where `system_tag = navTag`. `calculatePortfolioReturns` / `calculateTrailingReturns` / `calculateMonthlyPnL` / `calculateQuarterlyPnL` TP: derive from that series, baseline `prev_nav ?? 100` (treated as a fresh, 100-based series). |
| **Cash Flow** (`cashflowTag`) | Cash flows table | `getCashFlows` TP: rows where `system_tag = cashflowTag`, `capital_in_out` non-null/non-zero. |

The Returns/P&L group is unified through `getHistoricalData`'s TP override path: once
that returns the raw `navTag` series, the dependent calc methods route through it (in
their TP branches, passing `tagOverrides` and using the fresh-series/`prev_nav`
baseline), so returns, drawdown, trailing, monthly, and quarterly all stay mutually
consistent.

Drawdown on the Total Portfolio chart is computed in `handleGET` from
`equityCurveForDisplay`, which derives from `getHistoricalData(qcode, scheme, tagOverrides)`
— so it follows the `navTag` override automatically. The override historical path
prepends its own `{nav:100}` baseline, and `isFreshActiveScheme("Total Portfolio")` is
`false`, so there is no double-prepend.

## Invariants

- **Default preserved.** With no override selected, every TP branch runs the existing
  authoritative path → Total Portfolio numbers are **identical to the
  `krish-bifurcation-generalize` branch**. The override code executes only when a tag
  is chosen.
- **Read-only.** No writes; all queries are `findFirst`/`findMany`/`aggregate`.
- **Admin-only (UI).** Dropdowns render only while `isImpersonating` is true.
- **Per-request.** Overrides travel as query params; nothing is persisted.

## Out of scope

- Server-side admin enforcement on `/api/system-tags`, `/api/bifurcated-portfolio`,
  and `/api/portfolio` (deferred hardening; tracked separately).
- Any change to regular managed-account dropdowns (`showTagDropdowns`) — those keep
  their current per-account behavior.
- Combining a selected tag with the dashboard's date-range filter.

## Verification

- `npm run build` passes (type-safety gate; project has no automated test suite).
- **Default-unchanged check:** for a bifurcated client (e.g. Dinesh `QAC00053`,
  Arwani `QAC00071`), the Total Portfolio page with all dropdowns on "Default" shows
  numbers identical to the `krish-bifurcation-generalize` branch.
- **Override check:** selecting `navTag` = a windowed tag (e.g. `QYE++ …`) on Total
  Portfolio limits the returns/chart to that tag's date range, with the curve starting
  at 100 and day-1 return captured.
- **Per-metric check:** overriding only Returns leaves Amount Invested / Current Value
  / Cash Flow on the default aggregate.
- **Individual-scheme check:** scheme pages show no dropdowns.
