/**
 * lib/cash-margin/global-config.ts
 * Reader for global_config -- a key/value table of client-independent
 * constants (previously just RISK_FREE_RATE). Akash added NIFTY_LOT_SIZE
 * and PUT_PROTECTION_AVG_PRICE_PER_QTY rows (2026-07-29), so neither is a
 * hardcoded TS literal anymore -- both margin-requirements.ts and inputs.ts
 * read them from here now, sharing one source (see
 * docs/assumptions-and-changes-from-krish-logic.md §14b).
 *
 * Keys are matched by TRIMMED string, not exact equality: the live
 * PUT_PROTECTION_AVG_PRICE_PER_QTY row has a trailing space in its key
 * (`"PUT_PROTECTION_AVG_PRICE_PER_QTY "`), which would silently fail a
 * `findUnique({ where: { key: ... } })` exact match. Read-only code can't
 * fix the stray whitespace in the DB row, so the reader tolerates it
 * instead -- fetches all rows (the table has 3) and compares trimmed keys.
 */
import { prisma } from "@/lib/prisma";

/** Only used if a row is ever missing entirely -- defensive, not the normal path. */
const FALLBACKS = {
  NIFTY_LOT_SIZE: 65,
  PUT_PROTECTION_AVG_PRICE_PER_QTY: 450,
} as const;

async function getGlobalConfigNumber(key: keyof typeof FALLBACKS): Promise<number> {
  const rows = await prisma.global_config.findMany();
  const row = rows.find((r) => r.key.trim() === key);
  const fallback = FALLBACKS[key];
  if (!row) {
    console.warn(`[cash-margin] global_config.${key} missing -- falling back to ${fallback}.`);
    return fallback;
  }
  const parsed = Number(row.value);
  if (!Number.isFinite(parsed)) {
    console.warn(`[cash-margin] global_config.${key} = "${row.value}" is not a number -- falling back to ${fallback}.`);
    return fallback;
  }
  return parsed;
}

export async function getNiftyLotSize(): Promise<number> {
  return getGlobalConfigNumber("NIFTY_LOT_SIZE");
}

export async function getPutProtectionAvgPricePerQty(): Promise<number> {
  return getGlobalConfigNumber("PUT_PROTECTION_AVG_PRICE_PER_QTY");
}
