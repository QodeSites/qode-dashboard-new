# Ashok Jogani HUF — PMS schemes blended into the bifurcated dashboard

**Date:** 2026-06-30
**Client:** Ashok Jogani HUF — `icode QUS00124`, `qcode QAC00110`
**Status:** Design approved; ready for implementation plan

## Problem

Ashok Jogani HUF is an existing **bifurcated client** (`app/lib/clients/ashok.ts`),
rendered by the generic `BifurcatedPortfolioEngine`
(`app/lib/bifurcated-portfolio-utils.ts`). That engine reads everything from
`bifurcated_master_sheet_test`, keyed by `qcode` + `system_tag`. Today Ashok has
two Zerodha schemes — `Scheme QAW++` (active) and `Scheme QAW+` (inactive) — plus
a `Total Portfolio` aggregate sourced from the authoritative `Qode Total Portfolio`
curve.

He also holds **three PMS accounts** that live in a completely separate table,
`pms_master_sheet`, keyed by `account_code` (not `qcode`/`system_tag`), with a
different column shape:

| account_code | Latest value | Unit NAV (base ~10) | Net invested | Total P&L | Date range |
|---|---|---|---|---|---|
| `QAW00158` | ₹2.36 Cr | 10.12 | ₹2.33 Cr | +₹2.86 L | 2026-04-08 → 06-29 |
| `QGF00157` | ₹2.81 Cr | 12.04 | ₹2.33 Cr | +₹47.5 L | 2026-04-08 → 06-29 |
| `QTF00161` | ₹2.40 Cr | 10.30 | ₹2.33 Cr | +₹6.96 L | 2026-04-08 → 06-29 |

The PMS accounts are the **majority** of his portfolio (~₹7.6 Cr PMS vs ~₹4.9 Cr
Zerodha). They must be surfaced in his dashboard's portfolio section.

### Confirmed via read-only DB inspection (2026-06-30)

- The `Qode Total Portfolio` curve for `QAC00110` reflects **Zerodha only**
  (NAV 98.38); it does **not** include PMS value/PnL.
- PMS unit NAV is **base ~10** (vs base 100 for the bifurcated/Zerodha schemes)
  and starts **earlier** (2026-04-08 vs QAW+ 2026-05-22, QAW++ 2026-06-18). The
  three PMS NAVs are internally consistent (net invested + PnL = latest value),
  so each is a clean per-account TWRR (unit-NAV) series.
- The engine's `Total Portfolio` Current-Value path reads a **literal**
  `Zerodha Total Portfolio` system_tag, which **does not exist** for Ashok (he
  has `QAW++ Zerodha Total Portfolio` / `QAW+ …`). So his TP Current Value may
  currently read ₹0 even before PMS — fixed as part of this work (§4d).

## Requirements (from the user)

1. The three PMS accounts appear as **three separate schemes** in Ashok's
   strategy dropdown, labeled **`Scheme PMS QAW`**, **`Scheme PMS QGF`**,
   **`Scheme PMS QTF`** (for `QAW00158`, `QGF00157`, `QTF00161` respectively).
   This matches Sarla/Satidham's existing `Scheme PMS QAW` convention
   (`sarla-utils.ts`) and Ashok's own `Scheme QAW++` / `Scheme QAW+` prefix.
2. **All** PMS numbers flow into the **Total Portfolio** aggregate.
3. The dashboard **blends the combined Total Portfolio NAV curve in code**
   (the data team's `Qode Total Portfolio` curve will NOT be changed to include
   PMS).

## Non-goals

- PMS **holdings** (the holdings page stays Zerodha-only). This is
  portfolio-section only.
- Any change to other bifurcated clients' behavior. All new logic is gated on a
  per-client `hasPms` flag.
- Any database write. Everything is read-only (`findMany` / `aggregate`),
  per `CLAUDE.md` Database Safety Rules.

## Chosen approach — isolated blend module (Approach 2)

Keep the 1448-line generic engine untouched for the ~30 non-PMS clients. Put all
PMS divergence into two new modules plus one gated block in `handleGET`. The hard
piece (a value-weighted combined NAV curve) lives in one testable place and
reuses the engine's existing drawdown/trailing/monthly helpers so Ashok's numbers
compute the same way as every other client's.

Rejected alternatives:
- **Approach 1 (surgical per-method branches):** scatters PMS logic across the
  engine's 8 `Total Portfolio` blocks + 6 per-scheme getters; regression risk for
  all clients; hard to test in isolation.
- **Approach 3 (synthetic curve injection):** the TP methods query the DB
  directly, so feeding a synthetic curve means intercepting queries — fragile.

## Design

### 1. Config & data model

Extend `app/lib/bifurcated-client-builder.ts`:

```ts
// new optional input to defineBifurcatedClient
pms?: Array<{
  schemeName: string;   // dropdown label, e.g. "Scheme PMS QAW"
  accountCode: string;  // pms_master_sheet.account_code, e.g. "QAW00158"
  inactive?: boolean;   // default false
}>
```

`defineBifurcatedClient`:
- writes the list into `ClientConfig` as a new `pmsSchemes` array, and
- adds each `schemeName` as a key in `portfolioMapping` (so it appears in the
  dropdown order). PMS scheme keys are routed specially (NOT read from
  `msTable`).

Add a derived `hasPms` notion (`pmsSchemes?.length > 0`) used to gate all new
behavior. `app/lib/clients/ashok.ts` gains:

```ts
pms: [
  { schemeName: "Scheme PMS QAW", accountCode: "QAW00158" },
  { schemeName: "Scheme PMS QGF", accountCode: "QGF00157" },
  { schemeName: "Scheme PMS QTF", accountCode: "QTF00161" },
],
```

**When `hasPms` is false, every code path is byte-for-byte today's behavior.**

### 2. PMS bridge — `app/lib/pms-bridge.ts` (new, read-only)

Single responsibility: read `pms_master_sheet` for a set of `account_code`s and
return normalized series. The only module that touches `pms_master_sheet`.

```ts
getPmsAccountSeries(accountCode: string): Promise<{
  daily: { date: string; value: number; nav: number; prevNav: number | null;
           pnl: number; cashIn: number }[];   // value = portfolio_value
  deposited: number;       // Σ cash_in_out
  currentValue: number;    // latest portfolio_value
  totalProfit: number;     // Σ pnl
  cashFlows: CashFlow[];
}>
```

Mirrors the read shape of `sarla-utils.getPMSData` but standalone and per-account.
Only `findMany` / `aggregate` SELECTs.

### 3. Per-scheme PMS views (the 3 dropdown entries)

For each PMS account, build a `PortfolioData` from its bridge series:
- **NAV curve rebased to 100** for display:
  `nav_display = pms_nav / pms_nav_at_inception × 100` (PMS unit NAV is base ~10).
- Return %, drawdown, trailing returns, monthly/quarterly computed by **reusing
  the engine's existing helpers** (`calculateDrawdownMetrics`,
  `computeMonthlyPnLFromHistoricalData`, the existing quarterly helper, and the
  extracted trailing-returns helper from §5) fed the rebased curve.
- Cards (`amountDeposited` / `currentExposure` / `totalProfit`) straight from the
  bridge. `metadata.isActive: true`, `metadata.inceptionDate` = first PMS date.

### 4. Combined Total Portfolio blend — `app/lib/pms-blend.ts` (new)

Produces the full blended TP `PortfolioData`. Inputs: the Zerodha component (from
the engine) + the three PMS bridge series.

**4a. Gather component daily series** (date → value, nav, pnl, cashflow):
- **Zerodha component:** daily NAV from the `Qode Total Portfolio` curve; daily
  value = `QAW++ Zerodha Total Portfolio` `portfolio_value` + `QAW+ …`
  `portfolio_value` per date; daily pnl/cashflow from the existing
  aggregated-scheme logic.
- **3 PMS components:** from the bridge.

**4b. Build the value-weighted combined NAV curve.** Union all dates (axis starts
2026-04-08; PMS-only until Zerodha enters 2026-05-22). For each date `t`:

```
combinedReturn(t) = Σ_j [ value_j(t−1) × (nav_j(t)/nav_j(t−1) − 1) ] / Σ_j value_j(t−1)
combinedNav(t)    = combinedNav(t−1) × (1 + combinedReturn(t))      // base 100
```

A component contributes only once it has a prior-day value (Zerodha enters with
zero weight before its inception). Forward-fill a component's value across
non-trading gaps. This is valid because each component NAV is already a clean
TWRR series, so its daily return needs no cashflow adjustment.

**4c. Assemble the combined `historicalData[]`**
`{ date, nav: combinedNav, prevNav, drawdown, pnl: Σ component pnl,
   capitalInOut: Σ component cashflow }` and run it through the **same**
`calculateDrawdownMetrics`, trailing helper, `computeMonthlyPnLFromHistoricalData`,
and quarterly helper. TP returns/drawdown/trailing/monthly/quarterly all derive
from this single curve, using identical machinery to every other client.

**4d. Cards (simple sums):**
- Amount Invested = Σ scheme cashflows + Σ PMS `cash_in_out`
- Current Value = `QAW++`/`QAW+` latest `portfolio_value` + Σ PMS latest value
  (this also fixes the missing-literal-tag ₹0 issue from the Problem section)
- Total Profit = `Qode Total Portfolio` `pnl` + Σ PMS `pnl`
- Cash flows = merged Zerodha + PMS, date-sorted

### 5. Engine integration — `handleGET`, gated

In the `for (const scheme of schemes)` loop, when `hasPms`:
- **PMS scheme key** → build its result via §3 (skip all `msTable` paths).
- **`"Total Portfolio"`** → replace the result with §4's blended output (the
  generic Qode-only TP block is bypassed for Ashok).
- **All other schemes** (`QAW++`, `QAW+`) → unchanged.

When `hasPms` is false → unchanged loop.

**One small safe refactor:** extract the period-walking body of
`calculateTrailingReturns` into a pure `computeTrailingReturnsFromCurve(curve,
ddMetrics)` helper, called by both the existing method and the blend. No behavior
change for existing callers.

### 6. Frontend, labels, scope

- The 3 PMS schemes appear in the dropdown automatically — `app/dashboard/page.tsx`
  drives the strategy list from `Object.keys(data)`, and each renders through the
  existing `{ data, metadata }` path. **No `page.tsx` change.**
- Labels: `Scheme PMS QAW`, `Scheme PMS QGF`, `Scheme PMS QTF`.
- PMS holdings are out of scope (see Non-goals).

### 7. Testing, safety, rollout

- **Read-only verified:** bridge + blend use only `findMany` / `aggregate`; no
  `create`/`update`/`delete`/`upsert`/`$executeRaw` anywhere.
- **Validation script** (`scripts/`, read-only, `tsx`) asserts:
  - combined Current Value ≈ `QAW++` PV + 3 × PMS PV (≈ ₹12.5 Cr),
  - combined inception = 2026-04-08,
  - combined NAV curve is properly daily-linked from base 100,
  - each PMS per-scheme return = `(nav_latest / nav_inception − 1)` (short window)
    or CAGR (≥ 365 days).
- **Regression guard:** diff `/api/bifurcated-portfolio` JSON for one other client
  (e.g. Dinesh) before/after — must be identical.
- `npm run build` passes.

## Files touched

| File | Change |
|---|---|
| `app/lib/bifurcated-client-builder.ts` | add optional `pms` input → `pmsSchemes` + dropdown keys |
| `app/lib/clients/ashok.ts` | add `pms: [...]` block (3 accounts) |
| `app/lib/pms-bridge.ts` | **new** — read `pms_master_sheet` per account_code |
| `app/lib/pms-blend.ts` | **new** — value-weighted combined TP curve + cards |
| `app/lib/bifurcated-portfolio-utils.ts` | gated `hasPms` block in `handleGET`; extract `computeTrailingReturnsFromCurve` helper |
| `scripts/` | **new** read-only validation script |

## Open questions / assumptions

- Assumes PMS unit NAV is the authoritative per-account TWRR series (verified
  consistent on 2026-06-30). If the data team later changes the PMS NAV
  definition, §4b weighting must be revisited.
- Assumes the QAW++/QAW+ `Zerodha Total Portfolio` `portfolio_value` columns are
  the correct rupee values for the Zerodha component (QAW++ latest = ₹4.94 Cr,
  confirmed). The `Qode Total Portfolio` `portfolio_value` column is unreliable
  (showed negative) and is NOT used for value weighting — only its NAV column is.
