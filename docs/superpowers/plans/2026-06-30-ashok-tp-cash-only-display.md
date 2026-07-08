# Ashok Total Portfolio Sarla-style Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Ashok Jogani HUF's Total Portfolio tab — and its PDF/Excel exports — like Sarla/Satidham (absolute ₹ only, no %/toggle, no NAV curve, no trailing table) while KEEPING the monthly table (the one deviation).

**Architecture:** A derived `pmsBlendedTP` flag (true only for a PMS client's Total Portfolio) drives an `effectiveNavBased = hasNavBasedTotalPortfolio && !pmsBlendedTP` value that is threaded through the three display consumers (StatsCards, the RevenueChart guard, PnlTable) and both export generators. A new `PnlTable` `cashOnly` mode forces ₹ + hides toggles but keeps monthly. The PDF gets a new ₹ monthly table on its stripped path; the Excel un-gates its monthly section. Pure display/export — no engine, API, or DB change.

**Tech Stack:** Next.js 15 / React 19, TypeScript. Source: `app/dashboard/page.tsx`, `components/PnlTable.tsx`, `components/buildPortfolioReportHTML.ts`, `components/generateExcelReport.ts`.

## Global Constraints

- No automated test suite exists. **`npm run build` is the type/compile gate** and must pass after every task. Behavior is verified manually (impersonate the client) and by regression-checking other clients.
- Read-only w.r.t. data: this plan touches **no** Prisma/DB code. Do not add any DB calls.
- Change **only** Ashok's Total Portfolio tab + its exports. Every branch added must be a no-op for other clients and for Ashok's non-TP tabs. The discriminator is `pmsBlendedTP`, which is false whenever `config.pmsSchemes` is empty (i.e. everyone except Ashok) — so `effectiveNavBased === hasNavBasedTotalPortfolio` and `cashOnly === false` for them.
- `pmsBlendedTP` is derived: `isTotalPortfolio && (bifurcatedClient?.config?.pmsSchemes?.length ?? 0) > 0`.

---

### Task 1: `PnlTable` — add `cashOnly` mode

**Files:**
- Modify: `components/PnlTable.tsx`

**Interfaces:**
- Produces: `PnlTable` accepts a new optional prop `cashOnly?: boolean` (default `false`). When `true`: both quarterly and monthly tables render in ₹, the per-table %/₹ toggle is hidden, and the monthly table is still shown. Distinct from `showOnlyQuarterlyCash` (which hides monthly).

- [ ] **Step 1: Add `cashOnly` to the props interface and destructure**

In `components/PnlTable.tsx`, change:

```ts
interface PnlTableProps {
  quarterlyPnl: QuarterlyPnlData;
  monthlyPnl: MonthlyPnlData;
  showOnlyQuarterlyCash?: boolean;
  showPmsQawView?: boolean;
  fees?: { [year: string]: { q1?: number; q2?: number; q3?: number; q4?: number } };
}
```
to add `cashOnly?: boolean;`:
```ts
interface PnlTableProps {
  quarterlyPnl: QuarterlyPnlData;
  monthlyPnl: MonthlyPnlData;
  showOnlyQuarterlyCash?: boolean;
  showPmsQawView?: boolean;
  cashOnly?: boolean;
  fees?: { [year: string]: { q1?: number; q2?: number; q3?: number; q4?: number } };
}
```
and change the destructure:
```ts
export function PnlTable({
  quarterlyPnl,
  monthlyPnl,
  showOnlyQuarterlyCash = false,
  showPmsQawView = false,
  fees,
}: PnlTableProps) {
```
to:
```ts
export function PnlTable({
  quarterlyPnl,
  monthlyPnl,
  showOnlyQuarterlyCash = false,
  showPmsQawView = false,
  cashOnly = false,
  fees,
}: PnlTableProps) {
```

- [ ] **Step 2: Force ₹ + hide toggle in the quarterly table**

In `renderQuarterlyTable`, change:
```ts
  const displayType = showOnlyQuarterlyCash || showPmsQawView ? "cash" : viewType;
  const isPercentView = displayType === "percent" && !showOnlyQuarterlyCash && !showPmsQawView;
```
to:
```ts
  const displayType = showOnlyQuarterlyCash || showPmsQawView || cashOnly ? "cash" : viewType;
  const isPercentView = displayType === "percent" && !showOnlyQuarterlyCash && !showPmsQawView && !cashOnly;
```
and change the toggle guard:
```ts
        {!showOnlyQuarterlyCash && !showPmsQawView && (
```
to:
```ts
        {!showOnlyQuarterlyCash && !showPmsQawView && !cashOnly && (
```

(`isCashDisplay` already derives from `displayType === "cash"`, so it needs no change.)

- [ ] **Step 3: Force ₹ + hide toggle in the monthly table**

In `renderMonthlyTable`, change:
```ts
  const displayType = showPmsQawView ? "percent" : viewType;
  const isPercentView = displayType === "percent";
```
to:
```ts
  const displayType = showPmsQawView ? "percent" : cashOnly ? "cash" : viewType;
  const isPercentView = displayType === "percent";
```
and change the toggle guard:
```ts
        {!showPmsQawView && (
```
to:
```ts
        {!showPmsQawView && !cashOnly && (
```

(The monthly render gate at the bottom stays `{!showOnlyQuarterlyCash && renderMonthlyTable()}` — `cashOnly` must NOT hide monthly.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: completes, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add components/PnlTable.tsx
git commit -m "feat(pnl): add cashOnly mode (force ₹, hide toggle, keep monthly)"
```

---

### Task 2: `renderDineshContent` — strip the on-screen Total Portfolio for PMS clients

**Files:**
- Modify: `app/dashboard/page.tsx` (`renderDineshContent`, ~lines 1284–1360)

**Interfaces:**
- Consumes: `PnlTable` `cashOnly` prop (Task 1); `bifurcatedClient.config.pmsSchemes` (exists from the PMS-blend feature).
- Produces: local `const pmsBlendedTP` and `const effectiveNavBased` in `renderDineshContent`, used later by the export tasks.

- [ ] **Step 1: Compute `pmsBlendedTP` and `effectiveNavBased`**

In `renderDineshContent`, immediately after the existing line:
```ts
    const hasNavBasedTotalPortfolio = bifurcatedClient?.hasNavBasedTotalPortfolio ?? false;
```
add:
```ts
    // PMS-blended clients (Ashok) render their Total Portfolio Sarla/Satidham-style:
    // absolute ₹ only, no NAV curve, no trailing table — but keep monthly.
    const pmsBlendedTP =
      isTotalPortfolio && (bifurcatedClient?.config?.pmsSchemes?.length ?? 0) > 0;
    const effectiveNavBased = hasNavBasedTotalPortfolio && !pmsBlendedTP;
```

- [ ] **Step 2: Lock StatsCards to cash for the PMS-blended TP**

Change the `StatsCards` prop:
```ts
          hasNavBasedTotalPortfolio={hasNavBasedTotalPortfolio}
```
to:
```ts
          hasNavBasedTotalPortfolio={effectiveNavBased}
```
(For Ashok's TP `effectiveNavBased` is `false` → `lockToCashView` in StatsCards → ₹-only Returns card, no %/Value toggle. For everyone else it equals `hasNavBasedTotalPortfolio`.)

- [ ] **Step 3: Hide the NAV chart + trailing table for the PMS-blended TP**

Change the RevenueChart guard:
```ts
        {(!isTotalPortfolio || hasNavBasedTotalPortfolio) && (
```
to:
```ts
        {(!isTotalPortfolio || effectiveNavBased) && (
```

- [ ] **Step 4: Pass `cashOnly` to PnlTable**

Change:
```ts
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={false}
          showPmsQawView={false}
        />
```
to:
```ts
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={false}
          showPmsQawView={false}
          cashOnly={pmsBlendedTP}
        />
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): Sarla-style Total Portfolio for PMS-blended clients (Ashok)"
```

---

### Task 3: PDF export — strip TP but add a ₹ monthly table

**Files:**
- Modify: `components/buildPortfolioReportHTML.ts`
- Modify: `app/dashboard/page.tsx` (`handleDownloadPDF` signature + its `buildPortfolioReportHTML` call + the PDF button `onClick` in `renderDineshContent`)

**Interfaces:**
- Consumes: `pmsBlendedTP` (Task 2).
- Produces: `buildPortfolioReportHTML` accepts `pmsBlendedTP?: boolean`; `handleDownloadPDF(..., pmsBlendedTP: boolean = false)`.

- [ ] **Step 1: Accept `pmsBlendedTP` in the report input**

In `components/buildPortfolioReportHTML.ts`, in the input interface change:
```ts
  isTotalPortfolio?: boolean;
  hasNavBasedTotalPortfolio?: boolean;
```
to:
```ts
  isTotalPortfolio?: boolean;
  hasNavBasedTotalPortfolio?: boolean;
  pmsBlendedTP?: boolean;
```
and in the destructure (near `hasNavBasedTotalPortfolio = false,`) add `pmsBlendedTP = false,`.

- [ ] **Step 2: Capture monthly cash values in `monthlyData`**

Change:
```ts
      const row: any = { year, months: {}, totalPercent: rec?.totalPercent };
      monthOrderFull.forEach((m) => {
        row.months[m] = { percent: months[m]?.percent ?? null };
      });
```
to:
```ts
      const row: any = { year, months: {}, totalPercent: rec?.totalPercent, totalCash: rec?.totalCash };
      monthOrderFull.forEach((m) => {
        row.months[m] = { percent: months[m]?.percent ?? null, cash: months[m]?.cash ?? null };
      });
```

- [ ] **Step 3: Add a ₹ monthly table to the stripped (cash) path**

In the `showFullPages ? ... : ...` block, the `:` branch currently ends its Quarterly ₹ section with:
```ts
              </tbody>
            </table>
          </div>
        </div>
        `
```
Replace that closing with the same closing plus a conditional ₹ monthly section (rendered only for `pmsBlendedTP`):
```ts
              </tbody>
            </table>
          </div>
        </div>
        ${
          pmsBlendedTP
            ? `
        <div class="section-header">Monthly Profit and Loss (₹)</div>
        <div class="section no-split">
          <div class="section-content">
            <table class="monthly-table">
              <thead>
                <tr>
                  <th>Year</th>
                  ${monthOrderShort.map(m => `<th>${m}</th>`).join("")}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${
                  monthlyData.length
                    ? monthlyData.map(row => `
                      <tr>
                        <td style="font-weight:600;">${row.year}</td>
                        ${monthOrderFull.map(m => {
                          const val = row.months[m]?.cash ?? null;
                          return `<td class="${getPnlColorClass(val)}">${formatCashAmountNoSymbol(val)}</td>`;
                        }).join("")}
                        <td class="${getPnlColorClass(row.totalCash)}" style="font-weight:600;">${formatCashAmountNoSymbol(row.totalCash)}</td>
                      </tr>`).join("")
                    : `<tr><td colspan="14" style="text-align:center;">No data available</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        `
            : ""
        }
        `
```
(`monthOrderShort`, `monthOrderFull`, `getPnlColorClass`, and `formatCashAmountNoSymbol` are already defined in this file — the Quarterly ₹ table and the full-path monthly table use them.)

- [ ] **Step 4: Thread `pmsBlendedTP` through `handleDownloadPDF`**

In `app/dashboard/page.tsx`, change the `handleDownloadPDF` signature:
```ts
  const handleDownloadPDF = async (convertedStats: Stats, strategyName: string, isTotalPortfolio: boolean, exportMetadata?: { inceptionDate?: string | null; dataAsOfDate?: string | null }, hasNavBasedTotalPortfolio: boolean = false) => {
```
to add a trailing param:
```ts
  const handleDownloadPDF = async (convertedStats: Stats, strategyName: string, isTotalPortfolio: boolean, exportMetadata?: { inceptionDate?: string | null; dataAsOfDate?: string | null }, hasNavBasedTotalPortfolio: boolean = false, pmsBlendedTP: boolean = false) => {
```
In the object passed to `buildPortfolioReportHTML`, add `pmsBlendedTP,` right after `hasNavBasedTotalPortfolio,`.

- [ ] **Step 5: Pass `pmsBlendedTP` from the PDF button**

In `renderDineshContent`, change the PDF button `onClick`:
```ts
              onClick={() => handleDownloadPDF(convertedStats, selectedStrategy, isTotalPortfolio, { inceptionDate: strategyData.metadata?.inceptionDate, dataAsOfDate: strategyData.metadata?.dataAsOfDate }, hasNavBasedTotalPortfolio)}
```
to:
```ts
              onClick={() => handleDownloadPDF(convertedStats, selectedStrategy, isTotalPortfolio, { inceptionDate: strategyData.metadata?.inceptionDate, dataAsOfDate: strategyData.metadata?.dataAsOfDate }, hasNavBasedTotalPortfolio, pmsBlendedTP)}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add components/buildPortfolioReportHTML.ts app/dashboard/page.tsx
git commit -m "feat(pdf): Ashok TP export cash-only with ₹ monthly table"
```

---

### Task 4: Excel export — strip TP but keep the monthly section

**Files:**
- Modify: `components/generateExcelReport.ts`
- Modify: `app/dashboard/page.tsx` (`handleDownloadExcel` signature + its `generateExcelReport` call + the Excel button `onClick` in `renderDineshContent`)

**Interfaces:**
- Consumes: `pmsBlendedTP` (Task 2).
- Produces: `generateExcelReport` accepts `pmsBlendedTP?: boolean`; `handleDownloadExcel(..., pmsBlendedTP: boolean = false)`.

- [ ] **Step 1: Accept `pmsBlendedTP` and split the gates**

In `components/generateExcelReport.ts`, in `ExcelReportInput` change:
```ts
  isTotalPortfolio: boolean;
  hasNavBasedTotalPortfolio?: boolean;
```
to:
```ts
  isTotalPortfolio: boolean;
  hasNavBasedTotalPortfolio?: boolean;
  pmsBlendedTP?: boolean;
```
In the destructure add `pmsBlendedTP = false,` next to `hasNavBasedTotalPortfolio = false,`.

Change:
```ts
  const includeFullSections = !isTotalPortfolio || hasNavBasedTotalPortfolio;
```
to:
```ts
  const includeFullSections = !isTotalPortfolio || (hasNavBasedTotalPortfolio && !pmsBlendedTP);
  const includeMonthly = includeFullSections || pmsBlendedTP;
```

- [ ] **Step 2: Gate the monthly section on `includeMonthly`**

Change:
```ts
    if (includeFullSections && monthlyPnl && Object.keys(monthlyPnl).length > 0) {
```
to:
```ts
    if (includeMonthly && monthlyPnl && Object.keys(monthlyPnl).length > 0) {
```

- [ ] **Step 3: Thread `pmsBlendedTP` through `handleDownloadExcel`**

In `app/dashboard/page.tsx`, change the `handleDownloadExcel` signature's last param:
```ts
    hasNavBasedTotalPortfolio: boolean = false
  ) => {
```
to:
```ts
    hasNavBasedTotalPortfolio: boolean = false,
    pmsBlendedTP: boolean = false
  ) => {
```
In the object passed to `generateExcelReport`, add `pmsBlendedTP,` right after `hasNavBasedTotalPortfolio,`.

- [ ] **Step 4: Pass `pmsBlendedTP` from the Excel button**

In `renderDineshContent`, change the Excel button `onClick`:
```ts
              onClick={() => handleDownloadExcel(convertedStats, selectedStrategy, isTotalPortfolio, undefined, { dataAsOfDate: strategyData.metadata?.dataAsOfDate, isActive }, hasNavBasedTotalPortfolio)}
```
to:
```ts
              onClick={() => handleDownloadExcel(convertedStats, selectedStrategy, isTotalPortfolio, undefined, { dataAsOfDate: strategyData.metadata?.dataAsOfDate, isActive }, hasNavBasedTotalPortfolio, pmsBlendedTP)}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add components/generateExcelReport.ts app/dashboard/page.tsx
git commit -m "feat(excel): Ashok TP export cash-only, keep monthly section"
```

---

### Task 5: Manual verification + regression

**Files:** none (verification only)

- [ ] **Step 1: Verify Ashok's Total Portfolio (the behavior gate)**

Run `npm run dev`, log in as an admin, impersonate **Ashok Jogani HUF** (`QUS00124` / `QAC00110`), open the **Total Portfolio** tab. Confirm:
  - Returns card shows a ₹ value only — **no `Value/Percentage` toggle**.
  - **No NAV/performance chart** and **no Trailing Returns table**.
  - Quarterly **and** Monthly P&L tables both present, in **₹**, with **no %/₹ toggle**.
  - PDF export and Excel export each contain: ₹ figures, no chart/trailing, **and** a monthly table.

- [ ] **Step 2: Verify Ashok's scheme tabs are unchanged**

Switch the strategy dropdown to `Scheme PMS QAW` (and `Scheme QAW++`). Confirm the full view is intact: %/Value toggle, NAV chart, Trailing Returns table.

- [ ] **Step 3: Regression — other clients unchanged**

Impersonate **Dinesh Goel** (`QUS00072`/`QAC00053`) or **Arwani** — a nav-based bifurcated client with no PMS. Confirm the Total Portfolio tab is unchanged: %/Value toggle, NAV chart, Trailing Returns, monthly-with-toggle. Impersonate a **Sarla/Satidham** user and confirm their TP is unchanged (still no monthly). PDF/Excel for these unchanged.

- [ ] **Step 4: Final build**

Run: `npm run build`
Expected: clean.

---

## Self-review

**Spec coverage:**
- TP-only, individual tabs unchanged → gated on `pmsBlendedTP` which requires `isTotalPortfolio` (Task 2). ✓
- Absolute-only Returns card, no toggle → `effectiveNavBased=false` → StatsCards `lockToCashView` (Task 2 Step 2). ✓
- No trailing table + no NAV curve → RevenueChart guard (Task 2 Step 3). ✓
- Keep monthly, cash-only, no toggle (screen) → `PnlTable cashOnly` (Task 1) + wired (Task 2 Step 4). ✓
- Exports match, keep monthly → PDF ₹ monthly table (Task 3) + Excel `includeMonthly` (Task 4). ✓
- Only Ashok / no other client affected → `pmsBlendedTP` false for non-PMS clients (Global Constraints; verified Task 5 Step 3). ✓
- No engine/data change → no DB/engine files in the file list. ✓

**Placeholder scan:** every step has complete code; no TBD/TODO. ✓

**Type consistency:** the new param `pmsBlendedTP: boolean` is named identically in `renderDineshContent`, both handlers, and both generators; `cashOnly?: boolean` matches between `PnlTableProps` and the `renderDineshContent` call site. `monthlyData` rows gain `cash`/`totalCash` used only in Task 3's new table. ✓
