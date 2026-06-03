# Total Portfolio Export — NAV-Based Client Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Excel and PDF "Total Portfolio" exports match what the dashboard already renders on screen for NAV-based aggregate clients (Dinesh, Arwani, Ashwin Agarwal) — adding Trailing Returns, Monthly P&L, and a Quarterly Percent Return column. Sarla, Satidham, and classic bifurcated clients keep their current cash-only Total Portfolio export.

**Architecture:** Strictly additive plumbing. Add an optional `hasNavBasedTotalPortfolio?: boolean` parameter (default `false`) to both export libraries and to `handleDownloadExcel` / `handleDownloadPDF`. Mirror the UI condition `(!isTotalPortfolio || hasNavBasedTotalPortfolio)` inside both libraries. Pass the already-computed flag through at the two bifurcated render call sites only. No data-layer changes; no API changes; no rename of `isTotalPortfolio`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `xlsx-js-style`, NextAuth.js.

**Spec:** `docs/superpowers/specs/2026-05-27-total-portfolio-export-nav-fix-design.md`

**Testing note:** This codebase has no automated test infrastructure for these export libraries (confirmed in the spec). Tasks gate on `npm run lint` + `npm run build` for structural correctness; the spec's manual verification plan (Task 5 below) covers behavior.

---

## Task 1: Excel export — plumb `hasNavBasedTotalPortfolio` and rewrite gates

**Files:**
- Modify: `components/generateExcelReport.ts`

Adds the new optional field to the input interface, destructures it, derives a single `includeFullSections` flag, and rewrites the three section gates. Net behavior: when `hasNavBasedTotalPortfolio=false` (every existing caller), output is byte-identical to before.

- [ ] **Step 1: Read the current input interface**

Run: `Read components/generateExcelReport.ts offset=39 limit=55`

Expected: `ExcelReportInput` defined at lines 39–73, function destructure at lines 79–92. Confirm `isTotalPortfolio: boolean` is at line 41 and `quarterlyPnl` ends the interface at line 72.

- [ ] **Step 2: Add `hasNavBasedTotalPortfolio?: boolean` to the input interface**

Use `Edit`.

`old_string`:
```ts
interface ExcelReportInput {
  strategyName: string;
  isTotalPortfolio: boolean;
  isActive: boolean;
```

`new_string`:
```ts
interface ExcelReportInput {
  strategyName: string;
  isTotalPortfolio: boolean;
  hasNavBasedTotalPortfolio?: boolean;
  isActive: boolean;
```

- [ ] **Step 3: Destructure the new field with default `false`**

Use `Edit`.

`old_string`:
```ts
  const {
    strategyName,
    isTotalPortfolio,
    isActive,
    sessionUserName,
    dataAsOfDate,
    accountInfo,
    metrics,
    combinedTrailing,
    cashFlows,
    monthlyPnl,
    quarterlyPnl,
  } = input;
```

`new_string`:
```ts
  const {
    strategyName,
    isTotalPortfolio,
    hasNavBasedTotalPortfolio = false,
    isActive,
    sessionUserName,
    dataAsOfDate,
    accountInfo,
    metrics,
    combinedTrailing,
    cashFlows,
    monthlyPnl,
    quarterlyPnl,
  } = input;

  const includeFullSections = !isTotalPortfolio || hasNavBasedTotalPortfolio;
```

- [ ] **Step 4: Rewrite the Trailing Returns gate (line 140 area)**

Use `Edit`.

`old_string`:
```ts
    // ========================================================================
    // 2. Trailing Returns Section (skip for Total Portfolio)
    // ========================================================================
    if (!isTotalPortfolio && combinedTrailing) {
```

`new_string`:
```ts
    // ========================================================================
    // 2. Trailing Returns Section (rendered only when includeFullSections)
    // ========================================================================
    if (includeFullSections && combinedTrailing) {
```

- [ ] **Step 5: Rewrite the Monthly P&L gate (line 229 area)**

Use `Edit`.

`old_string`:
```ts
    // ========================================================================
    // 4. Monthly PnL Section (skip for Total Portfolio)
    // ========================================================================
    if (!isTotalPortfolio && monthlyPnl && Object.keys(monthlyPnl).length > 0) {
```

`new_string`:
```ts
    // ========================================================================
    // 4. Monthly PnL Section (rendered only when includeFullSections)
    // ========================================================================
    if (includeFullSections && monthlyPnl && Object.keys(monthlyPnl).length > 0) {
```

- [ ] **Step 6: Rewrite the Quarterly P&L percent/cash branching (lines 264-291)**

There are three `if (isTotalPortfolio)` branches in this block. All three flip on the same `includeFullSections` flag with the polarity inverted (`!includeFullSections` is the cash-only path).

Use `Edit` three times.

First `Edit` — the title row (currently identical in both branches, so this is a no-op refactor we can leave alone, but we update the condition):

`old_string`:
```ts
      headerRows.push(wsData.length);
      if (isTotalPortfolio) {
        wsData.push(["", "Quarterly P&L"]);
      } else {
        wsData.push(["", "Quarterly P&L"]);
      }
      subHeaderRows.push(wsData.length);

      if (isTotalPortfolio) {
        wsData.push(["", "Year", "Quarter", "Cash Return (₹)"]);
      } else {
        wsData.push(["", "Year", "Quarter", "Percent Return (%)", "Cash Return (₹)"]);
      }
```

`new_string`:
```ts
      headerRows.push(wsData.length);
      wsData.push(["", "Quarterly P&L"]);
      subHeaderRows.push(wsData.length);

      if (!includeFullSections) {
        wsData.push(["", "Year", "Quarter", "Cash Return (₹)"]);
      } else {
        wsData.push(["", "Year", "Quarter", "Percent Return (%)", "Cash Return (₹)"]);
      }
```

Second `Edit` — the row loop:

`old_string`:
```ts
      years.forEach((year) => {
        const yearData = quarterlyPnl[year];
        if (isTotalPortfolio) {
          wsData.push(["", year, "Q1", parseFloat(yearData.cash.q1) || 0]);
          wsData.push(["", year, "Q2", parseFloat(yearData.cash.q2) || 0]);
          wsData.push(["", year, "Q3", parseFloat(yearData.cash.q3) || 0]);
          wsData.push(["", year, "Q4", parseFloat(yearData.cash.q4) || 0]);
        } else {
          wsData.push(["", year, "Q1", parseFloat(yearData.percent.q1) || 0, parseFloat(yearData.cash.q1) || 0]);
          wsData.push(["", year, "Q2", parseFloat(yearData.percent.q2) || 0, parseFloat(yearData.cash.q2) || 0]);
          wsData.push(["", year, "Q3", parseFloat(yearData.percent.q3) || 0, parseFloat(yearData.cash.q3) || 0]);
          wsData.push(["", year, "Q4", parseFloat(yearData.percent.q4) || 0, parseFloat(yearData.cash.q4) || 0]);
        }
      });
```

`new_string`:
```ts
      years.forEach((year) => {
        const yearData = quarterlyPnl[year];
        if (!includeFullSections) {
          wsData.push(["", year, "Q1", parseFloat(yearData.cash.q1) || 0]);
          wsData.push(["", year, "Q2", parseFloat(yearData.cash.q2) || 0]);
          wsData.push(["", year, "Q3", parseFloat(yearData.cash.q3) || 0]);
          wsData.push(["", year, "Q4", parseFloat(yearData.cash.q4) || 0]);
        } else {
          wsData.push(["", year, "Q1", parseFloat(yearData.percent.q1) || 0, parseFloat(yearData.cash.q1) || 0]);
          wsData.push(["", year, "Q2", parseFloat(yearData.percent.q2) || 0, parseFloat(yearData.cash.q2) || 0]);
          wsData.push(["", year, "Q3", parseFloat(yearData.percent.q3) || 0, parseFloat(yearData.cash.q3) || 0]);
          wsData.push(["", year, "Q4", parseFloat(yearData.percent.q4) || 0, parseFloat(yearData.cash.q4) || 0]);
        }
      });
```

- [ ] **Step 7: Quick grep to confirm `isTotalPortfolio` is no longer used as a section gate**

Run: `grep -n "isTotalPortfolio" components/generateExcelReport.ts`

Expected output (3 lines): the interface declaration (line 41 area), the destructure (line 82 area), and the `includeFullSections` derivation (newly added). **No** raw `isTotalPortfolio` usages in conditional gates. If a fourth line appears that's a gate, you missed an edit — go back and fix it.

- [ ] **Step 8: Commit**

```bash
git add components/generateExcelReport.ts
git commit -m "fix(excel-export): honor hasNavBasedTotalPortfolio gate"
```

---

## Task 2: PDF export — plumb `hasNavBasedTotalPortfolio` and update `showFullPages` + page numbering

**Files:**
- Modify: `components/buildPortfolioReportHTML.ts`

Adds the new optional prop, broadens `showFullPages` to mirror the UI condition, and switches the two page-number arithmetic lines off `isTotalPortfolio` and onto `showFullPages` (with the polarity inverted: full = 5 starting page, stripped = 3).

- [ ] **Step 1: Read current prop interface and destructure**

Run: `Read components/buildPortfolioReportHTML.ts offset=40 limit=110`

Expected: `PortfolioReportProps` defined at lines 40–62 with `isTotalPortfolio?: boolean` at line 55. Destructure at lines 124–143 with `isTotalPortfolio = false` at line 138.

- [ ] **Step 2: Add `hasNavBasedTotalPortfolio?: boolean` to the prop interface**

Use `Edit`.

`old_string`:
```ts
  strategyName?: string;
  isTotalPortfolio?: boolean;
  isActive?: boolean;
```

`new_string`:
```ts
  strategyName?: string;
  isTotalPortfolio?: boolean;
  hasNavBasedTotalPortfolio?: boolean;
  isActive?: boolean;
```

- [ ] **Step 3: Destructure the new prop with default `false`**

Use `Edit`.

`old_string`:
```ts
    strategyName,
    isActive = true,
    isTotalPortfolio = false,
    dateFormatter = defaultDateFmt,
```

`new_string`:
```ts
    strategyName,
    isActive = true,
    isTotalPortfolio = false,
    hasNavBasedTotalPortfolio = false,
    dateFormatter = defaultDateFmt,
```

- [ ] **Step 4: Broaden `showFullPages` to mirror the UI condition (line 251)**

Use `Edit`.

`old_string`:
```ts
  // =============== HTML ===============
  const showFullPages = !isTotalPortfolio; // if total portfolio => only summary + quarterly cash + cash flows
```

`new_string`:
```ts
  // =============== HTML ===============
  // Mirrors app/dashboard/page.tsx:1312 so NAV-based total portfolios
  // (Dinesh, Arwani, Ashwin) get the full report, while sum-of-schemes
  // aggregates (Sarla, Satidham, classic bifurcated) stay cash-only.
  const showFullPages = !isTotalPortfolio || hasNavBasedTotalPortfolio;
```

- [ ] **Step 5: Fix the starting page-number line (line 925 area)**

This is inside a string-interpolated client-side script. The `isTotalPortfolio` reference at line 925 must now follow `showFullPages` so the page count matches what was actually rendered.

Use `Edit`.

`old_string`:
```ts
        // Set starting page number based on portfolio type
        let nextPageNum = isTotalPortfolio ? 3 : 5; // Next page after cash flows page
```

`new_string`:
```ts
        // Set starting page number based on whether full pages were rendered
        let nextPageNum = showFullPages ? 5 : 3; // Next page after cash flows page
```

- [ ] **Step 6: Fix the pagination completion log (line 982 area)**

Use `Edit`.

`old_string`:
```ts
        console.log('Pagination completed. Total rows:', originalRows.length, 'Pages created:', nextPageNum - (isTotalPortfolio ? 3 : 5));
```

`new_string`:
```ts
        console.log('Pagination completed. Total rows:', originalRows.length, 'Pages created:', nextPageNum - (showFullPages ? 5 : 3));
```

- [ ] **Step 7: Grep to confirm `isTotalPortfolio` no longer drives content or page math**

Run: `grep -n "isTotalPortfolio" components/buildPortfolioReportHTML.ts`

Expected: 3 lines — the interface declaration, the destructure default, and the `${JSON.stringify(isTotalPortfolio)}` line that emits the flag into the runtime script (this one stays; it's currently unused after our changes but harmless to leave for now — removing it is out of scope). **No** other usages should remain. If `showFullPages` does not appear on lines 925 and 982 (or thereabouts), an edit was missed.

- [ ] **Step 8: Commit**

```bash
git add components/buildPortfolioReportHTML.ts
git commit -m "fix(pdf-export): honor hasNavBasedTotalPortfolio in showFullPages and page numbering"
```

---

## Task 3: Dashboard — plumb the flag through both handlers and pass it at the bifurcated call sites

**Files:**
- Modify: `app/dashboard/page.tsx`

Adds the new optional parameter to both export handlers, passes it through to the underlying libraries, and updates the two bifurcated render call sites to pass the value that's already in scope.

- [ ] **Step 1: Read the two handler signatures and the bifurcated call sites**

Run:
- `Read app/dashboard/page.tsx offset=842 limit=15` — `handleDownloadPDF` signature.
- `Read app/dashboard/page.tsx offset=890 limit=20` — `buildPortfolioReportHTML` call (with `isTotalPortfolio` at line 894).
- `Read app/dashboard/page.tsx offset=969 limit=10` — `handleDownloadExcel` signature.
- `Read app/dashboard/page.tsx offset=1009 limit=20` — `generateExcelReport` call (with `isTotalPortfolio` at line 1011).
- `Read app/dashboard/page.tsx offset=1268 limit=30` — bifurcated render section with `hasNavBasedTotalPortfolio` declared at line 1270 and the two buttons at lines 1283/1292.

Confirm the structure matches before editing.

- [ ] **Step 2: Extend `handleDownloadPDF` signature**

Use `Edit`.

`old_string`:
```ts
  const handleDownloadPDF = async (convertedStats: Stats, strategyName: string, isTotalPortfolio: boolean, exportMetadata?: { inceptionDate?: string | null; dataAsOfDate?: string | null }) => {
```

`new_string`:
```ts
  const handleDownloadPDF = async (convertedStats: Stats, strategyName: string, isTotalPortfolio: boolean, exportMetadata?: { inceptionDate?: string | null; dataAsOfDate?: string | null }, hasNavBasedTotalPortfolio: boolean = false) => {
```

- [ ] **Step 3: Pass `hasNavBasedTotalPortfolio` into the `buildPortfolioReportHTML` call**

Use `Edit`.

`old_string`:
```ts
        strategyName,
        isTotalPortfolio,
        isActive: true,
```

`new_string`:
```ts
        strategyName,
        isTotalPortfolio,
        hasNavBasedTotalPortfolio,
        isActive: true,
```

- [ ] **Step 4: Extend `handleDownloadExcel` signature**

Use `Edit`.

`old_string`:
```ts
  const handleDownloadExcel = async (
    convertedStats: Stats,
    strategyName: string,
    isTotalPortfolio: boolean,
    overrideAccountInfo?: { accountName: string; accountType: string; broker: string },
    exportMetadata?: { dataAsOfDate?: string | null; isActive?: boolean }
  ) => {
```

`new_string`:
```ts
  const handleDownloadExcel = async (
    convertedStats: Stats,
    strategyName: string,
    isTotalPortfolio: boolean,
    overrideAccountInfo?: { accountName: string; accountType: string; broker: string },
    exportMetadata?: { dataAsOfDate?: string | null; isActive?: boolean },
    hasNavBasedTotalPortfolio: boolean = false
  ) => {
```

- [ ] **Step 5: Pass `hasNavBasedTotalPortfolio` into the `generateExcelReport` call**

Use `Edit`.

`old_string`:
```ts
      generateExcelReport({
        strategyName,
        isTotalPortfolio,
        isActive: exportMetadata?.isActive ?? metadata?.isActive ?? true,
```

`new_string`:
```ts
      generateExcelReport({
        strategyName,
        isTotalPortfolio,
        hasNavBasedTotalPortfolio,
        isActive: exportMetadata?.isActive ?? metadata?.isActive ?? true,
```

- [ ] **Step 6: Update the bifurcated PDF call site (line 1283 area)**

The bifurcated section already computes `const hasNavBasedTotalPortfolio = isDinesh || isArwani || isAshwin;` at line 1270 — it's in scope at this call site. Pass it as the new positional argument after `exportMetadata`.

Use `Edit`.

`old_string`:
```ts
              onClick={() => handleDownloadPDF(convertedStats, selectedStrategy, isTotalPortfolio, { inceptionDate: strategyData.metadata?.inceptionDate, dataAsOfDate: strategyData.metadata?.dataAsOfDate })}
```

`new_string`:
```ts
              onClick={() => handleDownloadPDF(convertedStats, selectedStrategy, isTotalPortfolio, { inceptionDate: strategyData.metadata?.inceptionDate, dataAsOfDate: strategyData.metadata?.dataAsOfDate }, hasNavBasedTotalPortfolio)}
```

- [ ] **Step 7: Update the bifurcated Excel call site (line 1292 area)**

Use `Edit`.

`old_string`:
```ts
              onClick={() => handleDownloadExcel(convertedStats, selectedStrategy, isTotalPortfolio, undefined, { dataAsOfDate: strategyData.metadata?.dataAsOfDate, isActive })}
```

`new_string`:
```ts
              onClick={() => handleDownloadExcel(convertedStats, selectedStrategy, isTotalPortfolio, undefined, { dataAsOfDate: strategyData.metadata?.dataAsOfDate, isActive }, hasNavBasedTotalPortfolio)}
```

- [ ] **Step 8: Verify the Sarla / Satidham / regular-account call sites are unchanged**

Run: `grep -n "handleDownloadPDF\|handleDownloadExcel" app/dashboard/page.tsx`

Expected: 12 lines total — the two handler definitions (lines 842, 969) and ten call sites:
- Sarla PDF + Excel (lines 1108, 1117)
- Satidham PDF + Excel (lines 1197, 1206)
- Bifurcated PDF + Excel (lines 1283, 1292) — only these two were edited in Steps 6/7
- Regular single-account PDF + Excel (lines 1442, 1454)
- Regular multi-account PDF + Excel (lines 1506, 1515)

Open each of the eight non-bifurcated call sites and confirm they do **not** pass `hasNavBasedTotalPortfolio` — they continue to rely on the default `false`. Line numbers may shift slightly after the previous edits; the count and the structure are what matters.

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "fix(dashboard): plumb hasNavBasedTotalPortfolio through PDF/Excel handlers"
```

---

## Task 4: Build + lint gate

**Files:** none (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exits cleanly. If it surfaces new warnings/errors in the three files we touched, fix them in place and commit; otherwise proceed.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: build succeeds. TypeScript should accept the new optional fields without complaint because every caller either passes the new value (bifurcated) or relies on the default `false` (Sarla, Satidham, regular account).

If the build fails with a TS error referencing `hasNavBasedTotalPortfolio`, check:
- Did Step 2 of Task 1 / Step 2 of Task 2 add the field to **both** interfaces?
- Did Step 3 of Task 1 / Step 3 of Task 2 add a default of `false` so existing callers compile?

- [ ] **Step 3: Commit any lint fixes (only if Step 1 produced edits)**

```bash
git add -A
git commit -m "chore: lint fixes for hasNavBasedTotalPortfolio plumbing"
```

(Skip this step if `npm run lint` was clean.)

---

## Task 5: Manual verification (per spec)

**Files:** none (behavior check)

This codebase has no automated rendering tests for the export libraries, so verification is manual. Use the dev server on port 2030 (`npm run dev`). Each of these scenarios must hold.

- [ ] **Step 1: NAV-based Total Portfolio — Dinesh**

Log in as Dinesh. In the dashboard, click the **Total Portfolio** tab in the bifurcated strategy view.

Confirm on-screen: Trailing Returns, Monthly P&L, and Quarterly P&L (with Percent Return column) all visible (this is the existing pre-fix UI behavior).

Click **Excel**. Open the downloaded file. Expected sections in order:
1. Portfolio Statistics
2. Trailing Returns (Portfolio vs Benchmark) — 12 rows
3. Cash Flow Summary + Cash Flows Detail
4. Monthly P&L (Year / Month / % / ₹)
5. Quarterly P&L with **four columns** (Year, Quarter, Percent Return (%), Cash Return (₹))

Click **PDF**. Confirm: the PDF contains the full report (not just the summary + quarterly cash + cash flows trio). Confirm page numbers in the footer match the actual page count (the fix to lines 925/982 of `buildPortfolioReportHTML.ts` is what makes the numbering correct after the content broadens).

- [ ] **Step 2: NAV-based Total Portfolio — Arwani, Ashwin**

Repeat Step 1 for Arwani and for Ashwin Agarwal. Same expectations.

- [ ] **Step 3: Cash-only Total Portfolio — Sarla (no regression)**

Log in as Sarla (`QUS0007`). Select **Total Portfolio**. Click **Excel** and **PDF** in turn.

Expected Excel (must match pre-fix output exactly):
1. Portfolio Statistics
2. Cash Flow Summary + Cash Flows Detail
3. Quarterly P&L with **three columns** (Year, Quarter, Cash Return (₹)) — no Percent Return column.

No Trailing Returns section. No Monthly P&L section.

Expected PDF: summary + quarterly cash + cash flows only (current cash-only format).

- [ ] **Step 4: Cash-only Total Portfolio — Satidham (no regression)**

Repeat Step 3 for Satidham (`QUS0010`). Same expectations as Sarla.

- [ ] **Step 5: Per-strategy export (no regression)**

For any client with multiple strategies, select an individual scheme (not Total Portfolio) and click Excel + PDF. Expected: both exports unchanged from before — full report with all sections.

- [ ] **Step 6: Regular account export (no regression)**

Log in as a regular PMS, managed, or prop account user (single-account view, no multi-strategy tabs). Click Excel. Expected: unchanged from before — full report with all sections.

---

## Final Commit (optional)

If Tasks 1–4 each committed individually as instructed, no final commit is needed. If you batched edits into one commit instead, ensure the commit message documents both the Excel and PDF fix.

```bash
git log --oneline -n 5
```

Expected: three commits (one per modified file) on top of the spec commit.
