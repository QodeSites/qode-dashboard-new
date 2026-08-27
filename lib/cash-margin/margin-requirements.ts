/**
 * lib/cash-margin/margin-requirements.ts
 * "Margin Requirements" (§2c) -- Required (Long Options, PSAR, Put
 * Protection, Drawdown Margin) vs Available (Cash Collateral, Non-Cash
 * Collateral, Cash) per active strategy mandate, plus a Combined scope.
 *
 * Ported from managed_accounts_analysis/reports/margin_report.py
 * (compute_margin_requirements, get_available_from_zerodha,
 * compute_exposure_share) and margin_config.py (STRATEGY_MARGIN_CONFIG,
 * PUT_PROTECTION_STRATEGIES, NIFTY_LOT_SIZE, PUT_PROTECTION_AVG_PRICE_PER_QTY).
 *
 * Deliberate divergences from Python -- see
 * docs/page2-cell-by-cell-calculations.md Part B and
 * docs/assumptions-and-changes-from-krish-logic.md:
 *  - long_opt_pct / psar_multiplier / psar_leverage / drawdown_margin_pct
 *    come from client_strategy_configs ?? strategy_defaults (DB-driven),
 *    not Python's hardcoded STRATEGY_MARGIN_CONFIG / CLIENT_OVERRIDES dicts.
 *  - Put Protection is gated on config_catalog's equity_book leaves having
 *    a resolved "ideal" value for that strategy (same hasConfiguredLeaves
 *    check system-breakup.ts/consolidated.ts use), not a hardcoded
 *    {"QAW+","QAW++"} name check, and not the old gold_pct/momentum_pct/
 *    lowvol_pct != null check this file used before it moved onto
 *    config_catalog -- those columns are no longer read here at all.
 *  - Put Protection lots use Math.ceil (matching Python's math.ceil), so
 *    protection is never under-sized -- see docs/assumptions-and-changes-from-krish-logic.md
 *    §19.1 (previously Math.round, changed after diffing against real client
 *    Excels showed Math.round undercounts by 1 lot right at common boundaries).
 *    exposure_per_lot (contractValue) = niftyLtp *
 *    NIFTY_LOT_SIZE -- caller-supplied niftyLtp
 *    standing in for Python's live/manual Nifty ATM feed. (Previously this
 *    read cm_contract_value.contract_value, but that column's data turned
 *    out to be a signed delta-like figure, not ATM * lot size -- it flips
 *    sign day to day for every qcode. Dropped in favor of niftyLtp, which is
 *    the real Python input this table was standing in for.)
 *  - NIFTY_LOT_SIZE and PUT_PROTECTION_AVG_PRICE_PER_QTY both come from
 *    global_config (lib/cash-margin/global-config.ts's getNiftyLotSize()/
 *    getPutProtectionAvgPricePerQty()), not hardcoded TS literals.
 *    Algebraically NIFTY_LOT_SIZE still cancels out of putProtectionCash
 *    (contractValue already has a niftyLotSize factor), but it's read fresh
 *    per request for Python/DB parity. See
 *    docs/assumptions-and-changes-from-krish-logic.md §14b.
 *  - Available Cash = cm_margin_collateral.opening_balance + the day's signed
 *    settlement delta (cm_contract_value.contract_value), split by exposure
 *    share like cc/ncc since both are one client-wide figure, not
 *    per-strategy -- standard opening/closing-balance accounting, not
 *    Python's original mastersheet-residual formula (compute_account_summary).
 *    That mastersheet residual was this file's Available Cash source until
 *    now; margin-api.ts documented opening_balance as the intended source
 *    for a while before the switch actually happened here. See
 *    docs/cash-margin-architecture.md for the fix history.
 *  - Combined is a straight sum of each active strategy's Required line
 *    items and (already exposure-split) Available figures -- Python has no
 *    Combined view for Margin Requirements at all.
 *
 * TEMPORARY DEBUG: each byStrategy scope includes `putProtectionDebug`
 * (momentumVal, lowVolVal, protectedVal, contractValue, lotsRequired, etc.)
 * while a Put Protection sign/magnitude bug is under investigation. Remove
 * `putProtectionDebug` from MarginRequirementsScope and computeRequiredLines
 * once resolved -- not meant to ship long-term.
 */
import { prisma } from "@/lib/prisma";
import { loadMastersheet, getVal, type MastersheetSnapshot } from "./mastersheet";
import { computeExposureShare } from "./exposure";
import { loadMarginCollaterals, loadContractValues, type MarginAvailable } from "./margin-api";
import { getNiftyLotSize, getPutProtectionAvgPricePerQty } from "./global-config";
import { PROP_STRATEGY } from "./tags";
import type { StrategyOverrides } from "./config";
import { loadCatalog, type Catalog } from "./catalog";
import { loadHoldings, type HoldingsSnapshot } from "./holdings";
import {
  loadResolvedRatios,
  withOverrides,
  hasConfiguredLeaves,
  resolveActual,
  Diagnostics,
  type Diagnostic,
} from "./ratio-resolver";

export interface MarginLine {
  system: "Long Options" | "PSAR" | "Put Protection" | "Drawdown Margin";
  cashComponent: number | null;
  nonCashComponent: number | null;
  cash: number | null;
}

export interface MarginTotals {
  cc: number;
  ncc: number;
  cash: number;
}

export interface MarginAvailableSplit {
  cc: number | null;
  ncc: number | null;
  cash: number | null;
}

export interface MarginRequirementsScope {
  strategy: string;
  accountValue: number;
  lines: MarginLine[];
  required: MarginTotals;
  available: MarginAvailableSplit;
  /** Each available figure as a % of this scope's Account Value. */
  availablePct: MarginAvailableSplit;
  /** available - required, per column. */
  excessShortfall: MarginAvailableSplit;
  marginFetchOk: boolean;
  /**
   * TEMPORARY DEBUG -- every intermediate value behind the Put Protection
   * line, so a wrong final number can be traced to its source. Only present
   * when this strategy has a Put Protection config (hasPutProtectionConfig).
   * Remove once the current investigation is resolved.
   */
  putProtectionDebug?: {
    /** Every equity-book leaf actually summed into protectedVal, discovered
     *  by walking config_catalog (see resolvePutProtectionLegs) -- not a
     *  fixed field per leg. A future split under momentum or lowvol shows up
     *  here automatically, no shape change. */
    legs: PutProtectionLeg[];
    protectedVal: number;
    /** niftyLtp * niftyLotSize (Python's exposure_per_lot); null when niftyLtp isn't supplied. */
    contractValue: number | null;
    /** From global_config.NIFTY_LOT_SIZE (see lib/cash-margin/global-config.ts), not hardcoded. */
    niftyLotSize: number;
    /** Caller-supplied NIFTY LTP (Python's Nifty ATM stand-in); drives contractValue, null if not supplied. */
    niftyLtp: number | null;
    avgPricePerQty: number;
    lotsRequired: number;
    putProtectionCash: number;
  };
}

export interface ResolvedMarginConfig {
  longOptPct: number;
  psarMultiplier: number;
  psarLeverage: number;
  drawdownMarginPct: number;
}

export interface MandateRow {
  qcode: string;
  account_name: string;
  strategy: string;
  exposure_tag_suffix: string;
  long_opt_pct: number | null;
  psar_multiplier: number | null;
  psar_leverage: number | null;
  drawdown_margin_pct: number | null;
}

export interface StrategyDefaultRow {
  strategy_name: string;
  long_opt_pct: number;
  psar_multiplier: number;
  psar_leverage: number;
  drawdown_margin_pct: number;
}

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/**
 * overrides[strategy]?.<field> ?? client_strategy_configs.<field> ??
 * strategy_defaults[strategy].<field>. `overrides` is request-scoped only
 * (POST body), never persisted -- see docs/thresholds-to-table-and-post-override-plan.md.
 * Exported for reuse by inputs.ts (§2f Inputs panel), which needs the same
 * resolved config per active strategy for display, not just for margin math.
 */
export function resolveMarginConfig(
  mandate: MandateRow,
  fallback: StrategyDefaultRow | undefined,
  overrides: StrategyOverrides | undefined,
): ResolvedMarginConfig {
  const ov = overrides?.[mandate.strategy];
  return {
    longOptPct: ov?.longOptPct ?? toNum(mandate.long_opt_pct) ?? toNum(fallback?.long_opt_pct) ?? 0,
    psarMultiplier: ov?.psarMultiplier ?? toNum(mandate.psar_multiplier) ?? toNum(fallback?.psar_multiplier) ?? 0,
    psarLeverage: ov?.psarLeverage ?? toNum(mandate.psar_leverage) ?? toNum(fallback?.psar_leverage) ?? 0,
    drawdownMarginPct:
      ov?.drawdownMarginPct ?? toNum(mandate.drawdown_margin_pct) ?? toNum(fallback?.drawdown_margin_pct) ?? 0,
  };
}

export interface PutProtectionLeg {
  configKey: string;
  label: string;
  value: number;
}

/** Top-level equity_book children never protected by a Nifty-put hedge --
 *  Gold isn't equity-index-correlated, so it was never in scope, not even in
 *  the original Python spec (`Momentum Stock Holdings + Low Vol Stock
 *  Holdings`, no Gold term). A named exclusion, not a technical gap: unlike
 *  everything else this leg-set walk is dynamic about, THIS is a genuine
 *  product decision that has to live somewhere as an explicit rule -- see
 *  docs/cash-margin-architecture.md §7.12 for the fuller reasoning and the
 *  fully-catalog-driven alternative (a config_catalog flag column) that was
 *  considered and deferred. */
const PUT_PROTECTION_EXCLUDED_TOP_LEVEL: ReadonlySet<string> = new Set(["gold"]);

/**
 * Sums every equity-book leaf's reconciled actual (resolveActual) that's
 * eligible for Put Protection, discovered by walking config_catalog rather
 * than a hardcoded ["momentum50", "momidmtm", "lowvol"] list -- so a future
 * split under momentum OR lowvol (or lowvol itself, unsplit today) is
 * protected automatically, no code change here. Shared by
 * margin-requirements.ts and inputs.ts's Put Protection blocks, same reuse
 * pattern as resolveMarginConfig below.
 */
export function resolvePutProtectionLegs(
  catalog: Catalog,
  holdings: HoldingsSnapshot,
  ms: MastersheetSnapshot,
  strategy: string,
  diagnostics: Diagnostics,
): { legs: PutProtectionLeg[]; protectedVal: number } {
  const equityBook = catalog.byKey.get("equity_book");
  const legs: PutProtectionLeg[] = [];
  if (equityBook) {
    for (const top of equityBook.children) {
      if (PUT_PROTECTION_EXCLUDED_TOP_LEVEL.has(top.configKey)) continue;
      for (const leaf of catalog.leavesUnder(top.configKey)) {
        const value = resolveActual(catalog, leaf.configKey, holdings, ms, strategy, diagnostics) ?? 0;
        legs.push({ configKey: leaf.configKey, label: leaf.label, value });
      }
    }
  }
  return { legs, protectedVal: legs.reduce((s, l) => s + l.value, 0) };
}

/**
 * Required-margin line items + account value for one strategy mandate.
 * Put Protection only appears when `hasPutProtectionConfig` is true -- the
 * caller resolves this via config_catalog's equity_book leaves (same
 * hasConfiguredLeaves check system-breakup.ts/consolidated.ts use), which
 * stands in for Python's hardcoded strategy-name gate.
 */
function computeRequiredLines(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
  config: ResolvedMarginConfig,
  hasPutProtectionConfig: boolean,
  niftyLotSize: number,
  avgPricePerQty: number,
  catalog: Catalog,
  holdings: HoldingsSnapshot,
  diagnostics: Diagnostics,
  niftyLtp?: number,
): {
  lines: MarginLine[];
  accountValue: number;
  required: MarginTotals;
  putProtectionDebug?: MarginRequirementsScope["putProtectionDebug"];
} {
  const accountValue = getVal(ms, `${strategy} ${exposureTagSuffix}`.trim());
  const lines: MarginLine[] = [];

  const longOptionsCash = accountValue * config.longOptPct;
  lines.push({ system: "Long Options", cashComponent: null, nonCashComponent: null, cash: longOptionsCash });

  const psarMargin = config.psarLeverage
    ? (accountValue * config.psarMultiplier) / config.psarLeverage / 2
    : 0;
  lines.push({ system: "PSAR", cashComponent: psarMargin, nonCashComponent: psarMargin, cash: null });

  let putProtectionDebug: MarginRequirementsScope["putProtectionDebug"];
  if (hasPutProtectionConfig) {
    // Dynamic leg set (see resolvePutProtectionLegs) -- not a hardcoded
    // ["momentum50", "momidmtm", "lowvol"] list. Replaces the old
    // momentumVal + lowVolVal 2-leg sum, which summed a stale pre-split
    // "Momentum Stock Holdings" combined tag. See docs/cash-margin-architecture.md §7.11/§7.12.
    const { legs, protectedVal } = resolvePutProtectionLegs(catalog, holdings, ms, strategy, diagnostics);
    // exposure_per_lot, matching Python's `nifty_atm * NIFTY_LOT_SIZE` --
    // niftyLtp stands in for Python's live/manual Nifty ATM figure. Null
    // when no niftyLtp is supplied (Put Protection falls back to 0, same as
    // any other missing-input case).
    const contractValue = niftyLtp ? niftyLtp * niftyLotSize : null;
    const lotsRequired = contractValue ? Math.ceil(protectedVal / contractValue) : 0;
    // niftyLotSize algebraically cancels out here (contractValue already
    // carries a niftyLotSize factor), but it's still read from global_config
    // and applied explicitly, for parity with Python/the DB value.
    const putProtectionCash = niftyLotSize * avgPricePerQty * lotsRequired;
    lines.push({ system: "Put Protection", cashComponent: null, nonCashComponent: null, cash: putProtectionCash });
    putProtectionDebug = {
      legs,
      protectedVal,
      contractValue,
      niftyLotSize,
      niftyLtp: niftyLtp ?? null,
      avgPricePerQty,
      lotsRequired,
      putProtectionCash,
    };
  } else {
    // Placeholder row so every strategy (incl. QYE++, which has no Put
    // Protection config) shows a Put Protection line instead of omitting it.
    // Cash is a flat 0, not null: this strategy genuinely has zero Put
    // Protection requirement, as opposed to "unavailable" (contractValue
    // being null when niftyLtp isn't supplied, which stays its own separate
    // case for strategies that DO have the config). Adds nothing to
    // `required.cash`/Combined's Put Protection sum.
    lines.push({ system: "Put Protection", cashComponent: null, nonCashComponent: null, cash: 0 });
  }

  const drawdownCash = accountValue * config.drawdownMarginPct;
  lines.push({ system: "Drawdown Margin", cashComponent: null, nonCashComponent: null, cash: drawdownCash });

  const required: MarginTotals = {
    cc: lines.reduce((s, l) => s + (l.cashComponent ?? 0), 0),
    ncc: lines.reduce((s, l) => s + (l.nonCashComponent ?? 0), 0),
    cash: lines.reduce((s, l) => s + (l.cash ?? 0), 0),
  };

  return { lines, accountValue, required, putProtectionDebug };
}

function pct(part: number | null, whole: number): number | null {
  return part === null || !whole ? null : (part / whole) * 100;
}

function buildScope(
  strategy: string,
  accountValue: number,
  lines: MarginLine[],
  required: MarginTotals,
  available: MarginAvailableSplit,
  marginFetchOk: boolean,
  putProtectionDebug?: MarginRequirementsScope["putProtectionDebug"],
): MarginRequirementsScope {
  const availablePct: MarginAvailableSplit = {
    cc: pct(available.cc, accountValue),
    ncc: pct(available.ncc, accountValue),
    cash: pct(available.cash, accountValue),
  };
  const excessShortfall: MarginAvailableSplit = {
    cc: available.cc === null ? null : available.cc - required.cc,
    ncc: available.ncc === null ? null : available.ncc - required.ncc,
    cash: available.cash === null ? null : available.cash - required.cash,
  };
  return {
    strategy,
    accountValue,
    lines,
    required,
    available,
    availablePct,
    excessShortfall,
    marginFetchOk,
    putProtectionDebug,
  };
}

export interface MarginRequirementsResult {
  qcode: string;
  accountName: string;
  strategies: string[];
  mastersheetDate: string | null;
  marginFetchOk: boolean;
  /** Currently-effective global_config values (default, or session-overridden
   *  via the POST body's globalOverrides -- see lib/cash-margin/request-utils.ts). */
  globalConfig: { niftyLotSize: number; avgPricePerQty: number };
  combined: MarginRequirementsScope;
  byStrategy: Record<string, MarginRequirementsScope>;
  /** Problems hit resolving config_catalog for the Put Protection gate (see
   *  ratio-resolver.ts's DiagnosticCode) -- [] in the healthy case, and in
   *  practice always [] today: hasConfiguredLeaves is diagnostic-free by
   *  design. Kept for shape consistency with the other cash-margin tables
   *  (system-breakup/account-summary/page2), and so this stays true if
   *  margin math ever reads a resolved value directly instead of just the
   *  gate. */
  diagnostics: Diagnostic[];
}

/**
 * Full Margin Requirements build for one client (qcode): per-strategy scopes
 * plus a Combined scope that's a straight sum of the per-strategy Required
 * line items and (already exposure-split) Available figures.
 *
 * @param overrides - optional, request-scoped only, never persisted (POST
 *   body override of long_opt_pct/psar_multiplier/psar_leverage/
 *   drawdown_margin_pct/gold_pct/momentum_pct/lowvol_pct).
 * @param asOfDate - pins every mandate/mastersheet read in this response to
 *   a historical date instead of always-latest -- see loadMastersheet().
 *   Omit for "latest."
 * @param niftyLtpOverride - a caller-supplied NIFTY LTP, standing in for
 *   Python's live/manual Nifty ATM figure. Drives Put Protection's
 *   contractValue (= niftyLtpOverride * niftyLotSize); without it,
 *   contractValue is null and Put Protection falls back to 0. niftyLotSize
 *   itself comes from global_config.NIFTY_LOT_SIZE (see global-config.ts),
 *   read fresh on every call -- no longer a hardcoded TS literal.
 * @param globalOverrides - optional, request-scoped only, never persisted --
 *   session override for niftyLotSize/avgPricePerQty, falling back to
 *   global_config when omitted. See lib/cash-margin/request-utils.ts.
 */
export async function buildMarginRequirements(
  qcode: string,
  overrides?: StrategyOverrides,
  asOfDate?: Date,
  niftyLtpOverride?: number,
  globalOverrides?: { niftyLotSize?: number; avgPricePerQty?: number },
): Promise<MarginRequirementsResult | null> {
  const referenceDate = asOfDate ?? new Date();
  const mandates = await prisma.client_strategy_configs.findMany({
    where: {
      qcode,
      strategy: { not: PROP_STRATEGY },
      effective_from: { lte: referenceDate },
      OR: [{ effective_to: null }, { effective_to: { gte: referenceDate } }],
    },
    select: {
      qcode: true,
      account_name: true,
      strategy: true,
      exposure_tag_suffix: true,
      long_opt_pct: true,
      psar_multiplier: true,
      psar_leverage: true,
      drawdown_margin_pct: true,
    },
    orderBy: { strategy: "asc" },
  });
  if (mandates.length === 0) return null;

  const strategyNames = Array.from(new Set(mandates.map((m) => m.strategy)));
  const defaults = await prisma.strategy_defaults.findMany({
    where: { strategy_name: { in: strategyNames } },
  });
  const defaultsByStrategy = new Map(defaults.map((d) => [d.strategy_name, d as unknown as StrategyDefaultRow]));

  const ms = await loadMastersheet(qcode, asOfDate);
  const holdings = await loadHoldings(qcode, asOfDate);
  const marginMap = await loadMarginCollaterals([qcode]);
  const margin: MarginAvailable | null = marginMap.get(qcode) ?? null;
  const marginFetchOk = margin !== null;
  const contractValueMap = await loadContractValues([qcode]);
  const cmContractValue = contractValueMap.get(qcode) ?? 0;
  const niftyLotSize = globalOverrides?.niftyLotSize ?? (await getNiftyLotSize());
  const avgPricePerQty = globalOverrides?.avgPricePerQty ?? (await getPutProtectionAvgPricePerQty());
  const catalog = await loadCatalog();
  const diagnostics = new Diagnostics();

  const byStrategy: Record<string, MarginRequirementsScope> = {};
  const combinedLines = new Map<string, MarginLine>();
  const combinedRequired: MarginTotals = { cc: 0, ncc: 0, cash: 0 };
  const combinedAvailable: MarginAvailableSplit = { cc: 0, ncc: 0, cash: 0 };
  let combinedAccountValue = 0;

  for (const m of mandates as unknown as MandateRow[]) {
    const config = resolveMarginConfig(m, defaultsByStrategy.get(m.strategy), overrides);
    // Put Protection's gate, resolved from config_catalog -- same
    // hasConfiguredLeaves check system-breakup.ts/consolidated.ts use, not
    // the old gold_pct/momentum_pct/lowvol_pct != null check (see this
    // file's header comment).
    const rawRatios = await loadResolvedRatios(m.strategy, qcode, referenceDate);
    const ratios = withOverrides(rawRatios, overrides);
    const hasPutProtectionConfig = hasConfiguredLeaves(catalog, "equity_book", "ideal", ratios);

    const { lines, accountValue, required, putProtectionDebug } = computeRequiredLines(
      ms,
      m.strategy,
      m.exposure_tag_suffix,
      config,
      hasPutProtectionConfig,
      niftyLotSize,
      avgPricePerQty,
      catalog,
      holdings,
      diagnostics,
      niftyLtpOverride,
    );

    const share = computeExposureShare(ms, m.strategy, m.exposure_tag_suffix, mandates.length);
    // Cash available = opening_balance + the day's signed settlement delta
    // (contract_value), i.e. opening/closing-balance accounting -- then split
    // by exposure share like cc/ncc, since opening_balance and contract_value
    // are both one client-wide figure, not per-strategy. See header comment.
    const available: MarginAvailableSplit = margin
      ? {
          cc: margin.liquidCollateral * share,
          ncc: margin.stockCollateral * share,
          cash: (margin.openingBalance + cmContractValue) * share,
        }
      : { cc: null, ncc: null, cash: null };

    byStrategy[m.strategy] = buildScope(
      m.strategy,
      accountValue,
      lines,
      required,
      available,
      marginFetchOk,
      putProtectionDebug,
    );

    combinedAccountValue += accountValue;
    combinedRequired.cc += required.cc;
    combinedRequired.ncc += required.ncc;
    combinedRequired.cash += required.cash;
    if (margin) {
      // cc/ncc/cash all come from the same cm_margin_collateral fetch now
      // (cash = opening_balance + contract_value), so all three are summed
      // together, gated on the same marginFetchOk check.
      combinedAvailable.cc = (combinedAvailable.cc ?? 0) + (available.cc ?? 0);
      combinedAvailable.ncc = (combinedAvailable.ncc ?? 0) + (available.ncc ?? 0);
      combinedAvailable.cash = (combinedAvailable.cash ?? 0) + (available.cash ?? 0);
    }
    for (const line of lines) {
      const existing = combinedLines.get(line.system);
      if (existing) {
        existing.cashComponent =
          line.cashComponent === null && existing.cashComponent === null
            ? null
            : (existing.cashComponent ?? 0) + (line.cashComponent ?? 0);
        existing.nonCashComponent =
          line.nonCashComponent === null && existing.nonCashComponent === null
            ? null
            : (existing.nonCashComponent ?? 0) + (line.nonCashComponent ?? 0);
        existing.cash =
          line.cash === null && existing.cash === null ? null : (existing.cash ?? 0) + (line.cash ?? 0);
      } else {
        combinedLines.set(line.system, { ...line });
      }
    }
  }

  const SYSTEM_ORDER: MarginLine["system"][] = ["Long Options", "PSAR", "Put Protection", "Drawdown Margin"];
  const orderedCombinedLines = SYSTEM_ORDER.filter((s) => combinedLines.has(s)).map((s) => combinedLines.get(s)!);

  const combined = buildScope(
    "Combined",
    combinedAccountValue,
    orderedCombinedLines,
    combinedRequired,
    marginFetchOk ? combinedAvailable : { cc: null, ncc: null, cash: null },
    marginFetchOk,
  );

  return {
    qcode,
    accountName: mandates[0].account_name,
    strategies: mandates.map((m) => m.strategy),
    mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
    marginFetchOk,
    globalConfig: { niftyLotSize, avgPricePerQty },
    combined,
    byStrategy,
    diagnostics: diagnostics.items,
  };
}
