import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import { detectTier } from "@/lib/cash-margin/tags";
import {
  computeSystemBreakupForStrategy,
  computeSystemBreakupCombined,
} from "@/lib/cash-margin/system-breakup";

/**
 * "SYSTEM BREAKUP SCHEME (ABSOLUTE)" for one client (qcode).
 *
 * Returns Equity Book + Derivative Book for each active strategy, plus a
 * Combined total (straight sum — no Python precedent, see
 * docs/assumptions-and-changes-from-krish-logic.md §10).
 *
 * hasEquitySplit is resolved as: clientConfig.gold_pct ?? strategyDefault.gold_pct != null
 * (same gate as Krish's has_equity_split in internal-utils.ts:2153).
 *
 * GET /api/internal/cash-margin/system-breakup?qcode=QAC00071
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const qcode = new URL(request.url).searchParams.get("qcode")?.trim();
  if (!qcode) {
    return NextResponse.json({ error: "Missing required query param: qcode" }, { status: 400 });
  }

  try {
    const [mandates, strategyDefaultsList] = await Promise.all([
      prisma.client_strategy_configs.findMany({
        where: {
          qcode,
          OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }],
        },
        select: {
          account_name: true,
          strategy: true,
          exposure_tag_suffix: true,
          gold_pct: true,
        },
        orderBy: { strategy: "asc" },
      }),
      prisma.strategy_defaults.findMany({
        select: { strategy_name: true, gold_pct: true },
      }),
    ]);

    if (mandates.length === 0) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }

    const defaultMap = new Map(strategyDefaultsList.map((d) => [d.strategy_name, d]));
    const ms = await loadMastersheet(qcode);

    const scopes = mandates.map((m) => {
      const tier = detectTier(m.strategy);
      const resolvedGoldPct =
        (m.gold_pct != null ? Number(m.gold_pct) : null) ??
        (defaultMap.get(m.strategy)?.gold_pct != null
          ? Number(defaultMap.get(m.strategy)!.gold_pct)
          : null);
      const hasEquitySplit = resolvedGoldPct != null;

      return computeSystemBreakupForStrategy(
        ms,
        m.strategy,
        m.exposure_tag_suffix,
        tier,
        hasEquitySplit,
      );
    });

    const combined = computeSystemBreakupCombined(scopes);

    const byStrategy: Record<string, (typeof scopes)[number]> = {};
    for (const scope of scopes) {
      byStrategy[scope.strategy] = scope;
    }

    return NextResponse.json({
      qcode,
      accountName: mandates[0].account_name,
      strategies: mandates.map((m) => m.strategy),
      mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      systemBreakup: { combined, byStrategy },
    });
  } catch (e) {
    console.error("[cash-margin/system-breakup] failed:", e);
    return NextResponse.json(
      { error: "Failed to build system breakup", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
