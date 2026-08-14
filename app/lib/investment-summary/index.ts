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
import { getClientConfig, getBaseTags } from "./config";
import { identifyTransitionWashTrades, isFullCashStrategy } from "./tradebook";
import { calcPerStrategySummaries, calcCombinedSummary } from "./strategy-summaries";
import { calcProfitRedeployment } from "./profit-redeployment";
import { getCurrentEquityHoldings, getCurrentMfHoldings } from "./holdings";
import { calcEquityTransactions, calcMfTransactions } from "./tradebook";
import { loadCashTransactions } from "./cash-inputs";
import { checkMissingSystemTags } from "./tags";
import { calcValidationSummary } from "./validation";
import type { MultiStrategyInvestmentData, StrategyInvestmentData } from "./types";

/** Out of scope per doc 04 — Satidham-old (QUS0010) stays on app/lib/sarla-utils.ts permanently (doc 05 Q14 — its qcode has zero rows in every Postgres table the calculator reads). */
const EXCLUDED_ICODES = new Set(["QUS0010"]);

export class UnsupportedClientError extends Error {
  constructor(icode: string) {
    super(
      `computeInvestmentSummary is not supported for icode ${icode} — this client is handled by app/lib/sarla-utils.ts instead (see docs/investment-summary-migration/ARCHITECTURE.md).`,
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

/** Computes the full Investment Summary for one client, straight from Postgres. */
export async function computeInvestmentSummary(icode: string): Promise<MultiStrategyInvestmentData> {
  if (EXCLUDED_ICODES.has(icode)) {
    throw new UnsupportedClientError(icode);
  }

  const allStrategyRows = await getClientConfig(icode);
  if (allStrategyRows.length === 0) {
    throw new ClientNotFoundError(icode);
  }

  const qcode = allStrategyRows[0].qcode;
  const clientName = allStrategyRows[0].clientName;

  // Doc 05: real Python's report_builder.py names inactive-strategy sheets
  // `f"Cash Inv {short} (Inactive)"` etc, and app/investment-summary/page.tsx
  // (isInactiveStrategy / displayStrategyName) expects that exact " (Inactive)"
  // suffix on entries in `strategies` — it's how the frontend both renders
  // the "(Inactive)" badge on the Scheme dropdown AND decides which strategy
  // is selected, so `perStrategy` must be keyed with the same suffixed
  // string for inactive rows or `data.perStrategy[selectedStrategy]` misses.
  // Previously `strategies` only listed Active rows, so inactive strategies
  // (e.g. Dinesh Goel's QTF+) never appeared as a selectable scheme at all,
  // even though calcPerStrategySummaries() already computed real data for
  // them.
  const strategies = allStrategyRows.map((r) =>
    r.status === "Active" ? r.strategy : `${r.strategy} (Inactive)`,
  );

  // Port of main.py/report_builder.py's `_default_strategy`: real Python
  // relabels blank-strategy holdings/transaction rows to the client's one
  // strategy name, but ONLY when the client has ever had exactly one
  // strategy (one currently-active strategy, no other stint, active or
  // inactive, in its history) — `not multi_strategy and
  // len(strategy_names) == 1` where multi_strategy = 2+ active strategies.
  // Ambiguous cases (e.g. Ashok Jogani HUF: QAW+ inactive -> QAW++ active,
  // 1 active but 2 distinct names ever) get no fallback — Python doesn't
  // guess which historical strategy a blank row belongs to. Without this,
  // single-strategy clients' blank-strategy rows (e.g. Sarla's 3
  // historical MF transactions predating strategy tagging) stay blank and
  // get silently dropped by the frontend's `QYE_STRATEGIES`-based filter,
  // which only matches exact strategy names.
  const activeStrategyNames = allStrategyRows.filter((r) => r.status === "Active").map((r) => r.strategy);
  const distinctStrategyNamesEver = new Set(allStrategyRows.map((r) => r.strategy));
  const defaultStrategy =
    activeStrategyNames.length === 1 && distinctStrategyNamesEver.size === 1
      ? activeStrategyNames[0]
      : "";

  const eqExcludeIds = await identifyTransitionWashTrades(qcode, allStrategyRows);

  const [perStrategyRaw, combined, profitRedeploymentRows, eqHoldings, mfHoldings, cashTxns, missingSystemTags] =
    await Promise.all([
      calcPerStrategySummaries(qcode, clientName, allStrategyRows, eqExcludeIds),
      calcCombinedSummary(qcode, clientName, allStrategyRows, eqExcludeIds),
      calcProfitRedeployment(qcode, allStrategyRows),
      getCurrentEquityHoldings(qcode, undefined),
      getCurrentMfHoldings(qcode, undefined),
      loadCashTransactions(),
      getBaseTags().then((baseTags) => checkMissingSystemTags(qcode, baseTags)),
    ]);

  const perStrategy: Record<string, StrategyInvestmentData> = {};
  for (const row of allStrategyRows) {
    const summary = perStrategyRaw[row.strategy];
    if (!summary) continue;
    const key = row.status === "Active" ? row.strategy : `${row.strategy} (Inactive)`;
    perStrategy[key] = {
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
    calcEquityTransactions(qcode, undefined, eqExcludeIds),
    calcMfTransactions(qcode, clientName, undefined),
  ]);
  const equityTransactions = equityTransactionsRaw.map((t) => ({
    name: t.symbol,
    capitalFlow: t.capitalFlow,
    date: t.date,
    strategy: t.strategy?.trim() || defaultStrategy,
    amount: t.amount,
  }));
  const mfTransactions = mfTransactionsRaw.map((t) => ({
    name: t.symbol,
    capitalFlow: t.capitalFlow,
    date: t.date,
    strategy: t.strategy?.trim() || defaultStrategy,
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

  // Port of report_builder.py's write_profit_redeployment: active rows
  // first (each labeled "Scheme {strategy}", fixed note text), then — only
  // if any inactive rows exist — an "Inactive Strategies" header row
  // (isHeader: true, matched by app/investment-summary/page.tsx's
  // withSectionTotals()/section-splitting logic), then the inactive rows
  // (same labeling), then a "Total Profits" row (isTotal: true). Previously
  // this just mapped profitRedeploymentRows 1:1 in Master_Config.csv's
  // row order (active/inactive interleaved, no "Scheme " prefix, no header
  // row, no total row) — silently broke the frontend's Active/Inactive
  // section split and per-strategy total computation for any client with
  // an inactive strategy (e.g. Dinesh Goel's QTF+).
  const activeProfitRows = profitRedeploymentRows.filter((r) => r.status === "Active");
  const inactiveProfitRows = profitRedeploymentRows.filter((r) => r.status !== "Active");
  const toRow = (row: (typeof profitRedeploymentRows)[number]) => ({
    strategy: `Scheme ${row.strategy}`,
    profits: row.profits,
    note: "Profits have been redeployed within the portfolio.",
  });
  const totalProfits = profitRedeploymentRows.reduce((sum, r) => sum + r.profits, 0);
  const profitRedeployment = [
    ...activeProfitRows.map(toRow),
    ...(inactiveProfitRows.length > 0
      ? [
          { strategy: "Inactive Strategies", profits: 0, note: "", isHeader: true },
          ...inactiveProfitRows.map(toRow),
        ]
      : []),
    { strategy: "Total Profits", profits: totalProfits, note: "", isTotal: true },
  ];

  const now = new Date();

  // Port of main.py's validation step (calc_validation_summary), run against
  // the COMBINED summary — matches Python's `validation_overview`/
  // `validation_inv`/`validation_acct` always being the combined/single-
  // strategy view, never a per-strategy one (main.py ~333-335, ~377-379).
  // `missingInputFiles` stays permanently empty — that check tracks failed
  // Excel-sheet downloads from the old file-fetching pipeline
  // (server_drive_fetcher.py), a step that doesn't exist in this
  // Postgres-native path at all. `missingSystemTags` is real (checkMissingSystemTags,
  // ported from main.py's _check_missing_tags).
  const validationChecks = calcValidationSummary(combined, [], missingSystemTags);

  return {
    clientName,
    generatedDate: now.toISOString().slice(0, 10),
    dataAsOfDate: now.toISOString().slice(0, 10),

    amountInvested: combined.amountInvested,
    validationChecks,
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
      strategy: h.strategy?.trim() || defaultStrategy,
      amount: h.valueAsOfToday ?? 0,
    })),
    currentMfHoldings: mfHoldings.map((h) => ({
      name: h.symbol ?? "",
      type: h.debtEquity ?? "",
      broker: h.broker ?? "",
      strategy: h.strategy?.trim() || defaultStrategy,
      amount: h.valueAsOfToday ?? 0,
    })),
    // Historical/realized holdings confirmed dead & unused (doc 03) — not ported.
    historicalEquityHoldings: [],
    historicalMfHoldings: [],

    equityTransactions,
    cashTransactions,
    mfTransactions,

    strategies,
    perStrategy,
  };
}

export { isFullCashStrategy };
