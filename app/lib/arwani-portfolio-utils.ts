import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import fs from "fs";
import path from "path";

// ==================== Interfaces ====================

interface CashFlow {
  date: string;
  amount: number;
  dividend: number;
}

interface QuarterlyPnL {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface MonthlyPnL {
  [year: string]: {
    months: {
      [month: string]: { percent: string; cash: string; capitalInOut: string };
    };
    totalPercent: number;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface PortfolioData {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: Record<string, number | null | string>;
  drawdown: string;
  maxDrawdown: string;
  equityCurve: { date: string; nav: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
  quarterlyPnl: QuarterlyPnL;
  monthlyPnl: MonthlyPnL;
  cashFlows: CashFlow[];
  strategyName: string;
  holdings?: HoldingsSummary;
}

interface Metadata {
  icode: string;
  accountCount: number;
  lastUpdated: string;
  filtersApplied: {
    accountType: string | null;
    broker: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  inceptionDate: string;
  dataAsOfDate: string;
  strategyName: string;
  isActive: boolean;
}

interface PortfolioResponse {
  data: PortfolioData;
  metadata: Metadata;
}

interface Holding {
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  buyValue: number;
  valueAsOfToday: number;
  pnlAmount: number;
  percentPnl: number;
  broker: string;
  debtEquity: string;
  subCategory: string;
  date: Date;
  type?: "equity" | "mutual_fund";
  isin?: string;
}

interface HoldingsSummary {
  totalBuyValue: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdingsCount: number;
  equityHoldings: Holding[];
  debtHoldings: Holding[];
  mutualFundHoldings: Holding[];
  categoryBreakdown: {
    [category: string]: {
      buyValue: number;
      currentValue: number;
      pnl: number;
      count: number;
    };
  };
  brokerBreakdown: {
    [broker: string]: {
      buyValue: number;
      currentValue: number;
      pnl: number;
      count: number;
    };
  };
}

// ==================== CSV Row & Parsing ====================

interface MasterSheetRow {
  systemTag: string;
  date: Date;
  dateStr: string;
  portfolioValue: number;
  cashInOut: number;
  nav: number;
  prevNav: number;
  pnl: number;
  dailyPLPercent: number;
  exposureValue: number;
  drawdownPercent: number;
}

type MasterSheetIndex = Map<string, MasterSheetRow[]>;

let cachedIndex: MasterSheetIndex | null = null;

function parseCsv(): MasterSheetIndex {
  if (cachedIndex) return cachedIndex;

  const csvPath = path.join(process.cwd(), "data", "arwani_prebifurcated.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());

  const index: MasterSheetIndex = new Map();

  // Skip header (line 0)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 13) continue;

    const systemTag = cols[0].trim();
    const dateStr = cols[1].trim();
    if (!dateStr || dateStr === "Date") continue;

    const row: MasterSheetRow = {
      systemTag,
      date: new Date(dateStr + "T00:00:00Z"),
      dateStr,
      portfolioValue: parseFloat(cols[2]) || 0,
      cashInOut: parseFloat(cols[3]) || 0,
      nav: parseFloat(cols[4]) || 0,
      prevNav: parseFloat(cols[5]) || 0,
      pnl: parseFloat(cols[6]) || 0,
      dailyPLPercent: parseFloat(cols[7]) || 0,
      exposureValue: parseFloat(cols[8]) || 0,
      drawdownPercent: parseFloat(cols[12]) || 0,
    };

    if (!index.has(systemTag)) {
      index.set(systemTag, []);
    }
    index.get(systemTag)!.push(row);
  }

  // Sort each tag's rows by date ascending
  for (const [, rows] of index) {
    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  cachedIndex = index;
  return index;
}

function getTagRows(tag: string): MasterSheetRow[] {
  const index = parseCsv();
  return index.get(tag) || [];
}

// ==================== Scheme Configuration ====================

interface SchemeConfig {
  name: string;
  depositTag: string; // For amountDeposited, exposure, cashFlows
  navTag: string; // For returns, historicalData, totalProfit
  isActive: boolean;
}

const ARWANI_QCODE = "QAC00071";

const ARWANI_SCHEMES: SchemeConfig[] = [
  {
    name: "Total Portfolio",
    depositTag: "Zerodha Total Portfolio",
    navTag: "Zerodha Total Portfolio",
    isActive: true,
  },
  {
    name: "Scheme QYE++",
    depositTag: "QYE++ Zerodha Total Portfolio",
    navTag: "QYE++ Total Portfolio Value",
    isActive: true,
  },
  {
    name: "Scheme QAW++",
    depositTag: "QAW++ Zerodha Total Portfolio",
    navTag: "QAW++ Zerodha Total Portfolio",
    isActive: true,
  },
];

// ==================== Data Fetching (from CSV) ====================

function getAmountDeposited(depositTag: string): number {
  const rows = getTagRows(depositTag);
  return rows.reduce((sum, r) => sum + r.cashInOut, 0);
}

function getLatestExposure(
  depositTag: string
): {
  portfolioValue: number;
  drawdown: number;
  nav: number;
  date: Date;
} | null {
  const rows = getTagRows(depositTag);
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return {
    portfolioValue: last.portfolioValue,
    drawdown: Math.abs(last.drawdownPercent),
    nav: last.nav,
    date: last.date,
  };
}

function getHistoricalData(
  navTag: string
): {
  date: Date;
  dateStr: string;
  nav: number;
  prevNav: number;
  drawdown: number;
  pnl: number;
  capitalInOut: number;
}[] {
  const rows = getTagRows(navTag);
  return rows
    .filter((r) => r.nav !== 0)
    .map((r) => ({
      date: r.date,
      dateStr: r.dateStr,
      nav: r.nav,
      prevNav: r.prevNav,
      drawdown: Math.abs(r.drawdownPercent),
      pnl: r.pnl,
      capitalInOut: r.cashInOut,
    }));
}

function getCashFlows(depositTag: string): CashFlow[] {
  const rows = getTagRows(depositTag);
  return rows
    .filter((r) => r.cashInOut !== 0)
    .map((r) => ({
      date: r.dateStr,
      amount: r.cashInOut,
      dividend: 0,
    }));
}

function getTotalProfit(navTag: string): number {
  const rows = getTagRows(navTag);
  return rows.reduce((sum, r) => sum + r.pnl, 0);
}

// ==================== Calculation Methods ====================

function normalizeDate(date: Date | string): string {
  if (typeof date === "string") return date.split("T")[0];
  return date.toISOString().split("T")[0];
}

function calculateDrawdownMetrics(
  equityCurve: { date: string; nav: number }[]
): {
  mdd: number;
  currentDD: number;
  ddCurve: { date: string; value: number }[];
} {
  if (equityCurve.length === 0)
    return { mdd: 0, currentDD: 0, ddCurve: [] };

  let peak = equityCurve[0].nav;
  let mdd = 0;
  const ddCurve: { date: string; value: number }[] = [];

  for (const point of equityCurve) {
    if (point.nav > peak) peak = point.nav;
    const drawdown = ((point.nav - peak) / peak) * 100;
    ddCurve.push({ date: point.date, value: drawdown });
    if (drawdown < mdd) mdd = drawdown;
  }

  const currentDD =
    ddCurve.length > 0 ? ddCurve[ddCurve.length - 1].value : 0;
  return { mdd, currentDD, ddCurve };
}

function calculatePortfolioReturns(
  historicalData: { date: Date; nav: number; prevNav: number }[]
): number {
  if (historicalData.length < 1) return 0;

  // Use prevNav of first entry as the base (should be 100 for fresh schemes)
  const initialNav = historicalData[0].prevNav || 100;
  const finalNav = historicalData[historicalData.length - 1].nav;
  const firstDate = historicalData[0].date;
  const lastDate = historicalData[historicalData.length - 1].date;
  const days =
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

  if (initialNav <= 0 || finalNav <= 0) return 0;

  if (days < 365) {
    return (finalNav / initialNav - 1) * 100;
  } else {
    return (Math.pow(finalNav / initialNav, 365 / days) - 1) * 100;
  }
}

function calculateTrailingReturns(
  equityCurve: { date: string; nav: number }[],
  drawdownMetrics: { mdd: number; currentDD: number }
): Record<string, number | null | string> {
  const emptyReturns: Record<string, number | null> = {
    "5d": null,
    "10d": null,
    "15d": null,
    "1m": null,
    "3m": null,
    "6m": null,
    "1y": null,
    "2y": null,
    "5y": null,
    sinceInception: null,
    MDD: drawdownMetrics.mdd,
    currentDD: drawdownMetrics.currentDD,
  };

  if (equityCurve.length === 0) return emptyReturns;

  const lastEntry = equityCurve[equityCurve.length - 1];
  const lastNav = lastEntry.nav;
  const currentDate = lastEntry.date;
  const oldestDate = equityCurve[0].date;
  const dataRangeDays =
    (new Date(currentDate).getTime() - new Date(oldestDate).getTime()) /
    (1000 * 60 * 60 * 24);

  const periods: Record<string, number | null> = {
    "5d": 5,
    "10d": 10,
    "15d": 15,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
    "2y": 730,
    "5y": 1825,
    sinceInception: null,
  };

  const returns: Record<string, number | null | string> = {};

  for (const [period, targetCount] of Object.entries(periods)) {
    if (period === "sinceInception") {
      const firstNav = 100; // All schemes start at NAV 100
      if (dataRangeDays > 365) {
        returns[period] =
          (Math.pow(lastNav / firstNav, 365 / dataRangeDays) - 1) * 100;
      } else {
        returns[period] = (lastNav / firstNav - 1) * 100;
      }
      continue;
    }

    const requiredDays = targetCount as number;
    if (requiredDays > dataRangeDays) {
      returns[period] = null;
      continue;
    }

    const targetDate = new Date(currentDate);
    targetDate.setDate(targetDate.getDate() - requiredDays);

    if (targetDate < new Date(oldestDate)) {
      returns[period] = null;
      continue;
    }

    const targetTime = targetDate.getTime();
    let candidate: { date: string; nav: number } | null = null;

    for (const dataPoint of equityCurve) {
      const dataTime = new Date(dataPoint.date).getTime();
      if (dataTime <= targetTime) candidate = dataPoint;
      else break;
    }

    if (!candidate) {
      for (const dataPoint of equityCurve) {
        const dataTime = new Date(dataPoint.date).getTime();
        if (dataTime >= targetTime) {
          candidate = dataPoint;
          break;
        }
      }
    }

    if (!candidate) {
      returns[period] = null;
      continue;
    }

    const candidateTime = new Date(candidate.date).getTime();
    const daysDiff =
      Math.abs(candidateTime - targetTime) / (1000 * 60 * 60 * 24);
    const maxAllowedDiff = requiredDays <= 30 ? 7 : 30;
    if (daysDiff > maxAllowedDiff) {
      returns[period] = null;
      continue;
    }

    returns[period] = (lastNav / candidate.nav - 1) * 100;
  }

  returns["MDD"] = drawdownMetrics.mdd;
  returns["currentDD"] = drawdownMetrics.currentDD;
  return returns;
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

function calculateMonthlyPnL(
  historicalData: {
    date: Date;
    nav: number;
    prevNav: number;
    pnl: number;
    capitalInOut: number;
  }[]
): MonthlyPnL {
  const monthlyPnl: MonthlyPnL = {};

  const grouped: Record<
    string,
    Record<
      string,
      {
        startNav: number;
        endNav: number;
        pnl: number;
        capitalInOut: number;
      }
    >
  > = {};
  let isFirstMonthSet = false;

  for (let i = 0; i < historicalData.length; i++) {
    const entry = historicalData[i];
    const date = new Date(entry.date);
    const year = date.getUTCFullYear().toString();
    const month = MONTH_NAMES[date.getUTCMonth()];

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) {
      let startNav: number;
      if (!isFirstMonthSet) {
        // Use prevNav of first entry as the base (100 for fresh schemes)
        startNav = historicalData[0]?.prevNav ?? 100;
        isFirstMonthSet = true;
      } else if (i > 0) {
        startNav = historicalData[i - 1]?.nav || entry.nav;
      } else {
        startNav = entry.nav;
      }

      grouped[year][month] = {
        startNav,
        endNav: entry.nav,
        pnl: entry.pnl,
        capitalInOut: entry.capitalInOut,
      };
    } else {
      grouped[year][month].endNav = entry.nav;
      grouped[year][month].pnl += entry.pnl;
      grouped[year][month].capitalInOut += entry.capitalInOut;
    }
  }

  for (const year of Object.keys(grouped).sort()) {
    monthlyPnl[year] = {
      months: {},
      totalPercent: 0,
      totalCash: 0,
      totalCapitalInOut: 0,
    };

    let compoundedReturn = 1;
    let hasValidData = false;

    for (const month of MONTH_NAMES) {
      if (grouped[year]?.[month]) {
        const data = grouped[year][month];
        const percent = (data.endNav / data.startNav - 1) * 100;
        monthlyPnl[year].months[month] = {
          percent: percent.toFixed(2),
          cash: data.pnl.toFixed(2),
          capitalInOut: data.capitalInOut.toFixed(2),
        };
        compoundedReturn *= 1 + percent / 100;
        hasValidData = true;
        monthlyPnl[year].totalCash += data.pnl;
        monthlyPnl[year].totalCapitalInOut += data.capitalInOut;
      } else {
        monthlyPnl[year].months[month] = {
          percent: "-",
          cash: "-",
          capitalInOut: "-",
        };
      }
    }

    if (hasValidData && compoundedReturn !== 1) {
      monthlyPnl[year].totalPercent = Number(
        ((compoundedReturn - 1) * 100).toFixed(2)
      );
    } else if (hasValidData) {
      monthlyPnl[year].totalPercent = 0;
    }
  }

  return monthlyPnl;
}

function calculateQuarterlyPnL(
  historicalData: {
    date: Date;
    nav: number;
    prevNav: number;
    pnl: number;
    capitalInOut: number;
  }[]
): QuarterlyPnL {
  const quarterlyPnl: QuarterlyPnL = {};

  const grouped: Record<
    string,
    Record<string, { startNav: number; endNav: number; pnl: number }>
  > = {};
  let isFirstQuarterSet = false;

  for (let i = 0; i < historicalData.length; i++) {
    const entry = historicalData[i];
    const date = new Date(entry.date);
    const year = date.getUTCFullYear().toString();
    const quarter = `q${Math.floor(date.getUTCMonth() / 3) + 1}`;

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][quarter]) {
      let startNav: number;
      if (!isFirstQuarterSet) {
        startNav = historicalData[0]?.prevNav ?? 100;
        isFirstQuarterSet = true;
      } else if (i > 0) {
        startNav = historicalData[i - 1]?.nav || entry.nav;
      } else {
        startNav = entry.nav;
      }

      grouped[year][quarter] = {
        startNav,
        endNav: entry.nav,
        pnl: entry.pnl,
      };
    } else {
      grouped[year][quarter].endNav = entry.nav;
      grouped[year][quarter].pnl += entry.pnl;
    }
  }

  for (const year of Object.keys(grouped).sort()) {
    quarterlyPnl[year] = {
      percent: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
      cash: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
      yearCash: "0",
    };

    let compoundedReturn = 1;
    let hasValidData = false;
    let yearTotalCash = 0;

    for (const q of ["q1", "q2", "q3", "q4"]) {
      if (grouped[year]?.[q]) {
        const data = grouped[year][q];
        const percent = (data.endNav / data.startNav - 1) * 100;
        quarterlyPnl[year].percent[
          q as keyof (typeof quarterlyPnl)[string]["percent"]
        ] = percent.toFixed(2);
        quarterlyPnl[year].cash[
          q as keyof (typeof quarterlyPnl)[string]["cash"]
        ] = data.pnl.toFixed(2);
        compoundedReturn *= 1 + percent / 100;
        hasValidData = true;
        yearTotalCash += data.pnl;
      }
    }

    quarterlyPnl[year].percent.total = hasValidData
      ? ((compoundedReturn - 1) * 100).toFixed(2)
      : "0";
    quarterlyPnl[year].cash.total = yearTotalCash.toFixed(2);
    quarterlyPnl[year].yearCash = yearTotalCash.toFixed(2);
  }

  return quarterlyPnl;
}

// ==================== Holdings (from DB) ====================

async function getHoldings(qcode: string): Promise<Holding[]> {
  const latestDateRecord = await (prisma.equity_holding as any).findFirst({
    where: { qcode },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  if (!latestDateRecord?.date) {
    return getMutualFundHoldings(qcode);
  }

  const holdings = await (prisma.equity_holding as any).findMany({
    where: {
      qcode,
      date: latestDateRecord.date,
      quantity: { gt: 0 },
    },
  });

  const equityHoldings: Holding[] = holdings.map((holding: any) => ({
    symbol: holding.symbol || "",
    exchange: holding.exchange || "",
    quantity: Number(holding.quantity) || 0,
    avgPrice: Number(holding.avg_price) || 0,
    ltp: Number(holding.ltp) || 0,
    buyValue: Number(holding.buy_value) || 0,
    valueAsOfToday: Number(holding.value_as_of_today) || 0,
    pnlAmount: Number(holding.pnl_amount) || 0,
    percentPnl: Number(holding.percent_pnl) || 0,
    broker: holding.broker || "",
    debtEquity: holding.debt_equity || "",
    subCategory: holding.sub_category || "",
    date: holding.date || new Date(),
    type: "equity" as const,
  }));

  const mutualFundHoldings = await getMutualFundHoldings(qcode);
  return [...equityHoldings, ...mutualFundHoldings];
}

async function getMutualFundHoldings(qcode: string): Promise<Holding[]> {
  const mutualFundHoldings = await prisma.$queryRaw<
    {
      isin: string;
      symbol: string;
      scheme_code: string;
      quantity: number;
      avg_price: number;
      nav: number;
      buy_value: number;
      value_as_of_today: number;
      pnl_amount: number;
      percent_pnl: number;
      broker: string;
      debt_equity: string;
      sub_category: string;
      as_of_date: Date;
      mastersheet_tag: string;
    }[]
  >`
    WITH latest_date AS (
      SELECT MAX(as_of_date) as max_date
      FROM mutual_fund_holding_sheet
      WHERE qcode = ${qcode} AND as_of_date IS NOT NULL
    ),
    ranked_holdings AS (
      SELECT
        m.*,
        ROW_NUMBER() OVER (
          PARTITION BY m.isin
          ORDER BY m.quantity DESC, m.buy_value DESC
        ) as rn
      FROM mutual_fund_holding_sheet m
      CROSS JOIN latest_date ld
      WHERE m.qcode = ${qcode}
        AND m.quantity > 0
        AND m.isin IS NOT NULL
        AND m.isin != ''
        AND m.as_of_date = ld.max_date
    )
    SELECT
      isin,
      MAX(symbol) as symbol,
      MAX(scheme_code) as scheme_code,
      SUM(quantity) as quantity,
      SUM(buy_value) / NULLIF(SUM(quantity), 0) as avg_price,
      MAX(nav) as nav,
      SUM(buy_value) as buy_value,
      SUM(value_as_of_today) as value_as_of_today,
      SUM(pnl_amount) as pnl_amount,
      (SUM(pnl_amount) / NULLIF(SUM(buy_value), 0) * 100) as percent_pnl,
      MAX(broker) as broker,
      MAX(debt_equity) as debt_equity,
      MAX(sub_category) as sub_category,
      MAX(as_of_date) as as_of_date,
      MAX(mastersheet_tag) as mastersheet_tag
    FROM ranked_holdings
    WHERE rn = 1
    GROUP BY isin
  `;

  const isinMap = new Map<string, Holding>();

  mutualFundHoldings.forEach((holding) => {
    const isin = holding.isin || "";
    if (isin && !isinMap.has(isin)) {
      isinMap.set(isin, {
        symbol: holding.symbol || "",
        exchange: "MUTUAL_FUND",
        quantity: Number(holding.quantity) || 0,
        avgPrice: Number(holding.avg_price) || 0,
        ltp: Number(holding.nav) || 0,
        buyValue: Number(holding.buy_value) || 0,
        valueAsOfToday: Number(holding.value_as_of_today) || 0,
        pnlAmount: Number(holding.pnl_amount) || 0,
        percentPnl: Number(holding.percent_pnl) || 0,
        broker: holding.broker || "",
        debtEquity: holding.debt_equity || "",
        subCategory: holding.sub_category || "",
        date: holding.as_of_date ? new Date(holding.as_of_date) : new Date(),
        type: "mutual_fund" as const,
        isin: isin,
      });
    }
  });

  return Array.from(isinMap.values());
}

function calculateHoldingsSummary(holdings: Holding[]): HoldingsSummary {
  const equityHoldings = holdings.filter((h) => h.type === "equity");
  const debtHoldings = holdings.filter(
    (h) => h.debtEquity?.toLowerCase() === "debt"
  );
  const mutualFundHoldings = holdings.filter((h) => h.type === "mutual_fund");

  const totalBuyValue = holdings.reduce((sum, h) => sum + h.buyValue, 0);
  const totalCurrentValue = holdings.reduce(
    (sum, h) => sum + h.valueAsOfToday,
    0
  );
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnlAmount, 0);
  const totalPnlPercent =
    totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;

  const categoryBreakdown: HoldingsSummary["categoryBreakdown"] = {};
  holdings.forEach((holding) => {
    const category = holding.subCategory || "Others";
    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = {
        buyValue: 0,
        currentValue: 0,
        pnl: 0,
        count: 0,
      };
    }
    categoryBreakdown[category].buyValue += holding.buyValue;
    categoryBreakdown[category].currentValue += holding.valueAsOfToday;
    categoryBreakdown[category].pnl += holding.pnlAmount;
    categoryBreakdown[category].count += 1;
  });

  const brokerBreakdown: HoldingsSummary["brokerBreakdown"] = {};
  holdings.forEach((holding) => {
    const broker = holding.broker || "Unknown";
    if (!brokerBreakdown[broker]) {
      brokerBreakdown[broker] = {
        buyValue: 0,
        currentValue: 0,
        pnl: 0,
        count: 0,
      };
    }
    brokerBreakdown[broker].buyValue += holding.buyValue;
    brokerBreakdown[broker].currentValue += holding.valueAsOfToday;
    brokerBreakdown[broker].pnl += holding.pnlAmount;
    brokerBreakdown[broker].count += 1;
  });

  return {
    totalBuyValue,
    totalCurrentValue,
    totalPnl,
    totalPnlPercent,
    holdingsCount: holdings.length,
    equityHoldings,
    debtHoldings,
    mutualFundHoldings,
    categoryBreakdown,
    brokerBreakdown,
  };
}

// ==================== Main GET Handler ====================

async function handleGET(request: Request): Promise<NextResponse> {
  try {
    const results: Record<string, PortfolioResponse> = {};
    const qcode = ARWANI_QCODE;

    // Fetch holdings once (from DB)
    let holdings: Holding[] = [];
    try {
      holdings = await getHoldings(qcode);
    } catch (error) {
      console.error("Error fetching holdings for Arwani:", error);
    }
    const holdingsSummary = calculateHoldingsSummary(holdings);

    for (const scheme of ARWANI_SCHEMES) {
      const investedAmount = getAmountDeposited(scheme.depositTag);
      const latestExposure = getLatestExposure(scheme.depositTag);
      const totalProfit = getTotalProfit(scheme.navTag);
      const historicalData = getHistoricalData(scheme.navTag);
      const cashFlows = getCashFlows(scheme.depositTag);

      const rawEquityCurve = historicalData.map((d) => ({
        date: d.dateStr,
        nav: d.nav,
      }));

      const returns = calculatePortfolioReturns(historicalData);
      const drawdownMetrics = calculateDrawdownMetrics(rawEquityCurve);
      const trailingReturns = calculateTrailingReturns(
        rawEquityCurve,
        drawdownMetrics
      );
      const monthlyPnl = calculateMonthlyPnL(historicalData);
      const quarterlyPnl = calculateQuarterlyPnL(historicalData);

      // Prepend NAV=100 baseline for chart display
      const equityCurve = (() => {
        if (rawEquityCurve.length > 0) {
          const firstDate = new Date(rawEquityCurve[0].date);
          firstDate.setDate(firstDate.getDate() - 1);
          const baselineDate = firstDate.toISOString().split("T")[0];
          return [{ date: baselineDate, nav: 100 }, ...rawEquityCurve];
        }
        return rawEquityCurve;
      })();

      const drawdownCurve = (() => {
        const rawDDCurve = drawdownMetrics.ddCurve.map((d) => ({
          date: d.date,
          drawdown: d.value,
        }));
        if (rawDDCurve.length > 0 && historicalData.length > 0) {
          const firstDate = new Date(historicalData[0].dateStr);
          firstDate.setDate(firstDate.getDate() - 1);
          const baselineDate = firstDate.toISOString().split("T")[0];
          return [{ date: baselineDate, drawdown: 0 }, ...rawDDCurve];
        }
        return rawDDCurve;
      })();

      const portfolioData: PortfolioData = {
        amountDeposited: investedAmount.toFixed(2),
        currentExposure: latestExposure?.portfolioValue.toFixed(2) || "0",
        return: returns.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        trailingReturns,
        drawdown: drawdownMetrics.currentDD.toFixed(2),
        maxDrawdown: drawdownMetrics.mdd.toFixed(2),
        equityCurve,
        drawdownCurve,
        quarterlyPnl,
        monthlyPnl,
        cashFlows,
        strategyName: scheme.name,
        holdings: scheme.name === "Total Portfolio" ? holdingsSummary : undefined,
      };

      const metadata: Metadata = {
        icode: scheme.name,
        accountCount: 1,
        lastUpdated: new Date().toISOString(),
        filtersApplied: {
          accountType: null,
          broker: null,
          startDate: null,
          endDate: null,
        },
        inceptionDate:
          historicalData.length > 0
            ? historicalData[0].dateStr
            : new Date().toISOString().split("T")[0],
        dataAsOfDate:
          latestExposure?.date.toISOString().split("T")[0] ||
          new Date().toISOString().split("T")[0],
        strategyName: scheme.name,
        isActive: scheme.isActive,
      };

      results[scheme.name] = { data: portfolioData, metadata };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error("Arwani Portfolio API Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ==================== Export ====================

export const ArwaniApi = {
  GET: (req: Request) => handleGET(req),
};
