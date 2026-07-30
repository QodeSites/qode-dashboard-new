import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { isXtsMandate } from "@/lib/cash-margin/tags";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import {
  computeConsolidated,
  computeConsolidatedExcessCash,
  detectConsolidatedTier,
  classifyCombinedCashStatus,
} from "@/lib/cash-margin/consolidated";
import { resolveRatioConfig } from "@/lib/cash-margin/config";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

/**
 * Single-client KPI top-bar: Account Value / Liquidcase / Holdings /
 * Cash+Liquidcase / Excess Cash / Alert Status for one qcode, combined
 * across all of that client's active strategies (e.g. a QYE+++QAW++
 * mandate).
 *
 * Ported from managed_accounts_analysis/common_report_utils.py's
 * compute_consolidated() + compute_excess_cash() -- reads the no-prefix
 * ("whole client") mastersheet tags.
 *
 * `alertStatus` is a DIFFERENT concept from alerts.ts's per-strategy
 * HEALTHY/WARNING/ACTION_REQUIRED/UPSIDE/UNAVAILABLE bands -- this is a
 * once-per-client classification of combined Cash % against its own flat
 * 17%/15%/13% bands, ported verbatim from SMA_Dashboard_v12.xlsx's P2 sheet
 * (cell 8K) -- see lib/cash-margin/consolidated.ts's classifyCombinedCashStatus()
 * and docs/assumptions-and-changes-from-krish-logic.md §19.2 for the full
 * writeup, including two oddities ported as-is, not "fixed": the tier
 * ordering looks backwards vs. thresholds.ts's own convention, and
 * "CRITICAL" has no equivalent anywhere else in this codebase.
 *
 * The Excess Cash ideal-holdings % comes from client_strategy_configs ??
 * strategy_defaults' equity_pct for this client's first active (non-XTS)
 * strategy -- optionally overridden via `overrides` in the POST body
 * (request-scoped only, never persisted). See
 * docs/thresholds-to-table-and-post-override-plan.md.
 *
 * POST /api/internal/cash-margin/top-bar
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

    const ms = await loadMastersheet(qcode, asOfDate);
    const summary = computeConsolidated(ms);
    const tier = detectConsolidatedTier(
      nonXtsMandates.length ? nonXtsMandates.map((m) => m.strategy) : mandates.map((m) => m.strategy),
    );
    const ratios = resolveRatioConfig(primaryMandate.strategy, primaryMandate, strategyDefault ?? undefined, overrides);
    const ec = computeConsolidatedExcessCash(summary, ratios.equityPct);

    const av = summary.accountValue;
    const pct = (part: number) => (av ? (part / av) * 100 : 0);
    const combinedCashPct = av ? ec.currentCash / av : 0;
    const alertStatus = classifyCombinedCashStatus(combinedCashPct);

    return NextResponse.json({
      qcode,
      accountName: mandates[0].account_name,
      strategies: mandates.map((m) => m.strategy),
      tier,
      mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      alertStatus,
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
