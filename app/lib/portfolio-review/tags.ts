import { prisma } from "@/lib/prisma";
import type { NavPoint } from "@/app/lib/internal-utils";

export interface StrategyPair {
  qcode: string;
  account_name: string;
  strategy: string;
  tag: string;
  // Cash-flow-bearing tag: exposure_tag_suffix tracks real client
  // deposits/withdrawals cleanly; profit_tag_suffix's capital_in_out
  // is contaminated with near-daily internal transfer noise on most
  // strategies, so XIRR must source flows from this tag, not `tag`.
  exposure_tag: string;
  equity_pct: number | null;
  debt_pct: number | null;
  lc_pct: number | null;
  cash_pct: number | null;
  gold_pct: number | null;
  lowvol_pct: number | null;
  momentum_pct: number | null;
  psar_leverage: number | null;
  psar_multiplier: number | null;
  long_opt_pct: number | null;
  gold_model_pct: number | null;
  momentum_model_pct: number | null;
  lowvol_model_pct: number | null;
  cash_pct_healthy: number | null;
  liquidcase_pct_gate: number | null;
  effective_to: string | null;
}

export function toNum(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

export async function fetchStrategyPairs(
  suffixField: "exposure_tag_suffix" | "profit_tag_suffix",
): Promise<StrategyPair[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    orderBy: [{ qcode: "asc" }, { strategy: "asc" }, { effective_from: "asc" }],
  });
  const map = new Map<string, StrategyPair>();
  for (const c of configs) {
    map.set(`${c.qcode}|${c.strategy}`, {
      qcode: c.qcode,
      account_name: c.account_name,
      strategy: c.strategy,
      tag: `${c.strategy} ${c[suffixField]}`,
      exposure_tag: `${c.strategy} ${c.exposure_tag_suffix}`,
      equity_pct: toNum(c.equity_pct),
      debt_pct: toNum(c.debt_pct),
      lc_pct: toNum(c.lc_pct),
      cash_pct: toNum(c.cash_pct),
      gold_pct: toNum(c.gold_pct),
      lowvol_pct: toNum(c.lowvol_pct),
      momentum_pct: toNum(c.momentum_pct),
      psar_leverage: toNum(c.psar_leverage),
      psar_multiplier: toNum(c.psar_multiplier),
      long_opt_pct: toNum(c.long_opt_pct),
      gold_model_pct: toNum(c.gold_model_pct),
      momentum_model_pct: toNum(c.momentum_model_pct),
      lowvol_model_pct: toNum(c.lowvol_model_pct),
      cash_pct_healthy: toNum(c.cash_pct_healthy),
      liquidcase_pct_gate: toNum(c.liquidcase_pct_gate),
      effective_to: c.effective_to
        ? c.effective_to.toISOString().split("T")[0]
        : null,
    });
  }
  return [...map.values()];
}

function groupRows(rows: any[]): Record<string, NavPoint[]> {
  const grouped: Record<string, NavPoint[]> = {};
  for (const row of rows) {
    const tag = row.system_tag as string;
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push({
      date: row.date instanceof Date ? row.date : new Date(row.date),
      nav: Number(row.nav) || 0,
      prev_nav: row.prev_nav != null ? Number(row.prev_nav) : null,
      drawdown: Number(row.drawdown) || 0,
      pnl: Number(row.pnl) || 0,
      portfolio_value: Number(row.portfolio_value) || 0,
    });
  }
  return grouped;
}

export async function fetchTagData(
  qcode: string,
  strategy: string,
  allPrefixes: string[],
  asOf?: Date,
): Promise<Record<string, NavPoint[]>> {
  let rows: any[];

  if (strategy === "combined") {
    if (allPrefixes.length === 0) {
      const dateClause = asOf ? " AND date <= $2" : "";
      const params: any[] = asOf ? [qcode, asOf] : [qcode];
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND nav IS NOT NULL${dateClause}
         ORDER BY system_tag, date ASC`,
        ...params,
      );
    } else {
      const excludes = allPrefixes
        .map((_, i) => `system_tag NOT LIKE $${i + 2}`)
        .join(" AND ");
      const dateIdx = allPrefixes.length + 2;
      const dateClause = asOf ? ` AND date <= $${dateIdx}` : "";
      const params: any[] = [qcode, ...allPrefixes.map((p) => `${p} %`)];
      if (asOf) params.push(asOf);
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND nav IS NOT NULL AND ${excludes}${dateClause}
         ORDER BY system_tag, date ASC`,
        ...params,
      );
    }
  } else {
    const dateClause = asOf ? " AND date <= $3" : "";
    const params: any[] = asOf
      ? [qcode, `${strategy} %`, asOf]
      : [qcode, `${strategy} %`];
    rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
       FROM bifurcated_master_sheet_test
       WHERE qcode = $1 AND nav IS NOT NULL
         AND system_tag LIKE $2${dateClause}
       ORDER BY system_tag, date ASC`,
      ...params,
    );
  }

  return groupRows(rows);
}

export interface PnlSnapshotEntry {
  pnl_inr: number;
  pnl_pct: number;
}

// single-day PnL (₹ and %) for one tag — null when that tag has no row on this date
export async function fetchPnlSnapshot(
  qcode: string,
  tag: string,
  dateStr: string, // "YYYY-MM-DD" — plain string, not Date, avoids driver timezone rounding on the exact match
): Promise<PnlSnapshotEntry | null> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pnl, daily_p_l FROM bifurcated_master_sheet_test
     WHERE qcode = $1 AND date = $2::date AND system_tag = $3
     LIMIT 1`,
    qcode,
    dateStr,
    tag,
  );
  if (rows.length === 0) return null;
  return {
    pnl_inr: Number(rows[0].pnl) || 0,
    pnl_pct: (Number(rows[0].daily_p_l) || 0) / 100, // stored as %, response uses fraction like everything else
  };
}

async function fetchClientStrategies(qcode: string): Promise<string[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    where: { qcode },
    select: { strategy: true },
  });
  return [...new Set(configs.map((c) => c.strategy))];
}

export async function fetchSystemTags(
  qcode: string,
  strategy: string,
): Promise<string[]> {
  let rows: { system_tag: string }[];

  if (strategy === "combined") {
    const allPrefixes = await fetchClientStrategies(qcode);
    if (allPrefixes.length === 0) {
      rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
        `SELECT DISTINCT system_tag
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1
         ORDER BY system_tag`,
        qcode,
      );
    } else {
      const excludes = allPrefixes
        .map((_, i) => `system_tag NOT LIKE $${i + 2}`)
        .join(" AND ");
      rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
        `SELECT DISTINCT system_tag
         FROM bifurcated_master_sheet_test
         WHERE qcode = $1 AND ${excludes}
         ORDER BY system_tag`,
        qcode,
        ...allPrefixes.map((p) => `${p} %`),
      );
    }
  } else {
    rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
      `SELECT DISTINCT system_tag
       FROM bifurcated_master_sheet_test
       WHERE qcode = $1 AND system_tag LIKE $2
       ORDER BY system_tag`,
      qcode,
      `${strategy} %`,
    );
  }

  return rows.map((r) => r.system_tag);
}
