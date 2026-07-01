# Ashok Jogani HUF — PMS Blend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Ashok Jogani HUF's three PMS accounts (`pms_master_sheet`) as three separate schemes in his bifurcated dashboard, and blend all three into the Total Portfolio aggregate via a value-weighted combined NAV curve.

**Architecture:** Isolated blend module (Approach 2 in the spec). Two new files — `pms-bridge.ts` (reads `pms_master_sheet`) and `pms-blend.ts` (pure value-weighting math) — plus a per-client `hasPms`-gated block in `BifurcatedPortfolioEngine.handleGET`. The generic engine is byte-for-byte unchanged for all non-PMS clients; PMS scheme keys and the blended Total Portfolio bypass the generic `msTable` paths.

**Tech Stack:** Next.js 15, TypeScript, Prisma (PostgreSQL), `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-06-30-ashok-pms-blend-design.md`

## Global Constraints

- **READ-ONLY database access only.** New code uses `findMany` / `aggregate` exclusively. No `create` / `update` / `delete` / `upsert` / `$executeRaw`. (CLAUDE.md Database Safety Rules.)
- **Zero behavior change for non-PMS clients.** Everything new is gated on `hasPms` (true only when a client config declares `pmsSchemes`). The 3 non-Ashok engine-touching tasks gate on a Dinesh (`QAC00053`) engine-output regression diff being byte-identical.
- **No unit-test framework exists.** Each task gates on a read-only `tsx` validation script + `npm run build` exit 0, matching the existing `scripts/validate-bifurcated-registry.ts` pattern.
- **Client identifiers:** Ashok Jogani HUF = `icode QUS00124`, `qcode QAC00110`.
- **PMS scheme labels (exact):** `Scheme PMS QAW` (`QAW00158`), `Scheme PMS QGF` (`QGF00157`), `Scheme PMS QTF` (`QTF00161`).
- **PMS unit NAV is base ~10** (rebase to 100 for display). **Zerodha component value** per date = `QAW++ Zerodha Total Portfolio`.portfolio_value + `QAW+ Zerodha Total Portfolio`.portfolio_value; **Zerodha component NAV** = the `Qode Total Portfolio` curve nav.
- **`pms_master_sheet` is LIVE data** — the data team appends a new row per account most days. Do NOT assert frozen point-in-time snapshots (currentValue / totalProfit / row count all drift daily). Assert **drift-proof invariants** instead:
  - **Money identity (per account):** `currentValue ≈ deposited + totalProfit` (portfolio value = capital in + P&L). Holds exactly, drift-proof.
  - **Self-consistency:** bridge `currentValue == last daily row's value`; a scheme's `return` matches `(equityCurve.last.nav / equityCurve.first.nav − 1) × 100` computed from its own curve.
  - **Total = sum of parts:** blended TP `currentExposure ≈ Σ(each scheme's currentExposure)` and `totalProfit ≈ Σ(each scheme's totalProfit)` across `Scheme QAW++`, `Scheme QAW+`, and the 3 PMS schemes — all read from the same response.
  - **Stable anchors:** every PMS account + the blended TP have inception `2026-04-08`; row count `≥ 83`; equity curves start at `100`.
  - Point-in-time values observed 2026-06-30 (currentValue ~₹2.4/2.8/2.4 Cr per account; blended TP ~₹12.5 Cr) are for rough sanity only, NOT exact assertions.

---

## Task 1: Config plumbing — declare PMS schemes on the client config

**Files:**
- Modify: `app/lib/bifurcated-client-builder.ts`
- Modify: `app/lib/clients/ashok.ts`
- Create: `scripts/validate-ashok-pms.ts`

**Interfaces:**
- Produces:
  - `interface PmsSchemeInput { schemeName: string; accountCode: string; inactive?: boolean }`
  - `PortfolioConfig` gains optional `pmsAccountCode?: string`.
  - `ClientConfig` gains optional `pmsSchemes?: PmsSchemeInput[]`.
  - `DefineBifurcatedClientInput` gains optional `pms?: PmsSchemeInput[]`.
  - PMS schemes appear as keys in `portfolioMapping` (each with `pmsAccountCode` set, `isActive` from `!inactive`), inserted **after** the Zerodha schemes so the dropdown order is `Total Portfolio`, `Scheme QAW++`, `Scheme QAW+`, then the 3 PMS schemes.

- [ ] **Step 1: Add the PMS types to the builder**

In `app/lib/bifurcated-client-builder.ts`, add `pmsAccountCode` to `PortfolioConfig` (after `displayAmountInvestedAsZero`):

```ts
export interface PortfolioConfig {
  current: string;
  metrics: string;
  nav: string;
  isActive: boolean;
  tags?: SchemeTagConfig;
  displayAmountInvestedAsZero?: boolean;
  // When set, this scheme is a PMS scheme sourced from pms_master_sheet by this
  // account_code (NOT from bifurcated_master_sheet_test). The engine routes it
  // through the PMS bridge instead of msTable.
  pmsAccountCode?: string;
}
```

Add the `PmsSchemeInput` type and extend `ClientConfig` (after `portfolioMapping`):

```ts
export interface PmsSchemeInput {
  schemeName: string;   // dropdown label, e.g. "Scheme PMS QAW"
  accountCode: string;  // pms_master_sheet.account_code, e.g. "QAW00158"
  inactive?: boolean;   // default false
}
```

```ts
export interface ClientConfig {
  // ...existing fields...
  portfolioMapping: Record<string, PortfolioConfig>;
  // PMS accounts blended into this client (Ashok). Empty/undefined for everyone
  // else. Presence of entries is what flips the engine's hasPms gate.
  pmsSchemes?: PmsSchemeInput[];
}
```

Extend `DefineBifurcatedClientInput` (after `accountCode`):

```ts
  accountCode?: string;            // default: "" (field is vestigial here)
  // Optional PMS accounts to surface as extra schemes + fold into Total
  // Portfolio. Sourced from pms_master_sheet by account_code.
  pms?: PmsSchemeInput[];
```

- [ ] **Step 2: Emit PMS schemes from `defineBifurcatedClient`**

In `app/lib/bifurcated-client-builder.ts`, inside `defineBifurcatedClient`, after the existing `for (const [schemeName, scheme] of Object.entries(input.schemes))` loop that fills `portfolioMapping`, append the PMS schemes:

```ts
  for (const pms of input.pms ?? []) {
    portfolioMapping[pms.schemeName] = {
      current: pms.accountCode,
      metrics: pms.accountCode,
      nav: pms.accountCode,
      isActive: !pms.inactive,
      displayAmountInvestedAsZero: !!pms.inactive,
      pmsAccountCode: pms.accountCode,
    };
  }
```

Then add `pmsSchemes` to the returned object (after `portfolioMapping`):

```ts
    portfolioMapping,
    pmsSchemes: input.pms ?? [],
  };
```

- [ ] **Step 3: Declare Ashok's 3 PMS accounts**

In `app/lib/clients/ashok.ts`, add a `pms` block to the `defineBifurcatedClient({...})` call, after the `schemes: {...}` object:

```ts
  schemes: {
    "Scheme QAW++": {
      inceptionDate: "2026-06-18",
      exposure: "QAW++ Zerodha Total Portfolio",
      profit: "QAW++ Zerodha Total Portfolio",
    },
    "Scheme QAW+": {
      inceptionDate: "2026-05-22",
      exposure: "QAW+ Zerodha Total Portfolio",
      profit: "QAW+ Zerodha Total Portfolio",
      inactive: true,
    },
  },
  pms: [
    { schemeName: "Scheme PMS QAW", accountCode: "QAW00158" },
    { schemeName: "Scheme PMS QGF", accountCode: "QGF00157" },
    { schemeName: "Scheme PMS QTF", accountCode: "QTF00161" },
  ],
});
```

- [ ] **Step 4: Write the validation script (config assertions only for now)**

Create `scripts/validate-ashok-pms.ts`. This script grows across tasks; start with config checks. It is READ-ONLY.

```ts
/**
 * Read-only validation for the Ashok Jogani HUF PMS blend.
 * Usage: npx tsx scripts/validate-ashok-pms.ts
 * NO DATABASE WRITES — only the engine's read-only handleGET + Prisma SELECTs.
 */
import { findByQcode } from "../app/lib/bifurcated-clients-registry";

const ASHOK = "QAC00110";
let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name} ${detail}`); failures++; }
}
function approx(a: number, b: number, tolPct = 0.5) {
  return Math.abs(a - b) <= Math.abs(b) * (tolPct / 100) + 1;
}

async function main() {
  console.log("== Task 1: config ==");
  const entry = findByQcode(ASHOK)!;
  const pm = entry.config.portfolioMapping;
  check("pmsSchemes has 3 entries", entry.config.pmsSchemes?.length === 3);
  for (const label of ["Scheme PMS QAW", "Scheme PMS QGF", "Scheme PMS QTF"]) {
    check(`portfolioMapping has "${label}"`, !!pm[label]);
    check(`"${label}" has pmsAccountCode`, !!pm[label]?.pmsAccountCode);
  }
  check("Zerodha schemes still present",
    !!pm["Scheme QAW++"] && !!pm["Scheme QAW+"] && !!pm["Total Portfolio"]);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
```

- [ ] **Step 5: Run validation + build**

Run: `npx tsx scripts/validate-ashok-pms.ts`
Expected: `ALL PASS`, exit 0.

Run: `npm run build`
Expected: build succeeds (exit 0).

- [ ] **Step 6: Commit**

```bash
git add app/lib/bifurcated-client-builder.ts app/lib/clients/ashok.ts scripts/validate-ashok-pms.ts
git commit -m "feat(ashok): declare 3 PMS schemes on bifurcated client config"
```

---

## Task 2: PMS bridge — read `pms_master_sheet` per account

**Files:**
- Create: `app/lib/pms-bridge.ts`
- Modify: `scripts/validate-ashok-pms.ts`

**Interfaces:**
- Consumes: `CashFlow` from `./bifurcated-portfolio-utils` (shape `{ date: string; amount: number; dividend: number }`).
- Produces:
  - `interface PmsDailyPoint { date: string; value: number; nav: number; prevNav: number | null; pnl: number; cashIn: number }`
  - `interface PmsAccountSeries { accountCode: string; daily: PmsDailyPoint[]; deposited: number; currentValue: number; totalProfit: number; cashFlows: CashFlow[] }`
  - `async function getPmsAccountSeries(accountCode: string): Promise<PmsAccountSeries>`

- [ ] **Step 1: Write the bridge module**

Create `app/lib/pms-bridge.ts`:

```ts
// READ-ONLY bridge to pms_master_sheet. The ONLY module that reads PMS data.
// Returns normalized daily series + summary cards for one PMS account_code.
import { prisma } from "@/lib/prisma";   // NAMED export — not default
import type { CashFlow } from "./bifurcated-portfolio-utils";

export interface PmsDailyPoint {
  date: string;            // YYYY-MM-DD
  value: number;           // portfolio_value
  nav: number;             // unit NAV (base ~10)
  prevNav: number | null;
  pnl: number;
  cashIn: number;          // cash_in_out
}

export interface PmsAccountSeries {
  accountCode: string;
  daily: PmsDailyPoint[];
  deposited: number;       // Σ cash_in_out
  currentValue: number;    // latest portfolio_value
  totalProfit: number;     // Σ pnl
  cashFlows: CashFlow[];
}

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function getPmsAccountSeries(
  accountCode: string
): Promise<PmsAccountSeries> {
  const rows = await prisma.pms_master_sheet.findMany({
    where: { account_code: accountCode },
    select: {
      report_date: true,
      portfolio_value: true,
      cash_in_out: true,
      nav: true,
      prev_nav: true,
      pnl: true,
    },
    orderBy: { report_date: "asc" },
  });

  const daily: PmsDailyPoint[] = rows.map((r) => ({
    date: ymd(r.report_date),
    value: Number(r.portfolio_value) || 0,
    nav: Number(r.nav) || 0,
    prevNav: r.prev_nav != null ? Number(r.prev_nav) : null,
    pnl: Number(r.pnl) || 0,
    cashIn: Number(r.cash_in_out) || 0,
  }));

  const deposited = daily.reduce((s, d) => s + d.cashIn, 0);
  const totalProfit = daily.reduce((s, d) => s + d.pnl, 0);
  const currentValue = daily.length ? daily[daily.length - 1].value : 0;
  const cashFlows: CashFlow[] = daily
    .filter((d) => d.cashIn !== 0)
    .map((d) => ({ date: d.date, amount: d.cashIn, dividend: 0 }));

  return { accountCode, daily, deposited, currentValue, totalProfit, cashFlows };
}
```

- [ ] **Step 2: Export the `CashFlow` type**

`CashFlow` is declared at `app/lib/bifurcated-portfolio-utils.ts:20` as `interface CashFlow {` (NOT exported). `pms-bridge.ts` imports it, so add the `export` keyword:

```ts
export interface CashFlow {
```

(Verify with `grep -n "interface CashFlow" app/lib/bifurcated-portfolio-utils.ts` — shape is `{ date: string; amount: number; dividend: number }`.)

- [ ] **Step 3: Extend the validation script with bridge assertions**

In `scripts/validate-ashok-pms.ts`, add the import at the top:

```ts
import { getPmsAccountSeries } from "../app/lib/pms-bridge";
```

And add, inside `main()` before the final summary:

```ts
  console.log("== Task 2: PMS bridge (drift-proof invariants) ==");
  for (const code of ["QAW00158", "QGF00157", "QTF00161"]) {
    const s = await getPmsAccountSeries(code);
    check(`${code} rows >= 83`, s.daily.length >= 83, `got ${s.daily.length}`);
    check(`${code} inception 2026-04-08`, s.daily[0]?.date === "2026-04-08", s.daily[0]?.date);
    check(`${code} currentValue == last daily value`,
      approx(s.currentValue, s.daily[s.daily.length - 1].value, 0.001),
      `cv=${s.currentValue} last=${s.daily[s.daily.length - 1].value}`);
    // Money identity: portfolio value = capital in + P&L. Drift-proof.
    check(`${code} value == deposited + profit`,
      approx(s.currentValue, s.deposited + s.totalProfit, 0.01),
      `cv=${s.currentValue} dep=${s.deposited} pnl=${s.totalProfit}`);
  }
```

- [ ] **Step 4: Run validation + build**

Run: `npx tsx scripts/validate-ashok-pms.ts`
Expected: `ALL PASS`, exit 0.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/lib/pms-bridge.ts app/lib/bifurcated-portfolio-utils.ts scripts/validate-ashok-pms.ts
git commit -m "feat(ashok): add read-only pms-bridge for pms_master_sheet"
```

---

## Task 3: Extract `computeTrailingReturnsFromCurve` (pure refactor, no behavior change)

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts`
- Create: `scripts/_snapshot-engine.ts` (regression helper)

**Interfaces:**
- Produces (module-level, exported for reuse by PMS code):
  - `function computeTrailingReturnsFromCurve(normalizedData: { date: string; nav: number }[], sinceInceptionBase: number, drawdownMetrics: { mdd: number; currentDD: number }): Record<string, number | null | string>`

**Why:** Tasks 4 and 5 need the engine's exact trailing-returns math fed an arbitrary curve. Extracting the pure loop (currently inside `calculateTrailingReturns`) lets PMS code reuse it verbatim. This task changes NO output for any existing client — gated by a byte-identical regression diff.

- [ ] **Step 1: Create the regression snapshot helper**

Create `scripts/_snapshot-engine.ts`:

```ts
/** Read-only: prints the engine's handleGET JSON for a qcode. */
import { getEngineForQcode } from "../app/lib/bifurcated-portfolio-utils";

async function main() {
  const qcode = process.argv[2];
  const engine = getEngineForQcode(qcode);
  if (!engine) { console.error(`no engine for ${qcode}`); process.exit(2); }
  const res = await engine.handleGET(
    new Request(`http://local/api?qcode=${qcode}`)
  );
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
main();
```

- [ ] **Step 2: Capture the Dinesh baseline (pre-refactor)**

Run: `npx tsx scripts/_snapshot-engine.ts QAC00053 > /tmp/dinesh-before.json`
Expected: a JSON file with `Total Portfolio`, `Scheme QAW++`, `Scheme QTF` keys. Confirm non-empty: `test -s /tmp/dinesh-before.json && echo OK`.

- [ ] **Step 3: Add the extracted pure function**

In `app/lib/bifurcated-portfolio-utils.ts`, add this module-level function (NOT a class method) just above the `class BifurcatedPortfolioEngine {` declaration. Copy the period-walking logic from the current `calculateTrailingReturns` body (the block from `const emptyReturns = {...}` through `return returns;`), parameterizing the sinceInception base as `sinceInceptionBase`:

```ts
export function computeTrailingReturnsFromCurve(
  normalizedData: { date: string; nav: number }[],
  sinceInceptionBase: number,
  drawdownMetrics: { mdd: number; currentDD: number }
): Record<string, number | null | string> {
  const emptyReturns = {
    "5d": null, "10d": null, "15d": null, "1m": null, "3m": null,
    "6m": null, "1y": null, "2y": null, "5y": null, sinceInception: null,
    MDD: drawdownMetrics.mdd, currentDD: drawdownMetrics.currentDD,
  };
  if (normalizedData.length === 0) return emptyReturns;

  const lastEntry = normalizedData[normalizedData.length - 1];
  const lastNav = lastEntry.nav;
  const currentDate = lastEntry.date;
  const oldestDate = normalizedData[0].date;
  const dataRangeDays =
    (new Date(currentDate).getTime() - new Date(oldestDate).getTime()) /
    (1000 * 60 * 60 * 24);

  const periods: Record<string, number | null> = {
    "5d": 5, "10d": 10, "15d": 15, "1m": 30, "3m": 90,
    "6m": 180, "1y": 365, "2y": 730, "5y": 1825, sinceInception: null,
  };

  const returns: Record<string, number | null | string> = {};
  for (const [period, targetCount] of Object.entries(periods)) {
    if (period === "sinceInception") {
      const firstNav = sinceInceptionBase;
      if (!firstNav) returns[period] = null;
      else if (dataRangeDays > 365)
        returns[period] = (Math.pow(lastNav / firstNav, 365 / dataRangeDays) - 1) * 100;
      else returns[period] = (lastNav / firstNav - 1) * 100;
      continue;
    }
    const requiredDays = targetCount as number;
    if (requiredDays > dataRangeDays) { returns[period] = null; continue; }
    const targetDate = new Date(currentDate);
    targetDate.setDate(targetDate.getDate() - requiredDays);
    if (targetDate < new Date(oldestDate)) { returns[period] = null; continue; }
    const targetTime = targetDate.getTime();
    let candidate: { date: string; nav: number } | null = null;
    for (const dp of normalizedData) {
      if (new Date(dp.date).getTime() <= targetTime) candidate = dp; else break;
    }
    if (!candidate) {
      for (const dp of normalizedData) {
        if (new Date(dp.date).getTime() >= targetTime) { candidate = dp; break; }
      }
    }
    if (!candidate) { returns[period] = null; continue; }
    const daysDiff = Math.abs(new Date(candidate.date).getTime() - targetTime) / (1000 * 60 * 60 * 24);
    const maxAllowedDiff = requiredDays <= 30 ? 7 : 30;
    if (daysDiff > maxAllowedDiff) { returns[period] = null; continue; }
    returns[period] = (lastNav / candidate.nav - 1) * 100;
  }
  returns["MDD"] = drawdownMetrics.mdd;
  returns["currentDD"] = drawdownMetrics.currentDD;
  return returns;
}
```

- [ ] **Step 4: Make `calculateTrailingReturns` delegate to the helper**

In `calculateTrailingReturns`, keep the existing data-prep (the `useRawDbNav` / `useRebasedData` / `normalizedData` / `historicalData` setup and the `oldSchemeName` early return). Replace everything from `const emptyReturns = {...}` through the final `return returns;` with:

```ts
    const sinceInceptionBase =
      scheme === this.config.newSchemeName && this.sharedNavTag
        ? (historicalData?.[0]?.prevNav ?? normalizedData[0]?.nav ?? 100)
        : 100;
    return computeTrailingReturnsFromCurve(
      normalizedData,
      sinceInceptionBase,
      drawdownMetrics
    );
```

Note: when `normalizedData` is empty, `normalizedData[0]?.nav` is `undefined`; `?? 100` covers it, and the helper returns `emptyReturns` regardless — preserving the old empty-data behavior.

- [ ] **Step 5: Regression diff — Dinesh must be byte-identical**

Run: `npm run build`
Expected: exit 0.

Run: `npx tsx scripts/_snapshot-engine.ts QAC00053 > /tmp/dinesh-after.json && diff /tmp/dinesh-before.json /tmp/dinesh-after.json && echo IDENTICAL`
Expected: `IDENTICAL` (no diff output). If `diff` shows ANY line, the extraction changed behavior — fix the helper to match the original exactly before proceeding.

- [ ] **Step 6: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts scripts/_snapshot-engine.ts
git commit -m "refactor(bifurcated): extract computeTrailingReturnsFromCurve (no behavior change)"
```

---

## Task 4: Per-scheme PMS views + `handleGET` routing

**Files:**
- Modify: `app/lib/bifurcated-portfolio-utils.ts`
- Modify: `scripts/validate-ashok-pms.ts`

**Interfaces:**
- Consumes: `getPmsAccountSeries` (Task 2); `computeTrailingReturnsFromCurve` (Task 3); existing private methods `calculateDrawdownMetrics`, `computeMonthlyPnLFromHistoricalData`, `calculateQuarterlyPnL`/`computeQuarterlyPnLFromHistoricalData`, `normalizeDate`.
- Produces: private `async buildPmsSchemeData(accountCode: string, scheme: string, isActive: boolean): Promise<PortfolioResponse>` on the engine; and a `get hasPms(): boolean` getter.

- [ ] **Step 1: Add the `hasPms` getter**

In `app/lib/bifurcated-portfolio-utils.ts`, add to `BifurcatedPortfolioEngine` (near `sharedNavTag`):

```ts
  private get hasPms(): boolean {
    return (this.config.pmsSchemes?.length ?? 0) > 0;
  }
```

- [ ] **Step 2: Confirm the quarterly helper signature**

The pure helper already exists: `private computeQuarterlyPnLFromHistoricalData(historicalData, useFirstPrevNav: boolean): QuarterlyPnL` at `app/lib/bifurcated-portfolio-utils.ts:1146` (mirror of `computeMonthlyPnLFromHistoricalData`). It takes the same `historicalData` array shape used in Step 3. Confirm with:

Run: `grep -n "computeQuarterlyPnLFromHistoricalData" app/lib/bifurcated-portfolio-utils.ts`
Expected: a `private computeQuarterlyPnLFromHistoricalData(` declaration. Use it directly in Step 3 — no fallback needed.

- [ ] **Step 3: Add `buildPmsSchemeData`**

Add this private method to the engine (place it near `getHistoricalData`). It rebases PMS unit-NAV (base ~10) to base 100 and reuses the engine's existing calc helpers:

```ts
  private async buildPmsSchemeData(
    accountCode: string,
    scheme: string,
    isActive: boolean
  ): Promise<PortfolioResponse> {
    const series = await getPmsAccountSeries(accountCode);

    if (series.daily.length === 0) {
      // Defensive empty render — should not happen for Ashok's live accounts.
      const empty: PortfolioData = {
        amountDeposited: "0.00", currentExposure: "0.00", return: "0.00",
        totalProfit: "0.00",
        trailingReturns: { MDD: 0, currentDD: 0, sinceInception: null } as any,
        drawdown: "0.00", maxDrawdown: "0.00", equityCurve: [],
        drawdownCurve: [], quarterlyPnl: {}, monthlyPnl: {},
        cashFlows: [], strategyName: scheme,
      };
      return {
        data: empty,
        metadata: {
          icode: scheme, accountCount: 1,
          lastUpdated: new Date().toISOString(),
          filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
          inceptionDate: null, dataAsOfDate: new Date().toISOString().split("T")[0],
          strategyName: scheme, isActive,
        },
      };
    }

    // Rebase unit NAV (base ~10) to display base 100.
    const navBase = series.daily[0].nav || 1;
    const factor = 100 / navBase;
    const historicalData = series.daily.map((d, i) => ({
      date: new Date(d.date),
      nav: d.nav * factor,
      prevNav: i === 0 ? 100 : series.daily[i - 1].nav * factor,
      drawdown: 0,
      pnl: d.pnl,
      capitalInOut: d.cashIn,
    }));

    const equityCurve = historicalData.map((d) => ({
      date: this.normalizeDate(d.date),
      nav: d.nav,
    }));
    const drawdownMetrics = this.calculateDrawdownMetrics(equityCurve);

    const firstNav = equityCurve[0].nav;   // == 100 after rebasing
    const lastNav = equityCurve[equityCurve.length - 1].nav;
    const days =
      (historicalData[historicalData.length - 1].date.getTime() -
        historicalData[0].date.getTime()) / (1000 * 60 * 60 * 24);
    const ret =
      days < 365
        ? (lastNav / firstNav - 1) * 100
        : (Math.pow(lastNav / firstNav, 365 / days) - 1) * 100;

    const trailingReturns = computeTrailingReturnsFromCurve(
      equityCurve, 100, drawdownMetrics
    );
    const monthlyPnl = this.computeMonthlyPnLFromHistoricalData(historicalData, true);
    // Quarterly: use the pure helper identified in Step 2.
    const quarterlyPnl = this.computeQuarterlyPnLFromHistoricalData(historicalData, true);

    const data: PortfolioData = {
      amountDeposited: series.deposited.toFixed(2),
      currentExposure: series.currentValue.toFixed(2),
      return: ret.toFixed(2),
      totalProfit: series.totalProfit.toFixed(2),
      trailingReturns,
      drawdown: drawdownMetrics.currentDD.toFixed(2),
      maxDrawdown: drawdownMetrics.mdd.toFixed(2),
      equityCurve,
      drawdownCurve: drawdownMetrics.ddCurve.map((d) => ({ date: d.date, drawdown: d.value })),
      quarterlyPnl,
      monthlyPnl,
      cashFlows: series.cashFlows,
      strategyName: scheme,
    };

    return {
      data,
      metadata: {
        icode: scheme, accountCount: 1,
        lastUpdated: new Date().toISOString(),
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: equityCurve[0].date,
        dataAsOfDate: this.normalizeDate(historicalData[historicalData.length - 1].date),
        strategyName: scheme, isActive,
      },
    };
  }
```

Add the `getPmsAccountSeries` import at the top of the file: `import { getPmsAccountSeries } from "./pms-bridge";`.

- [ ] **Step 4: Route PMS scheme keys in `handleGET`**

In `handleGET`, at the very top of the `for (const scheme of schemes)` loop body — after `const portfolioNames = this.getPortfolioNames(scheme);` and BEFORE the `if (scheme === this.config.oldSchemeName)` block — add:

```ts
        if (portfolioNames.pmsAccountCode) {
          results[scheme] = await this.buildPmsSchemeData(
            portfolioNames.pmsAccountCode,
            scheme,
            portfolioNames.isActive
          );
          continue;
        }
```

- [ ] **Step 5: Extend validation with per-scheme PMS assertions**

In `scripts/validate-ashok-pms.ts`, add the import (`getEngineForQcode` is exported from `bifurcated-portfolio-utils`, line 1435):

```ts
import { getEngineForQcode } from "../app/lib/bifurcated-portfolio-utils";
```

Add inside `main()`:

```ts
  console.log("== Task 4: PMS per-scheme views (drift-proof) ==");
  const engine = getEngineForQcode(ASHOK)!;
  const res = await engine.handleGET(new Request(`http://local/api?qcode=${ASHOK}`));
  const data: Record<string, any> = await res.json();
  const PMS_LABELS = ["Scheme PMS QAW", "Scheme PMS QGF", "Scheme PMS QTF"];
  const PMS_CODES: Record<string, string> = {
    "Scheme PMS QAW": "QAW00158", "Scheme PMS QGF": "QGF00157", "Scheme PMS QTF": "QTF00161",
  };
  for (const label of PMS_LABELS) {
    check(`response has "${label}"`, !!data[label]);
    if (!data[label]) continue;
    const d = data[label].data;
    // currentExposure matches the bridge's live value (self-consistent, drift-proof).
    const bridge = await getPmsAccountSeries(PMS_CODES[label]);
    check(`${label} currentExposure == bridge currentValue`,
      approx(Number(d.currentExposure), bridge.currentValue, 0.001),
      `resp=${d.currentExposure} bridge=${bridge.currentValue}`);
    // Equity rebased to base 100.
    check(`${label} equity starts at 100`, approx(d.equityCurve[0]?.nav, 100, 0.1), `got ${d.equityCurve[0]?.nav}`);
    check(`${label} inception 2026-04-08`,
      data[label].metadata.inceptionDate === "2026-04-08", data[label].metadata.inceptionDate);
    // return matches its own curve (short window → absolute return).
    const c = d.equityCurve;
    const expectedRet = (c[c.length - 1].nav / c[0].nav - 1) * 100;
    check(`${label} return matches its curve`, approx(Number(d.return), expectedRet, 1),
      `resp=${d.return} curve=${expectedRet.toFixed(2)}`);
  }
```

- [ ] **Step 6: Run validation + build + Dinesh regression**

Run: `npx tsx scripts/validate-ashok-pms.ts`
Expected: `ALL PASS`, exit 0.

Run: `npm run build`
Expected: exit 0.

Run: `npx tsx scripts/_snapshot-engine.ts QAC00053 > /tmp/dinesh-after2.json && diff /tmp/dinesh-before.json /tmp/dinesh-after2.json && echo IDENTICAL`
Expected: `IDENTICAL`.

- [ ] **Step 7: Commit**

```bash
git add app/lib/bifurcated-portfolio-utils.ts scripts/validate-ashok-pms.ts
git commit -m "feat(ashok): render 3 PMS accounts as per-scheme dashboard views"
```

---

## Task 5: Blend PMS into Total Portfolio (value-weighted combined NAV curve)

**Files:**
- Create: `app/lib/pms-blend.ts`
- Modify: `app/lib/bifurcated-portfolio-utils.ts`
- Modify: `scripts/validate-ashok-pms.ts`

**Interfaces:**
- Consumes: `getPmsAccountSeries` (Task 2); engine helpers (drawdown / monthly / quarterly / trailing).
- Produces:
  - In `pms-blend.ts` (PURE — no Prisma, no engine import):
    - `interface BlendComponentDaily { date: string; value: number; nav: number; pnl: number; cashIn: number }`
    - `interface BlendComponent { daily: BlendComponentDaily[] }`
    - `interface CombinedHistoricalPoint { date: Date; nav: number; prevNav: number | null; drawdown: number; pnl: number; capitalInOut: number }`
    - `function buildCombinedHistorical(components: BlendComponent[]): CombinedHistoricalPoint[]`
  - On the engine: private `async buildPmsBlendedTotalPortfolio(qcode: string): Promise<PortfolioResponse>`

- [ ] **Step 1: Write the pure blend math**

Create `app/lib/pms-blend.ts`:

```ts
// PURE value-weighted blend of multiple TWRR component series into one combined
// NAV curve (base 100). No DB / engine imports — unit-testable in isolation.
//
// Each component daily point carries its own unit NAV (already TWRR), its rupee
// value, and that day's pnl + cash-in. The combined daily return is the
// prior-day-value-weighted average of component daily returns; a component
// contributes only once it has a positive prior-day value (so a later-starting
// component enters with zero weight on its first day — correct TWRR treatment of
// new capital).

export interface BlendComponentDaily {
  date: string;     // YYYY-MM-DD
  value: number;
  nav: number;
  pnl: number;
  cashIn: number;
}
export interface BlendComponent {
  daily: BlendComponentDaily[];
}
export interface CombinedHistoricalPoint {
  date: Date;
  nav: number;
  prevNav: number | null;
  drawdown: number;   // filled by the engine's drawdown pass; 0 here
  pnl: number;
  capitalInOut: number;
}

export function buildCombinedHistorical(
  components: BlendComponent[]
): CombinedHistoricalPoint[] {
  // Per-component lookup by date.
  const maps = components.map((c) => {
    const m = new Map<string, BlendComponentDaily>();
    for (const d of c.daily) m.set(d.date, d);
    return m;
  });

  // Sorted union of all dates.
  const dateSet = new Set<string>();
  for (const c of components) for (const d of c.daily) dateSet.add(d.date);
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) return [];

  // Forward-filled value + nav per component (value persists across gaps; before
  // a component's first row both are null → it doesn't participate yet).
  const lastVal: (number | null)[] = components.map(() => null);
  const lastNav: (number | null)[] = components.map(() => null);

  const out: CombinedHistoricalPoint[] = [];
  let combinedNav = 100;

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];

    // Prior-day component values (weights) captured BEFORE applying today.
    const prevVals = lastVal.slice();
    const prevNavs = lastNav.slice();

    // Day pnl / cashIn summed across components present today.
    let dayPnl = 0;
    let dayCashIn = 0;

    // Value-weighted combined return for today.
    let weightSum = 0;
    let weightedReturn = 0;

    for (let ci = 0; ci < components.length; ci++) {
      const point = maps[ci].get(date);
      if (point) {
        dayPnl += point.pnl;
        dayCashIn += point.cashIn;
        // Component daily return needs a prior nav AND a positive prior value.
        if (prevNavs[ci] != null && prevNavs[ci]! > 0 &&
            prevVals[ci] != null && prevVals[ci]! > 0) {
          const r = point.nav / prevNavs[ci]! - 1;
          weightSum += prevVals[ci]!;
          weightedReturn += prevVals[ci]! * r;
        }
        // Advance forward-fill state.
        lastVal[ci] = point.value;
        lastNav[ci] = point.nav;
      }
      // No point today → keep prior forward-filled value/nav (no contribution
      // beyond the carried value, which only matters as a future weight).
    }

    const combinedReturn = weightSum > 0 ? weightedReturn / weightSum : 0;
    const prevNav = di === 0 ? null : out[di - 1].nav;
    combinedNav = di === 0 ? 100 : combinedNav * (1 + combinedReturn);

    out.push({
      date: new Date(date),
      nav: combinedNav,
      prevNav,
      drawdown: 0,
      pnl: dayPnl,
      capitalInOut: dayCashIn,
    });
  }

  return out;
}
```

- [ ] **Step 2: Add a pure unit check to the validation script**

In `scripts/validate-ashok-pms.ts`, add the import and a synthetic-data assertion (no DB) that proves the weighting math:

```ts
import { buildCombinedHistorical } from "../app/lib/pms-blend";
```

```ts
  console.log("== Task 5a: blend math (synthetic) ==");
  // Two components: A flat (nav 10→10), B grows 10→11 on day 2, equal prior value.
  const blended = buildCombinedHistorical([
    { daily: [
      { date: "2026-01-01", value: 100, nav: 10, pnl: 0, cashIn: 100 },
      { date: "2026-01-02", value: 100, nav: 10, pnl: 0, cashIn: 0 },
    ]},
    { daily: [
      { date: "2026-01-01", value: 100, nav: 10, pnl: 0, cashIn: 100 },
      { date: "2026-01-02", value: 110, nav: 11, pnl: 10, cashIn: 0 },
    ]},
  ]);
  // Day 1 base 100; day 2 = equal-weighted avg of (0%, +10%) = +5% → 105.
  check("blend day1 nav = 100", approx(blended[0].nav, 100, 0.01));
  check("blend day2 nav = 105", approx(blended[1].nav, 105, 0.01), `got ${blended[1]?.nav}`);
```

- [ ] **Step 3: Add the engine's blended Total Portfolio builder**

In `app/lib/bifurcated-portfolio-utils.ts`, add the import `import { buildCombinedHistorical, type BlendComponent } from "./pms-blend";` and this private method:

```ts
  private async buildPmsBlendedTotalPortfolio(
    qcode: string
  ): Promise<PortfolioResponse> {
    // --- Zerodha component: daily value (QAW++ PV + QAW+ PV) + Qode nav curve.
    const qawPlusPlus = "QAW++ Zerodha Total Portfolio";
    const qawPlus = "QAW+ Zerodha Total Portfolio";
    const [ppRows, pRows, qodeRows] = await Promise.all([
      this.msTable.findMany({
        where: { qcode, system_tag: qawPlusPlus },
        select: { date: true, portfolio_value: true, capital_in_out: true, pnl: true },
        orderBy: { date: "asc" },
      }),
      this.msTable.findMany({
        where: { qcode, system_tag: qawPlus },
        select: { date: true, portfolio_value: true, capital_in_out: true, pnl: true },
        orderBy: { date: "asc" },
      }),
      this.msTable.findMany({
        where: { qcode, system_tag: this.config.qodeTotalPortfolioTag, nav: { not: null } },
        select: { date: true, nav: true },
        orderBy: { date: "asc" },
      }),
    ]);

    const byDate = (rows: any[]) => {
      const m = new Map<string, any>();
      for (const r of rows) m.set(this.normalizeDate(r.date), r);
      return m;
    };
    const ppMap = byDate(ppRows), pMap = byDate(pRows), qodeMap = byDate(qodeRows);
    const zerodhaDates = Array.from(qodeMap.keys()).sort();
    const zerodhaDaily = zerodhaDates.map((date) => {
      const pp = ppMap.get(date), p = pMap.get(date);
      return {
        date,
        value: (Number(pp?.portfolio_value) || 0) + (Number(p?.portfolio_value) || 0),
        nav: Number(qodeMap.get(date)?.nav) || 0,
        pnl: (Number(pp?.pnl) || 0) + (Number(p?.pnl) || 0),
        cashIn: (Number(pp?.capital_in_out) || 0) + (Number(p?.capital_in_out) || 0),
      };
    });

    // --- PMS components.
    const pmsSeries = await Promise.all(
      (this.config.pmsSchemes ?? []).map((s) => getPmsAccountSeries(s.accountCode))
    );
    const components: BlendComponent[] = [
      { daily: zerodhaDaily },
      ...pmsSeries.map((s) => ({
        daily: s.daily.map((d) => ({
          date: d.date, value: d.value, nav: d.nav, pnl: d.pnl, cashIn: d.cashIn,
        })),
      })),
    ];

    const historicalData = buildCombinedHistorical(components);

    // --- Reuse engine calc helpers on the combined curve.
    const equityCurve = historicalData.map((d) => ({
      date: this.normalizeDate(d.date), nav: d.nav,
    }));
    const drawdownMetrics = this.calculateDrawdownMetrics(equityCurve);
    const trailingReturns = computeTrailingReturnsFromCurve(equityCurve, 100, drawdownMetrics);
    const monthlyPnl = this.computeMonthlyPnLFromHistoricalData(historicalData, false);
    const quarterlyPnl = this.computeQuarterlyPnLFromHistoricalData(historicalData, false);

    const firstNav = equityCurve.length ? equityCurve[0].nav : 100;
    const lastNav = equityCurve.length ? equityCurve[equityCurve.length - 1].nav : 100;
    const days = historicalData.length >= 2
      ? (historicalData[historicalData.length - 1].date.getTime() - historicalData[0].date.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const ret = days < 365
      ? (lastNav / firstNav - 1) * 100
      : (Math.pow(lastNav / firstNav, 365 / days) - 1) * 100;

    // --- Cards (additive): Zerodha + all PMS.
    const zerodhaCurrent =
      (Number(ppRows.at(-1)?.portfolio_value) || 0) +
      (Number(pRows.at(-1)?.portfolio_value) || 0);
    const currentValue = zerodhaCurrent + pmsSeries.reduce((s, x) => s + x.currentValue, 0);
    const totalProfit =
      historicalData.reduce((s, d) => s + d.pnl, 0); // Σ component pnl == Qode pnl + Σ PMS pnl
    const deposited =
      historicalData.reduce((s, d) => s + d.capitalInOut, 0);
    const cashFlows = historicalData
      .filter((d) => d.capitalInOut !== 0)
      .map((d) => ({ date: this.normalizeDate(d.date), amount: d.capitalInOut, dividend: 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const data: PortfolioData = {
      amountDeposited: deposited.toFixed(2),
      currentExposure: currentValue.toFixed(2),
      return: ret.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      trailingReturns,
      drawdown: drawdownMetrics.currentDD.toFixed(2),
      maxDrawdown: drawdownMetrics.mdd.toFixed(2),
      equityCurve,
      drawdownCurve: drawdownMetrics.ddCurve.map((d) => ({ date: d.date, drawdown: d.value })),
      quarterlyPnl, monthlyPnl, cashFlows,
      strategyName: "Total Portfolio",
    };

    return {
      data,
      metadata: {
        icode: "Total Portfolio", accountCount: 1,
        lastUpdated: new Date().toISOString(),
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: equityCurve.length ? equityCurve[0].date : null,
        dataAsOfDate: historicalData.length
          ? this.normalizeDate(historicalData[historicalData.length - 1].date)
          : new Date().toISOString().split("T")[0],
        strategyName: "Total Portfolio", isActive: true,
      },
    };
  }
```

Note on `totalProfit`/`deposited`: summing the combined `historicalData` pnl/capitalInOut equals (Σ Zerodha daily pnl + Σ PMS pnl) and (Σ Zerodha cashflow + Σ PMS cashflow) respectively, because each component's daily pnl/cashIn is summed into each combined point. This matches the engine's own `getTotalProfit` semantics (the `pnl` column is daily/incremental and `_sum`-able).

**Deliberate divergence from spec §4d wording:** §4d says "Qode curve `pnl` + Σ PMS pnl", but DB inspection showed the `Qode Total Portfolio` `pnl` column is effectively **0** for Ashok (cash movements live on the underlying QAW++/QAW+ tags). So the Zerodha profit is sourced from **summing the `QAW++ Zerodha Total Portfolio` + `QAW+ …` daily `pnl`** instead — which is the real Zerodha P&L. The Task 5 validation asserts the result is ≥ Σ PMS pnl, catching a regression to the zero-Qode path either way.

- [ ] **Step 4: Route Total Portfolio through the blend in `handleGET`**

In `handleGET`, immediately after the PMS-scheme routing block added in Task 4 Step 4, add:

```ts
        if (scheme === "Total Portfolio" && this.hasPms) {
          results[scheme] = await this.buildPmsBlendedTotalPortfolio(qcode);
          continue;
        }
```

- [ ] **Step 5: Extend validation with blended Total Portfolio assertions**

In `scripts/validate-ashok-pms.ts`, add inside `main()` (reusing `data` from Task 4):

```ts
  console.log("== Task 5b: blended Total Portfolio (drift-proof) ==");
  const tp = data["Total Portfolio"].data;
  // Total = sum of parts: TP current value ≈ Σ every scheme's currentExposure.
  const PART_KEYS = ["Scheme QAW++", "Scheme QAW+", ...PMS_LABELS];
  const sumCurrent = PART_KEYS.reduce((s, k) => s + Number(data[k].data.currentExposure), 0);
  check("TP currentExposure == Σ scheme currentExposures",
    approx(Number(tp.currentExposure), sumCurrent, 0.5),
    `tp=${tp.currentExposure} sumParts=${sumCurrent}`);
  const sumProfit = PART_KEYS.reduce((s, k) => s + Number(data[k].data.totalProfit), 0);
  check("TP totalProfit == Σ scheme totalProfits",
    approx(Number(tp.totalProfit), sumProfit, 0.5),
    `tp=${tp.totalProfit} sumParts=${sumProfit}`);
  // TP must exceed the 3 PMS accounts alone (it also holds the Zerodha QAW++).
  const sumPms = PMS_LABELS.reduce((s, k) => s + Number(data[k].data.currentExposure), 0);
  check("TP currentExposure > Σ PMS alone", Number(tp.currentExposure) > sumPms);
  check("TP inception = 2026-04-08",
    data["Total Portfolio"].metadata.inceptionDate === "2026-04-08",
    data["Total Portfolio"].metadata.inceptionDate);
  check("TP equity curve starts at 100",
    approx(tp.equityCurve[0]?.nav, 100, 0.1), `got ${tp.equityCurve[0]?.nav}`);
  check("TP equity curve monotonic dates",
    tp.equityCurve.every((p: any, i: number, a: any[]) => i === 0 || a[i-1].date <= p.date));
```

- [ ] **Step 6: Run validation + build + Dinesh regression**

Run: `npx tsx scripts/validate-ashok-pms.ts`
Expected: `ALL PASS`, exit 0.

Run: `npm run build`
Expected: exit 0.

Run: `npx tsx scripts/_snapshot-engine.ts QAC00053 > /tmp/dinesh-after3.json && diff /tmp/dinesh-before.json /tmp/dinesh-after3.json && echo IDENTICAL`
Expected: `IDENTICAL`.

- [ ] **Step 7: Commit**

```bash
git add app/lib/pms-blend.ts app/lib/bifurcated-portfolio-utils.ts scripts/validate-ashok-pms.ts
git commit -m "feat(ashok): blend 3 PMS accounts into Total Portfolio via value-weighted NAV curve"
```

---

## Task 6: Final verification — read-only safety, full build, manual dashboard check

**Files:**
- Modify: `scripts/validate-ashok-pms.ts` (only if a gap is found)

- [ ] **Step 1: Prove READ-ONLY across all new code**

Run: `grep -nE "\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(|\$executeRaw" app/lib/pms-bridge.ts app/lib/pms-blend.ts app/lib/bifurcated-client-builder.ts scripts/validate-ashok-pms.ts scripts/_snapshot-engine.ts`
Expected: NO output (no write operations anywhere).

Run: `grep -nE "pms_master_sheet|bifurcated_master_sheet_test" app/lib/pms-bridge.ts | head`
Expected: only `findMany` context — confirm by reading the surrounding lines.

- [ ] **Step 2: Full validation + production build**

Run: `npx tsx scripts/validate-ashok-pms.ts`
Expected: `ALL PASS`, exit 0.

Run: `npm run build`
Expected: exit 0, no type errors.

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 3: Manual dashboard smoke check**

Run: `npm run dev` (port 3020 per package.json) and sign in as / impersonate Ashok (`icode QUS00124`). Confirm in the dashboard portfolio section:
- The strategy dropdown lists: `Total Portfolio`, `Scheme QAW++`, `Scheme QAW+ (Inactive)`, `Scheme PMS QAW`, `Scheme PMS QGF`, `Scheme PMS QTF`.
- Each `Scheme PMS *` view shows a non-zero Current Value, an equity curve starting at 100, and sensible returns.
- `Total Portfolio` Current Value ≈ ₹12.5 Cr and the equity curve spans from 2026-04-08.

Record the result (pass/fail + screenshot) in the PR description. (This step is manual; it does not block the commit but MUST be done before merge.)

- [ ] **Step 4: Clean up scratch regression files**

Run: `rm -f /tmp/dinesh-before.json /tmp/dinesh-after.json /tmp/dinesh-after2.json /tmp/dinesh-after3.json`
(`scripts/validate-ashok-pms.ts` and `scripts/_snapshot-engine.ts` are READ-ONLY and kept as permanent tooling, matching `scripts/validate-bifurcated-registry.ts`.)

- [ ] **Step 5: Final commit (if Step 1–2 required any fix)**

```bash
git add -A
git commit -m "test(ashok): finalize read-only PMS blend validation"
```

---

## Self-review notes (coverage map)

- Spec §1 (config) → Task 1.
- Spec §2 (PMS bridge) → Task 2.
- Spec §3 (per-scheme PMS views, rebase to 100, reuse helpers) → Task 4 (+ Task 3 helper).
- Spec §4 (value-weighted combined NAV curve + additive cards + Current-Value fix) → Task 5.
- Spec §5 (handleGET gating + trailing-returns extraction) → Tasks 3 & 4 & 5.
- Spec §6 (frontend auto-renders; holdings out of scope) → no `page.tsx` change; verified Task 6 Step 3.
- Spec §7 (read-only, validation script, regression diff, build) → Tasks 1–6 gates.
