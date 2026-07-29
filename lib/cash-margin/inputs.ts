/**
 * lib/cash-margin/inputs.ts
 * "Inputs" panel (§2f) -- the per-tier config reference table
 * (QYE+/QYE++/QAW+/QAW++, same for every client), this client's resolved
 * config per active strategy + Combined, and an isolated Put Protection
 * Calculation block. See docs/cash-margin-client-dashboard-plan.md §2f.
 *
 * A projection, not a new formula, except the two divergences called out
 * below (confirmed with Akash):
 *
 *  - Combined PSAR Multiplier/Leverage are shown ONLY when every active
 *    strategy resolves to the exact same value; null otherwise. There's no
 *    single blended multiplier -- PSAR margin combines via its own
 *    per-strategy formula in margin-requirements.ts, not a weighted average
 *    here.
 *  - Combined Long Options % / Drawdown Margin % ARE derived:
 *    (sum of each active strategy's AV × that field) / combined AV --
 *    reproduces the target sheet's "Combined Drawdown Margin % = 8.16%"
 *    exactly (33,010,863.27 / 404,688,585.08, per the plan doc).
 *  - The Put Protection Calculation block's Nifty ATM is COMPLETELY
 *    ISOLATED from margin-requirements.ts: its own live fetch
 *    (nifty-ltp.ts), never margin-requirements' caller-supplied `niftyLtp`.
 *    It never feeds margin-requirements' contractValue/niftyLtp and is
 *    never fed by it. NIFTY_LOT_SIZE, however, IS shared with
 *    margin-requirements.ts -- both read the same global_config.NIFTY_LOT_SIZE
 *    row (lib/cash-margin/global-config.ts), per Akash's instruction to use
 *    one source for that constant in both places. Only the ATM *value* and
 *    the avg-price constant stay separate/isolated.
 *  - "Put Protection (%)" in the tier reference table is NOT a distinct DB
 *    column -- strategy_defaults has no such field. It equals long_opt_pct
 *    for every tier today (see docs/cash-margin-client-dashboard-plan.md
 *    Q5) and is displayed as such, not invented.
 */
import { prisma } from "@/lib/prisma";
import { loadMastersheet, computeAccountSummary, getVal } from "./mastersheet";
import { resolveMarginConfig, type MandateRow, type StrategyDefaultRow } from "./margin-requirements";
import type { StrategyOverrides } from "./config";
import { fetchNiftyLtp } from "./nifty-ltp";
import { getNiftyLotSize } from "./global-config";

/** No global_config row for this yet -- stays hardcoded, isolated per-file (see file header). */
const PUT_PROTECTION_AVG_PRICE_PER_QTY = 450;

const TIERS = ["QYE+", "QYE++", "QAW+", "QAW++"] as const;

export interface TierReferenceRow {
  strategy: string;
  psarMultiplier: number;
  psarLeverage: number;
  longOptPct: number;
  drawdownMarginPct: number;
  niftyLotSize: number;
  lcPct: number;
  cashPct: number;
  goldPct: number | null;
  momentumPct: number | null;
  lowvolPct: number | null;
  equityPct: number;
  derivativePct: number;
  /** Same as longOptPct today -- no distinct DB column, see file header. */
  putProtectionPct: number;
}

export interface StrategyInputsRow {
  strategy: string;
  psarMultiplier: number;
  psarLeverage: number;
  longOptPct: number;
  drawdownMarginPct: number;
}

export interface CombinedInputsRow {
  /** null when active strategies don't all resolve to the same value. */
  psarMultiplier: number | null;
  psarLeverage: number | null;
  longOptPct: number;
  drawdownMarginPct: number;
}

export interface PutProtectionCalculation {
  niftyAtm: number | null;
  fetchedAt: string | null;
  stale: boolean;
  fetchOk: boolean;
  exposurePerLot: number | null;
  avgPricePerQty: number;
  niftyLotSize: number;
  /** Momentum + Low Vol Stock Holdings for the first active QAW-split strategy; null if none. */
  protectedVal: number | null;
  lotsRequired: number | null;
}

export interface InputsPanelResult {
  qcode: string;
  accountName: string;
  strategies: string[];
  mastersheetDate: string | null;
  tierReference: TierReferenceRow[];
  byStrategy: Record<string, StrategyInputsRow>;
  combined: CombinedInputsRow;
  putProtectionCalculation: PutProtectionCalculation;
}

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function buildTierReferenceRow(d: StrategyDefaultRow & Record<string, unknown>, niftyLotSize: number): TierReferenceRow {
  const longOptPct = toNum(d.long_opt_pct) * 100;
  return {
    strategy: d.strategy_name,
    psarMultiplier: toNum(d.psar_multiplier),
    psarLeverage: toNum(d.psar_leverage),
    longOptPct,
    drawdownMarginPct: toNum(d.drawdown_margin_pct) * 100,
    niftyLotSize,
    lcPct: toNum(d.lc_pct) * 100,
    cashPct: toNum(d.cash_pct) * 100,
    goldPct: d.gold_pct === null || d.gold_pct === undefined ? null : Number(d.gold_pct) * 100,
    momentumPct: d.momentum_pct === null || d.momentum_pct === undefined ? null : Number(d.momentum_pct) * 100,
    lowvolPct: d.lowvol_pct === null || d.lowvol_pct === undefined ? null : Number(d.lowvol_pct) * 100,
    equityPct: toNum(d.equity_pct) * 100,
    derivativePct: toNum(d.derivative_pct) * 100,
    putProtectionPct: longOptPct,
  };
}

/**
 * Full Inputs panel build for one client (qcode).
 *
 * @param overrides - optional, request-scoped only, never persisted (POST
 *   body override of long_opt_pct/psar_multiplier/psar_leverage/
 *   drawdown_margin_pct -- see lib/cash-margin/config.ts). Does not affect
 *   the tierReference table, which is always the raw strategy_defaults.
 * @param asOfDate - TEMPORARY, for verification against frozen
 *   managed_accounts_analysis Excels -- see loadMastersheet(). Remove once done.
 */
export async function buildInputsPanel(
  qcode: string,
  overrides?: StrategyOverrides,
  asOfDate?: Date,
): Promise<InputsPanelResult | null> {
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

  const allDefaults = await prisma.strategy_defaults.findMany({ orderBy: { strategy_name: "asc" } });
  const defaultsByStrategy = new Map(allDefaults.map((d) => [d.strategy_name, d as unknown as StrategyDefaultRow]));
  const niftyLotSize = await getNiftyLotSize();

  const tierReference = TIERS.map((t) => defaultsByStrategy.get(t))
    .filter((d): d is StrategyDefaultRow => !!d)
    .map((d) => buildTierReferenceRow(d as StrategyDefaultRow & Record<string, unknown>, niftyLotSize));

  const ms = await loadMastersheet(qcode, asOfDate);

  const byStrategy: Record<string, StrategyInputsRow> = {};
  let combinedAv = 0;
  let combinedLongOptCash = 0;
  let combinedDrawdownCash = 0;
  const psarMultipliers = new Set<number>();
  const psarLeverages = new Set<number>();

  let putProtectionStrategy: string | null = null;

  for (const m of mandates as unknown as MandateRow[]) {
    const config = resolveMarginConfig(m, defaultsByStrategy.get(m.strategy), overrides);
    byStrategy[m.strategy] = {
      strategy: m.strategy,
      psarMultiplier: config.psarMultiplier,
      psarLeverage: config.psarLeverage,
      longOptPct: config.longOptPct * 100,
      drawdownMarginPct: config.drawdownMarginPct * 100,
    };
    psarMultipliers.add(config.psarMultiplier);
    psarLeverages.add(config.psarLeverage);

    const accountValue = computeAccountSummary(ms, m.strategy, m.exposure_tag_suffix).accountValue;
    combinedAv += accountValue;
    combinedLongOptCash += accountValue * config.longOptPct;
    combinedDrawdownCash += accountValue * config.drawdownMarginPct;

    if (
      !putProtectionStrategy &&
      config.goldPct !== null &&
      config.momentumPct !== null &&
      config.lowvolPct !== null
    ) {
      putProtectionStrategy = m.strategy;
    }
  }

  const combined: CombinedInputsRow = {
    psarMultiplier: psarMultipliers.size === 1 ? [...psarMultipliers][0] : null,
    psarLeverage: psarLeverages.size === 1 ? [...psarLeverages][0] : null,
    longOptPct: combinedAv ? (combinedLongOptCash / combinedAv) * 100 : 0,
    drawdownMarginPct: combinedAv ? (combinedDrawdownCash / combinedAv) * 100 : 0,
  };

  const niftyResult = await fetchNiftyLtp();
  const exposurePerLot = niftyResult.ltp !== null ? niftyResult.ltp * niftyLotSize : null;

  let protectedVal: number | null = null;
  if (putProtectionStrategy) {
    const momentumVal = getVal(ms, `${putProtectionStrategy} Momentum Stock Holdings`);
    const lowVolVal = getVal(ms, `${putProtectionStrategy} Low Vol Stock Holdings`);
    protectedVal = momentumVal + lowVolVal;
  }
  const lotsRequired = protectedVal !== null && exposurePerLot ? protectedVal / exposurePerLot : null;

  const putProtectionCalculation: PutProtectionCalculation = {
    niftyAtm: niftyResult.ltp,
    fetchedAt: niftyResult.fetchedAt ? niftyResult.fetchedAt.toISOString() : null,
    stale: niftyResult.stale,
    fetchOk: niftyResult.fetchOk,
    exposurePerLot,
    avgPricePerQty: PUT_PROTECTION_AVG_PRICE_PER_QTY,
    niftyLotSize,
    protectedVal,
    lotsRequired,
  };

  return {
    qcode,
    accountName: mandates[0].account_name,
    strategies: mandates.map((m) => m.strategy),
    mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
    tierReference,
    byStrategy,
    combined,
    putProtectionCalculation,
  };
}
