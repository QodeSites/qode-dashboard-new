/**
 * lib/cash-margin/request-utils.ts
 * Shared POST-body parsing for the cash-margin routes -- qcode, overrides,
 * and asOfDate all follow the same shape across account-summary,
 * system-breakup, margin-requirements, debt-equity, top-bar, and alerts.
 * Centralized here so a field like `asOfDate` (see below) only needs to
 * change in one place instead of all six route files.
 */
import { NextResponse } from "next/server";
import type { StrategyOverrides } from "./config";

export interface ParsedCashMarginBody {
  qcode?: string;
  overrides?: StrategyOverrides;
  /**
   * Pins every read in the response (mandate selection, mastersheet,
   * holdings, resolved ratios) to a historical date instead of always-latest
   * -- see mastersheet.ts's loadMastersheet and ratio-resolver.ts's
   * loadResolvedRatios. Omit for "latest."
   */
  asOfDate?: Date;
  /**
   * A caller-supplied NIFTY LTP, standing in for Python's live/manual Nifty
   * ATM figure. Drives Put Protection's contractValue in
   * margin-requirements.ts (= niftyLtpOverride * niftyLotSize); without
   * it, Put Protection falls back to 0. niftyLotSize itself comes from
   * global_config.NIFTY_LOT_SIZE (lib/cash-margin/global-config.ts), not
   * this override.
   */
  niftyLtpOverride?: number;
  /**
   * Session-scoped override for the two global_config constants
   * (lib/cash-margin/global-config.ts's NIFTY_LOT_SIZE / PUT_PROTECTION_AVG_PRICE_PER_QTY),
   * consumed by margin-requirements.ts and inputs.ts (and page2.ts, which
   * calls both). Same contract as every other override in this codebase --
   * request-scoped only, never persisted. Distinct from
   * PUT /api/internal/global-config, which actually writes the DB value
   * permanently for an internal admin.
   */
  globalOverrides?: { niftyLotSize?: number; avgPricePerQty?: number };
}

/**
 * Parses and validates the common cash-margin POST body fields.
 * Returns `{ error }` (a ready-to-return NextResponse) on a validation
 * failure, or `{ data }` on success -- never both.
 */
export async function parseCashMarginBody(
  request: Request,
  opts: { requireQcode: boolean },
): Promise<{ data: ParsedCashMarginBody; error?: undefined } | { data?: undefined; error: NextResponse }> {
  const body = await request.json().catch(() => null);

  const qcode: string | undefined = body?.qcode?.trim() || undefined;
  if (opts.requireQcode && !qcode) {
    return { error: NextResponse.json({ error: "Missing required field: qcode" }, { status: 400 }) };
  }

  const overrides: StrategyOverrides | undefined = body?.overrides;
  if (overrides) {
    for (const [strategy, ov] of Object.entries(overrides)) {
      const eq = ov?.equityPct;
      const debt = ov?.debtPct;
      // equityPct and debtPct must sum to 1 -- Equity Book funds + Derivative
      // Book (Cash + Liquid Case) funds must exhaust Account Value. Overriding
      // only one silently leaves the other at its stale DB value (config.ts's
      // `?? 1 - equityPct` fallback never fires in practice, since debt_pct
      // already has a stored row for every strategy today -- see QAC00110,
      // which hit exactly this: equity_pct overridden to 0.65, debt_pct
      // independently set to 0.35, but back when this read `derivative_pct`
      // instead of `debt_pct` the two silently disagreed, 0.65+0.3=0.95), so
      // the two would stop summing to 100% with no error -- reject the
      // request instead of computing a wrong total.
      if ((eq !== undefined) !== (debt !== undefined)) {
        return {
          error: NextResponse.json(
            {
              error: `overrides.${strategy}: equityPct and debtPct must be supplied together -- ` +
                `providing only one leaves the other at its stale DB value and the two would no longer sum to 100% of Account Value`,
            },
            { status: 400 },
          ),
        };
      }
      if (eq !== undefined && debt !== undefined && Math.abs(eq + debt - 1) > 1e-6) {
        return {
          error: NextResponse.json(
            {
              error: `overrides.${strategy}: equityPct (${eq}) + debtPct (${debt}) = ${eq + debt}, must equal 1`,
            },
            { status: 400 },
          ),
        };
      }
    }
  }

  let asOfDate: Date | undefined;
  if (body?.asOfDate) {
    asOfDate = new Date(body.asOfDate);
    if (Number.isNaN(asOfDate.getTime())) {
      return { error: NextResponse.json({ error: "Invalid asOfDate" }, { status: 400 }) };
    }
  }

  let niftyLtpOverride: number | undefined;
  if (body?.niftyLtp !== undefined && body?.niftyLtp !== null && body?.niftyLtp !== "") {
    niftyLtpOverride = Number(body.niftyLtp);
    if (Number.isNaN(niftyLtpOverride) || niftyLtpOverride <= 0) {
      return { error: NextResponse.json({ error: "Invalid niftyLtp" }, { status: 400 }) };
    }
  }

  let globalOverrides: ParsedCashMarginBody["globalOverrides"];
  if (body?.globalOverrides && typeof body.globalOverrides === "object") {
    const { niftyLotSize, avgPricePerQty } = body.globalOverrides;
    globalOverrides = {};
    if (niftyLotSize !== undefined && niftyLotSize !== null && niftyLotSize !== "") {
      const parsed = Number(niftyLotSize);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return { error: NextResponse.json({ error: "Invalid globalOverrides.niftyLotSize" }, { status: 400 }) };
      }
      globalOverrides.niftyLotSize = parsed;
    }
    if (avgPricePerQty !== undefined && avgPricePerQty !== null && avgPricePerQty !== "") {
      const parsed = Number(avgPricePerQty);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return { error: NextResponse.json({ error: "Invalid globalOverrides.avgPricePerQty" }, { status: 400 }) };
      }
      globalOverrides.avgPricePerQty = parsed;
    }
  }

  return { data: { qcode, overrides, asOfDate, niftyLtpOverride, globalOverrides } };
}
