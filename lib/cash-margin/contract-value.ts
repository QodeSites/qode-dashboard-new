/**
 * lib/cash-margin/contract-value.ts
 * Put Protection "exposure per lot" source: cm_contract_value (Postgres).
 *
 * No Python precedent -- margin_report.py computes exposure_per_lot as
 * `nifty_atm * NIFTY_LOT_SIZE` from a live/manual Nifty ATM figure.
 * cm_contract_value.contract_value already holds that same product
 * (Nifty ATM x lot size) per qcode/date, so no live market-data fetch is
 * needed here. Confirmed against the pasted target table (65 * 450 *
 * (protected_val / contract_value) reproduces the reference Put Protection
 * cash figure exactly).
 */
import { prisma } from "@/lib/prisma";

/**
 * Latest cm_contract_value.contract_value per qcode. Returns null for a
 * qcode with no row yet (Put Protection required-margin falls back to 0 for
 * that mandate rather than dividing by zero).
 */
export async function loadContractValues(qcodes: string[]): Promise<Map<string, number | null>> {
  const unique = Array.from(new Set(qcodes));
  const map = new Map<string, number | null>();
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
    map.set(qcode, row?.contract_value ? Number(row.contract_value) : null);
  }
  return map;
}
