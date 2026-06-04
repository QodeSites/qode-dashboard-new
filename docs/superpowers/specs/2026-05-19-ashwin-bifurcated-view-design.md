# Ashwin Agarwal — Bifurcated View Integration

**Date:** 2026-05-19
**Status:** Approved design, ready for implementation plan
**Client:** Ashwin Agarwal (`icode = QUS00097`, `qcode = QAC00083`)

## Goal

Add Ashwin Agarwal to the existing `BifurcatedPortfolioEngine` (in
`app/lib/bifurcated-portfolio-utils.ts`) so that his dashboard surfaces three
views — `Total Portfolio`, `Scheme QYE++`, `Scheme QAW++` — using the same
mechanism that powers the Arwani view.

## Constraints

- **READ-ONLY** dashboard code. No `create` / `update` / `delete` / `upsert`
  / raw INSERTs. Adheres to the database safety rules in `CLAUDE.md`.
- **Additive** — no engine logic changes, no holdings-API logic changes. Only
  new constants, new route files, and ternary extensions in two dashboard
  pages.
- **No regressions** for Arwani, Dinesh, Shilpa, Vikram. The engine is
  parametrized over `ClientConfig`, so adding a new config cannot perturb
  existing clients.

## Confirmed DB Facts

From `scripts/investigate-ashwin-data.ts` (read-only) plus a Prisma Studio
spot-check by the team:

| Item | Value |
|---|---|
| icode | `QUS00097` |
| qcode | `QAC00083` |
| `accounts.account_name` | `Ashwin Agarwal` |
| `accounts.broker` | `zerodha` |
| `accounts.account_type` | `managed_account` |
| `pooled_account_users` entry | icode=`QUS00097`, access=`read`, created=2026-03-02 |
| `master_sheet` rows for QAC00083 with target tags | **0** — Ashwin lives entirely in the bifurcated table |
| `bifurcated_master_sheet_test` rows by tag | `QYE++ Zerodha Total Portfolio`: 54 rows, 2026-02-24 → 2026-05-18<br>`QYE++ Total Portfolio Value`: 54 rows, same range<br>`QAW++ Zerodha Total Portfolio`: 11 rows, 2026-05-04 → 2026-05-18<br>`Qode Total Portfolio`: 54 rows, same range as QYE++ |
| Cash flows (`bifurcated_master_sheet_test.capital_in_out` column) | QAW++: 10,000,000 on 2026-05-04, 2,500,000 on 2026-05-14 (verified in Studio). Standalone `capital_in_out` table has zero rows for QAC00083 — engine does not read from it, so this is irrelevant. |
| `bifurcated_equity_holding_test` | 6 rows, latest 2026-05-18, strategies: `QAW++`, `QYE++` |
| `bifurcated_mutual_fund_holding_sheet_test` | 20 rows, latest 2026-05-18, strategies: `QYE++` only |

Setting `qodeTotalPortfolioTag = "Qode Total Portfolio"` is **mandatory** for
Ashwin — the engine's `msTable` getter uses this to route reads to
`bifurcated_master_sheet_test` (where Ashwin's data actually lives).

## Architecture

The bifurcated engine (`app/lib/bifurcated-portfolio-utils.ts`) is a single
`BifurcatedPortfolioEngine` class parametrized by a `ClientConfig`. Each
supported client gets one instance + one `createApiHandlers(engine)` export
+ one 3-line API route re-exporting that handler. The dashboard
(`app/dashboard/page.tsx`) and holdings page (`app/holding-summary/page.tsx`)
detect each bifurcated client by `icode` and dispatch to the matching API.

Ashwin slots in as the fifth bifurcated client. Pattern matches Arwani
(both have two parallel active schemes and a `Qode Total Portfolio`
aggregate; no inactive scheme; `EMPTY_FROZEN_DATA`).

## File Changes

### 1. `app/lib/bifurcated-portfolio-utils.ts` (modify, additive only)

Add **after** `ARWANI_CONFIG`:

```ts
// Ashwin Agarwal: identical shape to Arwani — two parallel active schemes
// (QYE++ since 2026-02-24, QAW++ added 2026-05-04) and an authoritative
// Qode Total Portfolio aggregate curve. No inactive scheme; the engine's
// frozen-scheme branches stay dormant via sentinel oldSchemeName/tags.
const ASHWIN_CONFIG: ClientConfig = {
  clientName: "Ashwin Agarwal",
  defaultQcode: "QAC00083",
  accountCode: "AC13",
  oldSchemeName: "__no_old_scheme__",
  newSchemeName: "Scheme QYE++",
  oldFinalNav: 100,
  newStartDate: new Date("2026-02-24"),
  depositSystemTag: "QYE++ Zerodha Total Portfolio",
  navSystemTag: "QYE++ Zerodha Total Portfolio",
  oldSchemeDepositTag: "__no_old_deposit_tag__",
  oldSchemeNavTag: "__no_old_nav_tag__",
  qodeTotalPortfolioTag: "Qode Total Portfolio",
  portfolioMapping: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QYE++": {
      current: "QYE++ Zerodha Total Portfolio",
      metrics: "QYE++ Zerodha Total Portfolio",
      nav: "QYE++ Total Portfolio Value",
      isActive: true,
      tags: {
        depositTag: "QYE++ Zerodha Total Portfolio",
        navTag: "QYE++ Total Portfolio Value",
        startDate: new Date("2026-02-24"),
      },
    },
    "Scheme QAW++": {
      current: "QAW++ Zerodha Total Portfolio",
      metrics: "QAW++ Zerodha Total Portfolio",
      nav: "QAW++ Zerodha Total Portfolio",
      isActive: true,
      tags: {
        depositTag: "QAW++ Zerodha Total Portfolio",
        navTag: "QAW++ Zerodha Total Portfolio",
        startDate: new Date("2026-05-04"),
      },
    },
  },
};
```

And at the bottom of the file (alongside the existing engine instances and
API exports):

```ts
const ashwinEngine = new BifurcatedPortfolioEngine(ASHWIN_CONFIG, EMPTY_FROZEN_DATA);
export const AshwinApi = createApiHandlers(ashwinEngine);
```

### 2. `app/api/ashwin-api/route.ts` (new)

```ts
import { AshwinApi } from '@/app/lib/bifurcated-portfolio-utils';
export const GET = AshwinApi.GET;
```

### 3. `app/api/ashwin-holdings-api/route.ts` (new)

Byte-for-byte copy of `app/api/arwani-holdings-api/route.ts` with the
following constant + string substitutions:

| Original | Replace with |
|---|---|
| `ARWANI_ICODE = "QUS00085"` | `ASHWIN_ICODE = "QUS00097"` |
| `ARWANI_QCODE = "QAC00071"` | `ASHWIN_QCODE = "QAC00083"` |
| Identifier references `ARWANI_ICODE` / `ARWANI_QCODE` | corresponding `ASHWIN_*` |
| Error message strings mentioning "Arwani" | "Ashwin" |

All Prisma calls in this file are read-only (`findFirst`, `findMany`,
`count`) and remain unchanged.

### 4. `app/dashboard/page.tsx` (modify)

**Add detection (around line 424):**
```ts
const isAshwin = effectiveIcode === "QUS00097";
const isBifurcatedClient = isDinesh || isShilpa || isVikram || isArwani || isAshwin;
```

**Extend `bifurcatedConfig` picker (around line 517-525):**

Append a final `: { api: "/api/ashwin-api", qcode: "QAC00083", name: "Ashwin Agarwal" }`
fallback after the existing Arwani branch.

**Extend `hasNavBasedTotalPortfolio` (line 1267):**
```ts
const hasNavBasedTotalPortfolio = isDinesh || isArwani || isAshwin;
```

**Extend broker-label ternary (line 1302):**
```ts
broker={
  isDinesh ? "Dinesh" :
  isShilpa ? "Shilpa" :
  isVikram ? "Vikram Trading" :
  isArwani ? "Arwani" :
  "Ashwin Agarwal"
}
```

**Extend empty-state error-message ternary (line 1368):** mirror the broker
ternary, returning `"Ashwin Agarwal"` in the final fallback.

The `useEffect` dependency arrays at lines 578 and 701 already reference
`isBifurcatedClient`, so no list-level change is needed there — but verify
during implementation.

### 5. `app/holding-summary/page.tsx` (modify)

**Add detection (around line 520):**
```ts
const isAshwin = session?.user?.icode === "QUS00097";
```

**Extend dispatch chain (around line 530-538):**
```ts
if (isArwani) fetchArwaniHoldings();
else if (isAshwin) fetchAshwinHoldings();
else if (isDinesh) fetchDineshHoldings();
else if (isSarla || isSatidham) fetchHoldingsForSpecialAccounts();
else fetchAccounts();
```

**Extend dependency arrays (lines 539, 545)** to include `isAshwin`.

**Extend negative guard (line 542):** add `&& !isAshwin`.

**Add `fetchAshwinHoldings`:** copy of `fetchArwaniHoldings` with URL
`/api/ashwin-holdings-api` and "Ashwin" in the error message.

## Verification Plan

Before declaring complete:

1. **Build passes:** `npm run build` exits 0.
2. **API smoke test:** authenticated GET to `/api/ashwin-api?qcode=QAC00083`
   returns a JSON object with three top-level keys (`Total Portfolio`,
   `Scheme QYE++`, `Scheme QAW++`).
3. **Cash-flow sanity:**
   - `Scheme QAW++` `amountDeposited` = ₹1,25,00,000 (10M + 2.5M).
   - `Scheme QYE++` `amountDeposited` matches the sum of
     `bifurcated_master_sheet_test.capital_in_out` rows for QAC00083 +
     `system_tag = "QYE++ Zerodha Total Portfolio"`.
4. **NAV curve:** `Total Portfolio` final NAV ≈ 113.06 (verified DB value);
   curve length = 54 days.
5. **Dashboard render:** login as `QUS00097` → strategy dropdown shows three
   options → all three render charts + stats cards without errors.
6. **Holdings page:** `/holding-summary` shows 6 equity + 20 MF holdings;
   strategy filter offers `QAW++` and `QYE++`.
7. **Regression check:** login as each of Arwani / Dinesh / Shilpa / Vikram
   and confirm dashboards still load.
8. **Read-only audit:** grep added code for `create|update|delete|upsert`
   — zero hits expected.

## Risks & Notes

- **QAW++ short history.** Only 11 days of data as of 2026-05-18. Since-
  inception return ≈ 1.87%. The visuals will reflect this honestly — no
  behaviour change needed.
- **`accountCode` field is vestigial** for bifurcated clients. Set to
  `"AC13"` for sequence consistency; the engine never reads it. This is
  the same pattern as Arwani's `"AC12"`.
- **`broker` string is vestigial** for label routing in `stats-cards.tsx`
  (which only branches on `'jainam'`). Set to `"Ashwin Agarwal"` for
  display in the surrounding UI.
- **Standalone `capital_in_out` table is empty for QAC00083.** The engine
  reads cash flows from the `bifurcated_master_sheet_test.capital_in_out`
  *column* (verified by tracing `getAmountDeposited` and `getCashFlows`),
  not from the standalone table. Empty-table state is benign.

## Out of Scope

- No `CLAUDE.md` updates in this change (can be a follow-up).
- No refactor of the per-client holdings-API route into a shared
  parameterized route. The duplication cost is one ~190-line file; the
  refactor would touch four working routes and risk regression. Keep the
  current per-client pattern.
- No changes to `arwani-portfolio-utils.ts` (legacy, unused).
- No new test scaffolding — the project has no test suite for this code
  path; manual verification per the plan above.
