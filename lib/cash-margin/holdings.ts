/**
 * lib/cash-margin/holdings.ts
 * Loads console_equity_holdings for one client, indexed by symbol.
 *
 * This is the actual-value source for catalog leaves that carry a `symbol`
 * (gold, lowvol, momentum50, momidmtm, liquidcase). Unlike the mastersheet,
 * which tracks momentum as ONE combined "Momentum Stock Holdings" tag, this
 * table has a row per instrument -- so per-leg actual values are obtainable
 * here and nowhere else.
 *
 * Value convention matches app/lib/internal-utils.ts's resolveUndeployedValue:
 * pledged shares are ADDITIVE for equity, so the position is
 * (quantity + collateral_quantity) * last_price. Reading `quantity` alone
 * would value a fully-pledged position at 0 -- 80 of 407 latest-date rows are
 * in exactly that state.
 *
 * NOTE: console_equity_holdings has no `strategy` column -- one row per
 * (qcode, date, symbol). This is only unambiguous because no two
 * concurrently-active strategies on the same qcode define overlapping sleeve
 * instruments today. See loadHoldings' duplicate guard.
 */
import { prisma } from "@/lib/prisma";

export interface HoldingsSnapshot {
  qcode: string;
  /** Latest date with rows for this qcode, or null when the client has none. */
  date: Date | null;
  /** Normalised symbol -> position value in rupees. */
  bySymbol: Map<string, number>;
}

/**
 * Strip the exchange suffix so a catalog `symbol` ("GOLDBEES.NS") matches the
 * bare broker symbol stored in console_equity_holdings ("GOLDBEES").
 * Uppercased so casing differences between the two sources cannot cause a
 * silent miss.
 */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(NS|BO|NSE|BSE)$/, "");
}

/**
 * Load the latest-date holdings snapshot for a client, keyed by normalised
 * symbol. Returns an empty snapshot (date null) when the client has no rows.
 *
 * @param asOfDate - when given, resolves the latest snapshot on or before this
 *   date instead of the overall latest, mirroring loadMastersheet's parameter.
 */
export async function loadHoldings(qcode: string, asOfDate?: Date): Promise<HoldingsSnapshot> {
  const latest = await prisma.console_equity_holdings.findFirst({
    where: asOfDate ? { qcode, date: { lte: asOfDate } } : { qcode },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const snapshot: HoldingsSnapshot = { qcode, date: latest?.date ?? null, bySymbol: new Map() };
  if (!latest?.date) return snapshot;

  const rows = await prisma.console_equity_holdings.findMany({
    where: { qcode, date: latest.date },
    select: { symbol: true, quantity: true, collateral_quantity: true, last_price: true },
  });

  for (const r of rows) {
    const key = normalizeSymbol(r.symbol);
    const qty = Number(r.quantity ?? 0) + Number(r.collateral_quantity ?? 0);
    const value = qty * Number(r.last_price ?? 0);

    // One row per (qcode, date, symbol) is expected and currently holds. If
    // that ever breaks -- or if two symbols normalise to the same key -- sum
    // rather than silently keeping whichever row happened to come last.
    snapshot.bySymbol.set(key, (snapshot.bySymbol.get(key) ?? 0) + value);
  }
  return snapshot;
}
