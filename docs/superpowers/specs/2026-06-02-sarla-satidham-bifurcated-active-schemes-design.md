# Sarla/Satidham Active Schemes → bifurcated_master_sheet_test

**Date:** 2026-06-02
**Status:** Approved design, ready for implementation plan
**Scope:** Two active schemes — Sarla "Scheme B" (QAC00041) and Satidham "Scheme QAW++" (QAC00066). Inactive (hardcoded) schemes and PMS schemes are untouched.

## Goal

Switch the data source of the two **active, master_sheet-sourced** Sarla/Satidham schemes from `master_sheet` to `bifurcated_master_sheet_test`. Inactive schemes (served by hardcoded data) and the PMS-sourced active schemes (served from `pms_master_sheet`) keep their existing source and must not be touched. `bifurcated_master_sheet_test` becomes the authoritative source for these two schemes; minor NAV/return shifts vs the old master_sheet values are accepted.

## Background: current data flow (`app/lib/sarla-utils.ts`)

Every per-scheme data-fetch function (`getAmountDeposited`, `getLatestExposure`, `getTotalProfit`, `getPortfolioReturns`, `getHistoricalData`, `getCashFlows`, `getSingleSchemeProfit`, monthly/quarterly PnL) follows the same pattern:

1. **Inactive schemes:** a `getHardcoded(qcode)` check at the top returns frozen hardcoded data and **never touches the DB**. (~15 inactive schemes across Sarla + Satidham.)
2. **Active schemes:** resolve qcode via `getEffectiveQcode()` (handles `SCHEME_QCODE_OVERRIDE`, e.g. Satidham "Scheme QAW++" → QAC00066) and tag via `getSystemTag()` / inline-hardcoded tags, then read `prisma.master_sheet` (or `prisma.pms_master_sheet` for PMS schemes).
3. **Total Portfolio:** aggregates the active schemes (e.g. Sarla sums `["Scheme B", "Scheme PMS QAW"]`, line 1881), so it follows the per-scheme sources automatically for the metrics it aggregates.

`sarla-utils.ts` does **not** currently read `bifurcated_master_sheet_test` at all. All reads are READ-ONLY (`findMany`/`findFirst`/`aggregate`/`count`).

## Confirmed data (read-only DB probes)

The bifurcated tag is NOT a mechanical rename of the master_sheet tag — it is per-scheme. Each active scheme uses two tags (deposit/exposure + NAV):

| Scheme | Metric | master_sheet tag | bifurcated_master_sheet_test tag | Verified |
|---|---|---|---|---|
| **Sarla "Scheme B"** (QAC00041) | deposit/exposure | `Zerodha Total Portfolio` | `Zerodha Total Portfolio` (same) | 542 rows, 2024-03-18→2026-06-01, end NAV 163.40 vs 163.83 (~0.27%) |
| | NAV | `Total Portfolio Value` | `Total Portfolio Value` (same) | 542 rows, end NAV 146.04 (match) |
| **Satidham "Scheme QAW++"** (QAC00066) | deposit/exposure | `Zerodha Total Portfolio` | **`QAW++ Zerodha Total Portfolio`** | 96 rows, 2026-01-07→2026-06-01, matches current source exactly |
| | NAV | `Total Portfolio Value` | **`QAW++ Total Portfolio Value`** | 96 rows, 2026-01-07 inception (matches) |

The plain `Zerodha Total Portfolio` / `Total Portfolio Value` in QAC00066's bifurcated table is a different (combined, 123-row, 2025-11-28 inception) series — using it would be wrong. Satidham QAW++ must read the **`QAW++ ` prefixed** tags.

## Approach (chosen)

**Per-scheme bifurcated-source config + a table/tag resolver, applied at every `master_sheet` read site (blanket, identity-safe).** Mirrors the bifurcated engine's `msTable` + per-scheme-tag idiom.

Rejected alternatives:
- *Unified `readMasterSheet(scheme, opts)` accessor:* cleaner single choke point but the ~15 sites use different Prisma ops (`aggregate`/`findMany`/`findFirst`) with different selects; the accessor gets complex and churns a 3000-line critical file. Higher risk.
- *Table getter only (tags unchanged):* breaks Satidham QAW++, which needs the prefixed tags.

## Component design

### 1. Config + helpers (`app/lib/sarla-utils.ts`, near `SCHEME_QCODE_OVERRIDE`)

```ts
// Active schemes whose data now comes from bifurcated_master_sheet_test instead
// of master_sheet. Keyed by scheme name. `tagRewrite` maps the master_sheet
// system_tag -> the bifurcated table's system_tag (identity when the bifurcated
// table uses the same tag name). Schemes NOT listed here keep reading
// master_sheet with their existing tags. Inactive (hardcoded) schemes never
// reach a table read, so they are untouched regardless.
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

**Name-collision safety:** both Sarla and Satidham have a "Scheme B", but Satidham's is inactive/hardcoded — its reads short-circuit at `getHardcoded` before any table access, so the `"Scheme B"` key only ever affects Sarla's active scheme. The plan documents this; optionally gate on the scheme's `isActive` flag as belt-and-suspenders.

### 2. Read-site conversion (blanket, identity-safe)

Convert **every** `prisma.master_sheet` read in `sarla-utils.ts` uniformly:
- `prisma.master_sheet.<op>` → `PortfolioApi.schemeTable(scheme).<op>`
- the `system_tag` value → `PortfolioApi.rewriteTag(scheme, <tag>)`

Because `schemeTable` returns `master_sheet` and `rewriteTag` is identity for any scheme **not** in `SCHEME_BIFURCATED_SOURCE`, every non-migrated scheme keeps byte-identical behavior. Only Sarla "Scheme B" and Satidham "Scheme QAW++" route to the bifurcated table with rewritten tags. Uniform conversion means a scheme can't be half-migrated (one metric per table); the routing decision lives in one config.

The `scheme` (or loop variable `s`) is already in scope at every read site (it drives the current tag/qcode lookups). For aggregation loops in Total Portfolio, the loop variable is the scheme.

`pms_master_sheet` reads are left untouched (PMS out of scope).

**The plan's first task is a read-site enumeration** producing the exact file:line list of every `master_sheet` read, including the inline-hardcoded-tag branches (e.g. line 1891 `s === "Scheme B" ? "Zerodha Total Portfolio"`), each with its before/after.

### 3. Total Portfolio

Total Portfolio's aggregated metrics (deposits, exposure, profit, cashflows) sum the active schemes, so they follow the migration automatically. **Open item (resolved in the enumeration task):** Sarla's Total Portfolio NAV/historical may read a dedicated tag (`Sarla Performance fibers Scheme Total Portfolio`) rather than aggregating. If the enumeration shows a dedicated tag drives the displayed aggregate NAV, decide then whether to add it to `SCHEME_BIFURCATED_SOURCE` (to avoid a mixed aggregate where deposits come from bifurcated but NAV from master_sheet). Default: scope to the two named schemes.

### 4. Verification probe (read-only)

A small `tsx` script that, for Sarla "Scheme B" and Satidham "Scheme QAW++", reads via the new resolved (table, tag, qcode) and prints headline numbers (amountDeposited, latestExposure, totalProfit, sinceInception, NAV endpoints), confirming they match the bifurcated table's raw values for the expected tags. Only `findMany`/`findFirst`/`aggregate`/`count`.

## Risks

1. **Missed read site → half-migrated scheme.** Mitigated by blanket conversion + a grep in verification confirming no bare `prisma.master_sheet` remains in read paths.
2. **Inline-hardcoded tags.** `rewriteTag` keys off the actual tag string each site passes; the Satidham QAW++ map covers both tags it uses; Sarla "Scheme B" is identity. Covered.
3. **Sarla Total Portfolio dedicated tag** — see §3; resolved by the enumeration task.
4. **Column precision** — `schemeTable` returns `any`; reads only common columns; display rounds.

## Verification

- `npm run build` exits 0.
- Read-only audit: no write operations introduced; `schemeTable` only swaps which read model is used.
- Grep: no bare `prisma.master_sheet` left in read paths (all via `schemeTable`).
- Probe script confirms the two schemes resolve to the correct bifurcated (table, tag) and the numbers match the bifurcated raw values.
- Manual: load Sarla (`QUS0007`) + Satidham (`QUS0010`); confirm Scheme B / QAW++ render from bifurcated data and Total Portfolio reflects it; **confirm every inactive scheme (Sarla A/C/D/E/F/QAW; Satidham A/B/A-Old/QYE++) is byte-unchanged** (hardcoded values identical).

## Out of scope (explicit)

- PMS schemes (`pms_master_sheet`) — untouched.
- Inactive/hardcoded schemes — untouched (short-circuit before table reads).
- All non-Sarla/Satidham clients — untouched (`schemeTable`/`rewriteTag` live only in `sarla-utils.ts`).
- The slight NAV discrepancy — accepted (bifurcated authoritative).
- Sarla Total Portfolio's dedicated tag — pending the enumeration task's finding (risk 3 / §3).

## Future work

- Migrate the PMS-sourced active schemes if/when their data lands in the bifurcated tables under a qcode+system_tag.
- If more Sarla/Satidham schemes become active and move to the bifurcated table, add them to `SCHEME_BIFURCATED_SOURCE`.
