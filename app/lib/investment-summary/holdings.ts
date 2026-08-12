/**
 * DB access layer for bifurcated_equity_holding_test and
 * bifurcated_mutual_fund_holding_sheet_test — ports of Python's
 * calc_eq_holdings/calc_mf_holdings (doc 02, doc 04 "holdings.ts"),
 * read-only only (findMany — no writes, see CLAUDE.md DB safety rules).
 *
 * Both tables store one row per symbol per snapshot date. "Current holdings"
 * means the rows at the latest snapshot date for that qcode (max `date`/
 * `as_of_date` <= asOfDate if given, else the overall max) — same two-query
 * pattern as mastersheet.ts's getLatest, extended to return multiple rows.
 *
 * Every read accepts an optional `asOfDate` cutoff so the Phase 3
 * staging/preview design (doc 04) — admins see live/today, clients see the
 * latest published date — can reuse these functions unchanged; omit it to
 * read the latest data as of now.
 *
 * Historical/realized holdings (calc_eq_realized_holdings/
 * calc_mf_realized_holdings) are NOT ported here — confirmed dead/unused
 * per doc 03, out of scope.
 */
import { prisma } from "@/lib/prisma";
import type { HoldingRow } from "./types";

/** Sub-categories excluded from equity holdings (Python's `Sub Category in {liquidcase, liquidbees}`, case-insensitive per real data). */
const EQUITY_EXCLUDED_SUB_CATEGORIES = new Set(["liquidcase", "liquidbees"]);

function toNumberFromDecimal(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

function toNumberFromBigInt(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

function dateFilter(asOfDate?: Date) {
  return asOfDate ? { lte: asOfDate } : undefined;
}

/**
 * Current equity holdings for a qcode — Python's calc_eq_holdings.
 * Excludes rows whose `sub_category` is liquidcase/liquidbees
 * (case-insensitive), optionally filters to a single `strategy`, sorted by
 * symbol ascending.
 */
export async function getCurrentEquityHoldings(
  qcode: string,
  strategy?: string,
  asOfDate?: Date,
): Promise<HoldingRow[]> {
  const latest = await prisma.bifurcated_equity_holding_test.findFirst({
    where: {
      qcode,
      ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
    },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return [];

  const rows = await prisma.bifurcated_equity_holding_test.findMany({
    where: {
      qcode,
      date: latest.date,
      ...(strategy ? { strategy } : {}),
    },
    orderBy: { symbol: "asc" },
    select: {
      symbol: true,
      quantity: true,
      avg_price: true,
      buy_value: true,
      value_as_of_today: true,
      pnl_amount: true,
      percent_pnl: true,
      sub_category: true,
      strategy: true,
      broker: true,
      debt_equity: true,
      exchange: true,
    },
  });

  return rows
    .filter((r) => !r.sub_category || !EQUITY_EXCLUDED_SUB_CATEGORIES.has(r.sub_category.toLowerCase()))
    .map((r) => ({
      symbol: r.symbol,
      quantity: toNumberFromBigInt(r.quantity),
      avgPrice: toNumberFromDecimal(r.avg_price),
      buyValue: toNumberFromDecimal(r.buy_value),
      valueAsOfToday: toNumberFromDecimal(r.value_as_of_today),
      pnlAmount: toNumberFromDecimal(r.pnl_amount),
      percentPnl: toNumberFromDecimal(r.percent_pnl),
      subCategory: r.sub_category,
      strategy: r.strategy,
      broker: r.broker,
      debtEquity: r.debt_equity,
      exchange: r.exchange,
    }));
}

/**
 * Current mutual fund holdings for a qcode — Python's calc_mf_holdings.
 * No liquidcase/liquidbees exclusion (that filter is equity-specific per
 * doc 02). Optionally filters to a single `strategy`, sorted by symbol
 * ascending. Note: this table's date column is `as_of_date`, not `date`.
 */
export async function getCurrentMfHoldings(
  qcode: string,
  strategy?: string,
  asOfDate?: Date,
): Promise<HoldingRow[]> {
  const latest = await prisma.bifurcated_mutual_fund_holding_sheet_test.findFirst({
    where: {
      qcode,
      ...(asOfDate ? { as_of_date: dateFilter(asOfDate) } : {}),
    },
    orderBy: { as_of_date: "desc" },
    select: { as_of_date: true },
  });
  if (!latest) return [];

  const rows = await prisma.bifurcated_mutual_fund_holding_sheet_test.findMany({
    where: {
      qcode,
      as_of_date: latest.as_of_date,
      ...(strategy ? { strategy } : {}),
    },
    orderBy: { symbol: "asc" },
    select: {
      symbol: true,
      quantity: true,
      avg_price: true,
      buy_value: true,
      value_as_of_today: true,
      pnl_amount: true,
      percent_pnl: true,
      sub_category: true,
      strategy: true,
      broker: true,
      debt_equity: true,
    },
  });

  return rows.map((r) => ({
    symbol: r.symbol,
    quantity: toNumberFromDecimal(r.quantity),
    avgPrice: toNumberFromDecimal(r.avg_price),
    buyValue: toNumberFromDecimal(r.buy_value),
    valueAsOfToday: toNumberFromDecimal(r.value_as_of_today),
    pnlAmount: toNumberFromDecimal(r.pnl_amount),
    percentPnl: toNumberFromDecimal(r.percent_pnl),
    subCategory: r.sub_category,
    strategy: r.strategy,
    broker: r.broker,
    debtEquity: r.debt_equity,
    exchange: null, // bifurcated_mutual_fund_holding_sheet_test has no exchange column (has isin instead)
  }));
}
