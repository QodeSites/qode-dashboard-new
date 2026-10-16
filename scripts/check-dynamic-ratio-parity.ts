/**
 * scripts/check-dynamic-ratio-parity.ts
 * Phase 1 parity harness for the dynamic allocation ratios migration.
 *
 * Compares, for EVERY live cash-margin mandate:
 *   OLD path -- the fixed *_pct columns on client_strategy_configs /
 *     strategy_defaults, via lib/cash-margin/config.ts's resolveRatioConfig,
 *     and mastersheet sleeve tags via consolidated.ts.
 *   NEW path -- config_catalog + strategy_config_defaults /
 *     client_config_values via lib/cash-margin/ratio-resolver.ts, and
 *     console_equity_holdings via holdings.ts.
 *
 * Run:  npx tsx scripts/check-dynamic-ratio-parity.ts
 *
 * Ratios must match EXACTLY -- both sides read migrated copies of the same
 * numbers, so any delta is a migration or resolution bug.
 *
 * Actuals are NOT expected to match: the old path reads mastersheet tags and
 * the new path reads console_equity_holdings, which are different sources on
 * independent dates. Those are reported as informational, with the date lag
 * shown, so a real discrepancy can be told apart from the known lag.
 *
 * Read-only: findMany/findFirst only, no writes.
 */
import { prisma } from "../lib/prisma";
import { loadCatalog } from "../lib/cash-margin/catalog";
import { loadHoldings } from "../lib/cash-margin/holdings";
import { loadMastersheet, getVal, type MastersheetSnapshot } from "../lib/cash-margin/mastersheet";
import { resolveRatioConfig, resolveThresholdConfig } from "../lib/cash-margin/config";
import {
  loadResolvedRatios,
  resolveTarget,
  resolveAbsoluteTarget,
  resolveActual,
  unclassifiedHoldings,
  Diagnostics,
  type RatioType,
} from "../lib/cash-margin/ratio-resolver";

const EPS = 1e-9;

/**
 * Standalone copy of the OLD sleeve-actual computation this harness
 * exists to verify against -- lib/cash-margin/consolidated.ts's
 * sumQawSubTags before it was replaced by the catalog-driven resolveActual
 * walk. Deliberately duplicated HERE, not imported: the production code
 * migrated onto resolveActual, so there is no longer an independent old
 * implementation anywhere else to compare the new one against. Keeping a
 * frozen copy here is what makes this still a genuine two-implementation
 * check, not a comparison of the new code against itself.
 */
const OLD_QAW_SUB_TAG_SUFFIXES = {
  gold: "Gold Stock Holdings",
  momentum: "Momentum Stock Holdings",
  lowVol: "Low Vol Stock Holdings",
} as const;
function oldSumQawSubTags(ms: MastersheetSnapshot, strategy: string) {
  return {
    gold: getVal(ms, `${strategy} ${OLD_QAW_SUB_TAG_SUFFIXES.gold}`),
    momentum: getVal(ms, `${strategy} ${OLD_QAW_SUB_TAG_SUFFIXES.momentum}`),
    lowVol: getVal(ms, `${strategy} ${OLD_QAW_SUB_TAG_SUFFIXES.lowVol}`),
  };
}

/**
 * Tolerance for the "accountValue"-scale rows only (see RATIO_MAP below).
 * Those now involve a multiply up the parent_key chain (e.g. cash_pct 0.3333
 * x debt_pct 0.3), and the DB's `value` column is Decimal(9,4) -- 0.3333 is
 * already a rounded stand-in for 1/3, so the product carries real,
 * unavoidable drift (0.3333 x 0.3 = 0.09999, not 0.1 -- off by 1e-5).
 * 1e-4 lets that through while still catching anything structurally wrong
 * (a 3x scale bug, a missing chain link) by orders of magnitude. Tighten
 * this back to EPS once `value` is widened to Decimal(12,8) -- see
 * docs/dynamic-ratios-implementation-plan.md.
 */
const EPS_CHAIN = 1e-4;

/**
 * old RatioConfig field -> [new config_key, ratio_type, scale]
 *
 * `scale` says what the OLD flat-column value actually means, which decides
 * how the NEW side must be computed to be comparable:
 *
 *   "accountValue" -- old value is a fraction of Account Value directly
 *     (equityPct, cashPct, lcPct, debtPct). As of 2026-08-21, cash_pct/
 *     lc_pct are no longer stored this way in config_catalog -- they're
 *     parent-relative (fractions of debt_pct) -- so the new side must chain
 *     -multiply back up to Account Value scale before comparing. Calling
 *     resolveAbsoluteTarget(..., accountValue=1) does exactly that: passing
 *     1 for accountValue makes its return value the fraction itself, not
 *     rupees. equity_pct/debt_pct are still roots with no ancestors, so this
 *     is a no-op for them -- same call works for all four uniformly.
 *
 *   "self" -- old value is a fraction of the leaf's OWN parent, never
 *     Account Value (goldPct/momentumPct/lowvolPct were always equity_book
 *     -scale, e.g. 0.4, not 0.4 x 0.7). resolveTarget's plain own-value read
 *     already matches this with no chain-multiply -- using
 *     resolveAbsoluteTarget here would wrongly convert it to Account-Value
 *     scale and manufacture a mismatch that isn't a bug.
 */
const RATIO_MAP: [keyof ReturnType<typeof resolveRatioConfig>, string, RatioType, "accountValue" | "self"][] = [
  ["equityPct", "equity_pct", "value", "accountValue"],
  ["cashPct", "cash_pct", "value", "accountValue"],
  ["lcPct", "lc_pct", "value", "accountValue"],
  ["debtPct", "debt_pct", "value", "accountValue"],
  ["goldPct", "gold", "ideal", "self"],
  ["momentumPct", "momentum", "ideal", "self"],
  ["lowvolPct", "lowvol", "ideal", "self"],
];

/** old threshold path -> new config_key. Old side is percent-scale (x100). */
const THRESHOLD_MAP: [string, string, string][] = [
  ["cash_pct", "healthy", "cash_pct_healthy"],
  ["cash_pct", "warning", "cash_pct_warning"],
  ["cash_pct", "upside", "cash_pct_upside"],
  ["cash_collateral_pct", "healthy", "cash_collateral_pct_healthy"],
  ["cash_collateral_pct", "warning", "cash_collateral_pct_warning"],
  ["non_cash_collateral_pct", "healthy", "non_cash_collateral_pct_healthy"],
  ["non_cash_collateral_pct", "warning", "non_cash_collateral_pct_warning"],
];

interface Mismatch {
  qcode: string;
  strategy: string;
  field: string;
  old: number | null;
  next: number | null;
}

const fmt = (n: number | null) => (n === null ? "null" : String(n));
const inr = (n: number | null) =>
  n === null ? "null" : n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

async function main() {
  const referenceDate = new Date();
  const catalog = await loadCatalog();

  const [mandates, strategyDefaultsList] = await Promise.all([
    prisma.client_strategy_configs.findMany({
      where: {
        effective_from: { lte: referenceDate },
        OR: [{ effective_to: null }, { effective_to: { gte: referenceDate } }],
      },
      orderBy: [{ qcode: "asc" }, { strategy: "asc" }],
    }),
    prisma.strategy_defaults.findMany(),
  ]);
  const defaultMap = new Map(strategyDefaultsList.map((d) => [d.strategy_name, d]));

  const ratioMismatches: Mismatch[] = [];
  const thresholdMismatches: Mismatch[] = [];
  const actualRows: {
    qcode: string; strategy: string; key: string;
    old: number; next: number | null; msDate: string; hDate: string;
  }[] = [];
  const allDiagnostics: { qcode: string; strategy: string; code: string; message: string }[] = [];
  const gateChanges: { qcode: string; strategy: string; oldGate: boolean; newGate: boolean }[] = [];
  const unclassifiedByClient = new Map<string, { count: number; value: number }>();
  const noConsole: { qcode: string; strategy: string; gateOn: boolean; isXts: boolean; msGold: number }[] = [];

  let checked = 0;

  for (const m of mandates) {
    checked++;
    const diag = new Diagnostics();
    const [ratios, holdings, ms] = await Promise.all([
      loadResolvedRatios(m.strategy, m.qcode, referenceDate),
      loadHoldings(m.qcode),
      loadMastersheet(m.qcode),
    ]);

    // ---- ratios (must match exactly, within EPS_CHAIN's documented drift) ----
    const oldRatios = resolveRatioConfig(m.strategy, m, defaultMap.get(m.strategy), undefined);
    for (const [field, key, rt, scale] of RATIO_MAP) {
      const oldVal = oldRatios[field] as number | null;
      const newVal =
        scale === "accountValue"
          ? resolveAbsoluteTarget(catalog, key, rt, ratios, 1, diag)
          : resolveTarget(catalog, key, rt, ratios, diag);
      const eps = scale === "accountValue" ? EPS_CHAIN : EPS;
      const bothNull = oldVal === null && newVal === null;
      const bothNum = oldVal !== null && newVal !== null && Math.abs(oldVal - newVal) < eps;
      if (!bothNull && !bothNum) {
        ratioMismatches.push({ qcode: m.qcode, strategy: m.strategy, field, old: oldVal, next: newVal });
      }
    }

    // ---- thresholds (old side is x100) ----
    const oldTh = resolveThresholdConfig(m.strategy, m, defaultMap.get(m.strategy), undefined);
    for (const [metric, band, key] of THRESHOLD_MAP) {
      const raw = (oldTh as unknown as Record<string, Record<string, number | undefined>>)[metric][band];
      const oldVal = raw === undefined ? null : raw / 100;
      const newVal = resolveTarget(catalog, key, "value", ratios, diag);
      const bothNull = (oldVal === null || oldVal === 0) && newVal === null;
      const bothNum = oldVal !== null && newVal !== null && Math.abs(oldVal - newVal) < 1e-7;
      if (!bothNull && !bothNum) {
        thresholdMismatches.push({
          qcode: m.qcode, strategy: m.strategy, field: `${metric}.${band}`, old: oldVal, next: newVal,
        });
      }
    }

    // ---- hasEquitySplit gate ----
    const oldGate = oldRatios.goldPct != null;
    const sleeveKeys = catalog.leavesUnder("equity_book").map((n) => n.configKey);
    const configuredIdeal = ratios.configuredKeys("ideal");
    const newGate = sleeveKeys.some((k) => configuredIdeal.has(k));
    if (oldGate !== newGate) {
      gateChanges.push({ qcode: m.qcode, strategy: m.strategy, oldGate, newGate });
    }

    // ---- actuals (informational: different sources) ----
    const oldSummary = oldSumQawSubTags(ms, m.strategy);
    const msDate = ms.date?.toISOString().slice(0, 10) ?? "none";
    const hDate = holdings.date?.toISOString().slice(0, 10) ?? "none";
    for (const [key, oldVal] of [
      ["gold", oldSummary.gold],
      ["lowvol", oldSummary.lowVol],
      ["momentum", oldSummary.momentum],
    ] as const) {
      const newVal = resolveActual(catalog, key, holdings, ms, m.strategy, diag);
      actualRows.push({ qcode: m.qcode, strategy: m.strategy, key, old: oldVal, next: newVal, msDate, hDate });
    }

    for (const d of diag.items) {
      allDiagnostics.push({ qcode: m.qcode, strategy: m.strategy, code: d.code, message: d.message });
    }

    // console_equity_holdings carries EVERY equity position, not just the
    // sleeve ETFs, so "unclassified" is the normal case (individual stocks)
    // rather than an exception. Aggregate it -- listing per symbol produced
    // hundreds of rows of noise.
    const unc = unclassifiedHoldings(catalog, holdings);
    if (unc.length > 0) {
      unclassifiedByClient.set(m.qcode, {
        count: unc.length,
        value: unc.reduce((s, u) => s + u.value, 0),
      });
    }

    // Coverage: a mandate whose sleeve gate is ON but which has no console
    // rows would render every sleeve as Rs 0 under decision #5.
    if (holdings.date === null) {
      noConsole.push({
        qcode: m.qcode, strategy: m.strategy, gateOn: newGate,
        isXts: m.exposure_tag_suffix === "Total Portfolio Exposure",
        msGold: oldSummary.gold,
      });
    }
  }

  // ---------------- report ----------------
  console.log("=".repeat(78));
  console.log(`PARITY CHECK -- ${checked} live mandates, reference date ${referenceDate.toISOString().slice(0, 10)}`);
  console.log("=".repeat(78));

  // Prop was deliberately excluded from the migration (decision #10), so its
  // mismatches are expected, not regressions.
  const propMismatches = ratioMismatches.filter((x) => x.strategy === "Prop");
  const realMismatches = ratioMismatches.filter((x) => x.strategy !== "Prop");

  console.log(`\n[1] RATIOS  (must match exactly)`);
  if (realMismatches.length === 0) {
    console.log(`    PASS -- all non-Prop mandates identical (${checked * RATIO_MAP.length} comparisons)`);
  } else {
    console.log(`    ${realMismatches.length} REGRESSION(s):`);
    for (const x of realMismatches) {
      console.log(`      ${x.qcode}/${x.strategy}  ${x.field}: old=${fmt(x.old)}  new=${fmt(x.next)}`);
    }
  }
  if (propMismatches.length > 0) {
    const props = new Set(propMismatches.map((x) => x.qcode));
    console.log(`    EXPECTED: ${propMismatches.length} Prop mismatches across ${props.size} clients`);
    console.log(`      Prop was never migrated (decision #10) -- new path returns null.`);
  }

  console.log(`\n[2] THRESHOLDS  (must match exactly)`);
  if (thresholdMismatches.length === 0) {
    console.log(`    PASS -- all ${checked * THRESHOLD_MAP.length} comparisons identical`);
  } else {
    console.log(`    ${thresholdMismatches.length} mismatch(es):`);
    for (const x of thresholdMismatches.slice(0, 40)) {
      console.log(`      ${x.qcode}/${x.strategy}  ${x.field}: old=${fmt(x.old)}  new=${fmt(x.next)}`);
    }
    if (thresholdMismatches.length > 40) console.log(`      ... +${thresholdMismatches.length - 40} more`);
  }

  console.log(`\n[3] hasEquitySplit GATE  (old: gold_pct != null   new: any equity_book leaf configured)`);
  if (gateChanges.length === 0) {
    console.log(`    PASS -- gate identical for all ${checked} mandates`);
  } else {
    console.log(`    ${gateChanges.length} change(s):`);
    for (const g of gateChanges) {
      console.log(`      ${g.qcode}/${g.strategy}  old=${g.oldGate}  new=${g.newGate}`);
    }
  }

  console.log(`\n[4] ACTUALS  (informational -- mastersheet vs console_equity_holdings)`);
  const withBoth = actualRows.filter((r) => r.next !== null && (r.old !== 0 || r.next !== 0));
  const deltas = withBoth.map((r) => {
    const diff = (r.next as number) - r.old;
    const pct = r.old === 0 ? null : (diff / r.old) * 100;
    return { ...r, diff, pct };
  });
  const material = deltas.filter((d) => d.pct === null || Math.abs(d.pct) > 5);
  console.log(`    ${deltas.length} comparable rows; ${material.length} differ by >5% or have no old baseline`);
  const lagging = new Set(actualRows.filter((r) => r.msDate !== r.hDate).map((r) => `${r.qcode} (ms ${r.msDate} vs holdings ${r.hDate})`));
  console.log(`    date lag present on ${lagging.size} client(s)`);
  for (const d of material.slice(0, 25)) {
    const p = d.pct === null ? "n/a" : `${d.pct.toFixed(1)}%`;
    console.log(`      ${d.qcode}/${d.strategy} ${d.key.padEnd(9)} old=${inr(d.old).padStart(14)}  new=${inr(d.next).padStart(14)}  ${p}`);
  }
  if (material.length > 25) console.log(`      ... +${material.length - 25} more`);

  console.log(`\n[5] CONSOLE COVERAGE  (decision #5 uses console_equity_holdings for sleeve actuals)`);
  const xtsNo = noConsole.filter((n) => n.isXts);
  const gateOffNo = noConsole.filter((n) => !n.isXts && !n.gateOn);
  const broken = noConsole.filter((n) => !n.isXts && n.gateOn);
  console.log(`    mandates with NO console rows: ${noConsole.length}`);
  console.log(`      XTS (expected -- different platform, cash-margin skips them): ${xtsNo.length}`);
  console.log(`      non-XTS but sleeve gate OFF (harmless): ${gateOffNo.length}`);
  console.log(`      *** non-XTS with sleeve gate ON -- no console data: ${broken.length} (resolves null + NO_HOLDINGS_DATA, not Rs 0 -- see [6])`);
  for (const b of broken) {
    console.log(`          ${b.qcode}/${b.strategy}  mastersheet gold = Rs ${inr(b.msGold)} -> new path null (flagged, not silently 0)`);
  }

  console.log(`\n[6] DIAGNOSTICS`);
  const byCode = new Map<string, number>();
  for (const d of allDiagnostics) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
  if (byCode.size === 0) console.log(`    none`);
  for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${code}: ${n}`);
  }
  const samples = new Map<string, string>();
  for (const d of allDiagnostics) if (!samples.has(d.code)) samples.set(d.code, `${d.qcode}/${d.strategy}: ${d.message}`);
  for (const [code, s] of samples) console.log(`      e.g. [${code}] ${s}`);

  const totalUnc = [...unclassifiedByClient.values()].reduce((s, u) => s + u.value, 0);
  console.log(`    UNCLASSIFIED holdings: ${unclassifiedByClient.size} clients, Rs ${inr(totalUnc)} total`);
  console.log(`      (normal -- console_equity_holdings carries every equity position,`);
  console.log(`       not just the sleeve ETFs; excluded from sleeves by decision #7)`);

  // broken.length is NOT a hard-fail: resolveActual() resolves those sleeves
  // to null + NO_HOLDINGS_DATA (see ratio-resolver.ts), never Rs 0. It stays
  // a reported data gap (fix at source -- get the client into
  // console_equity_holdings) rather than a code regression.
  const hardFail = realMismatches.length + thresholdMismatches.length + gateChanges.length;
  console.log(`\n${"=".repeat(78)}`);
  if (hardFail === 0) {
    console.log("RESULT: PASS -- no regressions outside the known Prop exclusion");
  } else {
    console.log(`RESULT: ${hardFail} issue(s) to resolve before Phase 2`);
    if (realMismatches.length) console.log(`   - ${realMismatches.length} ratio regression(s)`);
    if (thresholdMismatches.length) console.log(`   - ${thresholdMismatches.length} threshold regression(s)`);
    if (gateChanges.length) console.log(`   - ${gateChanges.length} gate change(s)`);
  }
  if (broken.length) {
    console.log(`   NOTE: ${broken.length} mandate(s) have no console data (data-team fix, not a code issue) -- see [5]/[6]`);
  }
  console.log("=".repeat(78));
}

main()
  .catch((e) => { console.error("harness failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
