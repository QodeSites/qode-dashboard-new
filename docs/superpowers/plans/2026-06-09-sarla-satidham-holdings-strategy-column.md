# Sarla/Satidham Holdings Strategy Column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Strategy column (+ filter + export parity) on the Sarla/Satidham holdings summary, consistent with managed clients that use the bifurcated holdings tables.

**Architecture:** Approach A (frontend-derived). Backend (`sarla-utils.ts` `getHoldings`) populates `holding.strategy` from the bifurcated tables' `strategy` column; the frontend's `fetchHoldingsForSpecialAccounts` derives `availableStrategies` from the holdings. The holdings table, strategy filter, and CSV/Excel/PDF exports already gate on `availableStrategies.length > 0` + `holding.strategy`, so they light up with no further change.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Prisma `$queryRaw` (PostgreSQL), read-only.

**Verification note:** This code path has no automated test framework (consistent with the rest of the dashboard). "Tests" here are read-only `npx tsx` probes that run the actual SQL, plus `npm run build` and grep invariants. All DB access is SELECT-only per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-06-09-sarla-satidham-holdings-strategy-column-design.md`

---

## Task 1: Backend — populate `holding.strategy` in `getHoldings`

**Files:**
- Modify: `app/lib/sarla-utils.ts` — `Holding` interface (≈ line 34), `getHoldings` (≈ lines 3539–3677)

- [ ] **Step 1: Add `strategy` to the `Holding` interface**

In the `Holding` interface (≈ line 34–50), add `strategy` after the `isin?` field. Change:
```ts
  type?: 'equity' | 'mutual_fund';
  isin?: string;
}
```
to:
```ts
  type?: 'equity' | 'mutual_fund';
  isin?: string;
  strategy?: string;
}
```

- [ ] **Step 2: Add `strategy` to the equity `$queryRaw` raw-row type**

In `getHoldings`, the equity query is typed `prisma.$queryRaw<{ … date: Date; }[]>` (≈ lines 3547–3561). Add a `strategy` field to that type. Change the line:
```ts
      date: Date;
    }[]>`
```
(the equity type's closing) to:
```ts
      date: Date;
      strategy: string | null;
    }[]>`
```
Note: the equity query is `SELECT e.*`, so the `strategy` column is already returned — this only makes TypeScript aware of it.

- [ ] **Step 3: Map `strategy` in the equity mapping**

In `processedEquityHoldings` (≈ lines 3632–3647), add `strategy` after `type: 'equity' as const,`. Change:
```ts
      date: holding.date || new Date(),
      type: 'equity' as const,
    }));
```
to:
```ts
      date: holding.date || new Date(),
      type: 'equity' as const,
      strategy: holding.strategy || undefined,
    }));
```

- [ ] **Step 4: Add `strategy` to the MF `SELECT` (dedup-safe)**

In the MF query's `SELECT` (≈ lines 3611–3629), add `MAX(strategy) as strategy` as the last aggregated column. Change:
```ts
        MAX(mastersheet_tag) as mastersheet_tag
      FROM ranked_holdings
```
to:
```ts
        MAX(mastersheet_tag) as mastersheet_tag,
        MAX(strategy) as strategy
      FROM ranked_holdings
```
`MAX(strategy)` over the already-deduped `rn = 1` row simply carries that row's strategy — it does not change the `GROUP BY isin` granularity.

- [ ] **Step 5: Add `strategy` to the MF `$queryRaw` raw-row type**

The MF query is typed `prisma.$queryRaw<{ … mastersheet_tag: string; }[]>` (the `mastersheet_tag: string;` line is ≈ 3589). Add `strategy` after it. Change:
```ts
      mastersheet_tag: string;
    }[]>`
```
to:
```ts
      mastersheet_tag: string;
      strategy: string | null;
    }[]>`
```

- [ ] **Step 6: Map `strategy` in the MF mapping**

In the `isinMap.set(...)` object (≈ lines 3654–3670), add `strategy` after `isin: isin,`. Change:
```ts
          type: 'mutual_fund' as const,
          isin: isin,
        });
```
to:
```ts
          type: 'mutual_fund' as const,
          isin: isin,
          strategy: holding.strategy || undefined,
        });
```

- [ ] **Step 7: Verify the real queries now return strategy (read-only probe)**

Create `scripts/_tmp-verify-strategy.ts`:
```ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function eq(qcode: string) {
  const r: any[] = await prisma.$queryRawUnsafe(
    `SELECT e.* FROM bifurcated_equity_holding_test e WHERE e.qcode=$1 AND e.quantity>0
       AND e.date=(SELECT MAX(date) FROM bifurcated_equity_holding_test WHERE qcode=$1 AND date IS NOT NULL)`, qcode);
  return [...new Set(r.map(x => x.strategy))];
}
async function mf(qcode: string) {
  const r: any[] = await prisma.$queryRawUnsafe(
    `WITH latest AS (SELECT MAX(as_of_date) d FROM bifurcated_mutual_fund_holding_sheet_test WHERE qcode=$1),
       ranked AS (SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.isin ORDER BY m.quantity DESC, m.buy_value DESC) rn
         FROM bifurcated_mutual_fund_holding_sheet_test m CROSS JOIN latest ld
         WHERE m.qcode=$1 AND m.quantity>0 AND m.isin IS NOT NULL AND m.isin<>'' AND m.as_of_date=ld.d)
       SELECT isin, MAX(strategy) as strategy FROM ranked WHERE rn=1 GROUP BY isin`, qcode);
  return [...new Set(r.map(x => x.strategy))];
}
async function main() {
  console.log("Sarla QAC00041   equity strategies:", await eq("QAC00041"), " MF:", await mf("QAC00041"));
  console.log("Satidham QAC00066 equity strategies:", await eq("QAC00066"), " MF:", await mf("QAC00066"));
  await prisma.$disconnect();
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```
Run: `npx tsx scripts/_tmp-verify-strategy.ts && rm scripts/_tmp-verify-strategy.ts`
Expected:
```
Sarla QAC00041   equity strategies: [ 'QYE+' ]  MF: [ 'QYE+' ]
Satidham QAC00066 equity strategies: [ 'QAW++' ]  MF: []
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: exit 0, no type errors.

- [ ] **Step 9: Commit**

```bash
git add app/lib/sarla-utils.ts
git commit -m "feat(sarla): expose strategy on Sarla/Satidham holdings from bifurcated tables"
```

---

## Task 2: Frontend — derive and set `availableStrategies` for special accounts

**Files:**
- Modify: `app/holding-summary/page.tsx` — `fetchHoldingsForSpecialAccounts` (≈ lines 590–642)

- [ ] **Step 1: Set `availableStrategies` in the main path**

In `fetchHoldingsForSpecialAccounts`, after the `allHoldings` array is built (≈ lines 617–621), add a `setAvailableStrategies` call. Change:
```ts
                    const allHoldings = [
                        ...(holdingsSummary.equityHoldings || []),
                        ...(holdingsSummary.debtHoldings || []),
                        ...(holdingsSummary.mutualFundHoldings || [])
                    ];

                    if (allHoldings.length > 0 && allHoldings[0]?.date) {
                        setLastUpdatedDate(new Date(allHoldings[0].date));
                    }
```
to:
```ts
                    const allHoldings = [
                        ...(holdingsSummary.equityHoldings || []),
                        ...(holdingsSummary.debtHoldings || []),
                        ...(holdingsSummary.mutualFundHoldings || [])
                    ];

                    setAvailableStrategies(
                        [...new Set(allHoldings.map((h: Holding) => h.strategy).filter(Boolean))].sort() as string[]
                    );

                    if (allHoldings.length > 0 && allHoldings[0]?.date) {
                        setLastUpdatedDate(new Date(allHoldings[0].date));
                    }
```

- [ ] **Step 2: Set `availableStrategies` in the fallback path**

In the fallback loop (≈ lines 626–635), after `setHoldingsData(sd.data.holdingsSummary);`, derive strategies from that summary. Change:
```ts
                    for (const [, strategyData] of Object.entries(data)) {
                        const sd = strategyData as { data?: { holdingsSummary?: HoldingsSummary } };
                        if (sd?.data?.holdingsSummary) {
                            setHoldingsData(sd.data.holdingsSummary);
                            break;
                        }
                    }
```
to:
```ts
                    for (const [, strategyData] of Object.entries(data)) {
                        const sd = strategyData as { data?: { holdingsSummary?: HoldingsSummary } };
                        if (sd?.data?.holdingsSummary) {
                            const hs = sd.data.holdingsSummary;
                            setHoldingsData(hs);
                            setAvailableStrategies(
                                [...new Set([
                                    ...(hs.equityHoldings || []),
                                    ...(hs.debtHoldings || []),
                                    ...(hs.mutualFundHoldings || []),
                                ].map((h: Holding) => h.strategy).filter(Boolean))].sort() as string[]
                            );
                            break;
                        }
                    }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0, no type errors. (`setAvailableStrategies`, `HoldingsSummary`, and the `Holding` type with `strategy?: string` already exist in this file.)

- [ ] **Step 4: Commit**

```bash
git add app/holding-summary/page.tsx
git commit -m "feat(holdings): wire strategy filter/column for Sarla/Satidham"
```

---

## Task 3: Verify export parity + final checks (no code expected)

**Files:**
- Inspect only: `app/holding-summary/page.tsx` (export handlers), `app/lib/sarla-utils.ts`

- [ ] **Step 1: Confirm exports have no Sarla/Satidham-specific branch**

Run:
```bash
grep -nE "isSarla|isSatidham|QUS0007|QUS0010" app/holding-summary/page.tsx | grep -iE "csv|excel|pdf|download|export"
```
Expected: no matches — i.e. `handleDownloadCSV` / `handleDownloadExcel` / `handleDownloadPDF` operate generically on `holdingsData` + `availableStrategies` + `selectedStrategy`, so they include the Strategy column automatically once Task 2 sets `availableStrategies`.

- [ ] **Step 2: Confirm the three export handlers gate on `availableStrategies`**

Run:
```bash
grep -nE "hasStrategy = availableStrategies.length > 0" app/holding-summary/page.tsx
```
Expected: 3 matches (CSV ≈928, Excel ≈1068, PDF ≈1348).

- [ ] **Step 3: Read-only DB safety audit**

Run:
```bash
grep -nE "\.(create|update|delete|upsert)\s*\(|\\\$executeRaw|INSERT INTO|UPDATE .* SET|DELETE FROM" app/lib/sarla-utils.ts | grep -v "//"
```
Expected: no write operations introduced by Task 1 (the two `getHoldings` queries remain `$queryRaw` SELECT).

- [ ] **Step 4: Manual verification checklist (record results)**

Start the dev server (`npm run dev`, port 2030), then confirm:
1. Login as Sarla (`QUS0007`) → holdings table shows a **Strategy** column reading `QYE+`; strategy filter dropdown appears (ALL + QYE+).
2. Login as Satidham (`QUS0010`) → Strategy column reads `QAW++`; filter shows ALL + QAW++.
3. Download Excel and PDF for one of them → the export includes the **Strategy** column.
4. Regression: login as a managed multi-strategy client (Ashwin `QUS00097`) → Strategy column still shows both `QAW++` and `QYE++`; filtering works.

---

## Notes for the implementer

- **DRY:** the two frontend edits both derive strategies from a holdingsSummary's three holdings arrays; this duplication is acceptable (two small call sites, different sources). Do not over-engineer a shared helper.
- **YAGNI:** no label mapping — show raw tags (`QYE+` / `QAW++`) per the approved design.
- **Read-only:** every DB touch is SELECT (`$queryRaw` / `findMany` / etc.). Do not introduce writes.
- **Do not touch:** `processHoldingsSummary`, managed-client code, Sarla/Satidham portfolio/NAV logic, `components/generateExcelReport.ts` (separate report, not the holdings export).
