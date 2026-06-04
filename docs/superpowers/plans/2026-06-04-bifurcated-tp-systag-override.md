# Bifurcated Total Portfolio system-tag-wise override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the bifurcated-client system-tag-wise dropdowns to the Total Portfolio page only, and make each selected tag drive its metric's Total Portfolio data over the tag's full natural date range (NAV baseline = `prev_nav`), per-metric independent, with default (no-selection) output identical to the `krish-bifurcation-generalize` branch.

**Architecture:** Additive override paths at the top of each `if (scheme === "Total Portfolio")` branch in `BifurcatedPortfolioEngine`. When the override that drives a metric is set, the branch does a raw single-tag read over the tag's full range and returns early; otherwise the existing authoritative path runs untouched. The frontend change is a one-line inversion of the dropdown visibility guard.

**Tech Stack:** Next.js 15 / React 19, TypeScript, Prisma (PostgreSQL). Reads only. Source file: `app/lib/bifurcated-portfolio-utils.ts`; UI: `app/dashboard/page.tsx`.

---

## Testing note (read this first)

This project has **no automated test suite**. The established verification pattern (see `scripts/verify-sarla-bifurcated-schemes.ts`, `scripts/verify-dinesh-pnl.ts`) is:
1. `npm run build` as the **type-safety gate** (run after every code task), and
2. read-only `npx tsx scripts/*.ts` probes + manual dashboard checks as the **behavior gate**.

This plan follows that pattern: each code task ends with a build + commit; behavior is verified in the final task via a read-only probe and a manual checklist. Do **not** fabricate a Jest/pytest harness — it does not exist here.

All edits are READ-ONLY Prisma calls (`findFirst`/`findMany`/`aggregate`). No `create`/`update`/`delete`/`upsert`.

## File structure

- **Modify** `app/lib/bifurcated-portfolio-utils.ts` — add override paths to 8 Total Portfolio branches (Tasks 1–6).
- **Modify** `app/dashboard/page.tsx` — invert `showDineshTagDropdowns` (Task 7).
- **Create** `scripts/verify-tp-systag-override.ts` — read-only verification probe (Task 8).

All override paths key off the `tagOverrides?: TagOverrides` parameter already threaded through every method (from the merge). `handleGET` already builds `tagOverrides` when `scheme === overrideScheme`, so with `scheme=Total Portfolio` in the request the overrides already reach these branches — they just need to be honored.

---

### Task 1: Deposit/Value override on Total Portfolio

Drives **Amount Invested** and **Current Value**. When `depositTag` is set, read that one tag's full range.

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts` (`getAmountDeposited` TP branch, `getLatestExposure` TP branch)

- [ ] **Step 1: Add the override path to `getAmountDeposited`'s Total Portfolio branch**

Find this block:

```ts
    if (scheme === "Total Portfolio") {
      // Always derive from combined cash flows (frozen old + DB new) —
      // the DB may not have old period capital_in_out entries even when
      // deposit tags are shared. Overrides target one scheme only; do
      // not propagate to the aggregate's sub-scheme calls.
      const cashFlows = await this.getCashFlows(qcode, "Total Portfolio");
      return cashFlows.reduce((sum, flow) => sum + flow.amount, 0);
    }
```

Replace it with (adds the `depositTag` short-circuit at the top):

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: when a Deposit/Value tag is selected on the Total
      // Portfolio page, amount invested = net capital_in_out for that single
      // tag over its full natural range.
      if (tagOverrides?.depositTag) {
        const depositSum = await this.msTable.aggregate({
          where: {
            qcode,
            system_tag: tagOverrides.depositTag,
            capital_in_out: { not: null },
          },
          _sum: { capital_in_out: true },
        });
        return Number(depositSum._sum.capital_in_out) || 0;
      }

      // Always derive from combined cash flows (frozen old + DB new) —
      // the DB may not have old period capital_in_out entries even when
      // deposit tags are shared. Overrides target one scheme only; do
      // not propagate to the aggregate's sub-scheme calls.
      const cashFlows = await this.getCashFlows(qcode, "Total Portfolio");
      return cashFlows.reduce((sum, flow) => sum + flow.amount, 0);
    }
```

- [ ] **Step 2: Add the override path to `getLatestExposure`'s Total Portfolio branch**

Find this line (the start of the TP branch):

```ts
    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
```

Insert the override block between the two lines so it reads:

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: Current Value/drawdown/nav from the selected
      // Deposit/Value tag's latest row (full natural range).
      if (tagOverrides?.depositTag) {
        const record = await this.msTable.findFirst({
          where: { qcode, system_tag: tagOverrides.depositTag },
          orderBy: { date: "desc" },
          select: { portfolio_value: true, drawdown: true, nav: true, date: true },
        });
        if (!record) return null;
        return {
          portfolioValue: Number(record.portfolio_value) || 0,
          drawdown: Math.abs(Number(record.drawdown) || 0),
          nav: Number(record.nav) || 0,
          date: record.date,
        };
      }

      if (this.config.qodeTotalPortfolioTag) {
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: completes with no type errors (route table prints).

- [ ] **Step 4: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): Deposit/Value tag override on Total Portfolio"
```

---

### Task 2: NAV-series override on Total Portfolio (the enabler)

Drives the equity chart + everything derived from the historical series. This is the keystone — once `getHistoricalData` honors `navTag`, the returns/trailing/monthly/quarterly branches route through it.

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts` (`getHistoricalData` TP branch)

- [ ] **Step 1: Add the `navTag` override path to `getHistoricalData`'s Total Portfolio branch**

Find this line (start of the TP branch) and the authoritative sub-branch right after it:

```ts
    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
        // Authoritative single continuous curve — no frozen splice, no rebasing.
```

Insert the override block between `if (scheme === "Total Portfolio") {` and `if (this.config.qodeTotalPortfolioTag) {` so it reads:

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: when a Returns/P&L tag is selected on the Total
      // Portfolio page, build the curve from that single tag's full natural
      // range. Prepend a NAV=100 baseline one day before the first row (the
      // tag's first row carries prev_nav=100), matching the authoritative
      // curve's "starts at 100" convention.
      if (tagOverrides?.navTag) {
        const overrideRows = await this.msTable.findMany({
          where: { qcode, system_tag: tagOverrides.navTag, nav: { not: null } },
          select: {
            date: true,
            nav: true,
            prev_nav: true,
            drawdown: true,
            pnl: true,
            capital_in_out: true,
          },
          orderBy: { date: "asc" },
        });

        const overrideResult = overrideRows.map((entry: any) => ({
          date: entry.date as Date,
          nav: Number(entry.nav) || 0,
          prevNav: entry.prev_nav != null ? Number(entry.prev_nav) : null,
          drawdown: Math.abs(Number(entry.drawdown) || 0),
          pnl: Number(entry.pnl) || 0,
          capitalInOut: Number(entry.capital_in_out) || 0,
        }));

        if (overrideResult.length > 0) {
          const baselineDate = new Date(overrideResult[0].date);
          baselineDate.setUTCDate(baselineDate.getUTCDate() - 1);
          overrideResult.unshift({
            date: baselineDate,
            nav: 100,
            prevNav: null,
            drawdown: 0,
            pnl: 0,
            capitalInOut: 0,
          });
        }

        return overrideResult;
      }

      if (this.config.qodeTotalPortfolioTag) {
        // Authoritative single continuous curve — no frozen splice, no rebasing.
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): NAV-series tag override on Total Portfolio historical data"
```

---

### Task 3: Returns % and Total Profit override on Total Portfolio

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts` (`getTotalProfit` TP branch, `calculatePortfolioReturns` TP branch)

- [ ] **Step 1: Add the `navTag` override path to `getTotalProfit`'s Total Portfolio branch**

Find:

```ts
    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
        // Qode Total Portfolio's pnl column is authoritative for the combined
```

Insert the override block so it reads:

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: Total Profit = sum of the selected Returns/P&L tag's
      // pnl over its full natural range.
      if (tagOverrides?.navTag) {
        const overrideProfit = await this.msTable.aggregate({
          where: { qcode, system_tag: tagOverrides.navTag, pnl: { not: null } },
          _sum: { pnl: true },
        });
        return Number(overrideProfit._sum.pnl) || 0;
      }

      if (this.config.qodeTotalPortfolioTag) {
        // Qode Total Portfolio's pnl column is authoritative for the combined
```

- [ ] **Step 2: Add the `navTag` override path to `calculatePortfolioReturns`'s Total Portfolio branch**

Find:

```ts
    if (scheme === "Total Portfolio") {
      if (this.config.qodeTotalPortfolioTag) {
        // Qode's first row has prev_nav=100 (the inception baseline) and
```

Insert the override block so it reads:

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: returns from the selected Returns/P&L tag's full
      // natural range, baseline = first row's prev_nav (?? 100), inception =
      // one day before the first row (captures the day-1 return).
      if (tagOverrides?.navTag) {
        const firstNavRecord = await this.msTable.findFirst({
          where: { qcode, system_tag: tagOverrides.navTag, nav: { not: null } },
          orderBy: { date: "asc" },
          select: { nav: true, prev_nav: true, date: true },
        });
        const latestNavRecord = await this.msTable.findFirst({
          where: { qcode, system_tag: tagOverrides.navTag, nav: { not: null } },
          orderBy: { date: "desc" },
          select: { nav: true, date: true },
        });

        if (!firstNavRecord || !latestNavRecord) return 0;

        const initialNav =
          firstNavRecord.prev_nav != null
            ? Number(firstNavRecord.prev_nav)
            : 100;
        const finalNav = Number(latestNavRecord.nav) || 0;
        const inceptionDate = new Date(firstNavRecord.date);
        inceptionDate.setUTCDate(inceptionDate.getUTCDate() - 1);
        const days =
          (latestNavRecord.date.getTime() - inceptionDate.getTime()) /
          (1000 * 60 * 60 * 24);

        if (days < 365) {
          return (finalNav / initialNav - 1) * 100;
        }
        return (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
      }

      if (this.config.qodeTotalPortfolioTag) {
        // Qode's first row has prev_nav=100 (the inception baseline) and
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): Returns % and Total Profit tag override on Total Portfolio"
```

---

### Task 4: Trailing returns + drawdown override on Total Portfolio

Trailing returns and the displayed drawdown both derive from the historical series. Force the `getHistoricalData` path (instead of the raw-DB-NAV path) when a `navTag` override is present, so they pick up the overridden series from Task 2.

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts` (`calculateTrailingReturns`)

- [ ] **Step 1: Route trailing returns through the overridden series when `navTag` is set**

Find:

```ts
    // For "Total Portfolio" with shared tags: use raw DB NAV (no rebasing) to match old flow
    // For "Total Portfolio" with different tags: use rebased combined data (Dinesh)
    const useRawDbNav = scheme === "Total Portfolio" && this.sharedNavTag;
    const useRebasedData = scheme === "Total Portfolio" && !this.sharedNavTag;
    const historicalData = (useRawDbNav)
      ? null
      : await this.getHistoricalData(qcode, scheme, tagOverrides);
```

Replace with (adds `hasNavOverride`, which suppresses the raw-DB-NAV path):

```ts
    // For "Total Portfolio" with shared tags: use raw DB NAV (no rebasing) to match old flow
    // For "Total Portfolio" with different tags: use rebased combined data (Dinesh)
    // Admin override: a selected Returns/P&L tag must drive trailing returns,
    // so force the getHistoricalData path (which honors the override) instead
    // of the raw-DB-NAV path.
    const hasNavOverride = scheme === "Total Portfolio" && !!tagOverrides?.navTag;
    const useRawDbNav =
      scheme === "Total Portfolio" && this.sharedNavTag && !hasNavOverride;
    const useRebasedData =
      scheme === "Total Portfolio" && !this.sharedNavTag && !hasNavOverride;
    const historicalData = (useRawDbNav)
      ? null
      : await this.getHistoricalData(qcode, scheme, tagOverrides);
```

(The displayed drawdown on Total Portfolio is computed in `handleGET` from `equityCurveForDisplay`, which already derives from `getHistoricalData(qcode, scheme, tagOverrides)` — so it follows the override automatically once Task 2 is in. No extra change needed for drawdown.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no type errors. (Note: `useRebasedData` may now be unused if it already was — if the build flags it as unused, leave it as-is only if it was already declared-and-unused before this change; otherwise keep the `&& !hasNavOverride` form shown above, which the build accepts.)

- [ ] **Step 3: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): trailing returns tag override on Total Portfolio"
```

---

### Task 5: Monthly & Quarterly PnL override on Total Portfolio

When a `navTag` override is set, compute monthly/quarterly PnL purely from the selected tag's series (bypassing the cross-scheme capital-in-out aggregation, which is not meaningful for a single inspected tag).

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts` (`calculateMonthlyPnL` TP branch, `calculateQuarterlyPnL` TP branch)

- [ ] **Step 1: Add the override path to `calculateMonthlyPnL`'s Total Portfolio branch**

Find:

```ts
    if (scheme === "Total Portfolio") {
      const unifiedHistoricalData = await this.getHistoricalData(
        qcode,
        "Total Portfolio"
      );
      const navBasedResult = this.computeMonthlyPnLFromHistoricalData(
        unifiedHistoricalData,
        false
      );
```

Insert the override short-circuit immediately after `if (scheme === "Total Portfolio") {` so it reads:

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: monthly PnL from the selected Returns/P&L tag's series
      // (full natural range, NAV=100 baseline). useFirstPrevNav=false matches
      // the authoritative path — the series already carries the prepended 100
      // baseline from getHistoricalData.
      if (tagOverrides?.navTag) {
        const overrideHistoricalData = await this.getHistoricalData(
          qcode,
          "Total Portfolio",
          tagOverrides
        );
        return this.computeMonthlyPnLFromHistoricalData(
          overrideHistoricalData,
          false
        );
      }

      const unifiedHistoricalData = await this.getHistoricalData(
        qcode,
        "Total Portfolio"
      );
      const navBasedResult = this.computeMonthlyPnLFromHistoricalData(
        unifiedHistoricalData,
        false
      );
```

- [ ] **Step 2: Add the override path to `calculateQuarterlyPnL`'s Total Portfolio branch**

Find:

```ts
    if (scheme === "Total Portfolio") {
      const unifiedHistoricalData = await this.getHistoricalData(
        qcode,
        "Total Portfolio"
      );
      const navBasedResult = this.computeQuarterlyPnLFromHistoricalData(
        unifiedHistoricalData,
        false
      );
```

Insert the override short-circuit immediately after `if (scheme === "Total Portfolio") {` so it reads:

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: quarterly PnL from the selected Returns/P&L tag's
      // series (full natural range, NAV=100 baseline).
      if (tagOverrides?.navTag) {
        const overrideHistoricalData = await this.getHistoricalData(
          qcode,
          "Total Portfolio",
          tagOverrides
        );
        return this.computeQuarterlyPnLFromHistoricalData(
          overrideHistoricalData,
          false
        );
      }

      const unifiedHistoricalData = await this.getHistoricalData(
        qcode,
        "Total Portfolio"
      );
      const navBasedResult = this.computeQuarterlyPnLFromHistoricalData(
        unifiedHistoricalData,
        false
      );
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): monthly & quarterly PnL tag override on Total Portfolio"
```

---

### Task 6: Cash Flow override on Total Portfolio

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts` (`getCashFlows` TP branch)

- [ ] **Step 1: Add the `cashflowTag` override path to `getCashFlows`'s Total Portfolio branch**

Find:

```ts
    if (scheme === "Total Portfolio") {
      // Combine frozen old scheme + every active parallel scheme. This
```

Insert the override block so it reads:

```ts
    if (scheme === "Total Portfolio") {
      // Admin override: cash flows from the selected Cash Flow tag's rows over
      // its full natural range.
      if (tagOverrides?.cashflowTag) {
        const overrideFlows = await this.msTable.findMany({
          where: {
            qcode,
            system_tag: tagOverrides.cashflowTag,
            AND: [
              { capital_in_out: { not: null } },
              { capital_in_out: { not: new Decimal(0) } },
            ],
          },
          select: { date: true, capital_in_out: true },
          orderBy: { date: "asc" },
        });
        return overrideFlows.map((entry: any) => ({
          date: this.normalizeDate(entry.date),
          amount: entry.capital_in_out?.toNumber() || 0,
          dividend: 0,
        }));
      }

      // Combine frozen old scheme + every active parallel scheme. This
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): Cash Flow tag override on Total Portfolio"
```

---

### Task 7: Frontend — show dropdowns only on Total Portfolio

**Files:**
- Modify: `app/dashboard/page.tsx` (`renderDineshContent`, `showDineshTagDropdowns`)

- [ ] **Step 1: Invert the dropdown visibility guard**

Find:

```ts
    // Override is per-strategy (option-2 semantics). The "Total Portfolio"
    // aggregate doesn't consult scheme tags for clients with qodeTotalPortfolioTag
    // (Dinesh/Arwani) or delegates to sub-schemes (Shilpa/Vikram), so the
    // override has no effect there — hide the dropdown to avoid confusion.
    // Admin-only: the per-strategy system_tag override is an internal
    // inspection tool. Only show it while an admin is impersonating a client
    // (the only way an admin views the dashboard) — never to real clients.
    const showDineshTagDropdowns =
      isImpersonating && availableSystemTags.length > 1 && isActive && !isTotalPortfolio;
```

Replace with:

```ts
    // System-tag-wise override lives ONLY on the Total Portfolio page for
    // bifurcated clients: each dropdown re-points its metric at a chosen
    // system_tag over that tag's full natural date range. Individual scheme
    // pages show no dropdowns.
    // Admin-only: the override is an internal inspection tool. Only show it
    // while an admin is impersonating a client (the only way an admin views
    // the dashboard) — never to real clients.
    const showDineshTagDropdowns =
      isImpersonating && availableSystemTags.length > 1 && isTotalPortfolio;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(bifurcated): show system-tag dropdowns only on Total Portfolio page"
```

---

### Task 8: Verification (read-only probe + manual checklist)

**Files:**
- Create: `scripts/verify-tp-systag-override.ts`

- [ ] **Step 1: Write the read-only data-contract probe**

This mirrors `scripts/verify-sarla-bifurcated-schemes.ts`. It confirms the contract the override relies on for a sample bifurcated client + tag: the tag exists, has a bounded date range, and its first row carries `prev_nav = 100`. READ-ONLY.

```ts
/**
 * Verify the data contract behind the Total Portfolio system-tag override:
 * for a sample bifurcated client + tag, confirm the tag exists, has a bounded
 * date range, and its first occurrence carries prev_nav = 100 (the baseline
 * the override returns/curve depend on). READ-ONLY.
 *
 * Usage: npx tsx scripts/verify-tp-systag-override.ts [qcode] [system_tag]
 *   defaults: QAC00053 "QYE++ Zerodha Total Portfolio"
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().split("T")[0] : "—";

async function main() {
  const qcode = process.argv[2] || "QAC00053";
  const tag = process.argv[3] || "QYE++ Zerodha Total Portfolio";

  console.log("=".repeat(80));
  console.log(`VERIFY TP override data contract — ${qcode} | "${tag}"`);
  console.log("=".repeat(80));

  const count = await prisma.bifurcated_master_sheet_test.count({
    where: { qcode, system_tag: tag },
  });
  const first = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode, system_tag: tag, nav: { not: null } },
    orderBy: { date: "asc" },
    select: { date: true, nav: true, prev_nav: true },
  });
  const last = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode, system_tag: tag, nav: { not: null } },
    orderBy: { date: "desc" },
    select: { date: true, nav: true },
  });

  console.log(`  rows:        ${count}`);
  console.log(`  date range:  ${fmt(first?.date)} -> ${fmt(last?.date)}`);
  console.log(`  first nav:   ${first?.nav}  prev_nav: ${first?.prev_nav}`);
  console.log(`  last nav:    ${last?.nav}`);

  const prevNav = first?.prev_nav != null ? Number(first.prev_nav) : null;
  const baselineOk = prevNav === 100;
  const hasData = count > 0 && !!first && !!last;

  console.log("");
  console.log(`  ${hasData ? "✓" : "✗"} tag has a bounded date range`);
  console.log(
    `  ${baselineOk ? "✓" : "✗"} first occurrence prev_nav = 100 ` +
      `(override baseline)${baselineOk ? "" : ` — got ${prevNav}`}`
  );

  await prisma.$disconnect();
  process.exit(hasData && baselineOk ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Run the probe (requires DB access)**

Run: `npx tsx scripts/verify-tp-systag-override.ts QAC00053 "QYE++ Zerodha Total Portfolio"`
Expected: exits `0` with `✓ tag has a bounded date range` and `✓ first occurrence prev_nav = 100`. If the baseline check fails, the data team's "first occurrence = prev_nav 100" contract does not hold for that tag — coordinate before relying on override returns for it.

- [ ] **Step 3: Manual dashboard verification (the behavior gate)**

Run the app (`npm run dev`, port 2030), log in as an admin, and impersonate a bifurcated client (e.g. Dinesh `QUS00072` or Arwani `QUS00085`). Verify:
  1. **Default unchanged:** On **Total Portfolio** with all three dropdowns on "Default", the numbers (Amount Invested, Current Value, Return %, chart, PnL tables) match the `krish-bifurcation-generalize` branch for the same client. (Compare against that branch deployed/run separately, or against a known-good screenshot.)
  2. **Returns override windows the data:** Set **Returns / P&L** to a windowed tag (e.g. `QYE++ Total Portfolio Value`). The equity chart + Return % now cover only that tag's date range, the curve starts at 100, and day-1 movement is present.
  3. **Per-metric independence:** With only Returns overridden, Amount Invested / Current Value / Cash Flow still show the default aggregate.
  4. **Deposit & Cash Flow overrides:** Setting Deposit/Value or Cash Flow to a tag updates only those cards/table.
  5. **Individual schemes have no dropdowns:** Switch the strategy selector to any individual scheme — the three dropdowns are absent.
  6. **Client-facing:** Log in as a non-admin client (or view without impersonation) — no dropdowns anywhere.

- [ ] **Step 4: Commit the probe**

```bash
git add scripts/verify-tp-systag-override.ts
git commit -m "test(bifurcated): read-only probe for Total Portfolio system-tag override contract"
```

---

## Self-review

**Spec coverage:**
- Frontend "only on Total Portfolio, removed from individual schemes" → Task 7. ✓
- "all system tags in dropdown" → already provided by `/api/system-tags` (unchanged); no task needed. ✓
- Per-metric independent (deposit / returns / cashflow groups) → Tasks 1, 3–5, 6 respectively; each keys off only its own override field. ✓
- Returns/P&L group unified through `getHistoricalData` → Task 2 enabler + Tasks 3–5 route through it. ✓
- Full natural date range (no `startDate` filter) → none of the override reads add a `date` filter. ✓
- Baseline = `prev_nav ?? 100`, prepend `{day-before, nav:100}` → Tasks 2 (curve) & 3 (returns). ✓
- Default preserved (identical to krish) → every override path is a top-of-branch short-circuit guarded by the override field; absent override ⇒ existing path runs verbatim. ✓
- Admin-only UI (`isImpersonating`) → preserved in Task 7's guard. ✓
- Drawdown follows navTag → covered via `equityCurveForDisplay`/`getHistoricalData` (Task 2), noted in Task 4. ✓
- Out of scope (server-side admin enforcement, regular-account dropdowns, date-filter coupling) → untouched. ✓

**Placeholder scan:** every code step contains complete code; no TBD/TODO. ✓

**Type consistency:** override reads return the same shapes as the authoritative paths they sit beside — `getHistoricalData` override returns the `{date,nav,prevNav,drawdown,pnl,capitalInOut}[]` shape; `getCashFlows` override returns `{date,amount,dividend}[]` (`CashFlow`); `getLatestExposure` override returns `{portfolioValue,drawdown,nav,date}`. `computeMonthly/QuarterlyPnLFromHistoricalData(..., false)` matches the authoritative TP call signature. ✓
