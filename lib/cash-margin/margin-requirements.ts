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
 * Deliberate divergences from Python (confirmed with Akash -- see
 * docs/page2-cell-by-cell-calculations.md Part B and
 * docs/assumptions-and-changes-from-krish-logic.md):
 *  - long_opt_pct / psar_multiplier / psar_leverage / drawdown_margin_pct
 *    come from client_strategy_configs ?? strategy_defaults (DB-driven),
 *    not Python's hardcoded STRATEGY_MARGIN_CONFIG / CLIENT_OVERRIDES dicts.
 *  - Put Protection is gated on the resolved gold/momentum/lowvol_pct
 *    config being present for that strategy, not a hardcoded
 *    {"QAW+","QAW++"} name check.
 *  - Put Protection lots are fractional (no math.ceil), and exposure_per_lot
 *    comes from cm_contract_value.contract_value, not a live Nifty ATM feed.
 *  - Available Cash comes from cm_margin_collateral.live_balance * exposure
 *    share, NOT the mastersheet "cash" residual Python uses -- confirmed
 *    against the pasted target table (D2 in the plan doc).
 *  - Combined is a straight sum of each active strategy's Required line
 *    items and (already exposure-split) Available figures -- Python has no
 *    Combined view for Margin Requirements at all.
 */
import { prisma } from "@/lib/prisma";
import { loadMastersheet, getVal, type MastersheetSnapshot } from "./mastersheet";
import { computeExposureShare } from "./exposure";
import { loadMarginCollaterals, type MarginAvailable } from "./margin-api";
import { loadContractValues } from "./contract-value";

const NIFTY_LOT_SIZE = 65;
const PUT_PROTECTION_AVG_PRICE_PER_QTY = 450;

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
}

export interface ResolvedMarginConfig {
  longOptPct: number;
  psarMultiplier: number;
  psarLeverage: number;
  drawdownMarginPct: number;
  goldPct: number | null;
  momentumPct: number | null;
  lowvolPct: number | null;
}

interface MandateRow {
  qcode: string;
  account_name: string;
  strategy: string;
  exposure_tag_suffix: string;
  long_opt_pct: number | null;
  psar_multiplier: number | null;
  psar_leverage: number | null;
  drawdown_margin_pct: number | null;
  gold_pct: number | null;
  momentum_pct: number | null;
  lowvol_pct: number | null;
}

interface StrategyDefaultRow {
  strategy_name: string;
  long_opt_pct: number;
  psar_multiplier: number;
  psar_leverage: number;
  drawdown_margin_pct: number;
  gold_pct: number | null;
  momentum_pct: number | null;
  lowvol_pct: number | null;
}

function toNum(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/** client_strategy_configs.<field> ?? strategy_defaults[strategy].<field>. */
function resolveMarginConfig(mandate: MandateRow, fallback: StrategyDefaultRow | undefined): ResolvedMarginConfig {
  return {
    longOptPct: toNum(mandate.long_opt_pct) ?? toNum(fallback?.long_opt_pct) ?? 0,
    psarMultiplier: toNum(mandate.psar_multiplier) ?? toNum(fallback?.psar_multiplier) ?? 0,
    psarLeverage: toNum(mandate.psar_leverage) ?? toNum(fallback?.psar_leverage) ?? 0,
    drawdownMarginPct: toNum(mandate.drawdown_margin_pct) ?? toNum(fallback?.drawdown_margin_pct) ?? 0,
    goldPct: toNum(mandate.gold_pct) ?? toNum(fallback?.gold_pct),
    momentumPct: toNum(mandate.momentum_pct) ?? toNum(fallback?.momentum_pct),
    lowvolPct: toNum(mandate.lowvol_pct) ?? toNum(fallback?.lowvol_pct),
  };
}

/**
 * Required-margin line items + account value for one strategy mandate.
 * Put Protection only appears when the resolved config carries all three of
 * gold_pct/momentum_pct/lowvol_pct (the QAW-split signature) -- config
 * presence stands in for Python's hardcoded strategy-name gate.
 */
function computeRequiredLines(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
  config: ResolvedMarginConfig,
  contractValue: number | null,
): { lines: MarginLine[]; accountValue: number; required: MarginTotals } {
  const accountValue = getVal(ms, `${strategy} ${exposureTagSuffix}`.trim());
  const lines: MarginLine[] = [];

  const longOptionsCash = accountValue * config.longOptPct;
  lines.push({ system: "Long Options", cashComponent: null, nonCashComponent: null, cash: longOptionsCash });

  const psarMargin = config.psarLeverage
    ? (accountValue * config.psarMultiplier) / config.psarLeverage / 2
    : 0;
  lines.push({ system: "PSAR", cashComponent: psarMargin, nonCashComponent: psarMargin, cash: null });

  const hasPutProtectionConfig =
    config.goldPct !== null && config.momentumPct !== null && config.lowvolPct !== null;
  if (hasPutProtectionConfig) {
    const momentumVal = getVal(ms, `${strategy} Momentum Stock Holdings`);
    const lowVolVal = getVal(ms, `${strategy} Low Vol Stock Holdings`);
    const protectedVal = momentumVal + lowVolVal;
    const lotsRequired = contractValue ? protectedVal / contractValue : 0;
    const putProtectionCash = NIFTY_LOT_SIZE * PUT_PROTECTION_AVG_PRICE_PER_QTY * lotsRequired;
    lines.push({ system: "Put Protection", cashComponent: null, nonCashComponent: null, cash: putProtectionCash });
  }

  const drawdownCash = accountValue * config.drawdownMarginPct;
  lines.push({ system: "Drawdown Margin", cashComponent: null, nonCashComponent: null, cash: drawdownCash });

  const required: MarginTotals = {
    cc: lines.reduce((s, l) => s + (l.cashComponent ?? 0), 0),
    ncc: lines.reduce((s, l) => s + (l.nonCashComponent ?? 0), 0),
    cash: lines.reduce((s, l) => s + (l.cash ?? 0), 0),
  };

  return { lines, accountValue, required };
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
  return { strategy, accountValue, lines, required, available, availablePct, excessShortfall, marginFetchOk };
}

export interface MarginRequirementsResult {
  qcode: string;
  accountName: string;
  strategies: string[];
  mastersheetDate: string | null;
  marginFetchOk: boolean;
  combined: MarginRequirementsScope;
  byStrategy: Record<string, MarginRequirementsScope>;
}

/**
 * Full Margin Requirements build for one client (qcode): per-strategy scopes
 * plus a Combined scope that's a straight sum of the per-strategy Required
 * line items and (already exposure-split) Available figures.
 */
export async function buildMarginRequirements(qcode: string): Promise<MarginRequirementsResult | null> {
  const mandates = await prisma.client_strategy_configs.findMany({
    where: { qcode, OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }] },
    select: {
      qcode: true,
      account_name: true,
      strategy: true,
      exposure_tag_suffix: true,
      long_opt_pct: true,
      psar_multiplier: true,
      psar_leverage: true,
      drawdown_margin_pct: true,
      gold_pct: true,
      momentum_pct: true,
      lowvol_pct: true,
    },
    orderBy: { strategy: "asc" },
  });
  if (mandates.length === 0) return null;

  const strategyNames = Array.from(new Set(mandates.map((m) => m.strategy)));
  const defaults = await prisma.strategy_defaults.findMany({
    where: { strategy_name: { in: strategyNames } },
  });
  const defaultsByStrategy = new Map(defaults.map((d) => [d.strategy_name, d as unknown as StrategyDefaultRow]));

  const ms = await loadMastersheet(qcode);
  const marginMap = await loadMarginCollaterals([qcode]);
  const contractValueMap = await loadContractValues([qcode]);
  const margin: MarginAvailable | null = marginMap.get(qcode) ?? null;
  const marginFetchOk = margin !== null;
  const contractValue = contractValueMap.get(qcode) ?? null;

  const byStrategy: Record<string, MarginRequirementsScope> = {};
  const combinedLines = new Map<string, MarginLine>();
  const combinedRequired: MarginTotals = { cc: 0, ncc: 0, cash: 0 };
  const combinedAvailable: MarginAvailableSplit = { cc: 0, ncc: 0, cash: 0 };
  let combinedAccountValue = 0;

  for (const m of mandates as unknown as MandateRow[]) {
    const config = resolveMarginConfig(m, defaultsByStrategy.get(m.strategy));
    const { lines, accountValue, required } = computeRequiredLines(
      ms,
      m.strategy,
      m.exposure_tag_suffix,
      config,
      contractValue,
    );

    const share = computeExposureShare(ms, m.strategy, m.exposure_tag_suffix, mandates.length);
    const available: MarginAvailableSplit = margin
      ? { cc: margin.liquidCollateral * share, ncc: margin.stockCollateral * share, cash: margin.liveBalance * share }
      : { cc: null, ncc: null, cash: null };

    byStrategy[m.strategy] = buildScope(m.strategy, accountValue, lines, required, available, marginFetchOk);

    combinedAccountValue += accountValue;
    combinedRequired.cc += required.cc;
    combinedRequired.ncc += required.ncc;
    combinedRequired.cash += required.cash;
    if (margin) {
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
    combined,
    byStrategy,
  };
}
