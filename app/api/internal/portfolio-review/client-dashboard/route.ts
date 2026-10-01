import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchTagData,
  fetchBenchmark,
  fetchPnlSnapshot,
  buildTagMetrics,
} from "@/app/lib/internal-utils";
import {
  solveXirr,
  fetchBulkXirrInputs,
  xirrSourceTag,
} from "@/app/lib/portfolio-review/xirr";
import {
  rebaseNavWindow,
  anchorDateBefore,
  withAnchorPoint,
} from "@/app/lib/portfolio-review/rebase";
import { toDisplayDate, toSqlDate } from "@/lib/utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: {
    qcode?: string;
    strategy?: string;
    risk_free_rate?: number;
    as_of?: string;
    start_date?: string;
    pnl_on?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { qcode, strategy } = body;
  if (!qcode)
    return NextResponse.json({ error: "qcode is required" }, { status: 400 });
  if (!strategy)
    return NextResponse.json(
      { error: "strategy is required" },
      { status: 400 },
    );

  let asOf: Date | null = null;
  if (body.as_of) {
    asOf = new Date(body.as_of);
    if (isNaN(asOf.getTime())) {
      return NextResponse.json(
        { error: "Invalid as_of date" },
        { status: 400 },
      );
    }
  }

  // Windows the NAV series (since_inception, drawdowns, monthly/yearly
  // returns) AND xirr below when given — same start/end convention as
  // Sub-Strategy Performance's fetchBulkNavSeries. Existing field names are
  // unchanged: since_inception_absolute etc. just reflect the window's own
  // range instead of full account history, same as sub-strategy-performance
  // already does when its own start/end are set.
  let windowStart: Date | null = null;
  if (body.start_date) {
    windowStart = new Date(body.start_date);
    if (isNaN(windowStart.getTime())) {
      return NextResponse.json(
        { error: "Invalid start_date" },
        { status: 400 },
      );
    }
  }

  let pnlOn: Date | null = null;
  if (body.pnl_on) {
    pnlOn = new Date(body.pnl_on);
    if (isNaN(pnlOn.getTime())) {
      return NextResponse.json(
        { error: "Invalid pnl_on date" },
        { status: 400 },
      );
    }
  }

  // Resolve risk-free rate: payload → global_config (no hardcoded fallback)
  let rfr = body.risk_free_rate ?? null;
  if (rfr == null) {
    const cfg = await prisma.global_config.findUnique({
      where: { key: "RISK_FREE_RATE" },
    });
    if (!cfg) {
      return NextResponse.json(
        { error: "RISK_FREE_RATE is not configured in global_config" },
        { status: 503 },
      );
    }
    rfr = parseFloat(cfg.value);
  }

  // All configs for this client (active + historical)
  const configs = await prisma.client_strategy_configs.findMany({
    where: { qcode },
    orderBy: { effective_from: "asc" },
  });
  if (configs.length === 0) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // All known strategy prefixes (needed to identify unbifurcated tags in combined view)
  const allPrefixes = [...new Set(configs.map((c) => c.strategy))];

  // Solo Prop client — no strategy prefix in its tags, so "Prop" and "combined"
  // both mean "just show this client's one config row's own tags"
  const isSoloProp = configs.length === 1 && configs[0].strategy === "Prop";
  const effectiveStrategy = isSoloProp ? "combined" : strategy;
  // Prop reads from master_sheet_test (bare tags, no bifurcation pipeline
  // run for these accounts yet) — see nav-series.ts's `table` param.
  const table = isSoloProp ? "master_sheet_test" : "bifurcated_master_sheet_test";

  // Determine profit_tag and benchmark start date based on requested strategy
  let profitTag: string;
  let benchmarkStart: Date;

  if (effectiveStrategy === "combined") {
    if (isSoloProp) {
      profitTag = configs[0].profit_tag_suffix; // unprefixed — Prop tags carry no strategy prefix
      benchmarkStart = configs[0].effective_from;
    } else {
      profitTag = "Qode Total Portfolio";
      benchmarkStart = configs.reduce<Date>(
        (min, c) => (c.effective_from < min ? c.effective_from : min),
        configs[0].effective_from,
      );
    }
  } else {
    // Most recent config row for this strategy (for up-to-date suffix)
    const match = [...configs]
      .reverse()
      .find((c) => c.strategy === effectiveStrategy);
    if (!match) {
      return NextResponse.json(
        { error: `Strategy "${strategy}" not found for this client` },
        { status: 404 },
      );
    }
    profitTag = `${effectiveStrategy} ${match.profit_tag_suffix}`;
    benchmarkStart = match.effective_from;
  }

  const tagData = await fetchTagData(
    qcode,
    effectiveStrategy,
    isSoloProp ? [] : allPrefixes,
    asOf ?? undefined,
    table,
    windowStart ?? undefined,
  );

  if (Object.keys(tagData).length === 0) {
    return NextResponse.json(
      { error: "No mastersheet data found" },
      { status: 404 },
    );
  }

  // Latest date across all returned tags — reflects the asOf cutoff automatically
  let dataAsOf = "";
  for (const series of Object.values(tagData)) {
    if (series.length > 0) {
      const d = series[series.length - 1].date.toISOString().split("T")[0];
      if (!dataAsOf || d > dataAsOf) dataAsOf = d;
    }
  }

  // Benchmark end date is capped to this account's own last reported day
  // (dataAsOf), not "today" — a withdrawn/closed or stale account whose
  // mastersheet data stopped weeks ago must not be compared against Nifty
  // running all the way to today, which silently hands the benchmark extra
  // performance (positive or negative) the account was never around to
  // earn or avoid. asOf (an explicit caller-given cutoff) still wins over
  // both when given. `benchmark` respects windowStart the same way the tag
  // metrics below do — same field, full account history when no start_date
  // is given, windowed since_inception/xirr/drawdown when it is (matches
  // buildTagMetrics' own since_inception_absolute: no separate "windowed"
  // key).
  //
  // Benchmark start is chosen so Nifty's 100-point lands on the same day as
  // the profit tag's: when the profit tag has a real row before windowStart,
  // both rebase off that t-1 day; otherwise (no window, or the account
  // started inside it) the profit tag's line starts at its first row, so
  // Nifty starts at the trading day just before that row.
  const windowStartStr = windowStart ? toSqlDate(windowStart) : null;
  const profitSeriesRaw = tagData[profitTag] ?? [];
  const profitHasAnchor =
    windowStartStr !== null &&
    profitSeriesRaw.some((p) => toSqlDate(p.date) < windowStartStr);
  const profitFirst = profitSeriesRaw.find(
    (p) => windowStartStr === null || toSqlDate(p.date) >= windowStartStr,
  );
  const benchmarkFrom = profitHasAnchor
    ? windowStart!
    : (profitFirst?.date ?? windowStart ?? benchmarkStart);
  const benchmarkEnd = asOf ?? (dataAsOf ? new Date(dataAsOf) : new Date());
  const fetchedBenchmark = await fetchBenchmark(benchmarkFrom, benchmarkEnd);
  // start_date = first real day of the period (the day after the 100-point),
  // matching each tag's own start_date below rather than the t-1 date.
  const benchmark = fetchedBenchmark
    ? {
        ...fetchedBenchmark,
        start_date: toDisplayDate(
          (fetchedBenchmark.series[1] ?? fetchedBenchmark.series[0]).date,
        ),
      }
    : null;
  const benchDates = fetchedBenchmark?.series.map((p) => p.date) ?? [];

  // XIRR only on client/strategy total rows, solved on that level's
  // exposure tag (xirrSourceTag) — sleeve rows (Gold, PSAR, LONG, ...) get
  // null rather than a copy of the account's XIRR. In the multi-strategy
  // "combined" view the client total rows (Qode Total Portfolio etc.) use
  // the client-level Zerodha Total Portfolio / Total Portfolio Exposure tag,
  // same as Client-Wise Returns' client row.
  const sourceByTag = new Map<string, string | null>();
  for (const tag of Object.keys(tagData)) {
    sourceByTag.set(tag, xirrSourceTag(tag, configs));
  }
  const xirrSources = [
    ...new Set([...sourceByTag.values()].filter((t): t is string => t !== null)),
  ];
  const xirrInputsMap = xirrSources.length
    ? await fetchBulkXirrInputs(
        xirrSources.map((tag) => ({ qcode, tag })),
        asOf ?? undefined,
        windowStart ?? undefined,
        table,
      )
    : new Map();
  const xirrBySource = new Map<string, number | null>();
  for (const source of xirrSources) {
    const inputs = xirrInputsMap.get(`${qcode}|${source}`);
    xirrBySource.set(
      source,
      inputs ? solveXirr(inputs.flows, inputs.asOfDate, inputs.finalValue) : null,
    );
  }
  const xirrFor = (tag: string) => {
    const source = sourceByTag.get(tag);
    return source ? (xirrBySource.get(source) ?? null) : null;
  };

  // Every tag's chart line starts at 100 on its t-1 day, same as Nifty.
  // Windowed: rebase off the tag's real row before windowStart (fetchTagData
  // prepends it); drawdown is recomputed from that baseline instead of the
  // DB's full-history column. Full history: metrics stay on the raw series
  // (DB drawdown is already correct there) — only the plotted series gets
  // the 100-point, dated on Nifty's trading day before the tag's first row.
  const tags: Record<string, ReturnType<typeof buildTagMetrics>> = {};
  for (const [tag, nav] of Object.entries(tagData)) {
    if (nav.length === 0) continue;
    if (windowStart) {
      const rebased = rebaseNavWindow(
        nav,
        windowStart,
        asOf ?? nav[nav.length - 1].date,
      );
      // Only a pre-window anchor row, nothing inside the window.
      if (!rebased) continue;
      const anchorDate = rebased.anchorDate
        ? toSqlDate(rebased.anchorDate)
        : anchorDateBefore(rebased.points[0].date, benchDates);
      tags[tag] = withAnchorPoint(
        buildTagMetrics(rebased.points, rfr, xirrFor(tag)),
        anchorDate,
      );
    } else {
      const metrics = buildTagMetrics(nav, rfr, xirrFor(tag));
      const first = nav[0];
      const base = first.prev_nav != null && first.prev_nav > 0 ? first.prev_nav : first.nav;
      tags[tag] = withAnchorPoint(
        {
          ...metrics,
          series: metrics.series.map((p) => ({ ...p, nav: (p.nav / base) * 100 })),
        },
        anchorDateBefore(first.date, benchDates),
      );
    }
  }

  if (Object.keys(tags).length === 0) {
    return NextResponse.json(
      { error: "No mastersheet data found in the selected window" },
      { status: 404 },
    );
  }

  // pnl_on not given → profit tag's OWN latest date, not the global dataAsOf.
  // dataAsOf is the max across every tag; if another tag's series runs a day ahead
  // of the profit tag's, that date has no row for the profit tag — exact match
  // would come back empty. Using this tag's own last date avoids that mismatch.
  const profitTagSeries = tagData[profitTag];
  const profitTagLastDate = profitTagSeries?.length
    ? profitTagSeries[profitTagSeries.length - 1].date
    : null;
  const resolvedPnlOnDate = pnlOn ?? profitTagLastDate;
  const resolvedPnlOn = resolvedPnlOnDate
    ? resolvedPnlOnDate.toISOString().split("T")[0]
    : null;

  const pnlSnapshot = resolvedPnlOn
    ? await fetchPnlSnapshot(qcode, profitTag, resolvedPnlOn, table)
    : null;

  // dataAsOf/resolvedPnlOn stay ISO everywhere above (benchmarkEnd's
  // `new Date(dataAsOf)`, fetchPnlSnapshot's `date = $2::date`) — only
  // reformatted here, at the point they're handed to the frontend as
  // raw display text.
  return NextResponse.json({
    account_name: configs[0].account_name,
    data_as_of: toDisplayDate(dataAsOf),
    risk_free_rate: rfr,
    benchmark,
    profit_tag: profitTag,
    tags,
    pnl_on: resolvedPnlOn ? toDisplayDate(resolvedPnlOn) : null,
    pnl_snapshot: pnlSnapshot,
  });
}
