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
  /** cm_margin_collateral.live_balance -- kept for reference, no longer the
   * Available Cash source for Margin Requirements (§2c) -- see openingBalance. */
  liveBalance: number;
  /** cm_margin_collateral.opening_balance -- Available Cash source for Margin
   * Requirements (§2c), split by exposure share like liquidCollateral/
   * stockCollateral. NOT the same as the mastersheet-residual "Cash" used
   * by Account Summary -- see docs/cash-margin-client-dashboard-plan.md D2.
   * Zerodha only (equity.available.opening_balance); no XTS equivalent. */
  openingBalance: number;
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
    select: {
      qcode: true,
      date: true,
      cash_collateral: true,
      non_cash_collateral: true,
      live_balance: true,
      opening_balance: true,
    },
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
      liveBalance: row.live_balance ? Number(row.live_balance) : 0,
      openingBalance: row.opening_balance ? Number(row.opening_balance) : 0,
    });
  }
  return map;
}

/**
 * Latest cm_contract_value.contract_value per qcode -- a signed daily
 * settlement delta, NOT exposure-per-lot (that's a different, unrelated
 * figure computed from niftyLtp in margin-requirements.ts's Put Protection
 * math -- see that file's header comment for why cm_contract_value was
 * dropped from THAT calculation specifically).
 *
 * Combined with opening_balance this reconstructs Available Cash, standard
 * opening/closing-balance accounting: opening_balance + contract_value =
 * current cash position. Returns 0 (never null) for a qcode with no row --
 * callers add this straight to opening_balance.
 */
export async function loadContractValues(qcodes: string[]): Promise<Map<string, number>> {
  const unique = Array.from(new Set(qcodes));
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const rows = await prisma.cm_contract_value.findMany({
    where: { qcode: { in: unique } },
    select: { qcode: true, date: true, contract_value: true },
    orderBy: { date: "desc" },
  });

  const latestByQcode = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!latestByQcode.has(r.qcode)) latestByQcode.set(r.qcode, r);
  }

  for (const qcode of unique) {
    const row = latestByQcode.get(qcode);
    map.set(qcode, row?.contract_value ? Number(row.contract_value) : 0);
  }
  return map;
}
