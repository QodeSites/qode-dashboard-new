/**
 * Satidham-old (QUS0010) Overview Cash Summary — built independently of the
 * generic Postgres-native calculator, which excludes QUS0010 entirely (see
 * index.ts's EXCLUDED_ICODES) because her own qcode (QAC00046) has zero rows
 * in every table the generic calculator reads.
 *
 * All of Satidham's real live data actually lives under a DIFFERENT qcode
 * (QAC00066) and a separate PMS custodian code (QAW00041) — confirmed
 * 2026-08-18 against app/lib/sarla-utils.ts's own SCHEME_QCODE_OVERRIDE and
 * resolvePmsAccountCode(), which the existing Satidham dashboard already
 * relies on. QAC00046 itself is never queried here; it is not a live data
 * source, only Satidham's identity/routing qcode elsewhere in the codebase.
 *
 * Unlike Sarla, Satidham currently has TWO simultaneously active strategies
 * (per Master_Config.csv): QAW++ (a full-cash strategy — deposits cash only,
 * no adjustment items, Current Zerodha Cash = raw Zerodha Total Portfolio)
 * and QYE++ (a normal strategy, reactivated 2026-07-24). This mirrors
 * overview-cash.ts's documented multi-active-strategy shape: each active
 * strategy gets its own per-strategy summary (own totalRealised/
 * totalUnrealised/currentZerodhaCash, own inactiveRealisedRows = empty),
 * and the 4 permanently-inactive Satidham schemes' profit is folded in
 * exactly ONCE at the combined level below — never per-strategy.
 *
 * No manual-reconciliation-adjustments layer exists for Satidham yet
 * (unlike Sarla's 6 hand-verified MANUAL_ADJUSTMENTS in
 * sarla-pms-overlay.ts) — Check is expected to be materially nonzero until
 * the data team supplies one.
 */
import { prisma } from "@/lib/prisma";
import * as tags from "./tags";
import { getBaseTags } from "./config";
import { calcCashInvestmentSummary, calcEquityPurchaseSold, loadCashTransactions } from "./cash-inputs";
import type { OverviewCashSummaryView } from "./strategy-summaries";

export const SATIDHAM_ICODE = "QUS0010";
export const SATIDHAM_LIVE_QCODE = "QAC00066";
const SATIDHAM_PMS_ACCOUNT_CODE = "QAW00041";
const SATIDHAM_CASH_CLIENT_NAME = "Satidham Industries";

/**
 * QYE++ reactivated 2026-07-24 (its first stint ran 2025-11-28 -> 2026-01-06,
 * tracked separately as the hardcoded "Scheme QYE++ (Old)" inactive scheme
 * below). But QAC00066's "QYE++ ..." tagged rows run continuously all the
 * way back to 2025-11-28 — the table was never scoped to just the second
 * stint. Confirmed 2026-08-18: every one of QYE++'s tags (Total Portfolio
 * Value, Liquidcase, Miscellaneous P&L, Equity Other Debits and Credits,
 * Equity Holdings Tax) has real pre-2026-07-24 rows, and summing them
 * unfiltered double-counts the old stint's profit (₹7,87,288.79 — exactly
 * SATIDHAM_HARDCODED_DATA's "Scheme QYE++ (Old)" figure) on top of the
 * hardcoded inactive-scheme total below. Same startDate app/lib/sarla-utils.ts's
 * SCHEME_BIFURCATED_SOURCE["Scheme QYE++"] already guards against for
 * exactly this reason — missed here when this module was first written.
 * QAW++ has no such phantom period (its earliest row is its real inception,
 * 2026-01-07), so this guard is QYE++-only.
 */
export const QYE_REINCEPTION_DATE = new Date("2026-07-24");
export function prevDay(d: Date): Date {
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}

/** First row of QYE++'s old stint in bifurcated_master_sheet_test, confirmed live 2026-08-18 (27 rows, 2025-11-28 -> 2026-01-06). */
export const QYE_OLD_STINT_START = new Date("2025-11-28");

/** Direct date-scoped pnl sum, bypassing tags.ts's resolve() (which has no date-range support) — used for QYE++'s live tags, which need the reinception-date floor above. Also reused by index.ts's calcProfitRedeployment override for the same reason (see there). Tag names are constructed directly (strategy-prefixed, no alias fallback), matching the allowUnprefixedFallback:false lookups elsewhere in this file. `until`, when given, adds an exclusive upper bound — used to compute the OLD QYE++ stint's profit (everything before the reinception floor) for the profit-redeployment override. */
export async function sumPnlSince(qcode: string, systemTag: string, since: Date, until?: Date): Promise<number> {
  const result = await prisma.bifurcated_master_sheet_test.aggregate({
    where: { qcode, system_tag: systemTag, date: { gte: since, ...(until ? { lt: until } : {}) } },
    _sum: { pnl: true },
  });
  return result._sum.pnl?.toNumber() ?? 0;
}

/**
 * Scheme A / B / A (Old) — Satidham's 3 permanently-inactive PRE-QAW++/QYE++
 * schemes — are DELIBERATELY EXCLUDED from the combined Total Realised
 * below, per explicit instruction (2026-08-26) after diffing against the
 * team's own ground-truth "Invst Summary Current" sheet
 * (Satidham Invst Summary 25.08.26 1.xlsx): that sheet's live "Current"
 * reconciliation never references these 3 schemes anywhere (not in Total
 * Realised, not in Profit Redeployment, not in any cross-check) — only
 * Scheme QYE++ (Old) is tracked as inactive there. Including them
 * previously added a net -₹25,775.13 to Total Realised that the ground
 * truth doesn't carry, accounting for most of a ₹26,431.28 Check gap found
 * the same day. Their figures (Scheme A: -1234832.40, Scheme B: 1645377.07,
 * Scheme A (Old): -436319.80 — matching app/lib/sarla-utils.ts's
 * SATIDHAM_HARDCODED_DATA) are no longer referenced anywhere in this file.
 */

/**
 * QYE++'s own separate "book" for its OLD stint (2025-11-28 -> 2026-01-06,
 * i.e. everything strictly before QYE_REINCEPTION_DATE) — computed live from
 * bifurcated_master_sheet_test instead of the flat hardcoded totalProfit
 * figure this used to be.
 *
 * Confirmed against the real cash trail 2026-08-18: when the old stint
 * closed, its ENTIRE closing balance was cash-transferred into QAW++ on
 * 2026-01-07 (cash_transactions.csv: "Internal Transfer (QYE++ to QAW++)",
 * -/+ ₹5,10,41,445.53, correctly excluded from Cash Investment via
 * excludeInternal:true since it's not new client money). Net capital that
 * had gone into QYE++ Old = Capital Added 79,998,180.50 - Capital Withdrawn
 * 30,000,000 = ₹4,99,98,180.50. The gap between that and the actual
 * transferred-out balance (₹1,043,265.03) IS the old stint's true total
 * profit — and that requires BOTH the "Total Portfolio Value" tag's pnl sum
 * (₹7,87,288.79) AND the 5 adjustment-item tags' sum (₹2,55,320.07:
 * Liquidcase 2,74,170.92 + Misc -91 + Eq.Other -8,539.12 + Eq.Tax -10,220.73),
 * matching to within ₹656 (rounding). An earlier version of this function
 * only summed the Total Portfolio Value tag, UNDER-counting the old stint's
 * real profit by the adjustment-items portion — found 2026-08-18 when the
 * combined Check didn't move the way subtracting just the portfolio-value
 * figure predicted. Now mirrors QYE++ New's exact realised+unrealised split
 * (see computeStrategySummary above), then sums both into one lump for
 * Total Realised — a closed scheme has no more open position to carry an
 * unrealised balance, so its whole profit (realised + what would've stayed
 * unrealised) is realised once it's cashed out. Same convention every other
 * inactive/closed scheme uses (Scheme A/B/A(Old) above, Sarla's own inactive
 * schemes in sarla-pms-overlay.ts).
 *
 * `closingZerodhaCash` is the old stint's cash position on its ACTUAL last
 * day — resolved dynamically as the latest date with real
 * "QYE++ Total Portfolio Value" pnl activity strictly before
 * QYE_REINCEPTION_DATE, NOT a naive "latest row before the reinception
 * date" lookup. Found 2026-08-18: a naive `date < QYE_REINCEPTION_DATE`
 * lookup on the ztp tag picks up a STRAY row dated 2026-07-23 (ztp =
 * 47,203,172.70) — that's actually the funding event for QYE++ NEW (it
 * matches exactly the "+47203172.7 Internal Transfer (QAW++ to QYE++)"
 * cash_transactions.csv row, timestamped one day before the reinception
 * cutoff), not the old stint's real close. The real close (2026-01-06)
 * shows ztp = 0 — the account was fully drained that day, consistent with
 * the 07-01-2026 "Internal Transfer (QYE++ to QAW++)" moving the entire
 * balance out. NOT folded into the combined Current Zerodha Cash — that
 * same cash became QAW++'s opening balance and is already embedded in
 * QAW++'s own currentZerodhaCash; adding it again here would double-count.
 */
export interface QyeOldBook {
  dateRange: { since: string; until: string };
  portfolioValuePnl: number;
  adjustmentItems: number;
  totalRealised: number;
  closingZerodhaCash: number;
}

export async function computeQyeOldBook(): Promise<QyeOldBook> {
  const baseTags = await getBaseTags();
  const strategyPrefix = "QYE++";
  const since = QYE_OLD_STINT_START;
  // until = prevDay(QYE_REINCEPTION_DATE), i.e. stop BEFORE 2026-07-23 —
  // not QYE_REINCEPTION_DATE (2026-07-24) itself. Found 2026-08-26: Jul 23
  // is the reinception day (the "Internal Transfer (QAW++ to QYE++)" cash
  // row and QYE++'s ztp jump both land on Jul 23), but the NEW stint's own
  // computeStrategySummary call uses `dateFloor = prevDay(QYE_REINCEPTION_DATE)
  // = Jul 23` (inclusive) for its pnl sums — so a `until = QYE_REINCEPTION_DATE`
  // here (which is exclusive, i.e. < Jul 24, i.e. INCLUDES Jul 23) double-
  // counted any tag with real activity that day. Liquidcase Stock Holdings
  // has exactly one such row (pnl -237.77 on 2026-07-23), causing the old+new
  // combined Liquidcase sum to undercount the true lifetime total by that
  // amount (double-counting a negative number lowers the sum). Aligning this
  // window's end with the new window's start removes the overlap entirely.
  const until = prevDay(QYE_REINCEPTION_DATE);

  const [portfolioValuePnl, liquidcase, liquidbees, miscPnl, eqOther, eqTax] = await Promise.all([
    sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.totalPortfolioValue}`, since, until),
    sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.liquidcaseStockHoldings}`, since, until),
    sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.liquidbees}`, since, until),
    sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.miscellaneousPnl}`, since, until),
    sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.equityOtherDebitsCredits}`, since, until),
    sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.equityHoldingsTax}`, since, until),
  ]);
  const adjustmentItems = liquidcase + liquidbees + miscPnl + eqOther + eqTax;
  const totalRealised = portfolioValuePnl + adjustmentItems;

  const lastActivityRow = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode: SATIDHAM_LIVE_QCODE, system_tag: `${strategyPrefix} ${baseTags.totalPortfolioValue}`, date: { gte: since, lt: until } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const closeDate = lastActivityRow?.date ?? since;

  const closeAsOf = async (baseTag: string) => {
    const row = await prisma.bifurcated_master_sheet_test.findFirst({
      where: { qcode: SATIDHAM_LIVE_QCODE, system_tag: `${strategyPrefix} ${baseTag}`, date: { lte: closeDate } },
      orderBy: { date: "desc" },
      select: { portfolio_value: true },
    });
    return row ? Number(row.portfolio_value) || 0 : 0;
  };
  const [ztp, esh, mf, bond] = await Promise.all([
    closeAsOf(baseTags.zerodhaTotalPortfolio),
    closeAsOf(baseTags.equityStockHoldings),
    closeAsOf(baseTags.mutualFunds),
    closeAsOf(baseTags.bondStockHoldings),
  ]);
  const closingZerodhaCash = ztp - esh - mf - bond;

  return {
    dateRange: { since: since.toISOString().slice(0, 10), until: closeDate.toISOString().slice(0, 10) },
    portfolioValuePnl,
    adjustmentItems,
    totalRealised,
    closingZerodhaCash,
  };
}

interface StrategySummary {
  totalRealised: number;
  totalUnrealised: number;
  currentZerodhaCash: number;
}

/** Per-strategy summary for one of Satidham's active strategies, scoped to QAC00066 via a strategy-prefixed, fallback-disabled tag lookup (same pattern as overview-cash.ts's multi-active branch). `dateFloor` applies the QYE++ reinception guard above (undefined for QAW++, which needs none). */
async function computeStrategySummary(
  strategyPrefix: string,
  isFullCash: boolean,
  dateFloor?: Date,
): Promise<StrategySummary> {
  const baseTags = await getBaseTags();
  const opts = { strategyPrefix: `${strategyPrefix} `, allowUnprefixedFallback: false };
  const forProfitTag = `${strategyPrefix} ${isFullCash ? baseTags.zerodhaTotalPortfolio : baseTags.totalPortfolioValue}`;

  const totalUnrealised = dateFloor
    ? await sumPnlSince(SATIDHAM_LIVE_QCODE, forProfitTag, dateFloor)
    : await tags.sumPnl(SATIDHAM_LIVE_QCODE, isFullCash ? baseTags.zerodhaTotalPortfolio : baseTags.totalPortfolioValue, opts);

  // Full-cash strategies (QAW++) don't accumulate their own realised items —
  // clients deposit cash only, Qode buys holdings from it (calculations.py's
  // FULL_CASH_STRATEGIES rule, ported in tradebook.ts's isFullCashStrategy).
  let totalRealised = 0;
  if (!isFullCash) {
    if (dateFloor) {
      const [liquidcase, liquidbees, miscPnl, eqOther, eqTax] = await Promise.all([
        sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.liquidcaseStockHoldings}`, dateFloor),
        sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.liquidbees}`, dateFloor),
        sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.miscellaneousPnl}`, dateFloor),
        sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.equityOtherDebitsCredits}`, dateFloor),
        sumPnlSince(SATIDHAM_LIVE_QCODE, `${strategyPrefix} ${baseTags.equityHoldingsTax}`, dateFloor),
      ]);
      totalRealised = liquidcase + liquidbees + miscPnl + eqOther + eqTax;
    } else {
      const [liquidcase, liquidbees, miscPnl, eqOther, eqTax] = await Promise.all([
        tags.sumPnl(SATIDHAM_LIVE_QCODE, baseTags.liquidcaseStockHoldings, opts),
        tags.sumPnl(SATIDHAM_LIVE_QCODE, baseTags.liquidbees, opts),
        tags.sumPnl(SATIDHAM_LIVE_QCODE, baseTags.miscellaneousPnl, opts),
        tags.sumPnl(SATIDHAM_LIVE_QCODE, baseTags.equityOtherDebitsCredits, opts),
        tags.sumPnl(SATIDHAM_LIVE_QCODE, baseTags.equityHoldingsTax, opts),
      ]);
      totalRealised = liquidcase + liquidbees + miscPnl + eqOther + eqTax;
    }
  }

  const ztp = await tags.getLatestPortfolioValue(SATIDHAM_LIVE_QCODE, baseTags.zerodhaTotalPortfolio, opts);
  let currentZerodhaCash: number;
  if (isFullCash) {
    currentZerodhaCash = ztp;
  } else {
    const [esh, mf, bond, liq, lb] = await Promise.all([
      tags.getLatestPortfolioValue(SATIDHAM_LIVE_QCODE, baseTags.equityStockHoldings, opts),
      tags.getLatestPortfolioValue(SATIDHAM_LIVE_QCODE, baseTags.mutualFunds, opts),
      tags.getLatestPortfolioValue(SATIDHAM_LIVE_QCODE, baseTags.bondStockHoldings, opts),
      tags.getLatestPortfolioValue(SATIDHAM_LIVE_QCODE, baseTags.liquidcaseStockHoldings, opts),
      tags.getLatestPortfolioValue(SATIDHAM_LIVE_QCODE, baseTags.liquidbees, opts),
    ]);
    currentZerodhaCash = ztp - esh - mf - bond - liq - lb + liq + lb;
  }

  return { totalRealised, totalUnrealised, currentZerodhaCash };
}

async function getSatidhamPmsSummary(): Promise<{ currentExposure: number; totalProfit: number }> {
  const rows = await prisma.pms_master_sheet.findMany({
    where: { account_code: SATIDHAM_PMS_ACCOUNT_CODE },
    orderBy: { report_date: "asc" },
    select: { portfolio_value: true, pnl: true },
  });
  const latest = rows.at(-1);
  return {
    currentExposure: latest ? Number(latest.portfolio_value) || 0 : 0,
    totalProfit: rows.reduce((sum, r) => sum + (Number(r.pnl) || 0), 0),
  };
}

/** Returns null for any icode other than QUS0010 — Satidham-old only. */
export async function computeSatidhamOverviewCashSummary(icode: string): Promise<OverviewCashSummaryView | null> {
  if (icode !== SATIDHAM_ICODE) return null;

  const [qawpp, qyepp, qyeOld, pms, cashInvestment, eqPurchaseSold] = await Promise.all([
    computeStrategySummary("QAW++", true),
    computeStrategySummary("QYE++", false, prevDay(QYE_REINCEPTION_DATE)),
    computeQyeOldBook(),
    getSatidhamPmsSummary(),
    // excludeInternal: true — REVERTED 2026-08-26 after diffing against the
    // team's own ground-truth "Invst Summary Current" sheet
    // (Satidham Invst Summary 25.08.26 1.xlsx), dated today. That sheet's
    // own Cash Investment (₹16,72,59,637.65) is computed excluding internal
    // transfers and reconciles to a Check of just -₹91.02 — matching
    // excludeInternal:true exactly, not the excludeInternal:false variant
    // tried 2026-08-18. That earlier change was tested against a since-
    // replaced cash_transactions.csv state and looked better only by
    // coincidence there; against the real, current data it inflates Cash
    // Investment by the mismatched 2026-07-23 transfer pair's +₹3.30 Cr
    // non-cash reallocation and makes Check dramatically worse. Matches
    // strategy-summaries.ts's calcCombinedSummary() convention (used for
    // every other multi-strategy client) again.
    calcCashInvestmentSummary(SATIDHAM_CASH_CLIENT_NAME, undefined, true),
    calcEquityPurchaseSold(SATIDHAM_CASH_CLIENT_NAME),
  ]);

  const totalRealised = qawpp.totalRealised + qyepp.totalRealised + eqPurchaseSold + qyeOld.totalRealised;
  const totalUnrealised = qawpp.totalUnrealised + qyepp.totalUnrealised + pms.totalProfit;
  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInvestment.netCashBalance;
  const currentZerodhaCash = qawpp.currentZerodhaCash + qyepp.currentZerodhaCash + pms.currentExposure;
  const check = currentZerodhaCash - totalCashGenerated;

  return {
    rows: [
      { label: "Total Realised", amount: totalRealised },
      { label: "Total Unrealised", amount: totalUnrealised },
      { label: "Total Profits", amount: totalProfits },
      { label: "Cash Investment", amount: cashInvestment.netCashBalance },
      { label: "Total Cash Generated", amount: totalCashGenerated },
      { label: "Current Zerodha Cash", amount: currentZerodhaCash },
      { label: "Check", amount: check },
    ],
    adjustments: [
      // Scheme A/B/A(Old) deliberately not listed here — excluded from
      // Total Realised 2026-08-26 to match the ground-truth "Invst Summary
      // Current" sheet, which never references them either.
      {
        label: `Scheme QYE++ (Old, Inactive, ${qyeOld.dateRange.since} → ${qyeOld.dateRange.until}) — Realised (live, portfolio value pnl ${qyeOld.portfolioValuePnl.toFixed(2)} + adjustment items ${qyeOld.adjustmentItems.toFixed(2)})`,
        amount: qyeOld.totalRealised,
      },
      {
        label: `Scheme QYE++ (Old, Inactive) — Closing Zerodha Cash as of ${qyeOld.dateRange.until} (informational, not in Current Zerodha Cash)`,
        amount: qyeOld.closingZerodhaCash,
      },
      { label: "Scheme QYE++ (New, Active) — Realised", amount: qyepp.totalRealised },
      { label: "Scheme QYE++ (New, Active) — Unrealised", amount: qyepp.totalUnrealised },
      { label: "Scheme QAW++ — Unrealised", amount: qawpp.totalUnrealised },
      { label: "Equity Purchase & Sold", amount: eqPurchaseSold },
      { label: "Scheme PMS QAW Profit (Unrealised)", amount: pms.totalProfit },
    ],
  };
}

/**
 * Standalone Overview Cash Summary + Check for QYE++'s OLD stint alone —
 * added per explicit request (2026-08-18), since the generic engine never
 * gives inactive strategies their own reconciliation sheet at all
 * (calcInactiveStrategySummary hardcodes overviewCashSummary: null,
 * strategy-summaries.ts:267 — by design, matching Python's real behaviour:
 * only ACTIVE strategies get a per-strategy Check). This is a deliberate,
 * Satidham-only exception, wired in by index.ts overriding
 * perStrategy["QYE++ (Inactive)"].overviewCashSummary with this function's
 * result — every other client's inactive strategies stay null, unaffected.
 *
 * Total Unrealised is always 0 here — the scheme is closed, so its entire
 * profit (computeQyeOldBook's totalRealised, portfolio-value pnl +
 * adjustment items) is treated as fully realised, same convention as the
 * combined view's "Inactive Realised" folding above.
 *
 * Cash Investment is scoped to ONLY this book's own cash flow: every
 * cash_transactions.csv row tagged Strategy="QYE++" dated before
 * QYE_REINCEPTION_DATE — which is exactly 3 rows (Capital Added
 * 28-11-2025, Capital Withdrawn 12-12-2025, and the closing "Internal
 * Transfer (QYE++ to QAW++)" 07-01-2026). Unlike the combined view (which
 * excludes internal transfers as not-real-new-money), THIS book's closing
 * transfer-out IS its own real cash exit event and must be included, or
 * Current Zerodha Cash (0, the account was fully drained) would never
 * reconcile against anything.
 */
export async function computeQyeOldOverviewCashSummaryView(): Promise<OverviewCashSummaryView> {
  const qyeOld = await computeQyeOldBook();

  // A single date boundary can't cleanly separate old vs new here: the old
  // stint's CLOSING transfer-out ("Internal Transfer (QYE++ to QAW++)") is
  // dated 2026-01-07, AFTER the old stint's last activity day (2026-01-06),
  // while the new stint's OPENING transfer-in ("Internal Transfer (QAW++ to
  // QYE++)") is dated 2026-07-23, BEFORE the reinception cutoff (2026-07-24)
  // — found live 2026-08-18 when a naive `< QYE_REINCEPTION_DATE` filter
  // wrongly pulled the new-stint funding row into this book too (+₹4,72,03,172.70
  // inflation). Excluding by transaction TYPE instead is unambiguous: the
  // new stint's funding-in type never belongs to the old book, regardless
  // of its date.
  const NEW_STINT_FUNDING_TYPE = "Internal Transfer (QAW++ to QYE++)";
  const allRows = await loadCashTransactions();
  const oldStintCashRows = allRows.filter(
    (r) =>
      r.clientName === SATIDHAM_CASH_CLIENT_NAME &&
      r.strategy === "QYE++" &&
      r.type !== NEW_STINT_FUNDING_TYPE &&
      new Date(r.date) < QYE_REINCEPTION_DATE,
  );
  const cashInvestment = oldStintCashRows.reduce((sum, r) => sum + r.amount, 0);

  const totalRealised = qyeOld.totalRealised;
  const totalUnrealised = 0;
  const totalProfits = totalRealised + totalUnrealised;
  const totalCashGenerated = totalProfits + cashInvestment;
  const currentZerodhaCash = qyeOld.closingZerodhaCash;
  const check = currentZerodhaCash - totalCashGenerated;

  return {
    rows: [
      { label: "Total Realised", amount: totalRealised },
      { label: "Total Unrealised", amount: totalUnrealised },
      { label: "Total Profits", amount: totalProfits },
      { label: "Cash Investment", amount: cashInvestment },
      { label: "Total Cash Generated", amount: totalCashGenerated },
      { label: "Current Zerodha Cash", amount: currentZerodhaCash },
      { label: "Check", amount: check },
    ],
    adjustments: [
      { label: `Portfolio Value pnl (${qyeOld.dateRange.since} → ${qyeOld.dateRange.until})`, amount: qyeOld.portfolioValuePnl },
      { label: "Adjustment items (Liquidcase/Liquidbees/Misc/Eq.Other/Eq.Tax)", amount: qyeOld.adjustmentItems },
    ],
  };
}
