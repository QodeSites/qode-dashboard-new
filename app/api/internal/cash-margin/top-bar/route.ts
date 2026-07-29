import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { isXtsMandate } from "@/lib/cash-margin/tags";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import {
  computeConsolidated,
  computeConsolidatedExcessCash,
  detectConsolidatedTier,
} from "@/lib/cash-margin/consolidated";
import { resolveRatioConfig, type StrategyOverrides } from "@/lib/cash-margin/config";

/**
 * Single-client KPI top-bar: Account Value / Liquidcase / Holdings /
 * Cash+Liquidcase / Excess Cash for one qcode, combined across all of that
 * client's active strategies (e.g. a QYE+++QAW++ mandate).
 *
 * Ported from managed_accounts_analysis/common_report_utils.py's
 * compute_consolidated() + compute_excess_cash() -- reads the no-prefix
 * ("whole client") mastersheet tags. No Alert Status column: there is no
 * per-client (as opposed to per-strategy) rollup of the tiered Margin
 * Health thresholds anywhere yet -- see docs/cash-margin-client-dashboard-plan.md.
 *
 * The Excess Cash ideal-holdings % comes from client_strategy_configs ??
 * strategy_defaults' equity_pct for this client's first active (non-XTS)
 * strategy -- optionally overridden via `overrides` in the POST body
 * (request-scoped only, never persisted). See
 * docs/thresholds-to-table-and-post-override-plan.md.
 *
 * POST /api/internal/cash-margin/top-bar
 * body: { qcode: string, overrides?: { [strategy: string]: { equityPct?, ... } } }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const qcode: string | undefined = body?.qcode?.trim();
  const overrides: StrategyOverrides | undefined = body?.overrides;
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
        equity_pct: true,
        cash_pct: true,
        lc_pct: true,
        derivative_pct: true,
      },
      orderBy: { strategy: "asc" },
    });

    if (mandates.length === 0) {
      return NextResponse.json(
        { error: `No active mandate found for qcode "${qcode}"` },
        { status: 404 },
      );
    }

    const nonXtsMandates = mandates.filter((m) => !isXtsMandate(m.exposure_tag_suffix));
    const primaryMandate = nonXtsMandates[0] ?? mandates[0];

    const strategyDefault = await prisma.strategy_defaults.findUnique({
      where: { strategy_name: primaryMandate.strategy },
      select: { equity_pct: true, cash_pct: true, lc_pct: true, derivative_pct: true },
    });

    const ms = await loadMastersheet(qcode);
    const summary = computeConsolidated(ms);
    const tier = detectConsolidatedTier(
      nonXtsMandates.length ? nonXtsMandates.map((m) => m.strategy) : mandates.map((m) => m.strategy),
    );
    const ratios = resolveRatioConfig(primaryMandate.strategy, primaryMandate, strategyDefault ?? undefined, overrides);
    const ec = computeConsolidatedExcessCash(summary, ratios.equityPct);

    const av = summary.accountValue;
    const pct = (part: number) => (av ? (part / av) * 100 : 0);

    return NextResponse.json({
      qcode,
      accountName: mandates[0].account_name,
      strategies: mandates.map((m) => m.strategy),
      tier,
      mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      kpis: {
        accountValue: { value: av, pct: 100 },
        liquidcase: { value: summary.liquidcase, pct: pct(summary.liquidcase) },
        holdings: { value: ec.holdingsValue, pct: pct(ec.holdingsValue) },
        cashPlusLiquidcase: { value: ec.currentCash, pct: pct(ec.currentCash) },
        excessCash: { value: ec.excessCash, pct: pct(ec.excessCash) },
      },
    });
  } catch (e) {
    console.error("[cash-margin/top-bar] failed:", e);
    return NextResponse.json(
      { error: "Failed to build top-bar KPIs", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
