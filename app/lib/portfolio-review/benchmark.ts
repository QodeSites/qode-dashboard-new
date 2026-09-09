import { round, MS, mean, std } from "@/lib/utils";
import { MONTHS } from "@/app/lib/portfolio-review/returns";
import type { MonthlyReturn } from "@/app/lib/portfolio-review/returns";

export interface BenchmarkResult {
  since_inception: number | null;
  max_drawdown: number | null;
  current_drawdown: number | null;
  series: { date: string; nav: number; drawdown: number }[];
}

const NIFTY_URL =
  "https://qode360-backend.qodeinvest.com/api/v1/returns/indices/?downloadNav=true";

export async function fetchNiftyRawSeries(
  startDate: Date,
  endDate: Date,
): Promise<{ date: string; nav: number }[] | null> {
  const buf = new Date(startDate);
  buf.setDate(buf.getDate() - 10);
  const endStr = endDate.toISOString().split("T")[0];

  const res = await fetch(NIFTY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: buf.toISOString().split("T")[0],
      endDate: endStr,
      indices: ["NIFTY 50"],
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const raw: { date: string; nav: number }[] = json?.data?.data?.["NIFTY 50"];
  return Array.isArray(raw) && raw.length > 0 ? raw : null;
}

export function computeBenchmarkMetrics(
  raw: { date: string; nav: number }[],
  startDate: Date,
  endDate: Date,
): BenchmarkResult | null {
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  const earlier = raw.filter((p) => p.date < startStr);
  if (earlier.length === 0) return null;
  const ref = earlier[earlier.length - 1];
  const refPrice = ref.nav;

  const clipped = raw.filter((p) => p.date >= ref.date && p.date <= endStr);
  if (clipped.length === 0) return null;

  const last = clipped[clipped.length - 1];
  const days =
    (new Date(last.date).getTime() - new Date(ref.date).getTime()) / MS;
  const si =
    days < 365
      ? last.nav / refPrice - 1
      : (last.nav / refPrice) ** (365 / days) - 1;

  let peak = refPrice,
    maxDD = 0;
  const series = clipped.map((p) => {
    if (p.nav > peak) peak = p.nav;
    const dd = peak > 0 ? (p.nav - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
    return {
      date: p.date,
      nav: parseFloat(((p.nav / refPrice) * 100).toFixed(4)),
      drawdown: round(dd, 4)!,
    };
  });

  return {
    since_inception: round(si, 4),
    max_drawdown: round(maxDD, 4),
    current_drawdown: series[series.length - 1].drawdown,
    series,
  };
}

export async function fetchBenchmark(
  startDate: Date,
  endDate: Date,
): Promise<BenchmarkResult | null> {
  try {
    const raw = await fetchNiftyRawSeries(startDate, endDate);
    if (!raw) return null;
    return computeBenchmarkMetrics(raw, startDate, endDate);
  } catch {
    return null;
  }
}

export function toMonthlyReturnMap(
  series: { date: string; nav: number }[],
): Map<string, number> {
  const monthEnd = new Map<string, number>();
  for (const p of series) monthEnd.set(p.date.slice(0, 7), p.nav);
  const keys = [...monthEnd.keys()].sort();

  const out = new Map<string, number>();
  for (let i = 1; i < keys.length; i++) {
    const prev = monthEnd.get(keys[i - 1])!;
    const cur = monthEnd.get(keys[i])!;
    if (prev > 0) out.set(keys[i], (cur / prev - 1) * 100);
  }
  return out;
}

export function alignMonthlyReturns(
  portfolioMonthly: MonthlyReturn[],
  benchmarkMonthly: Map<string, number>,
): { port: number[]; bm: number[] } {
  const port: number[] = [];
  const bm: number[] = [];
  for (const m of portfolioMonthly) {
    const key = `${m.year}-${String(MONTHS.indexOf(m.month) + 1).padStart(2, "0")}`;
    const bmVal = benchmarkMonthly.get(key);
    if (bmVal !== undefined) {
      port.push(m.return_pct);
      bm.push(bmVal);
    }
  }
  return { port, bm };
}

function covariance(a: number[], b: number[]): number {
  if (a.length < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}

export interface CaptureRatios {
  upside_capture: number | null;
  downside_capture: number | null;
}

export function calcCaptureRatios(port: number[], bm: number[]): CaptureRatios {
  const empty: CaptureRatios = { upside_capture: null, downside_capture: null };
  if (port.length < 3 || bm.length !== port.length) return empty;

  const up: number[] = [];
  const upBm: number[] = [];
  const down: number[] = [];
  const downBm: number[] = [];
  for (let i = 0; i < bm.length; i++) {
    if (bm[i] > 0) {
      up.push(port[i]);
      upBm.push(bm[i]);
    } else if (bm[i] < 0) {
      down.push(port[i]);
      downBm.push(bm[i]);
    }
  }
  if (upBm.length < 1 || downBm.length < 1) return empty;

  const bmUpAvg = mean(upBm);
  const bmDownAvg = mean(downBm);
  return {
    upside_capture:
      Math.abs(bmUpAvg) > 1e-8 ? round(mean(up) / bmUpAvg, 4) : null,
    downside_capture:
      Math.abs(bmDownAvg) > 1e-8 ? round(mean(down) / bmDownAvg, 4) : null,
  };
}

export interface ExtraRatios {
  tracking_error: number | null;
  information_ratio: number | null;
  alpha: number | null;
  beta: number | null;
}

export function calcExtraRatios(port: number[], bm: number[]): ExtraRatios {
  const empty: ExtraRatios = {
    tracking_error: null,
    information_ratio: null,
    alpha: null,
    beta: null,
  };
  if (port.length < 6 || bm.length !== port.length) return empty;

  const p = port.map((v) => v / 100);
  const b = bm.map((v) => v / 100);
  const diff = p.map((v, i) => v - b[i]);
  const te = std(diff) * Math.sqrt(12);

  let tracking_error: number | null = null;
  let information_ratio: number | null = null;
  if (te > 0) {
    tracking_error = round(te, 4);
    information_ratio = round(((mean(p) - mean(b)) * Math.sqrt(12)) / te, 3);
  }

  let alpha: number | null = null;
  let beta: number | null = null;
  const bmVar = std(b) ** 2;
  if (bmVar > 0) {
    const betaVal = covariance(p, b) / bmVar;
    beta = round(betaVal, 3);
    alpha = round((mean(p) - betaVal * mean(b)) * 12, 4);
  }

  return { tracking_error, information_ratio, alpha, beta };
}
