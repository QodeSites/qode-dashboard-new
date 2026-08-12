/**
 * Entry point for the Postgres-native Investment Summary calculator (doc 04
 * "index.ts") — the only module `app/api/investment-summary/route.ts`
 * imports. Produces the `MultiStrategyInvestmentData` shape defined in
 * app/lib/parse-investment-pdf.ts (originally the legacy `.xlsx` parser's
 * output shape, kept as the shared type home after that parser was
 * removed 2026-08-12), computed directly from Postgres.
 *
 * Satidham-old (QUS0010) is explicitly OUT OF SCOPE — it stays on the
 * existing app/lib/sarla-utils.ts path. computeInvestmentSummary throws for
 * this icode rather than silently producing wrong numbers.
 *
 * Sarla (QUS0007) was cut over 2026-08-12 (doc 05 Q14) on the strength of:
 * config/Master_Config.csv's existing QYE+ row for QAC00041 matching the
 * real WSL Strategy_Config.csv exactly, full/current data in every table
 * the calculator reads (QYE+ Total Portfolio Value / QYE+ Zerodha Total
 * Portfolio both have 591 rows through 2026-08-10), and the calculator
 * logic having already been validated against Sarla-shaped data (the
 * historical-MF port and the fullCash/combined-summary fix were both
 * verified using Sarla's own rows). No fresh ground-truth .xlsx was
 * diffed at cutover time — Akash's explicit call to treat that diff as a
 * post-hoc confirmation pass rather than a gate. If a fresh report later
 * surfaces a material mismatch, re-add "QUS0007" here.
 */
import { getClientConfig } from "./config";
import { identifyTransitionWashTrades, isFullCashStrategy } from "./tradebook";
import { calcPerStrategySummaries, calcCombinedSummary } from "./strategy-summaries";
import { calcProfitRedeployment } from "./profit-redeployment";
import { getCurrentEquityHoldings, getCurrentMfHoldings } from "./holdings";
import { calcEquityTransactions, calcMfTransactions } from "./tradebook";
import { loadCashTransactions } from "./cash-inputs";
import type { MultiStrategyInvestmentData, StrategyInvestmentData } from "./types";

/** Out of scope per doc 04 — Satidham-old (QUS0010) stays on app/lib/sarla-utils.ts permanently (doc 05 Q14 — its qcode has zero rows in every Postgres table the calculator reads). */
const EXCLUDED_ICODES = new Set(["QUS0010"]);

export class UnsupportedClientError extends Error {
  constructor(icode: string) {
    super(
      `computeInvestmentSummary is not supported for icode ${icode} — this client is handled by app/lib/sarla-utils.ts instead (see docs/investment-summary-migration/04-migration-plan.md).`,
    );
    this.name = "UnsupportedClientError";
  }
}

export class ClientNotFoundError extends Error {
  constructor(icode: string) {
    super(`No Master_Config.csv rows found for icode ${icode}.`);
    this.name = "ClientNotFoundError";
  }
}

function toStrategyView(summary: Awaited<ReturnType<typeof calcCombinedSummary>>): StrategyInvestmentData {
  return {
    amountInvested: summary.amountInvested,
    overviewCashSummary: summary.overviewCashSummary,
    cashInvestmentSummary: summary.cashInvestmentSummary,
    holdingsInvestmentSummary: summary.holdingsInvestmentSummary,
    currentAccountSummary: summary.currentAccountSummary,
    holdingsBifurcation: summary.holdingsBifurcation,
  };
}

/**
 * Computes the full Investment Summary for one client, straight from
 * Postgres. `asOfDate` supports the Phase 3 staging/preview design (doc
 * 04): admins pass today's date (or omit it), clients get the latest
 * published `sync_jobs` report_date — that resolution happens in
 * route.ts, not here; this function just takes whatever cutoff it's given.
 */
export async function computeInvestmentSummary(
  icode: string,
  asOfDate?: Date,
): Promise<MultiStrategyInvestmentData> {
  if (EXCLUDED_ICODES.has(icode)) {
    throw new UnsupportedClientError(icode);
  }

  const allStrategyRows = await getClientConfig(icode);
  if (allStrategyRows.length === 0) {
    throw new ClientNotFoundError(icode);
  }

  const qcode = allStrategyRows[0].qcode;
  const clientName = allStrategyRows[0].clientName;
  const activeStrategies = allStrategyRows.filter((r) => r.status === "Active").map((r) => r.strategy);

  const eqExcludeIds = await identifyTransitionWashTrades(qcode, allStrategyRows);

  const [perStrategyRaw, combined, profitRedeploymentRows, eqHoldings, mfHoldings, cashTxns] = await Promise.all([
    calcPerStrategySummaries(qcode, clientName, allStrategyRows, eqExcludeIds, asOfDate),
    calcCombinedSummary(qcode, clientName, allStrategyRows, eqExcludeIds, asOfDate),
    calcProfitRedeployment(qcode, allStrategyRows, asOfDate),
    getCurrentEquityHoldings(qcode, undefined, asOfDate),
    getCurrentMfHoldings(qcode, undefined, asOfDate),
    loadCashTransactions(),
  ]);

  const perStrategy: Record<string, StrategyInvestmentData> = {};
  for (const [strategy, summary] of Object.entries(perStrategyRaw)) {
    perStrategy[strategy] = {
      amountInvested: summary.amountInvested,
      overviewCashSummary: summary.overviewCashSummary,
      cashInvestmentSummary: summary.cashInvestmentSummary,
      holdingsInvestmentSummary: summary.holdingsInvestmentSummary,
      currentAccountSummary: summary.currentAccountSummary,
      holdingsBifurcation: summary.holdingsBifurcation,
    };
  }

  // Equity/MF transactions — ONE unfiltered call each, matching the real
  // Python source exactly (main.py: `calc_mf_transactions(mf_tradebook, ...)`
  // / `calc_eq_transactions(eq_tradebook, ...)`, called once on the whole
  // tradebook, not per-strategy). Each row keeps its own historical
  // strategy value regardless (doc 02). Previously looped per config row
  // and flattened, which silently dropped rows whose own strategy tag
  // doesn't match ANY config row — confirmed via Sarla's pre-strategy-
  // tagging historical MF rows (blank strategy) never surfacing. Full-cash
  // strategies still produce real transaction rows here (unlike
  // calcHoldingsInvestmentSummary's all-zero short-circuit) — doc 02
  // doesn't describe a full-cash exclusion for the transaction tables
  // themselves, only for the holdings-added/withdrawn totals.
  const [equityTransactionsRaw, mfTransactionsRaw] = await Promise.all([
    calcEquityTransactions(qcode, undefined, eqExcludeIds, asOfDate),
    calcMfTransactions(qcode, clientName, undefined, asOfDate),
  ]);
  const equityTransactions = equityTransactionsRaw.map((t) => ({
    name: t.symbol,
    capitalFlow: t.capitalFlow,
    date: t.date,
    strategy: t.strategy ?? "",
    amount: t.amount,
  }));
  const mfTransactions = mfTransactionsRaw.map((t) => ({
    name: t.symbol,
    capitalFlow: t.capitalFlow,
    date: t.date,
    strategy: t.strategy ?? "",
    amount: t.amount,
  }));

  const cashTransactions = cashTxns
    .filter((row) => row.clientName === clientName)
    .map((row) => ({
      date: row.date,
      transactionType: row.type,
      strategy: row.strategy,
      amount: row.amount,
    }));

  const profitRedeployment = profitRedeploymentRows.map((row) => ({
    strategy: row.strategy,
    profits: row.profits,
    note: row.status === "Inactive" ? "Inactive" : "",
  }));

  const now = new Date();

  return {
    clientName,
    generatedDate: now.toISOString().slice(0, 10),
    dataAsOfDate: (asOfDate ?? now).toISOString().slice(0, 10),

    amountInvested: combined.amountInvested,
    overviewCashSummary: combined.overviewCashSummary,
    currentAccountSummary: combined.currentAccountSummary,
    holdingsBifurcation: combined.holdingsBifurcation,
    cashInvestmentSummary: combined.cashInvestmentSummary,
    holdingsInvestmentSummary: combined.holdingsInvestmentSummary,

    profitRedeployment,

    currentEquityHoldings: eqHoldings.map((h) => ({
      name: h.symbol ?? "",
      type: h.debtEquity ?? "",
      broker: h.broker ?? "",
      exchange: h.exchange ?? "",
      strategy: h.strategy ?? "",
      amount: h.valueAsOfToday ?? 0,
    })),
    currentMfHoldings: mfHoldings.map((h) => ({
      name: h.symbol ?? "",
      type: h.debtEquity ?? "",
      broker: h.broker ?? "",
      strategy: h.strategy ?? "",
      amount: h.valueAsOfToday ?? 0,
    })),
    // Historical/realized holdings confirmed dead & unused (doc 03) — not ported.
    historicalEquityHoldings: [],
    historicalMfHoldings: [],

    equityTransactions,
    cashTransactions,
    mfTransactions,

    strategies: activeStrategies,
    perStrategy,
  };
}

export { isFullCashStrategy };
