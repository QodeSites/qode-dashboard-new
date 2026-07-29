import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import {
  computeAccountSummaryCombined,
  computeAccountSummaryForStrategy,
} from "@/lib/cash-margin/consolidated";

/**
 * "ACCOUNT SUMMARY - Combined / {strategy}" for one client (qcode) -- Account
 * Value, Mutual Funds, Equity Stock Holdings, Gold, Low Vol, Momentum, Bond
 * Stock Holdings, Liquidcase, Cash, Holdings (MF+EQ+Bond), Cash + Liquidcase,
 * each with % of that scope's own Account Value. Combined always uses the
 * no-prefix rollup (not a sum of the per-strategy legs, per
 * excess_cash_report.py) and is returned unconditionally, even for
 * single-strategy clients.
 *
 * Works for every client -- call once per qcode (see /api/internal/cash-margin/client-list
 * for the full qcode list).
 *
 * This table has no threshold/ratio inputs of its own -- POST is used only
 * for shape consistency with the rest of the cash-margin routes (see
 * docs/thresholds-to-table-and-post-override-plan.md); `overrides` in the
 * body is accepted but unused.
 *
 * POST /api/internal/cash-margin/account-summary
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
      select: { account_name: true, strategy: true, exposure_tag_suffix: true },
      orderBy: { strategy: "asc" },
    });

    if (mandates.length === 0) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }

    const ms = await loadMastersheet(qcode);

    const byStrategy: Record<string, ReturnType<typeof computeAccountSummaryForStrategy>> = {};
    for (const m of mandates) {
      byStrategy[m.strategy] = computeAccountSummaryForStrategy(
        ms,
        m.strategy,
        m.exposure_tag_suffix,
      );
    }
    const combined = computeAccountSummaryCombined(
      ms,
      mandates.map((m) => m.strategy),
    );

    return NextResponse.json({
      qcode,
      accountName: mandates[0].account_name,
      strategies: mandates.map((m) => m.strategy),
      mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      summary: { combined, byStrategy },
    });
  } catch (e) {
    console.error("[cash-margin/account-summary] failed:", e);
    return NextResponse.json(
      { error: "Failed to build account summary", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
