import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchTagData,
  fetchBenchmark,
  fetchPnlSnapshot,
  buildTagMetrics,
} from "@/app/lib/internal-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: {
    qcode?: string;
    strategy?: string;
    risk_free_rate?: number;
    as_of?: string;
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

  // Parallel: targeted DB query + Nifty fetch, both cut off at asOf when given
  const [tagData, benchmark] = await Promise.all([
    fetchTagData(
      qcode,
      effectiveStrategy,
      isSoloProp ? [] : allPrefixes,
      asOf ?? undefined,
    ),
    fetchBenchmark(benchmarkStart, asOf ?? new Date()),
  ]);

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

  // Build metrics for every tag
  const tags: Record<string, ReturnType<typeof buildTagMetrics>> = {};
  for (const [tag, nav] of Object.entries(tagData)) {
    tags[tag] = buildTagMetrics(nav, rfr);
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
    ? await fetchPnlSnapshot(qcode, profitTag, resolvedPnlOn)
    : null;

  return NextResponse.json({
    account_name: configs[0].account_name,
    data_as_of: dataAsOf,
    risk_free_rate: rfr,
    benchmark,
    profit_tag: profitTag,
    tags,
    pnl_on: resolvedPnlOn,
    pnl_snapshot: pnlSnapshot,
  });
}
