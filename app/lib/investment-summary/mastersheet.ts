/**
 * DB access layer for bifurcated_master_sheet_test — the only module that
 * touches this table directly (doc 04 "mastersheet.ts"). Confirmed source
 * for Investment Summary's Mastersheet data (doc 03), read-only only
 * (findMany/aggregate/findFirst — no writes, see CLAUDE.md DB safety rules).
 */
import { prisma } from "@/lib/prisma";
import type { MasterSheetRow } from "./types";

function toNumber(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

/** Raw rows for a qcode, optionally narrowed to specific system_tag values. */
export async function getMastersheetRows(qcode: string, tags?: string[]): Promise<MasterSheetRow[]> {
  const rows = await prisma.bifurcated_master_sheet_test.findMany({
    where: {
      qcode,
      ...(tags && tags.length > 0 ? { system_tag: { in: tags } } : {}),
    },
    orderBy: { date: "asc" },
    select: {
      date: true,
      system_tag: true,
      portfolio_value: true,
      capital_in_out: true,
      nav: true,
      pnl: true,
      drawdown: true,
    },
  });

  return rows.map((r) => ({
    date: r.date,
    systemTag: r.system_tag,
    portfolioValue: toNumber(r.portfolio_value),
    capitalInOut: toNumber(r.capital_in_out),
    nav: toNumber(r.nav),
    pnl: toNumber(r.pnl),
    drawdown: toNumber(r.drawdown),
  }));
}

/**
 * Lifetime sum of PnL for a single system_tag (Python's sum_pnl(ms, tag) —
 * sums across ALL dates for that tag, not a snapshot). Returns 0 if the tag
 * has no rows (matches Python's DataFrame-sum-of-empty-selection behavior).
 */
export async function sumPnl(qcode: string, systemTag: string): Promise<number> {
  const result = await prisma.bifurcated_master_sheet_test.aggregate({
    where: { qcode, system_tag: systemTag },
    _sum: { pnl: true },
  });
  return result._sum.pnl?.toNumber() ?? 0;
}

/**
 * Most recent (date, value) pair for a system_tag — Python's
 * get_latest_portfolio_value(ms, tag). `value` reads `portfolio_value`
 * (the column calc_current_account_summary and friends actually use).
 * Returns null if the tag has no rows.
 */
export async function getLatest(
  qcode: string,
  systemTag: string,
): Promise<{ date: Date; value: number } | null> {
  const row = await prisma.bifurcated_master_sheet_test.findFirst({
    where: { qcode, system_tag: systemTag },
    orderBy: { date: "desc" },
    select: { date: true, portfolio_value: true },
  });
  if (!row) return null;
  return { date: row.date, value: toNumber(row.portfolio_value) ?? 0 };
}

// tags.ts's resolve() calls getDistinctTags() on EVERY tag lookup (no
// memoization at the call site) — a single computeInvestmentSummary() run
// fires this 30-40+ times for one client, each a fresh full-table distinct
// scan pulling its own Prisma pool connection. Under any concurrency
// (another tab, the admin download-all batch iterating many clients) that
// exhausts a 17-connection pool well within its 10s acquire timeout
// (P2024). A plain TTL cache isn't enough on its own: callers fire these
// resolve() calls concurrently (Promise.all in strategy-summaries.ts /
// account-summary.ts / overview-cash.ts), so on a COLD cache every call in
// that burst sees a miss at the same instant and fires its own query before
// any of them finishes and populates the cache (thundering herd) — this is
// what caused "fails once, then works" behavior even after the TTL cache
// was added. Caching the in-flight PROMISE (not just the resolved value)
// collapses concurrent callers for the same qcode onto one query.
const DISTINCT_TAGS_CACHE_TTL_MS = 30_000;
const distinctTagsCache = new Map<string, { tags: Set<string>; expiresAt: number }>();
const distinctTagsInFlight = new Map<string, Promise<Set<string>>>();

/** All distinct system_tag values present for a qcode — used by tags.ts to check candidate existence without a full row fetch. */
export async function getDistinctTags(qcode: string): Promise<Set<string>> {
  const cached = distinctTagsCache.get(qcode);
  if (cached && cached.expiresAt > Date.now()) return cached.tags;

  const inFlight = distinctTagsInFlight.get(qcode);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const rows = await prisma.bifurcated_master_sheet_test.findMany({
        where: { qcode },
        distinct: ["system_tag"],
        select: { system_tag: true },
      });
      const tags = new Set(rows.map((r) => r.system_tag));
      distinctTagsCache.set(qcode, { tags, expiresAt: Date.now() + DISTINCT_TAGS_CACHE_TTL_MS });
      return tags;
    } finally {
      distinctTagsInFlight.delete(qcode);
    }
  })();

  distinctTagsInFlight.set(qcode, promise);
  return promise;
}
