/**
 * lib/cash-margin/consolidated.ts
 * Combined (multi-strategy) Account Summary + Excess Cash for a single
 * client/qcode running more than one strategy (e.g. QYE+++QAW++).
 *
 * Ported from managed_accounts_analysis/common_report_utils.py's
 * compute_consolidated() and compute_excess_cash() -- reads the NO-PREFIX
 * ("whole client") mastersheet tags, not a sum of the per-strategy legs
 * (computeAccountSummary in mastersheet.ts reads the prefixed tags instead).
 * The two can disagree if a client's no-prefix tags aren't populated exactly
 * as the sum of their legs -- kept as a separate function rather than merged.
 *
 * Does NOT compute Alert Status -- that's alerts.ts's per-metric bands
 * (resolved via config.ts's resolveThresholdConfig), and there is no
 * per-client (as opposed to per-strategy) rollup of it yet.
 */
import type { MastersheetSnapshot } from "./mastersheet";
import { getVal, computeAccountSummary } from "./mastersheet";
import type { Tier } from "./tags";
import type { Catalog, CatalogNode } from "./catalog";
import type { HoldingsSnapshot } from "./holdings";
import { resolveActual, type Diagnostics } from "./ratio-resolver";

const CONSOLIDATED_TAGS = {
  zerodhaTotal: "Zerodha Total Portfolio",
  mutualFunds: "Mutual Funds",
  equityStock: "Equity Stock Holdings",
  bondStock: "Bond Stock Holdings",
  liquidcase: "Liquidcase Stock Holdings",
} as const;
const LIQUIDBEES_TAG = "Liquidbees";

export interface ConsolidatedSummary {
  accountValue: number;
  mutualFunds: number;
  equityStock: number;
  bondStock: number;
  liquidcase: number;
  cash: number;
}

export interface ConsolidatedExcessCash {
  holdingsValue: number;
  /** Percent units (0-100), not a fraction. */
  idealHoldingsPct: number;
  idealAccountValue: number;
  /** Percent units (0-100), not a fraction. */
  idealCashPct: number;
  utilizedCash: number;
  currentCash: number;
  excessCash: number;
}

/** '++' if any active strategy is a ++ tier, else '+'. */
export function detectConsolidatedTier(strategies: string[]): Tier {
  return strategies.some((s) => s.includes("++")) ? "++" : "+";
}

/** Combined Account Summary from the no-prefix mastersheet tags. */
export function computeConsolidated(ms: MastersheetSnapshot): ConsolidatedSummary {
  const accountValue = getVal(ms, CONSOLIDATED_TAGS.zerodhaTotal);
  const mutualFunds = getVal(ms, CONSOLIDATED_TAGS.mutualFunds);
  const equityStock = getVal(ms, CONSOLIDATED_TAGS.equityStock);
  const bondStock = getVal(ms, CONSOLIDATED_TAGS.bondStock);
  const liquidcase = getVal(ms, CONSOLIDATED_TAGS.liquidcase) + getVal(ms, LIQUIDBEES_TAG);
  const cash = accountValue - mutualFunds - equityStock - bondStock - liquidcase;
  return { accountValue, mutualFunds, equityStock, bondStock, liquidcase, cash };
}

/**
 * holdings            = mutualFunds + equityStock + bondStock
 * idealHoldingsPct     = caller-resolved (client_strategy_configs.equity_pct
 *                        ?? strategy_defaults.equity_pct ?? POST-body
 *                        override -- see lib/cash-margin/config.ts's
 *                        resolveRatioConfig(); tier-based hardcode removed,
 *                        see docs/thresholds-to-table-and-post-override-plan.md)
 * idealAccountValue    = holdings / idealHoldingsPct
 * utilizedCash         = idealAccountValue - holdings
 * currentCash          = cash + liquidcase
 * excessCash           = currentCash - utilizedCash
 */
export function computeConsolidatedExcessCash(
  summary: ConsolidatedSummary,
  idealHoldingsPct: number,
): ConsolidatedExcessCash {
  const holdings = summary.mutualFunds + summary.equityStock + summary.bondStock;
  const idealCashPct = 1 - idealHoldingsPct;
  const idealAccountValue = idealHoldingsPct ? holdings / idealHoldingsPct : 0;
  const utilizedCash = idealAccountValue - holdings;
  const currentCash = summary.cash + summary.liquidcase;
  const excessCash = currentCash - utilizedCash;

  return {
    holdingsValue: holdings,
    idealHoldingsPct: idealHoldingsPct * 100,
    idealAccountValue,
    idealCashPct: idealCashPct * 100,
    utilizedCash,
    currentCash,
    excessCash,
  };
}

export type CombinedCashStatus = "HEALTHY" | "ACTION_REQUIRED" | "WARNING" | "CRITICAL";

/**
 * Combined (whole-client) Cash % health -- ported verbatim from
 * SMA_Dashboard_v12.xlsx's P2 sheet, cell 8K:
 *   IF(cashPct>=0.17,"Healthy", IF(>=0.15,"Action Required", IF(>=0.13,"Warning","Critical")))
 * A DIFFERENT concept from thresholds.ts's classifyMarginMetric -- that one
 * runs per-strategy (Cash %/CC %/NCC %, DB-driven bands via
 * resolveThresholdConfig), this one runs once per CLIENT on the combined
 * Cash+Liquidcase % of combined Account Value, with its own flat,
 * hardcoded 17%/15%/13% bands (not present in strategy_defaults or
 * client_strategy_configs -- this exact bands-and-tiers set exists only in
 * the source workbook). See docs/assumptions-and-changes-from-krish-logic.md
 * §19.2 for the full writeup, including two things ported AS-IS, unresolved:
 *  - the tier ORDER looks backwards ("Action Required" fires above
 *    "Warning" as cash% drops, opposite of thresholds.ts's own ordering)
 *  - "Critical" is a tier with no equivalent anywhere else in this codebase
 * Neither was "fixed" here -- this reproduces the sheet's own formula
 * exactly, on the theory that a faithful port is more useful than a
 * silently "corrected" guess. Revisit if the sheet's ordering turns out to
 * be a labeling bug rather than intentional.
 */
const COMBINED_CASH_STATUS_BANDS = { healthy: 0.17, actionRequired: 0.15, warning: 0.13 } as const;

/** @param cashPct - fraction (0-1) of combined Account Value, e.g. currentCash / accountValue -- NOT percent-scale. */
export function classifyCombinedCashStatus(cashPct: number): CombinedCashStatus {
  if (cashPct >= COMBINED_CASH_STATUS_BANDS.healthy) return "HEALTHY";
  if (cashPct >= COMBINED_CASH_STATUS_BANDS.actionRequired) return "ACTION_REQUIRED";
  if (cashPct >= COMBINED_CASH_STATUS_BANDS.warning) return "WARNING";
  return "CRITICAL";
}

export interface AccountSummaryLine {
  label: string;
  value: number;
  /** Percent units (0-100), always of Account Value. */
  pct: number;
}

/**
 * Gold/Low Vol/Momentum's dynamic sub-breakdown, replacing the old fixed
 * 3-row shape. Recursive: Momentum's `children` are momentum50/momidmtm
 * when config_catalog has them configured, [] otherwise -- a split added to
 * the catalog (or removed) changes this shape with no code change here. See
 * lib/cash-margin/system-breakup.ts's SystemBreakupRow for the sibling type
 * (this one carries no target/diff -- Account Summary is actuals-only).
 */
export interface AccountSummarySleeveRow {
  /** Stable catalog id -- use for logic/keys, never `label`. */
  configKey: string;
  label: string;
  /** 0 = direct child of equity_book, 1 = nested under that (e.g. momentum's children). */
  depth: number;
  /** null when the client has no data source at all for this leg (see
   *  ratio-resolver.ts's NO_HOLDINGS_DATA) -- render "--", never Rs 0. A
   *  genuine zero position (catalog symbol absent from holdings) is a real
   *  0, not null -- see UNMATCHED_SYMBOL. */
  value: number | null;
  /** % of THIS scope's own Account Value (same convention as every
   *  AccountSummaryLine here) -- null only when value is null. */
  pct: number | null;
  children: AccountSummarySleeveRow[];
}

export interface AccountSummaryCombined {
  accountValue: number;
  mutualFunds: number;
  equityStock: number;
  bondStock: number;
  liquidcase: number;
  cash: number;
  /** MF + Equity Stock Holdings + Bond Stock Holdings. Gold/Low Vol/Momentum
   * are an informational sub-breakdown only (of QAW's equity leg) and are
   * never added into this total -- ported from ma-portfolio-review's
   * dual_account_sheet.py Table 6 ("Overall Combined Summary"), which
   * explicitly subtracts them back out. */
  holdings: number;
  cashPlusLiquidcase: number;
  /** Account Value / Mutual Funds / Equity Stock Holdings / Bond Stock
   *  Holdings / Liquidcase / Cash / Holdings / Cash + Liquidcase -- the 8
   *  flat, always-present rows. Unchanged shape from before this file's
   *  catalog rewrite. */
  rows: AccountSummaryLine[];
  /** Gold/Low Vol/Momentum, dynamically walked from config_catalog. See
   *  AccountSummarySleeveRow. Unconditionally attempted for every strategy
   *  (unlike system-breakup.ts's hasEquitySplit gate) -- these are actuals,
   *  not targets, so there's nothing to gate on; a non-QAW strategy simply
   *  resolves 0/null here exactly as its old hardcoded tag reads did. */
  equitySleeves: AccountSummarySleeveRow[];
}

/**
 * Shared row-builder for the "ACCOUNT SUMMARY" table's 8 flat rows -- same
 * whether the scope is Combined (no-prefix rollup) or a single strategy
 * (prefixed tags). Pure -- no DB access.
 */
function buildAccountSummaryRows(summary: ConsolidatedSummary): AccountSummaryLine[] {
  const holdings = summary.mutualFunds + summary.equityStock + summary.bondStock;
  const cashPlusLiquidcase = summary.cash + summary.liquidcase;
  const av = summary.accountValue;
  const pct = (part: number) => (av ? (part / av) * 100 : 0);

  return [
    { label: "Account Value", value: av, pct: 100 },
    { label: "Mutual Funds", value: summary.mutualFunds, pct: pct(summary.mutualFunds) },
    { label: "Equity Stock Holdings", value: summary.equityStock, pct: pct(summary.equityStock) },
    { label: "Bond Stock Holdings", value: summary.bondStock, pct: pct(summary.bondStock) },
    { label: "Liquidcase", value: summary.liquidcase, pct: pct(summary.liquidcase) },
    { label: "Cash", value: summary.cash, pct: pct(summary.cash) },
    { label: "Holdings", value: holdings, pct: pct(holdings) },
    { label: "Cash + Liquidcase", value: cashPlusLiquidcase, pct: pct(cashPlusLiquidcase) },
  ];
}

/**
 * Recursively builds one Gold/Low Vol/Momentum sub-row (and its children)
 * by walking config_catalog under equity_book. Unlike
 * system-breakup.ts's buildRow, this never checks a ratio config_key for
 * "is this configured" -- Account Summary shows actuals only, and an actual
 * value is meaningful (0, or a genuine position) regardless of whether a
 * target ratio exists for it. A non-QAW strategy's gold/lowvol/momentum
 * legs simply resolve their mastersheet/holdings sources as usual, which
 * are 0/absent for it -- identical in effect to the old hardcoded tag reads
 * this replaces.
 */
function buildSleeveRow(
  catalog: Catalog,
  node: CatalogNode,
  depth: number,
  holdings: HoldingsSnapshot,
  ms: MastersheetSnapshot,
  strategy: string,
  accountValue: number,
  diagnostics: Diagnostics,
): AccountSummarySleeveRow {
  const value = resolveActual(catalog, node.configKey, holdings, ms, strategy, diagnostics);
  const pct = value === null || !accountValue ? (value === null ? null : 0) : (value / accountValue) * 100;
  return {
    configKey: node.configKey,
    label: node.label,
    depth,
    value,
    pct,
    children: node.children.map((c) =>
      buildSleeveRow(catalog, c, depth + 1, holdings, ms, strategy, accountValue, diagnostics),
    ),
  };
}

/**
 * @param hasEquitySplit - gates whether this STRATEGY's sleeves are resolved
 *   at all. Required because console_equity_holdings has NO strategy column
 *   (see holdings.ts) -- it returns the client's one true gold/momentum/lowvol
 *   position no matter which strategy asks, so resolving it unconditionally
 *   for every active strategy would double-count a leg on any client running
 *   a split strategy alongside a non-split one. Gating on the same
 *   hasEquitySplit check system-breakup.ts uses (any equity_book leaf
 *   resolved under "ideal" for THIS strategy) means only the strategy that
 *   actually owns the split contributes -- others contribute nothing. See
 *   docs/cash-margin-architecture.md §7.4 for the incident this prevents.
 */
function buildEquitySleeves(
  catalog: Catalog,
  holdings: HoldingsSnapshot,
  ms: MastersheetSnapshot,
  strategy: string,
  accountValue: number,
  hasEquitySplit: boolean,
  diagnostics: Diagnostics,
): AccountSummarySleeveRow[] {
  if (!hasEquitySplit) return [];
  const equityBook = catalog.byKey.get("equity_book");
  if (!equityBook) return [];
  return equityBook.children.map((c) =>
    buildSleeveRow(catalog, c, 0, holdings, ms, strategy, accountValue, diagnostics),
  );
}

/** Sums matching configKeys across multiple strategies' sleeve trees into
 *  one row per distinct key -- same by-key approach as
 *  system-breakup.ts's sumRowsByKey, for the same reason: robust to
 *  strategies having different resolved shapes.
 *
 *  NOTE: console_equity_holdings carries no strategy dimension (one row per
 *  qcode+date+symbol -- see holdings.ts's docstring), so summing per-strategy
 *  resolveActual() results for the SAME qcode double-counts if more than one
 *  active strategy has the equity split configured. Accepted today because
 *  no client currently runs two concurrently-active split strategies (same
 *  caveat holdings.ts already documents) -- not newly introduced by this
 *  function, and system-breakup.ts's Combined carries the identical
 *  assumption. */
function sumSleevesByKey(rowSets: AccountSummarySleeveRow[][], combinedAv: number): AccountSummarySleeveRow[] {
  const byKey = new Map<string, { label: string; depth: number; value: number | null; childSets: AccountSummarySleeveRow[][] }>();
  const order: string[] = [];

  for (const rows of rowSets) {
    for (const row of rows) {
      if (!byKey.has(row.configKey)) {
        byKey.set(row.configKey, { label: row.label, depth: row.depth, value: null, childSets: [] });
        order.push(row.configKey);
      }
      const agg = byKey.get(row.configKey)!;
      if (row.value !== null) agg.value = (agg.value ?? 0) + row.value;
      if (row.children.length > 0) agg.childSets.push(row.children);
    }
  }

  return order.map((configKey) => {
    const agg = byKey.get(configKey)!;
    return {
      configKey,
      label: agg.label,
      depth: agg.depth,
      value: agg.value,
      pct: agg.value !== null && combinedAv ? (agg.value / combinedAv) * 100 : agg.value === null ? null : 0,
      children: agg.childSets.length ? sumSleevesByKey(agg.childSets, combinedAv) : [],
    };
  });
}

/**
 * "ACCOUNT SUMMARY - Combined" -- one client's whole-account breakdown across
 * all of its active strategies. accountValue/mutualFunds/equityStock/
 * bondStock/liquidcase/cash come from the no-prefix rollup
 * (computeConsolidated), matching what excess_cash_report.py's
 * compute_consolidated() actually reads (not a sum of the per-strategy
 * legs). Gold/Low Vol/Momentum are resolved via config_catalog +
 * console_equity_holdings/mastersheet, ONLY for strategies in
 * `splitStrategies`, and summed by key -- see buildEquitySleeves' doc
 * comment for why the gate is required (console_equity_holdings has no
 * strategy dimension; an ungated strategy would re-report another
 * strategy's position and double it here).
 *
 * @param splitStrategies - which of `activeStrategies` have the equity
 *   split configured (same hasEquitySplit check as
 *   system-breakup.ts/computeSystemBreakupForStrategy) -- the caller
 *   already computes this while building System Breakup for the same
 *   mandates, so it's passed in rather than re-derived here.
 */
export function computeAccountSummaryCombined(
  ms: MastersheetSnapshot,
  activeStrategies: string[],
  catalog: Catalog,
  holdings: HoldingsSnapshot,
  splitStrategies: ReadonlySet<string>,
  diagnostics: Diagnostics,
): AccountSummaryCombined {
  const summary = computeConsolidated(ms);
  const rows = buildAccountSummaryRows(summary);
  const sleeveSets = activeStrategies.map((strategy) =>
    buildEquitySleeves(catalog, holdings, ms, strategy, summary.accountValue, splitStrategies.has(strategy), diagnostics),
  );
  const equitySleeves = sumSleevesByKey(sleeveSets, summary.accountValue);

  return {
    accountValue: summary.accountValue,
    mutualFunds: summary.mutualFunds,
    equityStock: summary.equityStock,
    bondStock: summary.bondStock,
    liquidcase: summary.liquidcase,
    cash: summary.cash,
    holdings: summary.mutualFunds + summary.equityStock + summary.bondStock,
    cashPlusLiquidcase: summary.cash + summary.liquidcase,
    rows,
    equitySleeves,
  };
}

/**
 * "ACCOUNT SUMMARY" for a single active strategy (e.g. QYE++ or QAW++) --
 * prefixed tags throughout (mastersheet.ts's computeAccountSummary), plus
 * that same strategy's own Gold/Low Vol/Momentum legs via config_catalog,
 * gated by `hasEquitySplit` -- see buildEquitySleeves' doc comment.
 */
export function computeAccountSummaryForStrategy(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
  catalog: Catalog,
  holdings: HoldingsSnapshot,
  hasEquitySplit: boolean,
  diagnostics: Diagnostics,
): AccountSummaryCombined {
  const summary = computeAccountSummary(ms, strategy, exposureTagSuffix);
  const rows = buildAccountSummaryRows(summary);
  const equitySleeves = buildEquitySleeves(catalog, holdings, ms, strategy, summary.accountValue, hasEquitySplit, diagnostics);

  return {
    accountValue: summary.accountValue,
    mutualFunds: summary.mutualFunds,
    equityStock: summary.equityStock,
    bondStock: summary.bondStock,
    liquidcase: summary.liquidcase,
    cash: summary.cash,
    holdings: summary.mutualFunds + summary.equityStock + summary.bondStock,
    cashPlusLiquidcase: summary.cash + summary.liquidcase,
    rows,
    equitySleeves,
  };
}
