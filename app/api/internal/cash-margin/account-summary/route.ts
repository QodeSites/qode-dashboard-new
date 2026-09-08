import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import {
  computeAccountSummaryCombined,
  computeAccountSummaryForStrategy,
} from "@/lib/cash-margin/consolidated";
import { loadCatalog } from "@/lib/cash-margin/catalog";
import { loadHoldings } from "@/lib/cash-margin/holdings";
import { loadResolvedRatios, hasConfiguredLeaves, Diagnostics } from "@/lib/cash-margin/ratio-resolver";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";
import { PROP_STRATEGY } from "@/lib/cash-margin/tags";

/**
 * "ACCOUNT SUMMARY - Combined / {strategy}" for one client (qcode) -- Account
 * Value, Mutual Funds, Equity Stock Holdings, Bond Stock Holdings,
 * Liquidcase, Cash, Holdings (MF+EQ+Bond), Cash + Liquidcase (the 8 flat
 * rows), plus Gold/Low Vol/Momentum's dynamic sub-breakdown
 * (`equitySleeves`, walked from config_catalog -- see
 * lib/cash-margin/consolidated.ts's AccountSummarySleeveRow and
 * docs/cash-margin-dynamic-api-contract.md). Combined always uses the
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
 * body: { qcode: string, asOfDate?: string }
 *
 * `asOfDate` (YYYY-MM-DD) pins the mastersheet read in this response to a
 * historical date instead of always-latest (see
 * lib/cash-margin/mastersheet.ts's loadMastersheet). Omit for "latest."
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { data, error: parseError } = await parseCashMarginBody(request, { requireQcode: true });
  if (parseError) return parseError;
  const { asOfDate } = data;
  const qcode = data.qcode as string;

  try {
    // Mandate selection must honour asOfDate -- see system-breakup/route.ts.
    const referenceDate = asOfDate ?? new Date();
    const mandates = await prisma.client_strategy_configs.findMany({
      where: {
        qcode,
        strategy: { not: PROP_STRATEGY },
        effective_from: { lte: referenceDate },
        OR: [{ effective_to: null }, { effective_to: { gte: referenceDate } }],
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

    const [ms, catalog, holdings] = await Promise.all([
      loadMastersheet(qcode, asOfDate),
      loadCatalog(),
      loadHoldings(qcode, asOfDate),
    ]);
    const diagnostics = new Diagnostics();
    const splitStrategies = new Set<string>();

    const byStrategy: Record<string, ReturnType<typeof computeAccountSummaryForStrategy>> = {};
    for (const m of mandates) {
      // Same split gate as system-breakup.ts -- required here even though
      // this route never builds targets, because console_equity_holdings
      // has no strategy dimension: an ungated strategy would re-report
      // another strategy's sleeve position. See consolidated.ts's
      // buildEquitySleeves doc comment.
      const ratios = await loadResolvedRatios(m.strategy, qcode, referenceDate);
      const hasEquitySplit = hasConfiguredLeaves(catalog, "equity_book", "ideal", ratios);
      if (hasEquitySplit) splitStrategies.add(m.strategy);

      byStrategy[m.strategy] = computeAccountSummaryForStrategy(
        ms,
        m.strategy,
        m.exposure_tag_suffix,
        catalog,
        holdings,
        hasEquitySplit,
        diagnostics,
      );
    }
    const combined = computeAccountSummaryCombined(
      ms,
      mandates.map((m) => m.strategy),
      catalog,
      holdings,
      splitStrategies,
      diagnostics,
    );

    return NextResponse.json({
      qcode,
      accountName: mandates[0].account_name,
      strategies: mandates.map((m) => m.strategy),
      mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      summary: { combined, byStrategy },
      diagnostics: diagnostics.items,
    });
  } catch (e) {
    console.error("[cash-margin/account-summary] failed:", e);
    return NextResponse.json(
      { error: "Failed to build account summary", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
