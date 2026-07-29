/**
 * lib/cash-margin/global-config.ts
 * Reader for global_config -- a key/value table of client-independent
 * constants (previously just RISK_FREE_RATE). Akash added a NIFTY_LOT_SIZE
 * row (2026-07-29), so the Put Protection lot size is no longer a hardcoded
 * TS literal -- both margin-requirements.ts and inputs.ts read it from here
 * now, sharing one source (see docs/assumptions-and-changes-from-krish-logic.md
 * §14b). PUT_PROTECTION_AVG_PRICE_PER_QTY (450) stays hardcoded in both
 * files -- no global_config row for it yet.
 */
import { prisma } from "@/lib/prisma";

/** Only used if the NIFTY_LOT_SIZE row is ever missing -- defensive, not the normal path. */
const FALLBACK_NIFTY_LOT_SIZE = 65;

export async function getNiftyLotSize(): Promise<number> {
  const row = await prisma.global_config.findUnique({ where: { key: "NIFTY_LOT_SIZE" } });
  if (!row) {
    console.warn("[cash-margin] global_config.NIFTY_LOT_SIZE missing -- falling back to 65.");
    return FALLBACK_NIFTY_LOT_SIZE;
  }
  const parsed = Number(row.value);
  if (!Number.isFinite(parsed)) {
    console.warn(`[cash-margin] global_config.NIFTY_LOT_SIZE = "${row.value}" is not a number -- falling back to 65.`);
    return FALLBACK_NIFTY_LOT_SIZE;
  }
  return parsed;
}
