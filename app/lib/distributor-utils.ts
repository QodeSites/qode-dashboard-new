import { prisma } from "@/lib/prisma";
import { calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";
// PortfolioApi from sarla-utils is intentionally NOT used because
// PortfolioApi.GET fetches ALL Sarla schemes (5-6), which is slow.
// Instead, getQyePlusStats queries master_sheet directly for Scheme B only.

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
const SARLA_QCODE = "QAC00041"; // Sarla Performance Fibers (Scheme B → QYE+)

export type DistributorStrategy = "qye" | "qaw" | "qyeplus";

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
 *
 * If `pnlByDate` is provided (a map from YYYY-MM-DD → daily pnl), the
 * function also populates the `cash` field in each month with the summed
 * rupee P&L for that bucket, and `totalCash` with the year sum. If omitted,
 * cash values stay at "0" (appropriate for synthetic spliced curves like
 * QAW++ where per-day pnl has no single meaning).
 */
function computeMonthlyPnl(
  sortedCurve: NavPoint[],
  pnlByDate?: Record<string, number>
): DerivedMonthlyPnl {
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

  // Inject rupee cash P&L per bucket if daily pnl data is available.
  if (pnlByDate) {
    const cashByMonth: Record<string, number> = {};
    for (const date of Object.keys(pnlByDate)) {
      const yearMonth = date.substring(0, 7);
      cashByMonth[yearMonth] = (cashByMonth[yearMonth] ?? 0) + pnlByDate[date];
    }

    for (const yearMonth of Object.keys(cashByMonth)) {
      const year = yearMonth.substring(0, 4);
      const monthIndex = parseInt(yearMonth.substring(5, 7), 10) - 1;
      const monthName = MONTH_NAMES[monthIndex];
      const cashValue = cashByMonth[yearMonth];

      if (!result[year]) {
        result[year] = {
          months: {},
          totalPercent: 0,
          totalCash: 0,
          totalCapitalInOut: 0,
        };
      }
      if (!result[year].months[monthName]) {
        // Rare: a month with pnl data but no NAV bucket. Add a stub row so
        // the cash value still shows up in the P&L table.
        result[year].months[monthName] = {
          percent: "-",
          cash: cashValue.toFixed(2),
          capitalInOut: "0",
        };
      } else {
        result[year].months[monthName].cash = cashValue.toFixed(2);
      }
    }

    // Recompute year cash total as a simple sum of month cash values.
    for (const year of Object.keys(result)) {
      let yearCash = 0;
      for (const month of Object.values(result[year].months)) {
        const c = parseFloat(month.cash);
        if (!Number.isNaN(c)) yearCash += c;
      }
      result[year].totalCash = yearCash;
    }
  }

  return result;
}

/**
 * Same idea as the monthly variant, but bucketed by year-quarter.
 *
 * Supports the same optional `pnlByDate` parameter — when provided, cash
 * values are populated per quarter from the summed daily pnl.
 */
function computeQuarterlyPnl(
  sortedCurve: NavPoint[],
  pnlByDate?: Record<string, number>
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

  // Inject rupee cash P&L per quarter bucket if daily pnl data is available.
  if (pnlByDate) {
    const cashByQuarter: Record<string, number> = {};
    for (const date of Object.keys(pnlByDate)) {
      const year = date.substring(0, 4);
      const month = parseInt(date.substring(5, 7), 10);
      const quarter = Math.ceil(month / 3);
      const qKey = `${year}-Q${quarter}`;
      cashByQuarter[qKey] = (cashByQuarter[qKey] ?? 0) + pnlByDate[date];
    }

    for (const key of Object.keys(cashByQuarter)) {
      const year = key.substring(0, 4);
      const quarter = parseInt(key.substring(6, 7), 10); // "2024-Q1" → 1
      const qKey = `q${quarter}` as "q1" | "q2" | "q3" | "q4";
      const cashValue = cashByQuarter[key];

      if (!result[year]) {
        result[year] = {
          percent: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
          cash: { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" },
          yearCash: "0",
        };
      }
      result[year].cash[qKey] = cashValue.toFixed(2);
    }

    // Year cash total = sum of non-dash quarter cash values.
    for (const year of Object.keys(result)) {
      let yearCash = 0;
      for (const q of ["q1", "q2", "q3", "q4"] as const) {
        const raw = result[year].cash[q];
        if (raw === "-") continue;
        const parsed = parseFloat(raw);
        if (!Number.isNaN(parsed)) yearCash += parsed;
      }
      result[year].cash.total = yearCash.toFixed(2);
      result[year].yearCash = yearCash.toFixed(2);
    }
  }

  return result;
}

/**
 * Take a NAV curve and produce all the derived metrics that the dashboard
 * components need: drawdown curve, return %, max drawdown %, trailing
 * returns, monthly P&L %, quarterly P&L %.
 *
 * If `pnlByDate` is provided, monthlyPnl and quarterlyPnl will also contain
 * real rupee cash values; otherwise cash values stay at "0" (for synthetic
 * spliced curves where daily pnl has no single meaning).
 */
function computeDerivedMetrics(
  curve: NavPoint[],
  pnlByDate?: Record<string, number>
): DerivedMetrics {
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

  const monthlyPnl = computeMonthlyPnl(sorted, pnlByDate);
  const quarterlyPnl = computeQuarterlyPnl(sorted, pnlByDate);

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
  // Deepti Parikh (QAC00022) is a registry-driven bifurcated client whose data
  // lives in bifurcated_master_sheet_test. Read it through the same engine the
  // regular dashboard uses (identical code path to getQawStats for Dinesh) so
  // the distributor view tracks the live bifurcated data. The previous
  // master_sheet pipeline read the generic "Total Portfolio Value" tag, which
  // is no longer updated for QYE schemes after the bifurcation refactor (froze
  // ~2026-06-03) — the fresh QYE++ data is in bifurcated_master_sheet_test.
  const engine = getEngineForQcode(QYE_QCODE);
  if (!engine) {
    throw new Error(
      `Distributor view: no engine registered for QYE qcode ${QYE_QCODE}`
    );
  }
  const res = await engine.handleGET(
    new Request(`http://internal.distributor/?qcode=${QYE_QCODE}`)
  );
  if (!res.ok) {
    throw new Error(
      `Distributor view: bifurcated engine returned ${res.status} for QYE`
    );
  }
  const json = await res.json();
  // Single-strategy client → exactly one scheme key in the response.
  const entry = Object.values(json)[0] as
    | {
        data: ReturnType<typeof formatPortfolioStats>;
        metadata: { inceptionDate?: string | null; dataAsOfDate?: string | null };
      }
    | undefined;
  if (!entry?.data?.equityCurve) {
    throw new Error("Distributor view: QYE++ payload missing equityCurve");
  }

  const stats = entry.data;
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
 * QYE+ branch — Sarla Performance Fibers, Scheme B (QAC00041).
 *
 * Queries master_sheet directly instead of going through PortfolioApi.GET
 * (which would fetch all ~5 Sarla schemes with dozens of queries and is
 * very slow).
 *
 * IMPORTANT: Sarla Scheme B splits its data across TWO system tags — NAV
 * and pnl live under "Total Portfolio Value" while capital_in_out and
 * portfolio_value live under "Zerodha Total Portfolio". This mirrors the
 * behavior in sarla-utils.ts:
 *
 *   - getHistoricalData (line 2256) → getSystemTag → "Total Portfolio Value"
 *   - getTotalProfit    (line 2213) → getSystemTag → "Total Portfolio Value"
 *   - getAmountDeposited (line 1928) → "Zerodha Total Portfolio" (override)
 *   - getLatestExposure  (line 2045) → "Zerodha Total Portfolio" (override)
 *
 * If we used a single tag for everything, the rupee values would be
 * wildly wrong (zero or nonsense). Four focused queries are correct and
 * still fast because they all target the same qcode.
 */
export async function getQyePlusStats(): Promise<DistributorPortfolioResponse> {
  const SCHEME_B_NAV_TAG = "Total Portfolio Value"; // NAV + pnl
  const SCHEME_B_RUPEE_TAG = "Zerodha Total Portfolio"; // deposits + portfolio_value

  // Run the three queries in parallel — they're independent.
  // Note: pnl comes from the navRows query (same system_tag), so we don't
  // need a separate profitSum aggregate — totalProfit is computed client-side
  // from navRows.pnl values. This is cheaper and ensures the total always
  // matches the per-month cash values derived from the same rows.
  // Read from bifurcated_master_sheet_test: Sarla's Scheme B was migrated there
  // (sarla-utils SCHEME_BIFURCATED_SOURCE, identity tag names), and master_sheet
  // stopped updating these tags after the bifurcation refactor (~2026-06-03).
  // The qcode and tag names are identical across both tables, so this is a
  // straight table swap.
  const [navRows, depositSum, latestExposureRow] = await Promise.all([
    prisma.bifurcated_master_sheet_test.findMany({
      where: {
        qcode: SARLA_QCODE,
        system_tag: SCHEME_B_NAV_TAG,
      },
      select: { date: true, nav: true, pnl: true },
      orderBy: { date: "asc" },
    }),
    prisma.bifurcated_master_sheet_test.aggregate({
      where: {
        qcode: SARLA_QCODE,
        system_tag: SCHEME_B_RUPEE_TAG,
        capital_in_out: { not: null },
      },
      _sum: { capital_in_out: true },
    }),
    prisma.bifurcated_master_sheet_test.findFirst({
      where: {
        qcode: SARLA_QCODE,
        system_tag: SCHEME_B_RUPEE_TAG,
      },
      orderBy: { date: "desc" },
      select: { portfolio_value: true, date: true },
    }),
  ]);

  if (navRows.length === 0) {
    throw new Error(
      "Distributor view: no Scheme B data found for Sarla (QAC00041)"
    );
  }

  // NAV curve: only rows where nav is populated.
  const navCurve: NavPoint[] = navRows
    .filter((r) => r.nav !== null)
    .map((r) => ({
      date: r.date.toISOString().split("T")[0],
      value: Number(r.nav) || 0,
    }));

  if (navCurve.length === 0) {
    throw new Error(
      "Distributor view: no Scheme B NAV entries for Sarla (QAC00041)"
    );
  }

  // Per-date pnl map (for month/quarter cash P&L) + total.
  const pnlByDate: Record<string, number> = {};
  let totalProfit = 0;
  for (const r of navRows) {
    if (r.pnl === null) continue;
    const dateStr = r.date.toISOString().split("T")[0];
    const pnlVal = Number(r.pnl) || 0;
    pnlByDate[dateStr] = (pnlByDate[dateStr] ?? 0) + pnlVal;
    totalProfit += pnlVal;
  }

  const amountDeposited = Number(depositSum._sum.capital_in_out) || 0;
  const currentExposure = latestExposureRow
    ? Number(latestExposureRow.portfolio_value) || 0
    : 0;

  // Compute percentage + cash metrics from the NAV curve and per-day pnl.
  const derived = computeDerivedMetrics(navCurve, pnlByDate);

  const stats: ReturnType<typeof formatPortfolioStats> = {
    amountDeposited: amountDeposited.toFixed(2),
    currentExposure: currentExposure.toFixed(2),
    return: derived.returnPct.toFixed(2),
    totalProfit: totalProfit.toFixed(2),
    trailingReturns: derived.trailingReturns,
    drawdown: derived.maxDrawdownPct.toFixed(2),
    equityCurve: navCurve,
    drawdownCurve: derived.drawdownCurve,
    quarterlyPnl: derived.quarterlyPnl,
    monthlyPnl: derived.monthlyPnl,
    cashFlows: [],
    strategyName: "QYE+ Strategy",
  };

  const { inceptionDate, dataAsOfDate } = getCurveDateRange(navCurve);

  return {
    data: stats,
    metadata: {
      strategyName: "QYE+ Strategy",
      displayName: "Client C",
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
  // Resolve the registry-driven engine for Dinesh's qcode and call handleGET
  // directly with a synthetic Request. Same code path as a real
  // /api/bifurcated-portfolio?qcode=QAC00053 hit, just skipping the HTTP and
  // auth layers (we're already server-side and trusted here).
  const dineshEngine = getEngineForQcode(QAW_DINESH_QCODE);
  if (!dineshEngine) {
    throw new Error(
      `Distributor view: no engine registered for Dinesh qcode ${QAW_DINESH_QCODE}`
    );
  }
  const fakeReq = new Request(
    `http://internal.distributor/?qcode=${QAW_DINESH_QCODE}`
  );
  const dineshRes = await dineshEngine.handleGET(fakeReq);
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

  // ---- 3. Splice point -------------------------------------------------------
  // Per team requirement: use Krishnan's data up to and including 2026-01-20,
  // then switch to Dinesh from 2026-01-21 onwards. Dinesh's scheme inception
  // is 2026-01-12, but his first ~8 days are skipped in favour of Krishnan's
  // data for that period.
  const spliceDate = "2026-01-21";

  // ---- 4. Prepare Dinesh's curve segments ------------------------------------
  const dineshCurveRaw: { date: string; nav: number }[] =
    dineshScheme.data.equityCurve;
  const dineshInception: string = dineshScheme.metadata.inceptionDate;

  // Dinesh's data FROM the splice date onwards (what we actually splice in).
  const dineshCurveClean = dineshCurveRaw.filter((p) => p.date >= spliceDate);
  if (dineshCurveClean.length === 0) {
    throw new Error(
      "Distributor view: Dinesh's QAW++ curve is empty after splice-date filter"
    );
  }

  // Dinesh's data BEFORE the splice date (between his real inception and the
  // splice). We need the last entry here as the rebase anchor — it's the
  // "previous day" NAV so that Dinesh's daily return on the splice date is
  // preserved in the rebased curve.
  const dineshPreSplice = dineshCurveRaw.filter(
    (p) => p.date >= dineshInception && p.date < spliceDate
  );
  if (dineshPreSplice.length === 0) {
    throw new Error(
      "Distributor view: Dinesh has no data between his inception and the splice date"
    );
  }
  const dineshPrevDayNav = dineshPreSplice[dineshPreSplice.length - 1].nav;

  // ---- 5. Find Krishnan's last NAV strictly before the splice date -----------
  const krishnanBeforeSplice = krishnanCurve.filter((p) => p.date < spliceDate);
  if (krishnanBeforeSplice.length === 0) {
    throw new Error(
      `Distributor view: Krishnan has no NAV history before ${spliceDate}`
    );
  }
  const krishnanLastNavBeforeSplice =
    krishnanBeforeSplice[krishnanBeforeSplice.length - 1].value;

  if (dineshPrevDayNav <= 0) {
    throw new Error(
      "Distributor view: Dinesh's pre-splice NAV is not positive — cannot rebase"
    );
  }

  // ---- 6. Rebase multiplier -------------------------------------------------
  // Divide by Dinesh's NAV on the day BEFORE the splice (not the splice day
  // itself). This ensures Dinesh's actual daily return on the splice date is
  // carried into the rebased curve:
  //
  //   rebased_jan21 = dinesh_jan21 × (krishnan_jan20 / dinesh_jan20)
  //                 = krishnan_jan20 × (dinesh_jan21 / dinesh_jan20)
  //                 = Krishnan's last value + Dinesh's real daily PnL
  const rebaseMultiplier = krishnanLastNavBeforeSplice / dineshPrevDayNav;

  // ---- 7. Build the rebased Dinesh segment in the standard {date, value}
  //         shape so it can be concatenated with Krishnan's curve.
  const dineshRebased: NavPoint[] = dineshCurveClean.map((p) => ({
    date: p.date,
    value: p.nav * rebaseMultiplier,
  }));

  // ---- 8. Splice into a single continuous NAV curve --------------------------
  const splicedCurve: NavPoint[] = [...krishnanBeforeSplice, ...dineshRebased];

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
