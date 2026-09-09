import { prisma } from "@/lib/prisma";
import type { NavPoint } from "@/app/lib/internal-utils";

export async function fetchBulkNavSeries(
  pairs: { qcode: string; tag: string }[],
  end?: Date,
  start?: Date,
): Promise<Map<string, NavPoint[]>> {
  const params: any[] = [pairs.map((p) => p.qcode), pairs.map((p) => p.tag)];
  let dateClause = "";
  if (start) {
    params.push(start);
    dateClause += ` AND b.date >= $${params.length}`;
  }
  if (end) {
    params.push(end);
    dateClause += ` AND b.date <= $${params.length}`;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.qcode, b.system_tag, b.date, b.nav, b.prev_nav, b.drawdown, b.pnl
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.nav IS NOT NULL${dateClause}
     ORDER BY b.qcode, b.system_tag, b.date ASC`,
    ...params,
  );

  // NOTE: portfolio_value is intentionally not selected here — this series
  // is NAV-curve-only. Do not reuse this for anything that needs a real
  // account value (e.g. XIRR final valuation); see fetchBulkXirrInputs.
  const seriesMap = new Map<string, NavPoint[]>();
  for (const row of rows) {
    const key = `${row.qcode}|${row.system_tag}`;
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push({
      date: row.date instanceof Date ? row.date : new Date(row.date),
      nav: Number(row.nav) || 0,
      prev_nav: row.prev_nav != null ? Number(row.prev_nav) : null,
      drawdown: Number(row.drawdown) || 0,
      pnl: Number(row.pnl) || 0,
      portfolio_value: 0,
    });
  }
  return seriesMap;
}
