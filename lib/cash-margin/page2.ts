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
import { detectTier, PROP_STRATEGY } from "./tags";
import type { StrategyOverrides } from "./config";
import { loadCatalog } from "./catalog";
import { loadHoldings } from "./holdings";
import {
  loadResolvedRatios,
  withOverrides,
  hasConfiguredLeaves,
  Diagnostics,
  type Diagnostic,
} from "./ratio-resolver";
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
  /** Problems hit resolving System Breakup's config_catalog tree (see
   *  ratio-resolver.ts's DiagnosticCode) -- [] in the healthy case. Not
   *  errors: the rest of this response is still valid. See
   *  docs/cash-margin-api-contract.md §0 (diagnostics conventions). */
  diagnostics: Diagnostic[];
}

/**
 * Full Page 2 build for one client (qcode): Account Summary + System
 * Breakup + Margin Requirements + Debt-to-Equity + Inputs, all in one call.
 *
 * @param overrides - optional, request-scoped only, never persisted -- see
 *   lib/cash-margin/config.ts's StrategyOverrides. Threaded into every
 *   sub-table exactly as it would be if each route were called individually.
 * @param asOfDate - pins every mandate/mastersheet read in this response to
 *   a historical date instead of always-latest -- see loadMastersheet().
 *   Omit for "latest."
 * @param niftyLtpOverride - see margin-requirements.ts; drives Put
 *   Protection's contractValue there. NOT passed to the Inputs panel's Put
 *   Protection Calculation block, which fetches its own live NIFTY LTP by
 *   design (the two are deliberately isolated -- see inputs.ts).
 * @param globalOverrides - optional, request-scoped only, never persisted --
 *   session override for niftyLotSize/avgPricePerQty, forwarded as-is to
 *   both buildMarginRequirements() and buildInputsPanel(). See
 *   lib/cash-margin/request-utils.ts.
 */
export async function buildPage2Dashboard(
  qcode: string,
  overrides?: StrategyOverrides,
  asOfDate?: Date,
  niftyLtpOverride?: number,
  globalOverrides?: { niftyLotSize?: number; avgPricePerQty?: number },
): Promise<Page2Result | null> {
  const referenceDate = asOfDate ?? new Date();
  const mandates = await prisma.client_strategy_configs.findMany({
    where: {
      qcode,
      strategy: { not: PROP_STRATEGY },
      effective_from: { lte: referenceDate },
      OR: [{ effective_to: null }, { effective_to: { gte: referenceDate } }],
    },
    select: { account_name: true, strategy: true, exposure_tag_suffix: true },
    orderBy: { strategy: "asc" },
  });
  if (mandates.length === 0) return null;

  const [ms, catalog, holdings] = await Promise.all([
    loadMastersheet(qcode, asOfDate),
    loadCatalog(),
    loadHoldings(qcode, asOfDate),
  ]);
  const diagnostics = new Diagnostics();

  const accountSummaryByStrategy: Record<string, AccountSummaryCombined> = {};
  const systemBreakupScopes: SystemBreakupScope[] = [];
  const systemBreakupByStrategy: Record<string, SystemBreakupScope> = {};
  const debtEquityScopes: DebtEquityRow[] = [];
  const debtEquityByStrategy: Record<string, DebtEquityRow> = {};
  const splitStrategies = new Set<string>();

  for (const m of mandates) {
    const tier = detectTier(m.strategy);
    const rawRatios = await loadResolvedRatios(m.strategy, qcode, referenceDate);
    const ratios = withOverrides(rawRatios, overrides);
    const hasEquitySplit = hasConfiguredLeaves(catalog, "equity_book", "ideal", ratios);
    if (hasEquitySplit) splitStrategies.add(m.strategy);

    // Same ratios/hasEquitySplit feed both tables -- Account Summary's
    // sleeve gate must agree with System Breakup's, or the two tables would
    // show a different equity split for the same strategy. See
    // consolidated.ts's buildEquitySleeves doc comment for why the gate
    // exists at all (console_equity_holdings has no strategy dimension).
    accountSummaryByStrategy[m.strategy] = computeAccountSummaryForStrategy(
      ms,
      m.strategy,
      m.exposure_tag_suffix,
      catalog,
      holdings,
      hasEquitySplit,
      diagnostics,
    );

    const breakupScope = computeSystemBreakupForStrategy(
      ms,
      m.strategy,
      m.exposure_tag_suffix,
      tier,
      catalog,
      ratios,
      holdings,
      diagnostics,
    );
    systemBreakupScopes.push(breakupScope);
    systemBreakupByStrategy[m.strategy] = breakupScope;

    const debtEquityRow = computeDebtEquityForStrategy(ms, m.strategy, m.exposure_tag_suffix);
    debtEquityScopes.push(debtEquityRow);
    debtEquityByStrategy[m.strategy] = debtEquityRow;
  }

  // buildMarginRequirements()/buildInputsPanel() still run their own mandate
  // query (different `select` shape than this file's -- long_opt_pct/
  // psar_multiplier/etc. that Account Summary/System Breakup/Debt-Equity
  // don't need), so that part isn't de-duplicated. But mastersheet/catalog/
  // holdings ARE identical for the same (qcode, asOfDate) regardless of which
  // table asks -- passed through via `preloaded` so both functions skip their
  // own otherwise-redundant loadMastersheet/loadCatalog/loadHoldings calls.
  const preloaded = { ms, catalog, holdings };
  const [marginRequirements, inputs] = await Promise.all([
    buildMarginRequirements(qcode, overrides, asOfDate, niftyLtpOverride, globalOverrides, preloaded),
    buildInputsPanel(qcode, overrides, asOfDate, globalOverrides, preloaded),
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
      combined: computeAccountSummaryCombined(
        ms,
        mandates.map((m) => m.strategy),
        catalog,
        holdings,
        splitStrategies,
        diagnostics,
      ),
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
    diagnostics: diagnostics.items,
  };
}
