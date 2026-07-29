import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import { detectTier } from "@/lib/cash-margin/tags";
import {
  computeSystemBreakupForStrategy,
  computeSystemBreakupCombined,
} from "@/lib/cash-margin/system-breakup";
import { resolveRatioConfig } from "@/lib/cash-margin/config";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

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
 * Equity Book %, Cash sub-%, and the Gold/Momentum/LowVol split come from
 * client_strategy_configs ?? strategy_defaults (equity_pct/cash_pct/lc_pct/
 * derivative_pct/gold_pct/momentum_pct/lowvol_pct) -- optionally overridden
 * per-strategy via `overrides` in the POST body. `overrides` is
 * request-scoped only and is never written back to the DB. See
 * docs/thresholds-to-table-and-post-override-plan.md.
 *
 * POST /api/internal/cash-margin/system-breakup
 * body: { qcode: string, overrides?: { [strategy: string]: { equityPct?, ... } }, asOfDate?: string }
 *
 * `asOfDate` (YYYY-MM-DD) is TEMPORARY -- for verifying against frozen
 * managed_accounts_analysis Excels by pinning the mastersheet read to a
 * historical date instead of always-latest. Remove once done (see
 * lib/cash-margin/mastersheet.ts's loadMastersheet).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { data, error: parseError } = await parseCashMarginBody(request, { requireQcode: true });
  if (parseError) return parseError;
  const { overrides, asOfDate } = data;
  const qcode = data.qcode as string;

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
          equity_pct: true,
          cash_pct: true,
          lc_pct: true,
          derivative_pct: true,
          momentum_pct: true,
          lowvol_pct: true,
        },
        orderBy: { strategy: "asc" },
      }),
      prisma.strategy_defaults.findMany({
        select: {
          strategy_name: true,
          gold_pct: true,
          equity_pct: true,
          cash_pct: true,
          lc_pct: true,
          derivative_pct: true,
          momentum_pct: true,
          lowvol_pct: true,
        },
      }),
    ]);

    if (mandates.length === 0) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }

    const defaultMap = new Map(strategyDefaultsList.map((d) => [d.strategy_name, d]));
    const ms = await loadMastersheet(qcode, asOfDate);

    const scopes = mandates.map((m) => {
      const tier = detectTier(m.strategy);
      const ratios = resolveRatioConfig(m.strategy, m, defaultMap.get(m.strategy), overrides);
      const hasEquitySplit = ratios.goldPct != null;

      return computeSystemBreakupForStrategy(
        ms,
        m.strategy,
        m.exposure_tag_suffix,
        tier,
        hasEquitySplit,
        ratios,
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
