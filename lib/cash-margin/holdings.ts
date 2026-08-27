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
 *
 * loadXtsHoldings (below) is a separate reader for xts_holdings (XTS-fed
 * clients, e.g. Nagarjun QAC00123). loadHoldings calls it only when a qcode
 * has zero console_equity_holdings rows -- a Zerodha client with real data
 * never reaches it, so this changes nothing for anyone already working.
 * xts_holdings is schema-defined but not yet migrated into the database, so
 * that call fails today (Prisma P2021) for every XTS-fed client -- caught
 * and logged loudly (console.error, not silent) so the gap stays visible in
 * server logs, but the page still renders (empty snapshot, same as before
 * this was wired) rather than crashing Margin Requirements for those
 * clients while the migration is pending.
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
 * bare broker symbol stored in console_equity_holdings ("GOLDBEES"). Also
 * strips a trailing "-EQ" (the XTS convention seen in raw RMS holdings
 * exports, e.g. "GRASIM-EQ") -- harmless for Zerodha symbols, which never
 * carry it. Uppercased so casing differences between sources cannot cause a
 * silent miss.
 */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(NS|BO|NSE|BSE)$/, "").replace(/-EQ$/, "");
}

/**
 * Standalone reader for xts_holdings -- NOT called by loadHoldings, NOT
 * wired into any live code path. Same value-keyed-by-symbol shape as
 * loadHoldings, reading the precomputed `value` column directly instead of
 * quantity * last_price (xts_holdings has no last_price column).
 *
 * No error handling: if xts_holdings doesn't exist yet in the database (it's
 * schema-defined but not migrated as of writing), this throws Prisma's P2021
 * straight to the caller -- deliberately, not caught here. Call this
 * explicitly once real data exists to check against; don't wire it into
 * loadHoldings' shared path until then.
 */
export async function loadXtsHoldings(qcode: string, asOfDate?: Date): Promise<HoldingsSnapshot> {
  const latest = await prisma.xts_holdings.findFirst({
    where: asOfDate ? { qcode, date: { lte: asOfDate } } : { qcode },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const snapshot: HoldingsSnapshot = { qcode, date: latest?.date ?? null, bySymbol: new Map() };
  if (!latest?.date) return snapshot;

  const rows = await prisma.xts_holdings.findMany({
    where: { qcode, date: latest.date },
    select: { symbol: true, value: true },
  });

  for (const r of rows) {
    const key = normalizeSymbol(r.symbol);
    const value = Number(r.value ?? 0);
    snapshot.bySymbol.set(key, (snapshot.bySymbol.get(key) ?? 0) + value);
  }
  return snapshot;
}

/**
 * Load the latest-date holdings snapshot for a client, keyed by normalised
 * symbol. Returns an empty snapshot (date null) when neither source has rows.
 *
 * Reads console_equity_holdings first (Zerodha clients -- unchanged path,
 * real data every time for a client that has any). Only when that comes back
 * empty does it try loadXtsHoldings -- today this only actually reaches
 * Nagarjun (QAC00123), the one XTS client with an active sleeve depending on
 * it; every other client either has console_equity_holdings data (Zerodha)
 * or has no sleeve gating on holdings at all (see hasConfiguredLeaves), so
 * the empty result they'd get either way is unchanged.
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

  if (!latest?.date) {
    try {
      return await loadXtsHoldings(qcode, asOfDate);
    } catch (e: unknown) {
      // Loud, not silent: xts_holdings isn't migrated into the database yet,
      // so this fails for every XTS-fed client today (Prisma P2021). Logged
      // so the gap stays visible in server logs -- but the page must still
      // render, so fall back to an empty snapshot rather than throwing.
      console.error(`[cash-margin] loadXtsHoldings failed for qcode ${qcode}:`, e);
      return { qcode, date: null, bySymbol: new Map() };
    }
  }

  const snapshot: HoldingsSnapshot = { qcode, date: latest.date, bySymbol: new Map() };
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
