/**
 * DB access layer for equity_holdings_tradebook / mutual_funds_tradebook —
 * the only module that touches these tables directly (doc 04 "tradebook.ts").
 * Ports of calculations.py's `identify_transition_wash_trades`,
 * `calc_holdings_investment_summary`, `calc_eq_transactions`,
 * `calc_mf_transactions`, and `is_full_cash_strategy` (doc 02). Read-only
 * (findMany only — no writes, see CLAUDE.md DB safety rules).
 *
 * Every read accepts an optional `asOfDate` cutoff (`date <= asOfDate`),
 * matching the pattern in mastersheet.ts, so Phase 3's staging/preview
 * design can reuse these functions unchanged.
 */
import { prisma } from "@/lib/prisma";
import type { ClientStrategyConfigRow } from "./types";

/** One row of calc_eq_transactions/calc_mf_transactions output (doc 02). */
export interface TransactionRow {
  symbol: string;
  capitalFlow: "Capital Inflow" | "Capital Outflow";
  date: string; // ISO date string
  strategy: string | null; // the row's OWN historical strategy value, not a "current" strategy
  amount: number;
}

function toNumber(value: { toNumber(): number } | null): number {
  return value === null ? 0 : value.toNumber();
}

function dateFilter(asOfDate?: Date) {
  return asOfDate ? { lte: asOfDate } : undefined;
}

const FULL_CASH_STRATEGIES = new Set(["QAW+", "QAW++", "QTF+", "QTF++"]);

/**
 * Cash-only strategies where Qode trades on the client's behalf — these get
 * all-zero treatment in calcHoldingsInvestmentSummary and are excluded from
 * "adjustment item" aggregation elsewhere (doc 02 calc_overview_cash_summary).
 */
export function isFullCashStrategy(strategyName: string): boolean {
  return FULL_CASH_STRATEGIES.has(strategyName);
}

function isLiquidSubCategory(subCategory: string | null): boolean {
  if (!subCategory) return false;
  const normalized = subCategory.toLowerCase();
  return normalized === "liquidcase" || normalized === "liquidbees";
}

/**
 * Port of identify_transition_wash_trades (doc 02). For each strategy
 * transition boundary in the client's Master_Config history (one row's
 * effectiveTo immediately followed by another row's effectiveFrom), finds
 * same-symbol Sell trades on the old strategy's effectiveTo date whose
 * amount (quantity * price) is offset — within `tolerance` — by same-symbol
 * Buy trades on the new strategy's effectiveFrom date. These are bookkeeping
 * artifacts from the transition (stock re-tagged between strategies), not
 * real trades.
 *
 * Returns a Set of excluded row ids, stringified from
 * equity_holdings_tradebook's own `id` primary key (e.g. "12345"), since
 * this is the equity table's natural unique row identifier. Only equity is
 * considered — doc 02 does not describe an MF-side wash-trade function.
 */
export async function identifyTransitionWashTrades(
  qcode: string,
  strategyConfigRows: ClientStrategyConfigRow[],
  tolerance = 0.01,
): Promise<Set<string>> {
  const excluded = new Set<string>();

  const sorted = [...strategyConfigRows].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );

  // Find transition boundaries: old row's effectiveTo === new row's effectiveFrom.
  const boundaries: { oldDate: string; newDate: string }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const oldRow = sorted[i];
    if (!oldRow.effectiveTo) continue;
    for (let j = 0; j < sorted.length; j++) {
      if (j === i) continue;
      const newRow = sorted[j];
      if (newRow.effectiveFrom === oldRow.effectiveTo) {
        boundaries.push({ oldDate: oldRow.effectiveTo, newDate: newRow.effectiveFrom });
      }
    }
  }

  if (boundaries.length === 0) return excluded;

  const allTrades = await prisma.equity_holdings_tradebook.findMany({
    where: { qcode },
    select: {
      id: true,
      date: true,
      trade_type: true,
      symbol: true,
      quantity: true,
      price: true,
    },
  });

  const toDateKey = (d: Date) => d.toISOString().slice(0, 10);

  for (const boundary of boundaries) {
    const sells = allTrades.filter(
      (t) => toDateKey(t.date) === boundary.oldDate && t.trade_type === "Sell",
    );
    const buys = allTrades.filter(
      (t) => toDateKey(t.date) === boundary.newDate && t.trade_type === "Buy",
    );

    for (const sell of sells) {
      const sellAmount = toNumber(sell.quantity) * toNumber(sell.price);
      const match = buys.find((buy) => {
        if (buy.symbol !== sell.symbol) return false;
        const buyAmount = toNumber(buy.quantity) * toNumber(buy.price);
        return Math.abs(sellAmount - buyAmount) <= tolerance;
      });
      if (match) {
        excluded.add(String(sell.id));
        excluded.add(String(match.id));
      }
    }
  }

  return excluded;
}

/**
 * Port of calc_holdings_investment_summary (doc 02). All-zero for full-cash
 * strategies (caller determines fullCash via isFullCashStrategy). Otherwise
 * sums Amount = quantity * price across both tradebooks, excluding
 * wash-trade rows (equity only, via eqExcludeIds) and liquidcase/liquidbees
 * sub-category rows, but keeping blank/empty `strategy` rows.
 *
 * NOTE: doc 02 also describes a row-level "full-cash-strategy rows"
 * exclusion independent of the `fullCash` param. Removed — confirmed
 * against real report data (Ashok Jogani HUF QUS00124, exact rupee match)
 * that this over-excludes: the combined ("Total Portfolio") view calls
 * this with `fullCash=false` and DOES include full-cash-strategy-tagged
 * rows in its total, so a hidden per-row veto based on the row's own
 * `strategy` tag was zeroing out real holdings the real pipeline counts.
 * The single `fullCash` parameter (checked once, by the caller) is the
 * only full-cash exclusion now.
 *
 * Sign convention matches calc_eq_transactions/calc_mf_transactions (doc
 * 02 line 138-142): sells are negated, so totalHoldingsWithdrawn is <= 0.
 */
export async function calcHoldingsInvestmentSummary(
  qcode: string,
  strategy: string | undefined,
  fullCash: boolean,
  eqExcludeIds: Set<string>,
  asOfDate?: Date,
): Promise<{ totalHoldingsAdded: number; totalHoldingsWithdrawn: number; netHoldingBalance: number }> {
  if (fullCash) {
    return { totalHoldingsAdded: 0, totalHoldingsWithdrawn: 0, netHoldingBalance: 0 };
  }

  const [eqRows, mfRows] = await Promise.all([
    prisma.equity_holdings_tradebook.findMany({
      where: {
        qcode,
        ...(strategy ? { strategy } : {}),
        ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
      },
      select: {
        id: true,
        trade_type: true,
        quantity: true,
        price: true,
        sub_category: true,
        strategy: true,
      },
    }),
    prisma.mutual_funds_tradebook.findMany({
      where: {
        qcode,
        ...(strategy ? { strategy } : {}),
        ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
      },
      select: {
        trade_type: true,
        quantity: true,
        price: true,
        sub_category: true,
        strategy: true,
      },
    }),
  ]);

  let totalHoldingsAdded = 0;
  let totalHoldingsWithdrawn = 0;

  for (const row of eqRows) {
    if (eqExcludeIds.has(String(row.id))) continue;
    if (isLiquidSubCategory(row.sub_category)) continue;

    const amount = toNumber(row.quantity) * toNumber(row.price);
    if (row.trade_type === "Buy") {
      totalHoldingsAdded += amount;
    } else if (row.trade_type === "Sell") {
      totalHoldingsWithdrawn += -amount;
    }
  }

  for (const row of mfRows) {
    if (isLiquidSubCategory(row.sub_category)) continue;

    const amount = toNumber(row.quantity) * toNumber(row.price);
    if (row.trade_type === "Buy") {
      totalHoldingsAdded += amount;
    } else if (row.trade_type === "Sell") {
      totalHoldingsWithdrawn += -amount;
    }
  }

  return {
    totalHoldingsAdded,
    totalHoldingsWithdrawn,
    netHoldingBalance: totalHoldingsAdded + totalHoldingsWithdrawn,
  };
}

/**
 * Groups raw tradebook rows into one row per (date, symbol, trade_type,
 * strategy) before amount aggregation. Confirmed against real report data
 * (Ashwin Agarwal / QAC00083): the DB stores one row per broker partial
 * fill — e.g. 20+ separate rows for a single same-day INDIGRID buy — but
 * the real "Equity/MF Transactions" sheet shows exactly one aggregated row
 * per date+symbol+type. Without this grouping, transaction counts were
 * inflated 20-50x versus the real pipeline's output.
 */
function groupFills<T extends { date: Date; trade_type: string; symbol: string; quantity: { toNumber(): number } | null; price: { toNumber(): number } | null; strategy: string | null; sub_category?: string | null; id?: bigint | number }>(
  rows: T[],
): { dateKey: string; date: Date; symbol: string; tradeType: string; strategy: string | null; amount: number; excluded: boolean }[] {
  const groups = new Map<string, { dateKey: string; date: Date; symbol: string; tradeType: string; strategy: string | null; amount: number; excluded: boolean }>();
  for (const row of rows) {
    const dateKey = row.date.toISOString().slice(0, 10);
    const key = `${dateKey}|${row.symbol}|${row.trade_type}|${row.strategy ?? ""}`;
    const amount = toNumber(row.quantity) * toNumber(row.price);
    const excluded = isLiquidSubCategory(row.sub_category ?? null);
    const existing = groups.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      groups.set(key, { dateKey, date: row.date, symbol: row.symbol, tradeType: row.trade_type, strategy: row.strategy, amount, excluded });
    }
  }
  return [...groups.values()];
}

/**
 * Port of calc_eq_transactions (doc 02). Amount = quantity * price; sells
 * negated + labeled "Capital Outflow", buys "Capital Inflow". Excludes
 * wash-trade rows (eqExcludeIds, checked pre-grouping since ids are
 * per-fill) and liquidcase/liquidbees sub-category rows. Each row keeps its
 * own historical `strategy` value. Same-day same-symbol-same-type broker
 * partial fills are aggregated into one row (see groupFills).
 */
export async function calcEquityTransactions(
  qcode: string,
  strategy: string | undefined,
  eqExcludeIds: Set<string>,
  asOfDate?: Date,
): Promise<TransactionRow[]> {
  const rows = await prisma.equity_holdings_tradebook.findMany({
    where: {
      qcode,
      ...(strategy ? { strategy } : {}),
      ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
    },
    select: {
      id: true,
      date: true,
      trade_type: true,
      symbol: true,
      quantity: true,
      price: true,
      sub_category: true,
      strategy: true,
    },
    orderBy: { date: "asc" },
  });

  const filtered = rows.filter((row) => !eqExcludeIds.has(String(row.id)));
  const grouped = groupFills(filtered).filter((g) => !g.excluded);

  const result: TransactionRow[] = [];
  for (const g of grouped) {
    if (g.tradeType === "Buy") {
      result.push({ symbol: g.symbol, capitalFlow: "Capital Inflow", date: g.dateKey, strategy: g.strategy, amount: g.amount });
    } else if (g.tradeType === "Sell") {
      result.push({ symbol: g.symbol, capitalFlow: "Capital Outflow", date: g.dateKey, strategy: g.strategy, amount: -g.amount });
    }
  }
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

/**
 * Port of calc_mf_transactions (doc 02). Same Amount/sign convention as
 * calcEquityTransactions, but no wash-trade or liquidcase/liquidbees
 * exclusions — doc 02 does not describe those for the MF side. Same-day
 * same-symbol-same-type partial fills are aggregated into one row (see
 * groupFills / calcEquityTransactions's comment for why).
 */
export async function calcMfTransactions(
  qcode: string,
  strategy: string | undefined,
  asOfDate?: Date,
): Promise<TransactionRow[]> {
  const rows = await prisma.mutual_funds_tradebook.findMany({
    where: {
      qcode,
      ...(strategy ? { strategy } : {}),
      ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
    },
    select: {
      date: true,
      trade_type: true,
      symbol: true,
      quantity: true,
      price: true,
      strategy: true,
    },
    orderBy: { date: "asc" },
  });

  const grouped = groupFills(rows);

  const result: TransactionRow[] = [];
  for (const g of grouped) {
    if (g.tradeType === "Buy") {
      result.push({ symbol: g.symbol, capitalFlow: "Capital Inflow", date: g.dateKey, strategy: g.strategy, amount: g.amount });
    } else if (g.tradeType === "Sell") {
      result.push({ symbol: g.symbol, capitalFlow: "Capital Outflow", date: g.dateKey, strategy: g.strategy, amount: -g.amount });
    }
  }
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}
