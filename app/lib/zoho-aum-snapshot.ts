// AUM/Invested snapshot builder for the Zoho sync cron.
// Consumed ONLY by /api/zoho/aum-snapshot.
//
// IMPORTANT: this file does NOT re-implement any calculation. It delegates to
// the exact same engines the dashboard UI uses, so the numbers pushed to Zoho
// always match what the client sees on their dashboard:
//
//   1. Bifurcated registry clients -> getEngineForQcode(qcode).handleGET()
//      (same handler behind /api/bifurcated-portfolio)
//   2. Sarla / Satidham            -> PortfolioApi.GET()
//      (same handler behind /api/sarla-api)
//   3. Normal managed accounts     -> getUserQcodes + calculatePortfolioMetrics
//      + formatPortfolioStats (same pipeline behind /api/portfolio)
//
// The engine handlers take a Request and return a NextResponse, so we call
// them with a synthetic Request and parse the JSON — no session needed, and
// no modification to any existing file.

import { getEngineForQcode } from "./bifurcated-portfolio-utils";
import { BIFURCATED_CLIENTS } from "./bifurcated-clients-registry";
import { PortfolioApi } from "./sarla-utils";
import {
  getUserQcodes,
  calculatePortfolioMetrics,
  formatPortfolioStats,
} from "./portfolio-utils";
import { prisma } from "@/lib/prisma";

export interface AumSnapshotRow {
  icode: string;
  qcode: string;
  currentAum: number;
  investedAmount: number;
  source: "bifurcated" | "sarla_satidham" | "normal";
}

export interface AumSnapshot {
  asOf: string;
  count: number;
  investors: AumSnapshotRow[];
  errors: { icode: string; qcode: string; error: string }[];
}

const SARLA_QCODE = "QAC00041";
const SATIDHAM_QCODE = "QAC00046";
// Satidham's QAW++ data account — surfaced under QAC00046, never directly.
const SATIDHAM_EFFECTIVE_QCODE = "QAC00066";

// Which scheme key of the sarla-api response feeds Zoho (matches
// aum-utils.ts, which reads Scheme B / Scheme QAW++ for these two).
const SARLA_SCHEME = "Scheme B";
const SATIDHAM_SCHEME = "Scheme QAW++";

interface Values {
  currentAum: number;
  investedAmount: number;
  source: AumSnapshotRow["source"];
}

const num = (v: unknown) => Number(v) || 0;

// ---------------------------------------------------------------------------
// 1. Bifurcated registry clients — call the engine's own GET handler
// ---------------------------------------------------------------------------

async function fromBifurcatedEngine(qcode: string): Promise<Values> {
  const engine = getEngineForQcode(qcode);
  if (!engine) throw new Error(`No bifurcated engine for ${qcode}`);

  const req = new Request(
    `http://internal/api/bifurcated-portfolio?qcode=${qcode}`
  );
  const res = await engine.handleGET(req);
  if (!res.ok) throw new Error(`Engine returned ${res.status} for ${qcode}`);
  const results = (await res.json()) as Record<
    string,
    { data: { amountDeposited: string; currentExposure: string } }
  >;

  // Multi-scheme clients: "Total Portfolio" is the aggregate the dashboard
  // headlines. Single-strategy clients: exactly one scheme key.
  const key =
    "Total Portfolio" in results
      ? "Total Portfolio"
      : Object.keys(results)[0];
  const data = results[key]?.data;
  if (!data) throw new Error(`Empty engine response for ${qcode}`);

  return {
    currentAum: num(data.currentExposure),
    investedAmount: num(data.amountDeposited),
    source: "bifurcated",
  };
}

// ---------------------------------------------------------------------------
// 2. Sarla / Satidham — call PortfolioApi.GET (the /api/sarla-api handler)
// ---------------------------------------------------------------------------

async function fromSarlaApi(qcode: string): Promise<Values> {
  const req = new Request(`http://internal/api/sarla-api?qcode=${qcode}`);
  const res = await PortfolioApi.GET(req);
  if (!res.ok) throw new Error(`sarla-api returned ${res.status} for ${qcode}`);
  const results = (await res.json()) as Record<
    string,
    { data: { amountDeposited: string; currentExposure: string } }
  >;

  const scheme = qcode === SATIDHAM_QCODE ? SATIDHAM_SCHEME : SARLA_SCHEME;
  const data = results[scheme]?.data;
  if (!data) {
    throw new Error(`Scheme "${scheme}" missing in sarla-api response`);
  }

  return {
    currentAum: num(data.currentExposure),
    investedAmount: num(data.amountDeposited),
    source: "sarla_satidham",
  };
}

// ---------------------------------------------------------------------------
// 3. Normal clients — same pipeline as /api/portfolio (no filters)
// ---------------------------------------------------------------------------

async function fromPortfolioPipeline(icode: string): Promise<Values | null> {
  const qcodes = await getUserQcodes(icode);
  if (!qcodes || qcodes.length === 0) return null;

  const metrics = await calculatePortfolioMetrics(qcodes);
  if (!metrics) return null;

  const stats = formatPortfolioStats(metrics);
  return {
    currentAum: num(stats.currentExposure),
    investedAmount: num(stats.amountDeposited),
    source: "normal",
  };
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildAumSnapshot(
  filterIcode?: string
): Promise<AumSnapshot> {
  const links = await prisma.pooled_account_users.findMany({
    select: { icode: true, qcode: true },
  });

  const bifQcodes = new Set(BIFURCATED_CLIENTS.map((c) => c.qcode));
  const wanted = filterIcode
    ? links.filter((l) => l.icode === filterIcode)
    : links;

  const errors: AumSnapshot["errors"] = [];

  // qcode-keyed engines are cached so multiple icodes on one pooled account
  // don't recompute; the normal pipeline is per-icode.
  const byQcode = new Map<string, Values>();

  // An icode can be linked to several qcodes (e.g. Satidham's owner also has
  // a regular account). Zoho holds ONE record per icode, so emit exactly one
  // row per icode, preferring the special calculators over the generic one.
  const SOURCE_PRIORITY: Record<AumSnapshotRow["source"], number> = {
    sarla_satidham: 3,
    bifurcated: 2,
    normal: 1,
  };
  const bestByIcode = new Map<string, AumSnapshotRow>();

  for (const { icode, qcode } of wanted) {
    if (qcode === SATIDHAM_EFFECTIVE_QCODE) continue;

    try {
      let values: Values | null = null;

      if (qcode === SARLA_QCODE || qcode === SATIDHAM_QCODE) {
        values = byQcode.get(qcode) ?? (await fromSarlaApi(qcode));
        byQcode.set(qcode, values);
      } else if (bifQcodes.has(qcode)) {
        values = byQcode.get(qcode) ?? (await fromBifurcatedEngine(qcode));
        byQcode.set(qcode, values);
      } else {
        values = await fromPortfolioPipeline(icode);
      }

      if (!values) continue;
      const row: AumSnapshotRow = {
        icode,
        qcode,
        currentAum: round2(values.currentAum),
        investedAmount: round2(values.investedAmount),
        source: values.source,
      };
      const existing = bestByIcode.get(icode);
      if (
        !existing ||
        SOURCE_PRIORITY[row.source] > SOURCE_PRIORITY[existing.source]
      ) {
        bestByIcode.set(icode, row);
      }
    } catch (err) {
      errors.push({
        icode,
        qcode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const investors = [...bestByIcode.values()];

  return {
    asOf: new Date().toISOString(),
    count: investors.length,
    investors,
    errors,
  };
}
