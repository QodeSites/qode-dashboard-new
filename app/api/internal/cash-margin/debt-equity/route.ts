import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import {
  computeDebtEquityForStrategy,
  computeDebtEquityCombined,
} from "@/lib/cash-margin/debt-equity";

/**
 * "DEBT TO EQUITY RATIO" for one client (qcode).
 *
 * Ported from ma-portfolio-review/cash_margin/engine/individual_sheet.py
 * (Table 13) -- a different Python repo than every other cash-margin table,
 * see docs/debt-to-equity-plan.md. No config-gating: every active strategy
 * gets the same 13-row breakup regardless of tier or QAW/QYE.
 *
 * This table has no threshold/ratio inputs of its own -- POST is used only
 * for shape consistency with the rest of the cash-margin routes (see
 * docs/thresholds-to-table-and-post-override-plan.md); `overrides` in the
 * body is accepted but unused.
 *
 * POST /api/internal/cash-margin/debt-equity
 * body: { qcode: string }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const qcode: string | undefined = body?.qcode?.trim();
  if (!qcode) {
    return NextResponse.json({ error: "Missing required field: qcode" }, { status: 400 });
  }

  try {
    const mandates = await prisma.client_strategy_configs.findMany({
      where: {
        qcode,
        OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }],
      },
      select: {
        account_name: true,
        strategy: true,
        exposure_tag_suffix: true,
      },
      orderBy: { strategy: "asc" },
    });

    if (mandates.length === 0) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }

    const ms = await loadMastersheet(qcode);

    const scopes = mandates.map((m) =>
      computeDebtEquityForStrategy(ms, m.strategy, m.exposure_tag_suffix),
    );
    const combined = computeDebtEquityCombined(scopes);

    const byStrategy: Record<string, (typeof scopes)[number]> = {};
    for (const scope of scopes) {
      byStrategy[scope.strategy] = scope;
    }

    return NextResponse.json({
      qcode,
      accountName: mandates[0].account_name,
      strategies: mandates.map((m) => m.strategy),
      mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      debtEquity: { combined, byStrategy },
    });
  } catch (e) {
    console.error("[cash-margin/debt-equity] failed:", e);
    return NextResponse.json(
      { error: "Failed to build debt-equity ratio", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
