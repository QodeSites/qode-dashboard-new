/**
 * Entry point for the Postgres-native Investment Summary calculator (doc 04
 * "index.ts") — the only module `app/api/investment-summary/route.ts`
 * imports. Produces the `MultiStrategyInvestmentData` shape defined in
 * app/lib/parse-investment-pdf.ts (originally the legacy `.xlsx` parser's
 * output shape, kept as the shared type home after that parser was
 * removed 2026-08-12), computed directly from Postgres.
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
 *
 * Satidham-old (QUS0010) was cut over 2026-08-18. Her own qcode (QAC00046,
 * from Master_Config.csv) has zero rows in every Postgres table this
 * calculator reads — all her real live data lives under a DIFFERENT qcode
 * (QAC00066, confirmed against app/lib/sarla-utils.ts's own
 * SCHEME_QCODE_OVERRIDE) and a separate PMS custodian code (QAW00041).
 * SATIDHAM_LIVE_QCODE below redirects every qcode-keyed call for her to
 * QAC00066 — safe for holdings/tradebook/account-summary/amountInvested
 * (all either clientName-keyed, latest-value-only, or individually-dated
 * transaction rows, none of which have a date-range issue), but NOT safe
 * for raw system_tag pnl SUMS: QAC00066's "QYE++ ..." tags run continuously
 * from her first QYE++ stint (2025-11-28) through her second (reactivated
 * 2026-07-24), and summing them unfiltered double-counts the first stint's
 * profit. That affects exactly two things, both overridden below rather
 * than trusting the generic engine's unfiltered sums: overviewCashSummary
 * (replaced outright by satidham-overview-cash.ts, which applies the
 * correct date floor) and the two QYE++ rows of profitRedeploymentRows
 * (patched below using the same date-scoped sumPnlSince).
 *
 * Known remaining gap: calcPerStrategySummaries' own per-strategy
 * overviewCashSummary for her "QYE++"/"QYE++ (Inactive)" perStrategy
 * dropdown entries still uses the generic (unfiltered, double-counting)
 * calculation — only the combined view is corrected. Flagged, not fixed,
 * pending a decision on whether the per-strategy dropdown needs the same
 * treatment.
 */
import { getClientConfig, getBaseTags } from "./config";
import { getLatestMastersheetDate } from "./mastersheet";
import { identifyTransitionWashTrades, isFullCashStrategy } from "./tradebook";
import { calcPerStrategySummaries, calcCombinedSummary } from "./strategy-summaries";
import { calcProfitRedeployment } from "./profit-redeployment";
import { getCurrentEquityHoldings, getCurrentMfHoldings } from "./holdings";
import { calcEquityTransactions, calcMfTransactions } from "./tradebook";
import { loadCashTransactions } from "./cash-inputs";
import { checkMissingSystemTags } from "./tags";
import { calcValidationSummary } from "./validation";
import { applySarlaPmsOverlay } from "./sarla-pms-overlay";
import { applyAshokPmsOverlay } from "./ashok-pms-overlay";
import {
  computeSatidhamOverviewCashSummary,
  computeQyeOldOverviewCashSummaryView,
  SATIDHAM_ICODE,
  SATIDHAM_LIVE_QCODE,
  QYE_REINCEPTION_DATE,
  prevDay,
  sumPnlSince,
} from "./satidham-overview-cash";
import type { MultiStrategyInvestmentData, StrategyInvestmentData } from "./types";

const EXCLUDED_ICODES = new Set<string>([]);

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

  // Satidham-old's Master_Config.csv qcode (QAC00046) has zero live data —
  // redirect every qcode-keyed call below to QAC00066 instead. See this
  // file's header comment for exactly which computations that is/isn't
  // safe for, and where the unsafe ones are patched separately.
  const qcode = icode === SATIDHAM_ICODE ? SATIDHAM_LIVE_QCODE : allStrategyRows[0].qcode;
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

  const [perStrategyRaw, combined, profitRedeploymentRowsRaw, eqHoldings, mfHoldings, cashTxns, missingSystemTags] =
    await Promise.all([
      calcPerStrategySummaries(qcode, clientName, allStrategyRows, eqExcludeIds),
      calcCombinedSummary(qcode, clientName, allStrategyRows, eqExcludeIds),
      calcProfitRedeployment(qcode, allStrategyRows),
      getCurrentEquityHoldings(qcode, undefined),
      getCurrentMfHoldings(qcode, undefined),
      loadCashTransactions(),
      getBaseTags().then((baseTags) => checkMissingSystemTags(qcode, baseTags)),
    ]);

  // calcProfitRedeployment sums each Master_Config.csv row's forProfitTag
  // with no date bound (see this file's header comment) — wrong for
  // Satidham's two "QYE++" rows specifically, since QAC00066's "QYE++ ..."
  // tags run continuously across both her stints under the identical tag
  // name. Patch both rows with date-scoped sums: the OLD (inactive) row
  // gets everything strictly before the reinception floor, the NEW (active)
  // row gets everything on/after it — together covering the same full
  // history the unpatched sum did, just split correctly between the two
  // stints instead of both showing the same double-counted total.
  const profitRedeploymentRows =
    icode === SATIDHAM_ICODE
      ? await Promise.all(
          profitRedeploymentRowsRaw.map(async (row) => {
            if (row.strategy !== "QYE++") return row;
            const floor = prevDay(QYE_REINCEPTION_DATE);
            const profits =
              row.status === "Active"
                ? await sumPnlSince(qcode, "QYE++ Total Portfolio Value", floor)
                : await sumPnlSince(qcode, "QYE++ Total Portfolio Value", new Date("2000-01-01"), floor);
            return { ...row, profits };
          }),
        )
      : profitRedeploymentRowsRaw;

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

  // Satidham-only exception (2026-08-18, explicit request): give QYE++'s
  // OLD/inactive stint its own standalone Overview Cash Summary + Check,
  // even though calcInactiveStrategySummary always sets this to null for
  // every inactive strategy (strategy-summaries.ts:267, by design — matches
  // Python's real behaviour, only active strategies get a per-strategy
  // Check). Every other client's inactive strategies are untouched.
  if (icode === SATIDHAM_ICODE && perStrategy["QYE++ (Inactive)"]) {
    perStrategy["QYE++ (Inactive)"] = {
      ...perStrategy["QYE++ (Inactive)"],
      overviewCashSummary: await computeQyeOldOverviewCashSummaryView(),
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
  // "Data as of" reflects the latest managed-account mastersheet row for
  // this qcode, not "today" — pms_master_sheet is excluded (see
  // getLatestMastersheetDate's comment) since PMS tends to post ~1 day
  // behind and would understate how current the managed-account figures
  // actually are. Falls back to `now` if the qcode somehow has zero rows.
  const latestMastersheetDate = await getLatestMastersheetDate(qcode);
  const dataAsOfDate = (latestMastersheetDate ?? now).toISOString().slice(0, 10);

  // Port of main.py's validation step (calc_validation_summary), run against
  // the COMBINED summary — matches Python's `validation_overview`/
  // `validation_inv`/`validation_acct` always being the combined/single-
  // strategy view, never a per-strategy one (main.py ~333-335, ~377-379).
  // `missingInputFiles` stays permanently empty — that check tracks failed
  // Excel-sheet downloads from the old file-fetching pipeline
  // (server_drive_fetcher.py), a step that doesn't exist in this
  // Postgres-native path at all. `missingSystemTags` is real (checkMissingSystemTags,
  // ported from main.py's _check_missing_tags).
  //
  // overviewCashSummary is computed BEFORE validation (not after, as
  // originally written) specifically so validation's "Cash Reconciliation"
  // check runs against the CORRECTED summary, not combined's raw one —
  // for Sarla/Satidham, combined.overviewCashSummary is the generic engine's
  // unpatched result (missing the PMS/manual-adjustment/date-floor fixes
  // those two overlays apply), so validating against it would report a
  // wildly wrong "Off by ₹X" figure alongside the correct one displayed in
  // the report itself. Confirmed 2026-08-18: for Satidham this was the
  // difference between validation reporting ₹7,88,681 (matches the real
  // Check) vs ₹6,82,31,894.81 (the unpatched generic value, off by exactly
  // the double-counted QYE++ old-stint profit + the internal-transfer
  // inflation this file's other two overlays exist to fix).
  const overviewCashSummary =
    icode === SATIDHAM_ICODE
      ? await computeSatidhamOverviewCashSummary(icode)
      : combined.overviewCashSummary
        ? await applyAshokPmsOverlay(icode, await applySarlaPmsOverlay(icode, combined.overviewCashSummary))
        : combined.overviewCashSummary;
  const validationChecks = calcValidationSummary({ ...combined, overviewCashSummary }, [], missingSystemTags);

  return {
    clientName,
    generatedDate: now.toISOString().slice(0, 10),
    dataAsOfDate,

    amountInvested: combined.amountInvested,
    validationChecks,
    overviewCashSummary,
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
