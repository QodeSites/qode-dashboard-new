/**
 * DB access layer for bifurcated_master_sheet_test — the only module that
 * touches this table directly (doc 04 "mastersheet.ts"). Confirmed source
 * for Investment Summary's Mastersheet data (doc 03), read-only only
 * (findMany/aggregate/findFirst — no writes, see CLAUDE.md DB safety rules).
 *
 * Every read accepts an optional `asOfDate` cutoff (`date <= asOfDate`) so
 * the Phase 3 staging/preview design (doc 04) — admins see live/today,
 * clients see the latest published date — can reuse these functions
 * unchanged; omit it to read all history up to now.
 */
import { prisma } from "@/lib/prisma";
import type { MasterSheetRow } from "./types";

function toNumber(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

function dateFilter(asOfDate?: Date) {
  return asOfDate ? { lte: asOfDate } : undefined;
}

/** Raw rows for a qcode, optionally narrowed to specific system_tag values and/or an as-of cutoff. */
export async function getMastersheetRows(
  qcode: string,
  tags?: string[],
  asOfDate?: Date,
): Promise<MasterSheetRow[]> {
  const rows = await prisma.bifurcated_master_sheet_test.findMany({
    where: {
      qcode,
      ...(tags && tags.length > 0 ? { system_tag: { in: tags } } : {}),
      ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
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
export async function sumPnl(qcode: string, systemTag: string, asOfDate?: Date): Promise<number> {
  const result = await prisma.bifurcated_master_sheet_test.aggregate({
    where: {
      qcode,
      system_tag: systemTag,
      ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
    },
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
  asOfDate?: Date,
): Promise<{ date: Date; value: number } | null> {
  const row = await prisma.bifurcated_master_sheet_test.findFirst({
    where: {
      qcode,
      system_tag: systemTag,
      ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
    },
    orderBy: { date: "desc" },
    select: { date: true, portfolio_value: true },
  });
  if (!row) return null;
  return { date: row.date, value: toNumber(row.portfolio_value) ?? 0 };
}

/** All distinct system_tag values present for a qcode — used by tags.ts to check candidate existence without a full row fetch. */
export async function getDistinctTags(qcode: string, asOfDate?: Date): Promise<Set<string>> {
  const rows = await prisma.bifurcated_master_sheet_test.findMany({
    where: {
      qcode,
      ...(asOfDate ? { date: dateFilter(asOfDate) } : {}),
    },
    distinct: ["system_tag"],
    select: { system_tag: true },
  });
  return new Set(rows.map((r) => r.system_tag));
}
