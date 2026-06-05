# Sarla/Satidham Active Schemes → bifurcated_master_sheet_test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the two active master_sheet-sourced Sarla/Satidham schemes — Sarla "Scheme B" (QAC00041) and Satidham "Scheme QAW++" (QAC00066) — to read from `bifurcated_master_sheet_test` instead of `master_sheet`, leaving inactive (hardcoded) and PMS schemes untouched.

**Architecture:** Add a `SCHEME_BIFURCATED_SOURCE` config + `schemeTable(scheme)` / `rewriteTag(scheme, tag)` resolver helpers to `app/lib/sarla-utils.ts`, then convert every `prisma.master_sheet` read site uniformly to go through them. Non-migrated schemes get identity behavior (still master_sheet, same tag); only the two listed schemes route to the bifurcated table with rewritten tags.

**Tech Stack:** Next.js 15, TypeScript, Prisma (PostgreSQL).

**Spec:** `docs/superpowers/specs/2026-06-02-sarla-satidham-bifurcated-active-schemes-design.md`

**Database safety:** All changes are READ-ONLY. `schemeTable` only swaps which read model is used (both are SELECT-only). No `create`/`update`/`delete`/`upsert`/`$executeRaw`.

**Testing note:** No automated test suite for this path. Tasks gate on `npm run build` exit 0 + a read-only grep, plus a read-only probe script and manual dashboard checks. Per the spec, `bifurcated_master_sheet_test` is authoritative — there is NO byte-parity contract with the old master_sheet numbers; the key manual invariant is that **inactive (hardcoded) schemes stay byte-identical**.

**The 19 master_sheet read sites** (from `grep -n "prisma.master_sheet" app/lib/sarla-utils.ts`), all with a `scheme`/`s` variable in scope:
`298, 1892, 1905, 1930, 1945, 1994, 2011, 2048, 2070, 2179, 2185, 2225, 2289, 2350, 2379, 2409, 3200, 3384, 3389`. (Line 388 is `pms_master_sheet` — OUT OF SCOPE, do not touch.)

---

## Task 1: Read-site enumeration + Total Portfolio sourcing resolution

**Files:**
- Create: `docs/superpowers/notes/2026-06-02-sarla-readsite-enumeration.md`

No code changes. This task produces the authoritative site list (de-risking the mechanical conversion in Task 3) and resolves the spec's one open item: how Sarla/Satidham "Total Portfolio" sources its NAV/historical, which decides whether `"Total Portfolio"` also needs a `SCHEME_BIFURCATED_SOURCE` entry.

- [ ] **Step 1: Enumerate every master_sheet read site**

For each of the 19 line numbers above, read ~15 lines of surrounding context in `app/lib/sarla-utils.ts` and record in the notes file a table row with: line, enclosing function name, the **scheme variable in scope** (`scheme` or `s`), and the **exact `system_tag` expression** passed in the `where` clause (e.g. `"Zerodha Total Portfolio"` literal, or `systemTag` local, or `PortfolioApi.getSystemTag(...)`).

- [ ] **Step 2: Resolve the Total Portfolio NAV-sourcing open item**

Read `getHistoricalData` (around line 2289) and `getLatestExposure`'s `"Total Portfolio"` branch (around line 1969). Determine: when `scheme === "Total Portfolio"` for **Sarla** (QAC00041), does the NAV/historical/exposure come from (a) **aggregating** the member schemes (Scheme B + PMS QAW), or (b) a **dedicated** master_sheet tag (e.g. `Sarla Performance fibers Scheme Total Portfolio` / `Scheme Total Portfolio`)? Do the same for **Satidham** (QAC00046). Write the finding explicitly.

- [ ] **Step 3: Record the decision**

In the notes file, state the decision:
- If Total Portfolio **aggregates** member schemes → it follows Scheme B / QAW++ automatically; **no** `"Total Portfolio"` entry needed in the config.
- If Total Portfolio reads a **dedicated tag** that should also become bifurcated-sourced → record the exact dedicated tag(s) per account and whether the bifurcated table has them (note: `QAC00041` bifurcated tags include `Scheme Total Portfolio`, `Combined Scheme Total Portfolio`, `Qode Total Portfolio` per the spec's probe). The default per the spec is to scope to the two named schemes; only add a `"Total Portfolio"` entry if Step 2 shows the displayed aggregate NAV would otherwise be left on master_sheet while its deposits move to bifurcated (a mixed aggregate). If you add one, capture the exact `{ scheme: "Total Portfolio", tagRewrite: {...} }` to fold into Task 2.

- [ ] **Step 4: Commit the notes**

```bash
git add docs/superpowers/notes/2026-06-02-sarla-readsite-enumeration.md
git commit -m "docs(sarla): enumerate master_sheet read sites + resolve Total Portfolio sourcing"
```

**Report back** the Step 3 decision (does the config need a `"Total Portfolio"` entry, yes/no, and if yes the exact rewrite) so Task 2's config is final.

---

## Task 2: Add `SCHEME_BIFURCATED_SOURCE` config + resolver helpers

**Files:**
- Modify: `app/lib/sarla-utils.ts`

- [ ] **Step 1: Locate the insertion point**

Read `app/lib/sarla-utils.ts` lines 348–362 to confirm the existing `SCHEME_QCODE_OVERRIDE`, `getEffectiveQcode`, and `getSystemTag` block. The new config + helpers go immediately after `getSystemTag` (or adjacent to `SCHEME_QCODE_OVERRIDE`).

- [ ] **Step 2: Add the config + helpers**

Use `Edit`. `old_string` (the `getSystemTag` method — read the file to confirm its exact current text around lines 357–362):
```ts
  private static getSystemTag(scheme: string, qcode?: string, accountCode?: string): string {
    // Use accountCode if provided, otherwise infer from qcode
    const isSatidham = accountCode === "AC8" || qcode === "QAC00046" || qcode === "QAC00066";
    const map = isSatidham ? this.SATIDHAM_SYSTEM_TAGS : this.SARLA_SYSTEM_TAGS;
    return map[scheme] || `Zerodha Total Portfolio ${scheme}`;
  }
```

`new_string`:
```ts
  private static getSystemTag(scheme: string, qcode?: string, accountCode?: string): string {
    // Use accountCode if provided, otherwise infer from qcode
    const isSatidham = accountCode === "AC8" || qcode === "QAC00046" || qcode === "QAC00066";
    const map = isSatidham ? this.SATIDHAM_SYSTEM_TAGS : this.SARLA_SYSTEM_TAGS;
    return map[scheme] || `Zerodha Total Portfolio ${scheme}`;
  }

  // Active schemes whose data now comes from bifurcated_master_sheet_test instead
  // of master_sheet. Keyed by scheme name. `tagRewrite` maps the master_sheet
  // system_tag -> the bifurcated table's system_tag (identity when the bifurcated
  // table uses the same tag name). Schemes NOT listed here keep reading
  // master_sheet with their existing tags. Inactive (hardcoded) schemes never
  // reach a table read (getHardcoded short-circuits first), so they are
  // untouched regardless. Note: both Sarla and Satidham have a "Scheme B", but
  // Satidham's is inactive/hardcoded — only Sarla's active "Scheme B" reaches a
  // table read, so keying by name is safe here.
  private static readonly SCHEME_BIFURCATED_SOURCE: Record<
    string,
    { tagRewrite?: Record<string, string> }
  > = {
    // Sarla Scheme B — same tag names in the bifurcated table.
    "Scheme B": {},
    // Satidham Scheme QAW++ — bifurcated table uses the "QAW++ " prefixed tags.
    "Scheme QAW++": {
      tagRewrite: {
        "Zerodha Total Portfolio": "QAW++ Zerodha Total Portfolio",
        "Total Portfolio Value": "QAW++ Total Portfolio Value",
      },
    },
  };

  // Returns the Prisma model to read for a scheme: the bifurcated table for
  // migrated active schemes, else master_sheet. `any` sidesteps the minor
  // Decimal-precision type differences between the two models (same pattern as
  // the bifurcated engine's msTable); only columns common to both are read.
  private static schemeTable(scheme: string): any {
    return scheme in this.SCHEME_BIFURCATED_SOURCE
      ? prisma.bifurcated_master_sheet_test
      : prisma.master_sheet;
  }

  // Rewrites a master_sheet system_tag to its bifurcated-table equivalent for a
  // migrated scheme (identity for non-migrated schemes or unmapped tags).
  private static rewriteTag(scheme: string, tag: string): string {
    return this.SCHEME_BIFURCATED_SOURCE[scheme]?.tagRewrite?.[tag] ?? tag;
  }
```

**If Task 1 Step 3 decided a `"Total Portfolio"` entry is needed**, add it to `SCHEME_BIFURCATED_SOURCE` exactly as captured there (e.g. `"Total Portfolio": { tagRewrite: { ... } }`). Otherwise omit it.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0. The helpers are unused at this point — fine. If `prisma.bifurcated_master_sheet_test` isn't recognized, confirm the model exists (it's used by `app/lib/bifurcated-portfolio-utils.ts`) and that `prisma` is imported at the top of `sarla-utils.ts` (it is — used by all the existing reads).

- [ ] **Step 4: Commit**

```bash
git add app/lib/sarla-utils.ts
git commit -m "feat(sarla): add SCHEME_BIFURCATED_SOURCE config + schemeTable/rewriteTag helpers"
```

---

## Task 3: Convert all master_sheet read sites through the resolvers

**Files:**
- Modify: `app/lib/sarla-utils.ts`

Apply the same mechanical transform at every one of the 19 `master_sheet` read sites. **Do NOT touch line 388 (`pms_master_sheet`).**

**Transform rule (apply at each site):**
1. `prisma.master_sheet.<op>(` → `PortfolioApi.schemeTable(<schemeVar>).<op>(` where `<schemeVar>` is the `scheme` or `s` variable in scope at that site (from Task 1's enumeration).
2. In that call's `where`, change `system_tag: <tagExpr>` → `system_tag: PortfolioApi.rewriteTag(<schemeVar>, <tagExpr>)`, where `<tagExpr>` is the existing tag value (a literal, a `systemTag` local, etc.).

Because `schemeTable`/`rewriteTag` are identity for non-migrated schemes, every site is safe to convert; only Sarla "Scheme B" and Satidham "Scheme QAW++" change behavior.

- [ ] **Step 1: Worked example — `getSingleSchemeProfit` (line 298, scheme var = `scheme`)**

Use `Edit`. `old_string`:
```ts
    const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
    const profitSum = await prisma.master_sheet.aggregate({
      where: { qcode: effectiveQcode, system_tag: systemTag },
      _sum: { pnl: true },
    });
```
`new_string`:
```ts
    const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
    const profitSum = await PortfolioApi.schemeTable(scheme).aggregate({
      where: { qcode: effectiveQcode, system_tag: PortfolioApi.rewriteTag(scheme, systemTag) },
      _sum: { pnl: true },
    });
```

- [ ] **Step 2: Worked example — `getAmountDeposited` loop (lines 1890–1913, scheme var = `s`)**

Use `Edit`. `old_string`:
```ts
        } else if (s === "Scheme B" || s === "Scheme A") {
          const systemTag = s === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(s, qcode);
          const depositSum = await prisma.master_sheet.aggregate({
            where: {
              qcode,
              system_tag: systemTag,
              capital_in_out: { not: null },
            },
            _sum: { capital_in_out: true },
          });
          totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
        } else if (s === "Scheme QAW++") {
          // This scheme uses QAC00066 instead of QAC00046
          const effectiveQcode = PortfolioApi.getEffectiveQcode(s, qcode);
          const systemTag = PortfolioApi.getSystemTag(s, effectiveQcode);
          const depositSum = await prisma.master_sheet.aggregate({
            where: {
              qcode: effectiveQcode,
              system_tag: systemTag,
              capital_in_out: { not: null },
            },
            _sum: { capital_in_out: true },
          });
          totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
        }
```
`new_string`:
```ts
        } else if (s === "Scheme B" || s === "Scheme A") {
          const systemTag = s === "Scheme B" ? "Zerodha Total Portfolio" : PortfolioApi.getSystemTag(s, qcode);
          const depositSum = await PortfolioApi.schemeTable(s).aggregate({
            where: {
              qcode,
              system_tag: PortfolioApi.rewriteTag(s, systemTag),
              capital_in_out: { not: null },
            },
            _sum: { capital_in_out: true },
          });
          totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
        } else if (s === "Scheme QAW++") {
          // This scheme uses QAC00066 instead of QAC00046
          const effectiveQcode = PortfolioApi.getEffectiveQcode(s, qcode);
          const systemTag = PortfolioApi.getSystemTag(s, effectiveQcode);
          const depositSum = await PortfolioApi.schemeTable(s).aggregate({
            where: {
              qcode: effectiveQcode,
              system_tag: PortfolioApi.rewriteTag(s, systemTag),
              capital_in_out: { not: null },
            },
            _sum: { capital_in_out: true },
          });
          totalDeposited += Number(depositSum._sum.capital_in_out) || 0;
        }
```

- [ ] **Step 3: Worked example — `getAmountDeposited` single-scheme branches (lines 1928–1953, scheme var = `scheme`)**

Use `Edit`. `old_string`:
```ts
    if (scheme === "Scheme B") {
      const systemTag = "Zerodha Total Portfolio";
      const depositSum = await prisma.master_sheet.aggregate({
        where: {
          qcode,
          system_tag: systemTag,
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      return Number(depositSum._sum.capital_in_out) || 0;
    }

    // Handle Scheme QAW++ (uses QAC00066 instead of default qcode)
    if (scheme === "Scheme QAW++") {
      const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
      const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
      const depositSum = await prisma.master_sheet.aggregate({
        where: {
          qcode: effectiveQcode,
          system_tag: systemTag,
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      return Number(depositSum._sum.capital_in_out) || 0;
    }
```
`new_string`:
```ts
    if (scheme === "Scheme B") {
      const systemTag = "Zerodha Total Portfolio";
      const depositSum = await PortfolioApi.schemeTable(scheme).aggregate({
        where: {
          qcode,
          system_tag: PortfolioApi.rewriteTag(scheme, systemTag),
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      return Number(depositSum._sum.capital_in_out) || 0;
    }

    // Handle Scheme QAW++ (uses QAC00066 instead of default qcode)
    if (scheme === "Scheme QAW++") {
      const effectiveQcode = PortfolioApi.getEffectiveQcode(scheme, qcode);
      const systemTag = PortfolioApi.getSystemTag(scheme, effectiveQcode);
      const depositSum = await PortfolioApi.schemeTable(scheme).aggregate({
        where: {
          qcode: effectiveQcode,
          system_tag: PortfolioApi.rewriteTag(scheme, systemTag),
          capital_in_out: { not: null },
        },
        _sum: { capital_in_out: true },
      });
      return Number(depositSum._sum.capital_in_out) || 0;
    }
```

- [ ] **Step 4: Convert the remaining sites**

Apply the same transform rule to every remaining `prisma.master_sheet` site. The remaining line numbers (pre-edit) are: `1994, 2011, 2048, 2070, 2179, 2185, 2225, 2289, 2350, 2379, 2409, 3200, 3384, 3389`. For each:
- Read its context to identify the scheme variable (`scheme` or `s`) and the `system_tag:` expression (Task 1's enumeration lists these).
- Replace `prisma.master_sheet` with `PortfolioApi.schemeTable(<schemeVar>)`.
- Wrap the `system_tag:` value with `PortfolioApi.rewriteTag(<schemeVar>, <expr>)`.

Note sites where the `where` clause does NOT include `system_tag` (if any) — for those, only the `prisma.master_sheet` → `schemeTable(<schemeVar>)` swap applies (there's no tag to rewrite). The Task 1 enumeration flags any such site.

- [ ] **Step 5: Completeness check — no bare master_sheet reads remain**

Run:
```bash
grep -n "prisma\.master_sheet" app/lib/sarla-utils.ts
```
Expected: **zero** matches (every read now goes through `schemeTable`). If any remain, they were missed — convert them (unless one is genuinely unreachable; if so, document why in the commit). Then confirm `pms_master_sheet` is still intact:
```bash
grep -n "prisma\.pms_master_sheet" app/lib/sarla-utils.ts
```
Expected: line ~388 still present, unchanged.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: exit 0. If TypeScript complains that `.aggregate`/`.findMany`/`.findFirst` don't exist on the `schemeTable` return, that's why `schemeTable` returns `any` — confirm the return type annotation is `any`.

- [ ] **Step 7: Read-only audit**

Run:
```bash
grep -nE "(schemeTable\([^)]*\)|prisma\.[a-zA-Z_]+)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\$executeRaw" app/lib/sarla-utils.ts || echo "OK — read-only"
```
Expected: `OK — read-only`.

- [ ] **Step 8: Commit**

```bash
git add app/lib/sarla-utils.ts
git commit -m "feat(sarla): route active schemes (Scheme B, QAW++) reads via schemeTable/rewriteTag"
```

---

## Task 4: Read-only verification probe script

**Files:**
- Create: `scripts/verify-sarla-bifurcated-schemes.ts`

Confirms the two migrated schemes resolve to the correct bifurcated `(table, tag)` and that the bifurcated data is present, independent of the engine.

- [ ] **Step 1: Create the script**

Use `Write` for `scripts/verify-sarla-bifurcated-schemes.ts`:
```ts
/**
 * Verify the two migrated Sarla/Satidham active schemes read from
 * bifurcated_master_sheet_test under the expected tags. READ-ONLY.
 *
 * Usage: npx tsx scripts/verify-sarla-bifurcated-schemes.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fmt = (d: Date | null | undefined) =>
  d ? d.toISOString().split("T")[0] : "—";

// (label, qcode, expected bifurcated tag)
const CHECKS: Array<{ label: string; qcode: string; tag: string }> = [
  { label: "Sarla Scheme B — exposure/deposit", qcode: "QAC00041", tag: "Zerodha Total Portfolio" },
  { label: "Sarla Scheme B — NAV", qcode: "QAC00041", tag: "Total Portfolio Value" },
  { label: "Satidham QAW++ — exposure/deposit", qcode: "QAC00066", tag: "QAW++ Zerodha Total Portfolio" },
  { label: "Satidham QAW++ — NAV", qcode: "QAC00066", tag: "QAW++ Total Portfolio Value" },
];

async function main() {
  console.log("=".repeat(80));
  console.log("VERIFY Sarla/Satidham migrated schemes in bifurcated_master_sheet_test");
  console.log("=".repeat(80));

  let allOk = true;
  for (const c of CHECKS) {
    const cnt = await prisma.bifurcated_master_sheet_test.count({
      where: { qcode: c.qcode, system_tag: c.tag },
    });
    const min = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode: c.qcode, system_tag: c.tag },
      orderBy: { date: "asc" },
      select: { date: true, nav: true },
    });
    const max = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode: c.qcode, system_tag: c.tag },
      orderBy: { date: "desc" },
      select: { date: true, nav: true },
    });
    const ok = cnt > 0;
    if (!ok) allOk = false;
    console.log(
      `  ${ok ? "✓" : "✗"} ${c.label.padEnd(36)} [${c.qcode} | "${c.tag}"]  count=${cnt}  ${fmt(min?.date)}(${min?.nav}) -> ${fmt(max?.date)}(${max?.nav})`
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log(allOk ? "✓ All migrated-scheme tags present in bifurcated table" : "✗ Some tags missing — investigate");
  console.log("=".repeat(80));

  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Read-only audit**

Run:
```bash
grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\$executeRaw" scripts/verify-sarla-bifurcated-schemes.ts || echo "OK — read-only"
```
Expected: `OK — read-only`.

- [ ] **Step 3: Run it**

Run: `npx tsx scripts/verify-sarla-bifurcated-schemes.ts`
Expected: exit 0 with all four checks `✓` (Sarla B exposure 542 rows; Sarla B NAV 542 rows; Satidham QAW++ exposure 96 rows; Satidham QAW++ NAV 96 rows). If the DB is briefly unreachable (connection refused at 139.5.190.184), retry; if it stays down, note it and still commit.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-sarla-bifurcated-schemes.ts
git commit -m "feat(sarla): add read-only probe for migrated bifurcated scheme tags"
```

---

## Task 5: Verification

**Files:** none modified — gates only.

- [ ] **Step 1: Build + read-only audit on the whole change**

Run:
```bash
npm run build
git diff main...HEAD --name-only -- 'app/**/*.ts' 'scripts/**/*.ts' | xargs grep -nE "prisma\.[a-zA-Z_]+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)|\$executeRaw" 2>/dev/null || echo "OK — no write operations found"
```
Expected: build exit 0; audit prints `OK — no write operations found`.

- [ ] **Step 2: Confirm no bare master_sheet reads + PMS intact**

Run:
```bash
echo "master_sheet reads (expect 0):"; grep -c "prisma\.master_sheet" app/lib/sarla-utils.ts
echo "pms_master_sheet reads (expect 1):"; grep -c "prisma\.pms_master_sheet" app/lib/sarla-utils.ts
echo "schemeTable uses (expect ~19):"; grep -c "PortfolioApi\.schemeTable" app/lib/sarla-utils.ts
```
Expected: 0 bare master_sheet, 1 pms_master_sheet, ~19 schemeTable.

- [ ] **Step 3: Probe script**

Run: `npx tsx scripts/verify-sarla-bifurcated-schemes.ts`
Expected: exit 0, all four tags present.

- [ ] **Step 4: Manual — Sarla/Satidham render (operator, requires login)**

Start `npm run dev`. Load the dashboard as Sarla (`QUS0007`) and Satidham (`QUS0010`):
- Confirm Sarla "Scheme B" and Satidham "Scheme QAW++" render (stats, NAV curve, PnL, cashflows) — now sourced from the bifurcated table.
- Confirm "Total Portfolio" renders and reflects the migrated values (per Task 1's decision on whether its dedicated tag also moved).

- [ ] **Step 5: Manual — inactive schemes byte-unchanged (the key invariant)**

Still logged in, switch through the **inactive** schemes:
- Sarla: Scheme A, C, D, E, F, QAW.
- Satidham: Scheme A, Scheme B (Satidham's, inactive), Scheme A (Old), Scheme QYE++.
Confirm each shows the **same hardcoded numbers as before** (inception, total profit, NAV curve). These must be byte-identical — they never touch a table read. If any changed, a `schemeTable`/`rewriteTag` was wrongly applied to a hardcoded path (it shouldn't be — they short-circuit), or a name collision fired; investigate before merge.

- [ ] **Step 6: Final commit (only if fixes were needed in Steps 1–5)**

```bash
git add <fixed files>
git commit -m "fix(sarla): <what was fixed>"
```

---

## File Structure Summary

| Path | Action | Purpose |
|---|---|---|
| `docs/superpowers/notes/2026-06-02-sarla-readsite-enumeration.md` | Create (Task 1) | Authoritative read-site list + Total Portfolio sourcing decision |
| `app/lib/sarla-utils.ts` | Modify (Tasks 2–3) | Add `SCHEME_BIFURCATED_SOURCE` + `schemeTable`/`rewriteTag`; route all `master_sheet` reads through them |
| `scripts/verify-sarla-bifurcated-schemes.ts` | Create (Task 4) | Read-only probe confirming migrated-scheme tags exist in the bifurcated table |

No schema changes, no DB writes. `pms_master_sheet` reads, inactive/hardcoded schemes, and all non-Sarla/Satidham clients are untouched.
