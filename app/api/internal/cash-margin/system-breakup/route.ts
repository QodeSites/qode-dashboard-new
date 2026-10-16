import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { loadMastersheet } from "@/lib/cash-margin/mastersheet";
import { detectTier, PROP_STRATEGY } from "@/lib/cash-margin/tags";
import {
  computeSystemBreakupForStrategy,
  computeSystemBreakupCombined,
} from "@/lib/cash-margin/system-breakup";
import { loadCatalog } from "@/lib/cash-margin/catalog";
import { loadHoldings } from "@/lib/cash-margin/holdings";
import { loadResolvedRatios, withOverrides, Diagnostics } from "@/lib/cash-margin/ratio-resolver";
import { parseCashMarginBody } from "@/lib/cash-margin/request-utils";

/**
 * "SYSTEM BREAKUP SCHEME (ABSOLUTE)" for one client (qcode).
 *
 * Returns Equity Book + Derivative Book for each active strategy, plus a
 * Combined total (straight sum — no Python precedent, see
 * docs/assumptions-and-changes-from-krish-logic.md §10). Rows come from
 * walking config_catalog under equity_pct/debt_pct (see
 * lib/cash-margin/system-breakup.ts) -- NOT the old fixed Gold/Momentum/Low
 * Vol / Cash/Liquid Case shape. See docs/cash-margin-dynamic-api-contract.md
 * for the response shape frontend should build against.
 *
 * `hasEquitySplit` is now resolved from whether ANY equity_book leaf has a
 * resolved value for this strategy -- gated on resolved values, not catalog
 * shape (config_catalog is global; sleeve config is per-strategy). Same
 * intent as the old `gold_pct != null` gate, generalized past one hardcoded
 * field.
 *
 * `overrides` in the POST body is applied via ratio-resolver.ts's
 * withOverrides() -- same request-scoped-only contract as before, covering
 * the same flat fields (equityPct/cashPct/lcPct/debtPct/goldPct/
 * momentumPct/lowvolPct). Deeper legs (momentum50/momidmtm, liquidadd/
 * liquidcase) are not overridable this way, matching that feature's
 * original reach.
 *
 * POST /api/internal/cash-margin/system-breakup
 * body: { qcode: string, overrides?: { [strategy: string]: { equityPct?, ... } }, asOfDate?: string }
 *
 * `asOfDate` (YYYY-MM-DD) pins the mastersheet read in this response to a
 * historical date instead of always-latest (see
 * lib/cash-margin/mastersheet.ts's loadMastersheet). Omit for "latest." NOTE: config_catalog's
 * ratios are not yet date-aware in the same way -- see
 * docs/cash-margin-dynamic-api-contract.md §7.
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
    // Mandate selection must honour asOfDate, not always "now" -- otherwise a
    // historical query pins the mastersheet to the past while still selecting
    // today's mandates, silently mixing two dates. Matches page2.ts /
    // inputs.ts / margin-requirements.ts / alerts.ts / client-registry.ts,
    // which already bound BOTH effective_from and effective_to this way.
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

    const [catalog, holdings, ms] = await Promise.all([
      loadCatalog(),
      loadHoldings(qcode, asOfDate),
      loadMastersheet(qcode, asOfDate),
    ]);
    const diagnostics = new Diagnostics();

    const scopes = await Promise.all(
      mandates.map(async (m) => {
        const tier = detectTier(m.strategy);
        const rawRatios = await loadResolvedRatios(m.strategy, qcode, referenceDate);
        const ratios = withOverrides(rawRatios, overrides);

        return computeSystemBreakupForStrategy(
          ms,
          m.strategy,
          m.exposure_tag_suffix,
          tier,
          catalog,
          ratios,
          holdings,
          diagnostics,
        );
      }),
    );

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
      diagnostics: diagnostics.items,
    });
  } catch (e) {
    console.error("[cash-margin/system-breakup] failed:", e);
    return NextResponse.json(
      { error: "Failed to build system breakup", detail: (e as Error).message },
      { status: 500 },
    );
  }
}
