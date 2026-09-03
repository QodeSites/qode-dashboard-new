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
   * TEMPORARY -- pins loadMastersheet() to a historical date, for verifying
   * against frozen managed_accounts_analysis Excels. Remove this field (and
   * the asOfDate plumbing in mastersheet.ts/margin-requirements.ts/alerts.ts)
   * once that verification is done; not meant to be a permanent feature.
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
