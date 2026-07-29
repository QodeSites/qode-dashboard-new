/**
 * lib/cash-margin/page2.ts
 * Single combined read for everything Page 2 (Client Detail) needs for one
 * qcode -- Account Summary (§2b), System Breakup (§2d), Margin Requirements
 * (§2c), Debt-to-Equity (§2e), and the Inputs panel (§2f) -- in one response,
 * instead of 5 separate requests.
 *
 * Deliberately decoupled, not a rewrite: this file does not modify any of
 * the 5 existing single-table builders or their routes. `margin-requirements.ts`'s
 * buildMarginRequirements() and `inputs.ts`'s buildInputsPanel() are called
 * as-is (each is already fully self-contained -- own mandate query, own
 * loadMastersheet() call). Account Summary / System Breakup / Debt-Equity
 * don't have a standalone "build the whole table" function to call (their
 * mandate-fetch + assembly loop lives inline in each route.ts) -- rather
 * than extracting/touching those routes, this file re-fetches mandates once
 * itself and calls the already-exported per-strategy/combined compute
 * functions those routes already use (computeAccountSummaryForStrategy/Combined,
 * computeSystemBreakupForStrategy/Combined, computeDebtEquityForStrategy/Combined).
 * One shared mastersheet load covers all three, instead of the three
 * separate loads the individual routes would do if called one after another.
 *
 * `overrides` follows the same StrategyOverrides shape and resolution order
 * as every other cash-margin route (request-scoped only, never persisted) --
 * see lib/cash-margin/config.ts.
 */
import { prisma } from "@/lib/prisma";
import { loadMastersheet } from "./mastersheet";
import { detectTier } from "./tags";
import { resolveRatioConfig, type StrategyOverrides } from "./config";
import {
  computeAccountSummaryForStrategy,
  computeAccountSummaryCombined,
  type AccountSummaryCombined,
} from "./consolidated";
import {
  computeSystemBreakupForStrategy,
  computeSystemBreakupCombined,
  type SystemBreakupScope,
  type SystemBreakupCombined,
} from "./system-breakup";
import {
  computeDebtEquityForStrategy,
  computeDebtEquityCombined,
  type DebtEquityRow,
} from "./debt-equity";
import { buildMarginRequirements, type MarginRequirementsResult } from "./margin-requirements";
import { buildInputsPanel, type InputsPanelResult } from "./inputs";

export interface Page2Result {
  qcode: string;
  accountName: string;
  strategies: string[];
  mastersheetDate: string | null;
  accountSummary: {
    combined: AccountSummaryCombined;
    byStrategy: Record<string, AccountSummaryCombined>;
  };
  systemBreakup: {
    combined: SystemBreakupCombined;
    byStrategy: Record<string, SystemBreakupScope>;
  };
  marginRequirements: Omit<MarginRequirementsResult, "qcode" | "accountName" | "strategies" | "mastersheetDate">;
  debtEquity: {
    combined: DebtEquityRow;
    byStrategy: Record<string, DebtEquityRow>;
  };
  inputs: Omit<InputsPanelResult, "qcode" | "accountName" | "strategies" | "mastersheetDate">;
}

/**
 * Full Page 2 build for one client (qcode): Account Summary + System
 * Breakup + Margin Requirements + Debt-to-Equity + Inputs, all in one call.
 *
 * @param overrides - optional, request-scoped only, never persisted -- see
 *   lib/cash-margin/config.ts's StrategyOverrides. Threaded into every
 *   sub-table exactly as it would be if each route were called individually.
 * @param asOfDate - TEMPORARY, for verification against frozen
 *   managed_accounts_analysis Excels -- see loadMastersheet(). Remove once done.
 * @param niftyLtpOverride - see margin-requirements.ts; drives Put
 *   Protection's contractValue there. NOT passed to the Inputs panel's Put
 *   Protection Calculation block, which fetches its own live NIFTY LTP by
 *   design (the two are deliberately isolated -- see inputs.ts).
 */
export async function buildPage2Dashboard(
  qcode: string,
  overrides?: StrategyOverrides,
  asOfDate?: Date,
  niftyLtpOverride?: number,
): Promise<Page2Result | null> {
  const [mandates, strategyDefaultsList] = await Promise.all([
    prisma.client_strategy_configs.findMany({
      where: { qcode, OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }] },
      select: {
        account_name: true,
        strategy: true,
        exposure_tag_suffix: true,
        gold_pct: true,
        equity_pct: true,
        cash_pct: true,
        lc_pct: true,
        derivative_pct: true,
        momentum_pct: true,
        lowvol_pct: true,
      },
      orderBy: { strategy: "asc" },
    }),
    prisma.strategy_defaults.findMany({
      select: {
        strategy_name: true,
        gold_pct: true,
        equity_pct: true,
        cash_pct: true,
        lc_pct: true,
        derivative_pct: true,
        momentum_pct: true,
        lowvol_pct: true,
      },
    }),
  ]);
  if (mandates.length === 0) return null;

  const defaultMap = new Map(strategyDefaultsList.map((d) => [d.strategy_name, d]));
  const ms = await loadMastersheet(qcode, asOfDate);

  const accountSummaryByStrategy: Record<string, AccountSummaryCombined> = {};
  const systemBreakupScopes: SystemBreakupScope[] = [];
  const systemBreakupByStrategy: Record<string, SystemBreakupScope> = {};
  const debtEquityScopes: DebtEquityRow[] = [];
  const debtEquityByStrategy: Record<string, DebtEquityRow> = {};

  for (const m of mandates) {
    accountSummaryByStrategy[m.strategy] = computeAccountSummaryForStrategy(
      ms,
      m.strategy,
      m.exposure_tag_suffix,
    );

    const tier = detectTier(m.strategy);
    const ratios = resolveRatioConfig(m.strategy, m, defaultMap.get(m.strategy), overrides);
    const hasEquitySplit = ratios.goldPct != null;
    const breakupScope = computeSystemBreakupForStrategy(
      ms,
      m.strategy,
      m.exposure_tag_suffix,
      tier,
      hasEquitySplit,
      ratios,
    );
    systemBreakupScopes.push(breakupScope);
    systemBreakupByStrategy[m.strategy] = breakupScope;

    const debtEquityRow = computeDebtEquityForStrategy(ms, m.strategy, m.exposure_tag_suffix);
    debtEquityScopes.push(debtEquityRow);
    debtEquityByStrategy[m.strategy] = debtEquityRow;
  }

  // buildMarginRequirements()/buildInputsPanel() are self-contained (their
  // own mandate query + mastersheet load) -- called as-is, not inlined,
  // to avoid touching either file. Both are guaranteed non-null here since
  // we already confirmed mandates.length > 0 above with the same active-mandate filter.
  const [marginRequirements, inputs] = await Promise.all([
    buildMarginRequirements(qcode, overrides, asOfDate, niftyLtpOverride),
    buildInputsPanel(qcode, overrides, asOfDate),
  ]);

  const { qcode: _mrQcode, accountName: _mrName, strategies: _mrStrategies, mastersheetDate: _mrDate, ...marginRequirementsRest } =
    marginRequirements!;
  const { qcode: _inQcode, accountName: _inName, strategies: _inStrategies, mastersheetDate: _inDate, ...inputsRest } = inputs!;

  return {
    qcode,
    accountName: mandates[0].account_name,
    strategies: mandates.map((m) => m.strategy),
    mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
    accountSummary: {
      combined: computeAccountSummaryCombined(ms, mandates.map((m) => m.strategy)),
      byStrategy: accountSummaryByStrategy,
    },
    systemBreakup: {
      combined: computeSystemBreakupCombined(systemBreakupScopes),
      byStrategy: systemBreakupByStrategy,
    },
    marginRequirements: marginRequirementsRest,
    debtEquity: {
      combined: computeDebtEquityCombined(debtEquityScopes),
      byStrategy: debtEquityByStrategy,
    },
    inputs: inputsRest,
  };
}
