/**
 * lib/cash-margin/margin-api.ts
 * Margin collateral source: reads the latest snapshot per client from
 * cm_margin_collateral (Postgres) instead of the live Zerodha RMS endpoint.
 *
 * Replaces the earlier fetch_margin/fetch_margins HTTP client (Redis-backed)
 * now that cm_margin_collateral is populated by that same upstream job.
 * Keyed by qcode (the table's key), not account_name.
 */
import { prisma } from "@/lib/prisma";

export interface MarginAvailable {
  /** cm_margin_collateral.cash_collateral -- Cash Collateral (Liquid Funds). */
  liquidCollateral: number;
  /** cm_margin_collateral.non_cash_collateral -- Non-Cash Collateral (stocks). */
  stockCollateral: number;
}

/**
 * Latest cm_margin_collateral row per qcode, restricted to the zerodha broker
 * (non-XTS mandates are the only ones fed into this path -- see
 * isXtsMandate in tags.ts). Returns null for a qcode with no row yet.
 */
export async function loadMarginCollaterals(qcodes: string[]): Promise<Map<string, MarginAvailable | null>> {
  const unique = Array.from(new Set(qcodes));
  const map = new Map<string, MarginAvailable | null>();
  if (unique.length === 0) return map;

  const rows = await prisma.cm_margin_collateral.findMany({
    where: { qcode: { in: unique }, broker: "zerodha" },
    select: { qcode: true, date: true, cash_collateral: true, non_cash_collateral: true },
    orderBy: { date: "desc" },
  });

  // Rows are date-desc; keep the first (latest) row seen per qcode.
  const latestByQcode = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!latestByQcode.has(r.qcode)) latestByQcode.set(r.qcode, r);
  }

  for (const qcode of unique) {
    const row = latestByQcode.get(qcode);
    if (!row) {
      map.set(qcode, null);
      continue;
    }
    map.set(qcode, {
      liquidCollateral: row.cash_collateral ? Number(row.cash_collateral) : 0,
      stockCollateral: row.non_cash_collateral ? Number(row.non_cash_collateral) : 0,
    });
  }
  return map;
}
