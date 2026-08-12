/**
 * Entry point for the Postgres-native Investment Summary calculator (doc 04
 * "index.ts") — the only module `app/api/investment-summary/route.ts` needs
 * to import once Phase 3 cuts over. Produces the exact same
 * `MultiStrategyInvestmentData` shape today's `parseInvestmentXlsx()`
 * returns from an `.xlsx` buffer, but computed directly from Postgres.
 *
 * Sarla and Satidham (icodes QUS0007, QUS0010) are explicitly OUT OF SCOPE
 * — they stay on the existing app/lib/sarla-utils.ts path (doc 04, Akash's
 * 2026-08-11 decision). computeInvestmentSummary throws for these icodes
 * rather than silently producing wrong numbers.
 */
import { getClientConfig } from "./config";
import { identifyTransitionWashTrades, isFullCashStrategy } from "./tradebook";
import { calcPerStrategySummaries, calcCombinedSummary } from "./strategy-summaries";
import { calcProfitRedeployment } from "./profit-redeployment";
import { getCurrentEquityHoldings, getCurrentMfHoldings } from "./holdings";
import { calcEquityTransactions, calcMfTransactions } from "./tradebook";
import { loadCashTransactions } from "./cash-inputs";
import type { MultiStrategyInvestmentData, StrategyInvestmentData } from "./types";

/** Out of scope per doc 04 — these stay on app/lib/sarla-utils.ts. */
const EXCLUDED_ICODES = new Set(["QUS0007", "QUS0010"]);

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

  // Equity/MF transactions, one call per strategy the client has held
  // (each row keeps its own historical strategy value — doc 02), then
  // flattened. Full-cash strategies still produce real transaction rows
  // here (unlike calcHoldingsInvestmentSummary's all-zero short-circuit) —
  // doc 02 doesn't describe a full-cash exclusion for the transaction
  // tables themselves, only for the holdings-added/withdrawn totals.
  const equityTransactionsNested = await Promise.all(
    allStrategyRows.map((row) => calcEquityTransactions(qcode, row.strategy, eqExcludeIds, asOfDate)),
  );
  const mfTransactionsNested = await Promise.all(
    allStrategyRows.map((row) => calcMfTransactions(qcode, row.strategy, asOfDate)),
  );
  const equityTransactions = equityTransactionsNested.flat().map((t) => ({
    name: t.symbol,
    capitalFlow: t.capitalFlow,
    date: t.date,
    strategy: t.strategy ?? "",
    amount: t.amount,
  }));
  const mfTransactions = mfTransactionsNested.flat().map((t) => ({
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
