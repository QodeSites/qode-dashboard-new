# Total Portfolio Export — NAV-Based Client Fix

**Date:** 2026-05-27
**Status:** Approved design, ready for implementation plan
**Affected clients:** Dinesh, Arwani, Ashwin Agarwal (`hasNavBasedTotalPortfolio === true`)

## Goal

Bring the Excel and PDF exports of the **Total Portfolio** view into parity
with what the on-screen dashboard already renders for NAV-based aggregate
clients. Today these three clients see Trailing Returns, Monthly P&L, and a
Percent Return column for Quarterly P&L on screen, but their downloaded Excel
and PDF strip those sections out.

Out of scope: changing the export shape for Sarla (`QUS0007`), Satidham
(`QUS0010`), or classic bifurcated clients — their cash-only Total Portfolio
export is intentional because their aggregate is a sum of schemes with
different NAV bases, and only cash returns/cash flows are mathematically
meaningful at the aggregate level.

## Root Cause

The export libraries gate three sections on a single boolean
`isTotalPortfolio`:

- `components/generateExcelReport.ts:140` — `if (!isTotalPortfolio && combinedTrailing)` skips Trailing Returns.
- `components/generateExcelReport.ts:229` — `if (!isTotalPortfolio && monthlyPnl && …)` skips Monthly P&L.
- `components/generateExcelReport.ts:264-291` — Quarterly P&L renders cash-only when `isTotalPortfolio`, otherwise renders percent + cash.
- `components/buildPortfolioReportHTML.ts:251` — `const showFullPages = !isTotalPortfolio;` (with explicit comment "if total portfolio => only summary + quarterly cash + cash flows").

The dashboard UI gates the same sections on a richer condition at
`app/dashboard/page.tsx:1312`:

```ts
{(!isTotalPortfolio || hasNavBasedTotalPortfolio) && ( … )}
```

where `hasNavBasedTotalPortfolio = isDinesh || isArwani || isAshwin`
(`app/dashboard/page.tsx:1270`).

This second clause is never passed through to the export libraries, so they
strip sections the UI displays.

## Constraints

- **READ-ONLY** dashboard code. No data-layer or query changes.
- **Additive** — new optional parameter `hasNavBasedTotalPortfolio?: boolean`
  on both export entry points, defaulting to `false`. Existing callers that
  don't pass it (Sarla, Satidham, regular-account flows) are unaffected.
- **No regressions** for Sarla/Satidham/classic bifurcated Total Portfolio
  exports — they continue to produce the current cash-only output.
- **No regressions** for any per-strategy (non-Total-Portfolio) export.

## Approach (Approach A from brainstorming)

Mirror the UI's existing condition (`!isTotalPortfolio ||
hasNavBasedTotalPortfolio`) inside both export libraries. No semantic
refactor, no rename of `isTotalPortfolio` — surgical change in the spirit of
the project's CLAUDE.md guidance.

### Change Set

#### 1. `components/generateExcelReport.ts`

- Add `hasNavBasedTotalPortfolio?: boolean` to the `ExcelReportInput`
  interface (around line 39-73).
- In the function body, destructure it with default `false`.
- Introduce one derived flag immediately after destructuring:

  ```ts
  const includeFullSections = !isTotalPortfolio || hasNavBasedTotalPortfolio;
  ```

- Rewrite the three gates:
  - Line 140 — `if (!isTotalPortfolio && combinedTrailing)` → `if (includeFullSections && combinedTrailing)`
  - Line 229 — `if (!isTotalPortfolio && monthlyPnl && Object.keys(monthlyPnl).length > 0)` → `if (includeFullSections && monthlyPnl && Object.keys(monthlyPnl).length > 0)`
  - Lines 264, 271, 281 (Quarterly P&L branching) — every `if (isTotalPortfolio)` becomes `if (!includeFullSections)`. All three flip on the same derived flag.

#### 2. `components/buildPortfolioReportHTML.ts`

- Add `hasNavBasedTotalPortfolio?: boolean` to the input type (around line 55).
- Destructure with default `false` (around line 138).
- Line 251:

  ```ts
  const showFullPages = !isTotalPortfolio || hasNavBasedTotalPortfolio;
  ```

- Lines 925 and 982 currently use `isTotalPortfolio` directly for page-number
  arithmetic (`nextPageNum = isTotalPortfolio ? 3 : 5`). Switch both to
  `showFullPages` so the page count matches what was actually rendered:

  ```ts
  let nextPageNum = showFullPages ? 5 : 3;
  ```

  Apply the same inversion in the `console.log` at line 982.

  `isTotalPortfolio` stays in the file — it still drives the title-text
  branch and isn't otherwise content-gating after this change.

#### 3. `app/dashboard/page.tsx`

Three plumbing edits:

- **`handleDownloadPDF`** (signature at line 842): add
  `hasNavBasedTotalPortfolio?: boolean` parameter; pass it through to the
  `buildPortfolioReportHTML` call (around line 864-902).
- **`handleDownloadExcel`** (signature at line 969): add
  `hasNavBasedTotalPortfolio?: boolean` parameter; pass it through to the
  `generateExcelReport` call (around line 1009-1026).
- **Call sites in `renderBifurcatedStrategyTabs`** (lines 1283 and 1292):
  pass `hasNavBasedTotalPortfolio` (already in scope at line 1270) as the
  new argument.

The Sarla call sites (lines 1108, 1117), Satidham call sites (lines 1197,
1206), and regular-account call sites (lines 1454, 1515) require no edits —
the new parameter is optional and defaults to `false`, preserving current
behavior.

## Data Flow

```
renderBifurcatedStrategyTabs (page.tsx:1268)
  ├── hasNavBasedTotalPortfolio = isDinesh || isArwani || isAshwin   [line 1270, unchanged]
  ├── PDF button → handleDownloadPDF(..., hasNavBasedTotalPortfolio)  [new arg, line 1283]
  │     └── buildPortfolioReportHTML({ ..., hasNavBasedTotalPortfolio })
  │           ├── showFullPages = !isTotalPortfolio || hasNavBasedTotalPortfolio  [line 251]
  │           └── page numbering uses showFullPages                   [lines 925, 982]
  └── Excel button → handleDownloadExcel(..., hasNavBasedTotalPortfolio)  [new arg, line 1292]
        └── generateExcelReport({ ..., hasNavBasedTotalPortfolio })
              └── includeFullSections = !isTotalPortfolio || hasNavBasedTotalPortfolio
                  → trailing returns, monthly P&L, quarterly % all gated on this
```

## Verification

Manual verification (no automated test infrastructure exists for these
exports):

1. **NAV-based Total Portfolio (the fix path).** Log in as Dinesh, Arwani, or
   Ashwin and select **Total Portfolio**:
   - Excel must add Trailing Returns, Monthly P&L, and a Percent Return
     column in Quarterly P&L. The on-screen sections must match the new Excel
     rows.
   - PDF must include the full pages; rendered page numbers must match the
     actual page count.

2. **Cash-only Total Portfolio (no regression).** Log in as Sarla (`QUS0007`)
   or Satidham (`QUS0010`) and select **Total Portfolio**:
   - Excel and PDF must be unchanged from before this fix — Stats + Cash
     Flows + cash-only Quarterly P&L.

3. **Per-strategy export (no regression).** For any client, select an
   individual scheme/strategy:
   - Excel and PDF must be unchanged from before this fix.

4. **Regular-account export (no regression).** Log in as a regular
   PMS/managed/prop account user (no multi-strategy view):
   - Excel must be unchanged from before this fix.

5. `npm run lint` and `npm run build` must pass.

## Risks

- **Page numbering edge cases in PDF.** Lines 925/982 are inside a
  client-side pagination script (string-interpolated into the HTML). Flipping
  from `isTotalPortfolio` to `showFullPages` should be a strict improvement,
  but the only way to confirm is to render a PDF for each client class and
  visually compare the page footers. Verification step 1 covers this.

- **Hidden callers.** A grep for `generateExcelReport(` and
  `buildPortfolioReportHTML(` should return only the two call sites in
  `app/dashboard/page.tsx`. If a third caller exists, it inherits the new
  default `false` for `hasNavBasedTotalPortfolio` and continues to produce
  the current output — no breakage, but worth noting during implementation.

## Out of Scope

- No changes to `app/lib/sarla-utils.ts`, `app/lib/portfolio-utils.ts`,
  `app/lib/bifurcated-portfolio-utils.ts`, or any API route.
- No new automated tests (existing repo has no export-rendering tests; adding
  the infra is beyond this bug fix).
- No format unification across client types (Option C from brainstorming —
  deferred).
- No changes to the cash-only Total Portfolio format used by
  Sarla/Satidham/classic bifurcated.
