import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { buildPage2Dashboard } from "@/lib/cash-margin/page2";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

/**
 * Combined Page 2 (Client Detail) read for one client (qcode) -- Account
 * Summary (§2b), System Breakup (§2d), Margin Requirements (§2c),
 * Debt-to-Equity (§2e), and the Inputs panel (§2f), in a single response,
 * instead of 5 separate requests to each individual route. See
 * lib/cash-margin/page2.ts for how this composes the existing 5 builders
 * without modifying any of them.
 *
 * Same `overrides`/`asOfDate`/`niftyLtp` conventions as every other
 * cash-margin route (request-scoped only, never persisted) -- see
 * docs/cash-margin-api-reference.md.
 *
 * POST /api/internal/cash-margin/page2
 * body: { qcode: string, overrides?: { [strategy: string]: {...} }, asOfDate?: string, niftyLtp?: number }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { data, error: parseError } = await parseCashMarginBody(request, { requireQcode: true });
  if (parseError) return parseError;
  const { overrides, asOfDate, niftyLtpOverride } = data;
  const qcode = data.qcode as string;

  try {
    const result = await buildPage2Dashboard(qcode, overrides, asOfDate, niftyLtpOverride);
    if (!result) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cash-margin/page2] failed:", e);
    return NextResponse.json(
      { error: "Failed to build Page 2 dashboard", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
