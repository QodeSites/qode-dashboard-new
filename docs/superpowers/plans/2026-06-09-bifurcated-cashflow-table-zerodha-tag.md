# Bifurcated Cash In/Out Table (Zerodha-Total-Portfolio Tags) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Source the bifurcated clients' Cash In/Out table from the base/strategy "total portfolio" cash tags in the bifurcated master sheet, without changing Amount Invested.

**Architecture:** Add a display-only reader `getCashFlowTableEntries` to `BifurcatedPortfolioEngine` that reads `config.depositSystemTag` (Total Portfolio) or the scheme's `depositTag` (strategy) — broker-aware via config, so Zerodha → `Zerodha Total Portfolio` and Radiance → `Total Portfolio Exposure`. Swap the single cash-table call site to it. `getCashFlows`/`getAmountDeposited` stay untouched, so Amount Invested is unchanged. Exports + frontend consume the same `portfolioData.cashFlows`, so they follow automatically.

**Tech Stack:** Next.js 15 / TypeScript, Prisma `findMany` on `bifurcated_master_sheet_test` (read-only, SELECT).

**Verification note:** No automated test framework for this path. Verification is `npm run build` + a read-only `npx tsx` probe + diff invariants + a manual browser check. All DB access is SELECT-only per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-06-09-bifurcated-cashflow-table-zerodha-tag-design.md`

---

## Task 1: Add `getCashFlowTableEntries` and swap the cash-table call site

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts` — add a method after `getCashFlows` (≈ line 483); swap the call site (≈ line 1273)

- [ ] **Step 1: Add the display-only reader after `getCashFlows`**

Insert this method immediately after the closing brace of `getCashFlows` (the `}` at ≈ line 483, before `private async getTotalProfit(`):

```ts
  // Cash In/Out TABLE source (display only). Deliberately separate from
  // getCashFlows so it does NOT affect Amount Invested — getAmountDeposited
  // still derives from getCashFlows. Reads the broker's base/strategy
  // "total portfolio" cash tag from the bifurcated master sheet:
  //   Total Portfolio -> config.depositSystemTag (e.g. "Zerodha Total Portfolio",
  //                      or "Total Portfolio Exposure" for Radiance)
  //   a specific scheme -> that scheme's depositTag (e.g. "QAW++ Zerodha Total
  //                        Portfolio"), from the scheme's inception onwards.
  private async getCashFlowTableEntries(
    qcode: string,
    scheme: string
  ): Promise<CashFlow[]> {
    const isTotal = scheme === "Total Portfolio";
    const schemeTags = isTotal ? null : this.getSchemeTagsAndDate(scheme);
    const tag = isTotal ? this.config.depositSystemTag : schemeTags!.depositTag;

    const data = await this.msTable.findMany({
      where: {
        qcode,
        system_tag: tag,
        ...(schemeTags ? { date: { gte: schemeTags.startDate } } : {}),
        AND: [
          { capital_in_out: { not: null } },
          { capital_in_out: { not: new Decimal(0) } },
        ],
      },
      select: { date: true, capital_in_out: true },
      orderBy: { date: "asc" },
    });

    return data.map((entry: any) => ({
      date: this.normalizeDate(entry.date),
      amount: entry.capital_in_out?.toNumber() || 0,
      dividend: 0,
    }));
  }
```

- [ ] **Step 2: Swap the cash-table call site**

At ≈ line 1273, change:
```ts
        const cashFlows = await this.getCashFlows(qcode, scheme);
```
to:
```ts
        const cashFlows = await this.getCashFlowTableEntries(qcode, scheme);
```
This is the only call site that populates the displayed `portfolioData.cashFlows`. Do NOT change the `getCashFlows` call inside `getAmountDeposited` (≈ line 203).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0, no type errors. (If it errors on `/api/bifurcated-holdings` "Failed to collect page data", that's a known intermittent build-time DB issue — re-run once.)

- [ ] **Step 4: Confirm the change is exactly the added method + one-line swap (Amount Invested untouched)**

Run:
```bash
git diff --stat
echo "--- new method present? ---"; grep -n "getCashFlowTableEntries" app/lib/bifurcated-portfolio-utils.ts
echo "--- getAmountDeposited still uses getCashFlows (unchanged)? ---"; sed -n '199,206p' app/lib/bifurcated-portfolio-utils.ts | grep -n "getCashFlows"
echo "--- getCashFlows body untouched in diff? ---"; git diff app/lib/bifurcated-portfolio-utils.ts | grep -E "^[-+].*getCashFlows\(" 
```
Expected:
- only `app/lib/bifurcated-portfolio-utils.ts` changed;
- `getCashFlowTableEntries` appears twice (definition + call site);
- `getAmountDeposited` still calls `getCashFlows` (line ≈203 present);
- the only `getCashFlows(` diff line is the single `-`/`+` swap at the call site (no edits inside `getCashFlows`'s body or `getAmountDeposited`).

- [ ] **Step 5: Read-only probe — the new reader's tags resolve to the right cash entries**

Create `scripts/_tmp-cashtable-verify.ts`, run it, then delete it:
```ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const fmt = (d: any) => (d ? new Date(d).toISOString().split("T")[0] : "—");
// Mirrors getCashFlowTableEntries: read `tag` cash flows (>= startDate if given).
async function entries(qcode: string, tag: string, startDate?: string) {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT date, capital_in_out FROM bifurcated_master_sheet_test
     WHERE qcode=$1 AND system_tag=$2
       AND capital_in_out IS NOT NULL AND capital_in_out<>0
       ${startDate ? "AND date >= $3" : ""}
     ORDER BY date ASC`,
    ...(startDate ? [qcode, tag, startDate] : [qcode, tag])
  );
  const sum = rows.reduce((s, r) => s + Number(r.capital_in_out), 0);
  return `${rows.length} entries, net=${Math.round(sum)}, range ${fmt(rows[0]?.date)}..${fmt(rows.at(-1)?.date)}`;
}
async function main() {
  // Zerodha multi-scheme (Dinesh QAC00053): Total Portfolio = base tag; strategy = prefixed tag
  console.log("Dinesh QAC00053 Total Portfolio  (Zerodha Total Portfolio):     ", await entries("QAC00053", "Zerodha Total Portfolio"));
  console.log("Dinesh QAC00053 Scheme QAW++      (QAW++ Zerodha Total Portfolio):", await entries("QAC00053", "QAW++ Zerodha Total Portfolio"));
  console.log("Dinesh QAC00053 Scheme QYE++      (QYE++ Zerodha Total Portfolio):", await entries("QAC00053", "QYE++ Zerodha Total Portfolio"));
  // Radiance (Radiance FPI QAC00065): Total Portfolio = Exposure family (broker-aware via config.depositSystemTag)
  console.log("Radiance FPI QAC00065 Total Portfolio (Total Portfolio Exposure):", await entries("QAC00065", "Total Portfolio Exposure"));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
```
Run: `npx tsx scripts/_tmp-cashtable-verify.ts && rm scripts/_tmp-cashtable-verify.ts`
Expected: each line prints a non-zero entry count with a net amount (Dinesh Total Portfolio net ≈ 149,999,905; QAW++ ≈ 56,805,342; QYE++ ≈ 100,000,000; Radiance FPI Total Portfolio non-empty). (DB flaky → retry once.)

- [ ] **Step 6: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts
git commit -m "feat(bifurcated): cash in/out table reads base/strategy total-portfolio tags"
```
Do NOT commit the temp probe script (it must be deleted).

- [ ] **Step 7: Manual browser check (record results; cannot run headless)**

Start `npm run dev` (port 2030), then:
1. **Dinesh** (`QUS00072`): on **Total Portfolio**, the Cash In/Out table shows the base `Zerodha Total Portfolio` entries; on **Scheme QAW++** / **QYE++** tabs, the table shows that strategy's entries. The **Amount Invested** card value is unchanged from before.
2. **A Radiance client** (e.g. GRD `QUS00106` / Radiance FPI): the Cash In/Out table is **populated** (from the Exposure family), not empty.
3. **Export:** download Excel/PDF for Dinesh Total Portfolio → the cash sheet matches the on-screen table.

---

## Notes for the implementer

- **YAGNI / surgical:** the entire change is one new private method + one call-site swap. Do not refactor `getCashFlows`, `getAmountDeposited`, `getSchemeTagsAndDate`, or `msTable`.
- **Read-only:** `getCashFlowTableEntries` uses `this.msTable.findMany` (SELECT) only. Introduce no writes.
- **Decimal:** `new Decimal(0)` and `.toNumber()` are already imported/used in `getCashFlows` directly above — reuse the same `Decimal` import (top of file).
- **Frozen old-scheme clients (Shilpa `QAC00040` / Vikram `QAC00043`):** during the manual check, verify their Total Portfolio cash table (base tag) includes the old QYE+ period; if the base tag omits it, raise it before merge (the spec flagged this).
