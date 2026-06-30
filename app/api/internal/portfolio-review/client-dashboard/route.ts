import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchTagData,
  fetchBenchmark,
  buildTagMetrics,
} from "@/app/lib/internal-utils";

const DEFAULT_RFR = 0.065;

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { qcode?: string; strategy?: string; risk_free_rate?: number };
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

  // Resolve risk-free rate: payload → global_config → fallback
  let rfr = body.risk_free_rate ?? null;
  if (rfr == null) {
    const cfg = await prisma.global_config.findUnique({
      where: { key: "RISK_FREE_RATE" },
    });
    rfr = cfg ? parseFloat(cfg.value) : DEFAULT_RFR;
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

  // Determine profit_tag and benchmark start date based on requested strategy
  let profitTag: string;
  let benchmarkStart: Date;

  if (strategy === "combined") {
    profitTag = "Qode Total Portfolio";
    benchmarkStart = configs.reduce<Date>(
      (min, c) => (c.effective_from < min ? c.effective_from : min),
      configs[0].effective_from,
    );
  } else {
    // Most recent config row for this strategy (for up-to-date suffix)
    const match = [...configs].reverse().find((c) => c.strategy === strategy);
    if (!match) {
      return NextResponse.json(
        { error: `Strategy "${strategy}" not found for this client` },
        { status: 404 },
      );
    }
    profitTag = `${strategy} ${match.profit_tag_suffix}`;
    benchmarkStart = match.effective_from;
  }

  // Parallel: targeted DB query + Nifty fetch
  const [tagData, benchmark] = await Promise.all([
    fetchTagData(qcode, strategy, allPrefixes),
    fetchBenchmark(benchmarkStart, new Date()),
  ]);

  if (Object.keys(tagData).length === 0) {
    return NextResponse.json(
      { error: "No mastersheet data found" },
      { status: 404 },
    );
  }

  // Latest date across all returned tags
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

  return NextResponse.json({
    meta: {
      qcode,
      account_name: configs[0].account_name,
      strategy,
      data_as_of: dataAsOf,
      risk_free_rate: rfr,
    },
    benchmark,
    profit_tag: profitTag,
    tags,
  });
}
