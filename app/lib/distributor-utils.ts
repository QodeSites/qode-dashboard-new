import { prisma } from "@/lib/prisma";
import { calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";
import { DineshApi } from "@/app/lib/bifurcated-portfolio-utils";

/**
 * Distributor view data utilities.
 *
 * The distributor view is a masked, single-strategy showcase that reuses
 * existing dashboard components. Two strategies are supported:
 *
 *   - QYE++ : Deepti Parikh's account (QAC00022), shown as-is with the
 *             client identity scrubbed.
 *
 *   - QAW++ : A spliced curve combining Krishnan Iyer's account (QAC00055)
 *             as the long-history baseline with Dinesh Goel's QAW++ scheme
 *             (QAC00053, scheme inception 2026-01-12) taking over from his
 *             start date. Implemented in a later phase.
 *
 * Both branches return the standard Stats payload that StatsCards,
 * RevenueChart, and PnlTable already consume — plus a `displayConfig` field
 * the view page reads to decide which surfaces to show or hide for that
 * particular strategy.
 */

// Hardcoded account identifiers for the distributor strategies.
// Querying the accounts table at request time would also work, but the
// distributor surface is intentionally fixed to these specific accounts and
// hardcoding makes the dependency explicit.
const QYE_QCODE = "QAC00022"; // Deepti Parikh
const QAW_KRISHNAN_QCODE = "QAC00055"; // Krishnan Iyer
const QAW_DINESH_QCODE = "QAC00053"; // Dinesh Goel (bifurcated; QAW++ scheme only)

export type DistributorStrategy = "qye" | "qaw";

export interface DistributorPortfolioResponse {
  data: ReturnType<typeof formatPortfolioStats>;
  metadata: {
    strategyName: string;
    displayName: string; // Header text for the page
    inceptionDate: string | null;
    dataAsOfDate: string | null;
    lastUpdated: string;
  };
}

/**
 * Look up an account's account_type / broker / strategy from the accounts
 * table. We do this rather than hardcoding because the broker/strategy
 * columns are the source of truth and the team can change them without
 * updating distributor code.
 */
async function loadAccountMeta(qcode: string): Promise<{
  qcode: string;
  account_type: string;
  broker: string;
  strategy?: string;
}> {
  const account = await prisma.accounts.findFirst({
    where: { qcode },
    select: { qcode: true, account_type: true, broker: true, strategy: true },
  });
  if (!account) {
    throw new Error(`Distributor view: account ${qcode} not found`);
  }
  if (!account.account_type || !account.broker) {
    throw new Error(
      `Distributor view: account ${qcode} is missing account_type or broker`
    );
  }
  return {
    qcode: account.qcode,
    account_type: account.account_type,
    broker: account.broker,
    strategy: account.strategy ?? undefined,
  };
}

/**
 * Extract inception date and data-as-of date from an equity curve, mirroring
 * the helper used in /api/portfolio/route.ts so distributor responses carry
 * the same metadata shape.
 */
function getCurveDateRange(
  equityCurve: { date: string; value: number }[]
): { inceptionDate: string | null; dataAsOfDate: string | null } {
  if (!equityCurve || equityCurve.length === 0) {
    return { inceptionDate: null, dataAsOfDate: null };
  }
  const sorted = [...equityCurve].sort((a, b) => a.date.localeCompare(b.date));
  return {
    inceptionDate: sorted[0].date,
    dataAsOfDate: sorted[sorted.length - 1].date,
  };
}

// ============================================================================
// Math helpers — used to derive Stats from a NAV curve.
//
// These are needed for the QAW++ branch, which builds a synthetic continuous
// NAV curve by splicing two real accounts (Krishnan + Dinesh). The standard
// portfolio-utils pipeline doesn't expose these as standalone helpers — it
// computes them inside calculatePortfolioMetrics from raw DB rows. So we
// re-implement the math here, working off a NAV curve directly.
//
// Formulas match the conventions documented in CLAUDE.md:
//   - Returns < 365 days: ((finalNav / initialNav) - 1) * 100
//   - Returns >= 365 days: (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100
// ============================================================================

interface NavPoint {
  date: string; // ISO date "YYYY-MM-DD"
  value: number;
}

interface DerivedTrailingReturns {
  fiveDays: string;
  tenDays: string;
  fifteenDays: string;
  oneMonth: string;
  threeMonths: string;
  sixMonths: string;
  oneYear: string;
  twoYears: string;
  fiveYears: string;
  sinceInception: string;
  MDD: string;
  currentDD: string;
}

interface DerivedMonthlyPnl {
  [year: string]: {
    months: {
      [month: string]: { percent: string; cash: string; capitalInOut: string };
    };
    totalPercent: number;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface DerivedQuarterlyPnl {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface DerivedMetrics {
  drawdownCurve: { date: string; value: number }[];
  returnPct: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  trailingReturns: DerivedTrailingReturns;
  monthlyPnl: DerivedMonthlyPnl;
  quarterlyPnl: DerivedQuarterlyPnl;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function emptyTrailingReturns(): DerivedTrailingReturns {
  return {
    fiveDays: "-",
    tenDays: "-",
    fifteenDays: "-",
    oneMonth: "-",
    threeMonths: "-",
    sixMonths: "-",
    oneYear: "-",
    twoYears: "-",
    fiveYears: "-",
    sinceInception: "-",
    MDD: "-",
    currentDD: "-",
  };
}

/**
 * Compute return for a window ending at the curve's last date and beginning
 * `windowDays` calendar days earlier. Picks the latest NAV at-or-before the
 * target date (handles weekends/holidays/gaps the same way the standard
 * portfolio-utils helper `getNavEntriesAgo` does).
 *
 * Applies CAGR for windows >= 365 days, absolute return otherwise.
 */
function trailingReturnForWindow(
  sortedCurve: NavPoint[],
  windowDays: number
): number | null {
  if (sortedCurve.length < 2) return null;
  const last = sortedCurve[sortedCurve.length - 1];
  const lastTime = new Date(last.date).getTime();
  const targetTime = lastTime - windowDays * MS_PER_DAY;

  // Walk backward to find the latest entry on or before targetTime.
  let startNav: number | null = null;
  for (let i = sortedCurve.length - 1; i >= 0; i--) {
    if (new Date(sortedCurve[i].date).getTime() <= targetTime) {
      startNav = sortedCurve[i].value;
      break;
    }
  }
  if (startNav === null || startNav <= 0) return null;

  if (windowDays >= 365) {
    return (Math.pow(last.value / startNav, 365 / windowDays) - 1) * 100;
  }
  return ((last.value / startNav) - 1) * 100;
}

function computeAllTrailingReturns(
  sortedCurve: NavPoint[],
  maxDrawdownPct: number,
  currentDrawdownPct: number
): DerivedTrailingReturns {
  const result = emptyTrailingReturns();
  if (sortedCurve.length < 2) {
    result.MDD = maxDrawdownPct.toFixed(2);
    result.currentDD = currentDrawdownPct.toFixed(2);
    return result;
  }

  const periods: Array<[keyof DerivedTrailingReturns, number]> = [
    ["fiveDays", 5],
    ["tenDays", 10],
    ["fifteenDays", 15],
    ["oneMonth", 30],
    ["threeMonths", 90],
    ["sixMonths", 180],
    ["oneYear", 365],
    ["twoYears", 730],
    ["fiveYears", 1825],
  ];

  for (const [key, days] of periods) {
    const ret = trailingReturnForWindow(sortedCurve, days);
    if (ret !== null) {
      result[key] = ret.toFixed(2);
    }
  }

  // Since-inception: from the first NAV in the curve to the last.
  const first = sortedCurve[0];
  const last = sortedCurve[sortedCurve.length - 1];
  if (first.value > 0) {
    const days =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
      MS_PER_DAY;
    let sinceInception: number;
    if (days >= 365) {
      sinceInception =
        (Math.pow(last.value / first.value, 365 / days) - 1) * 100;
    } else {
      sinceInception = ((last.value / first.value) - 1) * 100;
    }
    result.sinceInception = sinceInception.toFixed(2);
  }

  result.MDD = maxDrawdownPct.toFixed(2);
  result.currentDD = currentDrawdownPct.toFixed(2);
  return result;
}

/**
 * Bucket the NAV curve by year-month and compute each month's percent return.
 *
 * For the first month, the "previous month's last NAV" is taken to be the
 * curve's first NAV (so the first month captures the full first-month return
 * from inception). Subsequent months chain off the prior month's last NAV.
 *
 * Year totals are computed by compounding the constituent monthly returns
 * (geometric, not arithmetic).
 */
function computeMonthlyPercentPnl(sortedCurve: NavPoint[]): DerivedMonthlyPnl {
  if (sortedCurve.length === 0) return {};

  // For each YYYY-MM bucket, remember the LAST NAV seen in that bucket.
  const lastNavByMonth = new Map<
    string,
    { lastNav: number; year: string; monthIndex: number }
  >();

  for (const point of sortedCurve) {
    const yearMonth = point.date.substring(0, 7); // "YYYY-MM"
    const year = yearMonth.substring(0, 4);
    const monthIndex = parseInt(yearMonth.substring(5, 7), 10) - 1;
    lastNavByMonth.set(yearMonth, { lastNav: point.value, year, monthIndex });
  }

  const orderedMonths = Array.from(lastNavByMonth.keys()).sort();
  const result: DerivedMonthlyPnl = {};

  let prevLastNav = sortedCurve[0].value;

  for (const key of orderedMonths) {
    const entry = lastNavByMonth.get(key)!;
    const monthReturn =
      prevLastNav > 0 ? ((entry.lastNav / prevLastNav) - 1) * 100 : 0;

    if (!result[entry.year]) {
      result[entry.year] = {
        months: {},
        totalPercent: 0,
        totalCash: 0,
        totalCapitalInOut: 0,
      };
    }
    result[entry.year].months[MONTH_NAMES[entry.monthIndex]] = {
      percent: monthReturn.toFixed(2),
      cash: "0",
      capitalInOut: "0",
    };
    prevLastNav = entry.lastNav;
  }

  // Compound the monthly returns into a year total (geometric).
  for (const year of Object.keys(result)) {
    const monthlyReturns = Object.values(result[year].months).map((m) =>
      parseFloat(m.percent)
    );
    const yearTotal =
      (monthlyReturns.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;
    result[year].totalPercent = parseFloat(yearTotal.toFixed(2));
  }

  return result;
}

/**
 * Same idea as the monthly variant, but bucketed by year-quarter.
 */
function computeQuarterlyPercentPnl(
  sortedCurve: NavPoint[]
): DerivedQuarterlyPnl {
  if (sortedCurve.length === 0) return {};

  const lastNavByQuarter = new Map<
    string,
    { lastNav: number; year: string; quarter: number }
  >();

  for (const point of sortedCurve) {
    const year = point.date.substring(0, 4);
    const month = parseInt(point.date.substring(5, 7), 10);
    const quarter = Math.ceil(month / 3); // 1..4
    lastNavByQuarter.set(`${year}-Q${quarter}`, {
      lastNav: point.value,
      year,
      quarter,
    });
  }

  const orderedQuarters = Array.from(lastNavByQuarter.keys()).sort();
  const result: DerivedQuarterlyPnl = {};

  let prevLastNav = sortedCurve[0].value;

  for (const key of orderedQuarters) {
    const entry = lastNavByQuarter.get(key)!;
    const quarterReturn =
      prevLastNav > 0 ? ((entry.lastNav / prevLastNav) - 1) * 100 : 0;

    if (!result[entry.year]) {
      result[entry.year] = {
        percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
        cash: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
        yearCash: "0",
      };
    }
    const qKey = `q${entry.quarter}` as "q1" | "q2" | "q3" | "q4";
    result[entry.year].percent[qKey] = quarterReturn.toFixed(2);
    prevLastNav = entry.lastNav;
  }

  // Compound the quarterly returns into a year total (geometric).
  for (const year of Object.keys(result)) {
    const quarters = (["q1", "q2", "q3", "q4"] as const)
      .map((q) => result[year].percent[q])
      .filter((v) => v !== "-")
      .map((v) => parseFloat(v));
    if (quarters.length > 0) {
      const yearTotal =
        (quarters.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;
      result[year].percent.total = yearTotal.toFixed(2);
    }
  }

  return result;
}

/**
 * Take a NAV curve and produce all the derived metrics that the dashboard
 * components need: drawdown curve, return %, max drawdown %, trailing
 * returns, monthly P&L %, quarterly P&L %.
 */
function computeDerivedMetrics(curve: NavPoint[]): DerivedMetrics {
  if (curve.length === 0) {
    return {
      drawdownCurve: [],
      returnPct: 0,
      maxDrawdownPct: 0,
      currentDrawdownPct: 0,
      trailingReturns: emptyTrailingReturns(),
      monthlyPnl: {},
      quarterlyPnl: {},
    };
  }

  // Defensive sort: callers should pass sorted curves but don't rely on it.
  const sorted = [...curve].sort((a, b) => a.date.localeCompare(b.date));

  // Drawdown curve: for each point, compute distance below the running max.
  const drawdownCurve: { date: string; value: number }[] = [];
  let runningMax = -Infinity;
  for (const p of sorted) {
    if (p.value > runningMax) runningMax = p.value;
    const dd = runningMax > 0 ? ((p.value / runningMax) - 1) * 100 : 0;
    drawdownCurve.push({ date: p.date, value: dd });
  }

  // Max drawdown is the most negative point on the drawdown curve.
  // Standard portfolio-utils stores this as a positive magnitude (e.g.
  // "2.53"), so we negate for consistency with the rest of the dashboard.
  const minDD = drawdownCurve.reduce((min, p) => Math.min(min, p.value), 0);
  const maxDrawdownPct = Math.abs(minDD);
  const currentDrawdownPct = Math.abs(
    drawdownCurve[drawdownCurve.length - 1].value
  );

  // Total return (CAGR if >365d, absolute otherwise)
  const firstNav = sorted[0].value;
  const lastNav = sorted[sorted.length - 1].value;
  const firstTime = new Date(sorted[0].date).getTime();
  const lastTime = new Date(sorted[sorted.length - 1].date).getTime();
  const totalDays = (lastTime - firstTime) / MS_PER_DAY;
  let returnPct = 0;
  if (firstNav > 0) {
    if (totalDays >= 365) {
      returnPct = (Math.pow(lastNav / firstNav, 365 / totalDays) - 1) * 100;
    } else {
      returnPct = ((lastNav / firstNav) - 1) * 100;
    }
  }

  const trailingReturns = computeAllTrailingReturns(
    sorted,
    maxDrawdownPct,
    currentDrawdownPct
  );

  const monthlyPnl = computeMonthlyPercentPnl(sorted);
  const quarterlyPnl = computeQuarterlyPercentPnl(sorted);

  return {
    drawdownCurve,
    returnPct,
    maxDrawdownPct,
    currentDrawdownPct,
    trailingReturns,
    monthlyPnl,
    quarterlyPnl,
  };
}

/**
 * QYE++ branch — Deepti Parikh (QAC00022).
 *
 * Reuses the standard portfolio-utils pipeline against a single qcode and
 * scrubs all identifying metadata before returning. The page renders a
 * percent-only view (no rupee cards, no cash P&L columns) regardless of what
 * fields are present in the Stats payload — that policy is enforced by the
 * UI components, not by the data layer.
 */
export async function getQyeStats(): Promise<DistributorPortfolioResponse> {
  const accountMeta = await loadAccountMeta(QYE_QCODE);

  const metrics = await calculatePortfolioMetrics([accountMeta]);
  if (!metrics) {
    throw new Error("Distributor view: failed to calculate QYE++ metrics");
  }

  const stats = formatPortfolioStats(metrics);
  const { inceptionDate, dataAsOfDate } = getCurveDateRange(stats.equityCurve);

  // Scrub the strategy name on the formatted stats so nothing client-specific
  // leaks through to the UI.
  stats.strategyName = "QYE++ Strategy";

  return {
    data: stats,
    metadata: {
      strategyName: "QYE++ Strategy",
      displayName: "Client A",
      inceptionDate,
      dataAsOfDate,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * QAW++ branch — Krishnan Iyer baseline + Dinesh Goel splice.
 *
 * Builds a single continuous NAV curve representing the QAW++ strategy,
 * stitched from two real client accounts:
 *
 *   1. Krishnan (QAC00055)  — long-history baseline, fetched via the standard
 *                             ZerodhaManagedStrategy pipeline
 *   2. Dinesh   (QAC00053)  — takes over from his QAW++ scheme inception
 *                             (2026-01-12), fetched via the bifurcated engine
 *                             so we use the exact same code path as the
 *                             regular Dinesh dashboard
 *
 * The splice uses the same rebase pattern as bifurcated-portfolio-utils.ts
 * lines 352-368 (the QTF→QAW++ chaining for Dinesh): multiply Dinesh's curve
 * by `krishnanLastNavBeforeSplice / dineshFirstNav` so his first day chains
 * seamlessly off Krishnan's last day. The result is a single continuous
 * trajectory with no rupee values exposed.
 *
 * All downstream metrics (drawdown, trailing returns, monthly/quarterly P&L)
 * are recomputed from the spliced curve using `computeDerivedMetrics`. Rupee
 * fields on the returned Stats object are populated with placeholder zeros
 * because the distributor UI never reads them.
 */
export async function getQawStats(): Promise<DistributorPortfolioResponse> {
  // ---- 1. Krishnan via the standard pipeline ---------------------------------
  const krishnanMeta = await loadAccountMeta(QAW_KRISHNAN_QCODE);
  const krishnanMetrics = await calculatePortfolioMetrics([krishnanMeta]);
  if (!krishnanMetrics) {
    throw new Error(
      "Distributor view: failed to compute Krishnan QAW++ metrics"
    );
  }
  const krishnanStats = formatPortfolioStats(krishnanMetrics);
  const krishnanCurve = krishnanStats.equityCurve as NavPoint[];

  // ---- 2. Dinesh's QAW++ scheme via the bifurcated engine --------------------
  // Calling DineshApi.GET directly (with a synthetic Request) means we go
  // through the EXACT same code as /api/dinesh-api. Zero risk of divergence
  // from what the regular Dinesh dashboard shows.
  const fakeReq = new Request(
    `http://internal.distributor/?qcode=${QAW_DINESH_QCODE}`
  );
  const dineshRes = await DineshApi.GET(fakeReq);
  if (!dineshRes.ok) {
    throw new Error(
      `Distributor view: bifurcated engine returned ${dineshRes.status} for Dinesh`
    );
  }
  const dineshJson = await dineshRes.json();
  const dineshScheme = dineshJson?.["Scheme QAW++"];
  if (!dineshScheme?.data?.equityCurve || !dineshScheme?.metadata?.inceptionDate) {
    throw new Error(
      "Distributor view: Dinesh's Scheme QAW++ payload is missing equityCurve or inceptionDate"
    );
  }

  // ---- 3. Splice point = Dinesh's QAW++ inception ----------------------------
  // Source this from the metadata (canonical) rather than hardcoding it,
  // so it always tracks DINESH_CONFIG.newStartDate.
  const spliceDate: string = dineshScheme.metadata.inceptionDate;

  // ---- 4. Strip the bifurcated engine's chart-baseline row -------------------
  // The bifurcated engine prepends a synthetic {date: spliceDate-1d, nav: 100}
  // row to its equityCurve for chart display purposes. We don't want it in
  // the splice (it would corrupt the rebase math). Filtering by date >= the
  // real inception cleanly drops it and keeps every real row.
  const dineshCurveRaw: { date: string; nav: number }[] =
    dineshScheme.data.equityCurve;
  const dineshCurveClean = dineshCurveRaw.filter((p) => p.date >= spliceDate);
  if (dineshCurveClean.length === 0) {
    throw new Error(
      "Distributor view: Dinesh's QAW++ curve is empty after baseline strip"
    );
  }

  // ---- 5. Find Krishnan's last NAV strictly before the splice date -----------
  const krishnanBeforeSplice = krishnanCurve.filter((p) => p.date < spliceDate);
  if (krishnanBeforeSplice.length === 0) {
    throw new Error(
      `Distributor view: Krishnan has no NAV history before ${spliceDate}`
    );
  }
  const krishnanLastNavBeforeSplice =
    krishnanBeforeSplice[krishnanBeforeSplice.length - 1].value;
  const dineshFirstNav = dineshCurveClean[0].nav;
  if (dineshFirstNav <= 0) {
    throw new Error(
      "Distributor view: Dinesh's first NAV is not positive — cannot rebase"
    );
  }

  // ---- 6. Rebase multiplier (same pattern as bifurcated:352-368) -------------
  const rebaseMultiplier = krishnanLastNavBeforeSplice / dineshFirstNav;

  // ---- 7. Build the rebased Dinesh segment in the standard {date, value}
  //         shape so it can be concatenated with Krishnan's curve.
  const dineshRebased: NavPoint[] = dineshCurveClean.map((p) => ({
    date: p.date,
    value: p.nav * rebaseMultiplier,
  }));

  // ---- 8. Splice into a single continuous NAV curve --------------------------
  const splicedCurve: NavPoint[] = [...krishnanBeforeSplice, ...dineshRebased];

  // ---- 9. Sanity diagnostic: a clean rebase should make the seam-day delta
  //         essentially zero (Krishnan and Dinesh are in the same strategy).
  //         A large delta would indicate they're not actually tracking each
  //         other, which would be worth knowing.
  const seamPct =
    ((dineshRebased[0].value / krishnanLastNavBeforeSplice) - 1) * 100;
  if (Math.abs(seamPct) > 0.01) {
    console.warn(
      `Distributor QAW++: rebased seam delta = ${seamPct.toFixed(
        4
      )}% (expected ≈0). Krishnan last=${krishnanLastNavBeforeSplice}, Dinesh first(rebased)=${
        dineshRebased[0].value
      }.`
    );
  }

  // ---- 10. Recompute all downstream metrics from the spliced curve ----------
  const derived = computeDerivedMetrics(splicedCurve);

  // ---- 11. Build the Stats payload. Rupee fields get placeholder zeros
  //          because the distributor UI doesn't render them.
  const stats: ReturnType<typeof formatPortfolioStats> = {
    amountDeposited: "0",
    currentExposure: "0",
    return: derived.returnPct.toFixed(2),
    totalProfit: "0",
    trailingReturns: derived.trailingReturns,
    drawdown: derived.maxDrawdownPct.toFixed(2),
    equityCurve: splicedCurve,
    drawdownCurve: derived.drawdownCurve,
    quarterlyPnl: derived.quarterlyPnl,
    monthlyPnl: derived.monthlyPnl,
    cashFlows: [],
    strategyName: "QAW++ Strategy",
  };

  const { inceptionDate, dataAsOfDate } = getCurveDateRange(splicedCurve);

  return {
    data: stats,
    metadata: {
      strategyName: "QAW++ Strategy",
      displayName: "Client B",
      inceptionDate,
      dataAsOfDate,
      lastUpdated: new Date().toISOString(),
    },
  };
}
