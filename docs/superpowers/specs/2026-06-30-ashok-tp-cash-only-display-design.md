# Ashok Jogani HUF — Sarla/Satidham-style Total Portfolio display

**Date:** 2026-06-30
**Client:** Ashok Jogani HUF — `icode QUS00124`, `qcode QAC00110`
**Status:** Design approved; ready for implementation plan
**Follows:** `2026-06-30-ashok-pms-blend-design.md` (the PMS blend this restyles)

## Problem

Ashok is a bifurcated client with a PMS-blended Total Portfolio (see the PMS-blend
spec). His **Total Portfolio tab** currently renders like Dinesh/Arwani — a
percentage/value toggle on the Returns card, a NAV curve, a trailing-returns
table, and a monthly PnL table with a %/₹ toggle. The team wants that tab to look
like the **Sarla/Satidham** Total Portfolio tabs (which also blend PMS): absolute
(₹) figures only, no percentage returns, no trailing-returns table, no NAV-curve
visual. The **one deviation** from Sarla/Satidham: Ashok's TP **keeps the monthly
returns table** (Sarla/Satidham omit it).

## Requirements (from the user)

1. Applies to Ashok's **Total Portfolio tab only**. His individual scheme tabs
   (`Scheme QAW++`, `Scheme QAW+`, `Scheme PMS QAW/QGF/QTF`) keep their current
   full view (% returns, NAV curve, trailing table) — same as Sarla/Satidham's
   individual schemes.
2. TP shows **absolute returns only** — the Returns card shows ₹ profit, no
   percentage, no %/Value toggle.
3. **No trailing-returns table** on the TP.
4. **No NAV-curve visual** on the TP.
5. **Keep the monthly returns table** on the TP (cash-only), unlike Sarla/Satidham.
6. **PDF and Excel exports of the TP match** the stripped-down on-screen view
   (cash-only, no chart/trailing, with monthly).
7. Zero change to any other client or to Ashok's non-TP tabs.

## How the current behavior is wired (from code inspection)

- **`components/stats-cards.tsx`**: `lockToCashView = isTotalPortfolio && !hasNavBasedTotalPortfolio`.
  When true, the Returns card shows ₹ profit and the `Value/Percentage` toggle +
  tooltip are hidden. Sarla/Satidham don't pass `hasNavBasedTotalPortfolio` (→
  `false` → locked to cash). Ashok's registry sets `hasNavBasedTotalPortfolio: true`,
  so his TP is *not* locked.
- **`app/dashboard/page.tsx` `renderDineshContent`**: the `RevenueChart` (NAV curve
  + trailing table) renders when `(!isTotalPortfolio || hasNavBasedTotalPortfolio)`.
  Sarla's guard is just `!isTotalPortfolio`. `PnlTable` is passed
  `showOnlyQuarterlyCash={false}`.
- **`components/PnlTable.tsx`**: renders the monthly table only when
  `!showOnlyQuarterlyCash`; each table has its own %/₹ toggle (default ₹).
  `showOnlyQuarterlyCash` forces ₹ **and hides monthly** — so it can't express
  "cash-only *with* monthly".
- **Exports** (`components/buildPortfolioReportHTML.ts`, `components/generateExcelReport.ts`):
  both gate the full sections (%, chart, trailing, **and** monthly) on
  `includeFullSections = !isTotalPortfolio || hasNavBasedTotalPortfolio`.

So the three surfaces (%/toggle, chart+trailing, and the export sections) are all
governed by `hasNavBasedTotalPortfolio`, and monthly is bundled into the export
gate. Ashok needs a *third* combination — stripped like Sarla **but keep monthly**
— that no existing flag expresses.

## Approach — derived `pmsBlendedTP` flag + effective nav-based (Approach 1)

Introduce a derived display concept, thread an **effective** nav-based flag through
display and export so they stay in lockstep, and add one new `PnlTable` mode. No
engine/data change; no new registry field (derive from existing PMS config).

### 1. Gating signal (derived)

A Total Portfolio is "PMS-blended" when the client declares PMS schemes:

```ts
// in renderDineshContent
const pmsBlendedTP =
  isTotalPortfolio && (bifurcatedClient?.config.pmsSchemes?.length ?? 0) > 0;
```

`ClientConfig.pmsSchemes` already exists (PMS-blend spec) and the registry entry
exposes `config`, so this is read-only and typed. True only for Ashok's TP today.

### 2. Effective nav-based flag

Everywhere the TP display/export decision currently reads `hasNavBasedTotalPortfolio`,
use:

```ts
const effectiveNavBased = hasNavBasedTotalPortfolio && !pmsBlendedTP; // false for Ashok TP
```

### 3. Frontend — `renderDineshContent` (TP only)

- **StatsCards**: pass `hasNavBasedTotalPortfolio={effectiveNavBased}`. For Ashok
  TP this is `false` → `lockToCashView` → Returns card shows ₹ profit only, no
  toggle. (Individual scheme tabs: `isTotalPortfolio` is false, so unaffected.)
- **RevenueChart**: change the guard from
  `(!isTotalPortfolio || hasNavBasedTotalPortfolio)` to
  `(!isTotalPortfolio || effectiveNavBased)` → not rendered on Ashok TP (drops NAV
  curve **and** trailing-returns table).
- **PnlTable**: pass a new `cashOnly={pmsBlendedTP}`.

### 4. `PnlTable` — new `cashOnly` prop

New optional prop, distinct from `showOnlyQuarterlyCash`:

- `cashOnly = true` → **both** the quarterly and monthly tables render, both forced
  to ₹, and the per-table %/₹ toggle is hidden.
- The monthly table still renders (gate becomes
  `{(!showOnlyQuarterlyCash) && renderMonthlyTable()}` unchanged; `cashOnly` does
  not hide it).
- Internally: `displayType`/`isPercentView` resolve to cash when `cashOnly`; the
  toggle `<Button>`s are hidden when `cashOnly` (as they already are for
  `showPmsQawView`).
- Existing callers pass nothing → `cashOnly` defaults `false` → unchanged.

### 5. Exports — mirror the screen

Thread `pmsBlendedTP` from `renderDineshContent` into `handleDownloadPDF` /
`handleDownloadExcel`, and on into `buildPortfolioReportHTML` and
`generateExcelReport`. In both generators, replace the single gate with two:

```ts
const includeFullSections =
  !isTotalPortfolio || (hasNavBasedTotalPortfolio && !pmsBlendedTP); // strips %/chart/trailing for Ashok TP
const includeMonthly = includeFullSections || pmsBlendedTP;          // …but keeps monthly
```

Gate the **monthly** section on `includeMonthly`; leave the %/chart/trailing
sections on `includeFullSections`. Force the exported PnL to cash when
`!includeFullSections` (already the case for the stripped path). Net: Ashok's PDF/
Excel TP = cash-only, no chart/trailing, with monthly.

## Files touched

| File | Change |
|---|---|
| `app/dashboard/page.tsx` | `renderDineshContent`: compute `pmsBlendedTP`/`effectiveNavBased`; pass to StatsCards / RevenueChart guard / PnlTable; thread `pmsBlendedTP` into the two export handlers |
| `components/PnlTable.tsx` | add `cashOnly?: boolean` — forces ₹ + hides toggles on both tables, keeps monthly |
| `components/buildPortfolioReportHTML.ts` | add `pmsBlendedTP` param; split `includeFullSections` / `includeMonthly` |
| `components/generateExcelReport.ts` | add `pmsBlendedTP` param; split `includeFullSections` / `includeMonthly` |

## Invariants / scope

- Only Ashok's **Total Portfolio** tab (and its exports) change.
- Ashok's individual scheme tabs unchanged (`isTotalPortfolio` false → all new
  branches are no-ops there).
- Every other client unchanged: `pmsBlendedTP` is false for anyone without
  `pmsSchemes`, so `effectiveNavBased === hasNavBasedTotalPortfolio`,
  `cashOnly === false`, and the export gates are identical to today.
- No engine, API, or DB change — pure presentation.

## Testing

- **`npm run build`** passes.
- **Manual (impersonate Ashok, QAC00110):** TP tab shows ₹-only Returns card (no
  toggle), no NAV chart, no trailing table, quarterly **and** monthly tables in ₹
  with no %/₹ toggle. Switch to a scheme tab (e.g. `Scheme PMS QAW`) → full view
  (%, chart, trailing) still present.
- **Regression:** impersonate Dinesh/Arwani (nav-based, no PMS) → TP unchanged
  (%/toggle, chart, trailing, monthly-with-toggle). Sarla/Satidham → unchanged.
- **Exports:** Ashok TP PDF + Excel contain cash-only figures, no chart/trailing,
  and the monthly section; a scheme-tab export is unchanged.

## Out of scope

- Any change to the PMS blend math or the engine response.
- Sarla/Satidham behavior (they intentionally keep omitting monthly).
- Individual scheme tabs and other clients.
