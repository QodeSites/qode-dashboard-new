"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactDOM from "react-dom/client";

import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { PnlTable } from "@/components/PnlTable";
import { TrailingReturnsTable } from "@/components/trailing-returns-table";
import PortfolioReport from "@/components/template";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// ✅ Benchmark hook (used to compute benchmark trailing pre-render)
import { useBse500Data } from "@/hooks/useBse500Data";
import { buildPortfolioReportHTML } from "@/components/buildPortfolioReportHTML";
import { makeBenchmarkCurves } from "@/components/benchmarkCurves";

// -----------------------------
// Types
// -----------------------------
interface EquityCurvePoint { date: string; value: number }


interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: TrailingReturns;
  /** Optional (if API already provides it) */
  benchmarkTrailingReturns?: TrailingReturns;
  drawdown: string;
  equityCurve: EquityCurvePoint[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: {
    [year: string]: {
      percent: { q1: string; q2: string; q3: string; q4: string; total: string };
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
      yearCash: string;
    };
  };
  monthlyPnl: {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
      totalPercent: number | string;
      totalCash: number;
      totalCapitalInOut: number;
    };
  };
  cashFlows: { date: string; amount: number }[];
  strategyName?: string;
}

interface PmsStats {
  totalPortfolioValue: string;
  totalPnl: string;
  maxDrawdown: string;
  cumulativeReturn: string;
  equityCurve: EquityCurvePoint[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: {
    [year: string]: {
      percent: { q1: string; q2: string; q3: string; q4: string; total: string };
      cash: { q1: string; q2: string; q3: string; q4: string; total: string };
      yearCash?: string;
    };
  };
  monthlyPnl: {
    [year: string]: {
      months: { [month: string]: { percent: string; cash: string; capitalInOut?: string } };
      totalPercent: number;
      totalCash: number;
      totalCapitalInOut?: number;
    };
  };
  trailingReturns: TrailingReturns;
  /** Optional */
  benchmarkTrailingReturns?: TrailingReturns;
  cashFlows: { date: string; amount: number }[];
  strategyName?: string;
}

interface Account {
  qcode: string;
  account_name: string;
  account_type: string;
  broker: string;
}

interface Metadata {
  icode: string;
  accountCount: number;
  inceptionDate: string | null;
  dataAsOfDate: string | null;
  lastUpdated: string;
  strategyName: string;
  filtersApplied: {
    accountType: string | null;
    broker: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  isActive: boolean;
  /** Optional */
  benchmarkTrailingReturns?: TrailingReturns;
}

interface SarlaApiResponse {
  [strategyName: string]: {
    data: Stats | PmsStats;
    metadata: Metadata;
  };
}

type ReturnView = "percent" | "cash";
type TrailingReturns = {
  fiveDays?: string | null;
  tenDays?: string | null;
  fifteenDays?: string | null;
  oneMonth?: string | null;
  threeMonths?: string | null;
  sixMonths?: string | null;
  oneYear?: string | null;
  twoYears?: string | null;
  fiveYears?: string | null;
  sinceInception: string;
  MDD?: string;
  currentDD?: string;
};

// COMBINED trailing returns per horizon
type CombinedTrailingCell = { portfolio?: string | null; benchmark?: string | null };
type CombinedTrailing = {
  fiveDays?: CombinedTrailingCell;
  tenDays?: CombinedTrailingCell;
  fifteenDays?: CombinedTrailingCell;
  oneMonth?: CombinedTrailingCell;
  threeMonths?: CombinedTrailingCell;
  sixMonths?: CombinedTrailingCell;
  oneYear?: CombinedTrailingCell;
  twoYears?: CombinedTrailingCell;
  fiveYears?: CombinedTrailingCell;
  sinceInception: CombinedTrailingCell;
  MDD?: CombinedTrailingCell;
  currentDD?: CombinedTrailingCell;
};

// -----------------------------
// Helpers
// -----------------------------
function isPmsStats(s: Stats | PmsStats): s is PmsStats {
  return "totalPortfolioValue" in s;
}

function convertPmsStatsToStats(pms: PmsStats): Stats {
  const amountDeposited = pms.cashFlows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  return {
    amountDeposited: amountDeposited.toFixed(2),
    currentExposure: pms.totalPortfolioValue,
    return: pms.cumulativeReturn,
    totalProfit: pms.totalPnl,
    trailingReturns: pms.trailingReturns,
    benchmarkTrailingReturns: pms.benchmarkTrailingReturns,
    drawdown: pms.maxDrawdown,
    equityCurve: pms.equityCurve,
    drawdownCurve: pms.drawdownCurve,
    quarterlyPnl: Object.fromEntries(
      Object.entries(pms.quarterlyPnl).map(([y, v]) => [y, { ...v, yearCash: v.yearCash ?? v.cash.total }])
    ),
    monthlyPnl: Object.fromEntries(
      Object.entries(pms.monthlyPnl).map(([y, yr]) => [
        y,
        {
          ...yr,
          months: Object.fromEntries(
            Object.entries(yr.months).map(([m, mv]) => [m, { ...mv, capitalInOut: mv.capitalInOut ?? "0" }])
          ),
          totalCapitalInOut: yr.totalCapitalInOut ?? 0,
        },
      ])
    ),
    cashFlows: pms.cashFlows ?? [],
  };
}

function normalizeToStats(input: Stats | PmsStats): Stats {
  return isPmsStats(input) ? convertPmsStatsToStats(input) : input;
}

function filterEquityCurve(
  equityCurve: EquityCurvePoint[],
  startDate: string | null,
  endDate: string | null
) {
  if (!startDate || !endDate) return equityCurve;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return equityCurve.filter(e => {
    const d = new Date(e.date);
    return d >= start && d <= end;
  });
}

const dateFormatter = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

function getLastDate(equityCurve: EquityCurvePoint[], lastUpdated: string | null): string | null {
  if (equityCurve.length === 0) return lastUpdated || null;
  const latest = [...equityCurve].sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];
  return latest.date;
}

const sumNum = (v: any) => (isNaN(Number(v)) ? 0 : Number(v));

function mergeQuarterly(
  acc: Record<string, { q1: number; q2: number; q3: number; q4: number; total: number }>,
  next?: { [year: string]: { cash: { q1: string; q2: string; q3: string; q4: string; total: string } } }
) {
  if (!next) return acc;
  for (const year of Object.keys(next)) {
    const c = next[year].cash;
    acc[year] ??= { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };
    acc[year].q1 += sumNum(c.q1);
    acc[year].q2 += sumNum(c.q2);
    acc[year].q3 += sumNum(c.q3);
    acc[year].q4 += sumNum(c.q4);
    acc[year].total += sumNum(c.total);
  }
  return acc;
}

const getGreeting = () => {
  const hours = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date())
  );
  if (hours < 12) return "Good Morning";
  if (hours < 17) return "Good Afternoon";
  return "Good Evening";
};

// If your APIs sometimes carry the benchmark trailing inline, grab it
function extractBenchmarkTrailing(source: any, fallbackMeta?: any): TrailingReturns | null {
  if (!source) return null;
  if (source.benchmarkTrailingReturns) return source.benchmarkTrailingReturns;
  if (source.trailingReturnsBenchmark) return source.trailingReturnsBenchmark;
  if (source.benchmarks?.trailingReturns) return source.benchmarks.trailingReturns;
  if (fallbackMeta?.benchmarkTrailingReturns) return fallbackMeta.benchmarkTrailingReturns;

  const nested = source.benchmarks && typeof source.benchmarks === "object"
    ? Object.values(source.benchmarks).find((v: any) => v?.trailingReturns)
    : null;
  if (nested?.trailingReturns) return nested.trailingReturns as TrailingReturns;

  return null;
}

// Combine (portfolio vs benchmark) into one structure
function combineTrailing(portfolio?: TrailingReturns | null, benchmark?: TrailingReturns | null): CombinedTrailing {
  const horizons: (keyof CombinedTrailing)[] = [
    'fiveDays',
    'tenDays',
    'fifteenDays',
    'oneMonth',
    'threeMonths',
    'oneYear',
    'twoYears',
    'sinceInception',
    'MDD',
    'currentDD',
  ];

  const portfoliohorizons: string[] = [
    '5d',
    '10d',
    '15d',
    '1m',
    '3m',
    '1y',
    '2y',
    'sinceInception',
    'MDD',
    'currentDD',
  ];

  const out: CombinedTrailing = {};

  for (let i = 0; i < horizons.length; i++) {
    const horizon = horizons[i];
    const portfolioHorizon = portfoliohorizons[i];

    const portfolioValue = portfolio && portfolio[portfolioHorizon] !== undefined ? portfolio[portfolioHorizon] : portfolio[horizon];
    const benchmarkValue = benchmark && benchmark[horizon] !== undefined ? benchmark[horizon] : null;
    // If portfolio doesn't have the value, show "-" for benchmark as well
    const finalBenchmarkValue = (portfolioValue === null || portfolioValue === undefined || portfolioValue === "-") ? "-" : benchmarkValue;

    if (portfolioValue !== null || benchmarkValue !== null) {
      out[horizon] = {
        portfolio: typeof portfolioValue === 'number' ? Number(portfolioValue.toFixed(2)) : portfolioValue,
        benchmark: typeof finalBenchmarkValue === 'number' ? Number(finalBenchmarkValue.toFixed(2)) : finalBenchmarkValue,
      };
    }
  }

  return out;
}

// -----------------------------
// Cash Flow Table (shadcn <Table />)
// -----------------------------
function CashFlowTable({
  transactions,
  totals,
  showAccountColumn = false,
  getAccountName,
}: {
  transactions: { date: string; amount: number }[];
  totals: { totalIn: number; totalOut: number; netFlow: number };
  showAccountColumn?: boolean;
  getAccountName?: (t: { date: string; amount: number }) => string | undefined;
}) {
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

  if (!transactions || transactions.length === 0) {
    return <div className="text-center py-3 text-gray-900 dark:text-gray-100">No cash flow data available</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-full text-black">
        <TableHeader>
          <TableRow className="bg-black/5 border-b border-gray-200">
            <TableHead className="py-1 text-left text-xs font-medium uppercase text-black tracking-wider">Date</TableHead>
            <TableHead className="py-1 text-right text-xs font-medium uppercase text-black tracking-wider">Amount (₹)</TableHead>
            {showAccountColumn && (
              <TableHead className="py-1 text-left text-xs font-medium uppercase text-black tracking-wider">Account</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t, i) => {
            const acct = showAccountColumn && getAccountName ? (getAccountName(t) || "Unknown") : undefined;
            return (
              <TableRow key={`${t.date}-${i}`} className="border-b border-gray-200 dark:border-gray-700">
                <TableCell className="py-2 text-xs">{dateFormatter(t.date)}</TableCell>
                <TableCell className={`py-2 text-xs font-medium text-right ${Number(t.amount) > 0 ? "text-green-600" : "text-red-600"}`}>
                  {inr.format(Number(t.amount))}
                </TableCell>
                {showAccountColumn && <TableCell className="py-2 text-xs">{acct}</TableCell>}
              </TableRow>
            );
          })}

          {/* Totals */}
          <TableRow className="border-t border-gray-200 dark:border-gray-700 font-semibold">
            <TableCell className="py-2 text-xs">Total In</TableCell>
            <TableCell className="py-2 text-xs text-right text-green-800 dark:text-green-600">
              {inr.format(totals.totalIn)}
            </TableCell>
            {showAccountColumn && <TableCell />}
          </TableRow>
          <TableRow className="font-semibold">
            <TableCell className="py-2 text-xs">Total Out</TableCell>
            <TableCell className="py-2 text-xs text-right text-red-800 dark:text-red-600">
              {inr.format(totals.totalOut)}
            </TableCell>
            {showAccountColumn && <TableCell />}
          </TableRow>
          <TableRow className="font-semibold">
            <TableCell className="py-2 text-xs">Net Flow</TableCell>
            <TableCell
              className={`py-2 text-xs text-right font-semibold ${totals.netFlow >= 0 ? "text-green-800 dark:text-green-600" : "text-red-800 dark:text-red-600"
                }`}
            >
              {inr.format(totals.netFlow)}
            </TableCell>
            {showAccountColumn && <TableCell />}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

// -----------------------------
// Component
// -----------------------------
export default function Portfolio() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountCode = searchParams.get("accountCode") || "AC5";
  const isSarla = session?.user?.icode === "QUS0007";
  const isSatidham = session?.user?.icode === "QUS0010";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [viewMode] = useState<"consolidated" | "individual">("consolidated");
  const [stats, setStats] = useState<
    (Stats | PmsStats) | { stats: Stats | PmsStats; metadata: Account & { strategyName: string; isActive: boolean } }[] | null
  >(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sarlaData, setSarlaData] = useState<SarlaApiResponse | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [availableStrategies, setAvailableStrategies] = useState<string[]>([]);
  const [returnViewType, setReturnViewType] = useState<ReturnView>("percent");

  const pdfRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Fetch
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status !== "authenticated") return;

    const fetchSarlaLike = async (qcode: string) => {
      try {
        const res = await fetch(`/api/sarla-api?qcode=${qcode}&accountCode=${accountCode}`, { credentials: "include" });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `Failed to load data for accountCode ${accountCode}`);
        }
        const data: SarlaApiResponse = await res.json();
        setSarlaData(data);
        const strategies = Object.keys(data);
        setAvailableStrategies(strategies);
        if (strategies.length > 0) setSelectedStrategy(strategies[0]);
      } catch (err: any) {
        setError(err?.message || `An unexpected error occurred for accountCode ${accountCode}`);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/accounts", { credentials: "include" });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Failed to load accounts");
        }
        const data: Account[] = await res.json();
        setAccounts(data);
        if (data.length > 0) setSelectedAccount(data[0].qcode);
      } catch (err: any) {
        setError(err?.message || "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    if (isSarla) fetchSarlaLike("QAC00041");
    else if (isSatidham) fetchSarlaLike("QAC00046");
    else fetchAccounts();
  }, [status, router, isSarla, isSatidham, accountCode]);

  useEffect(() => {
    if (!selectedAccount || status !== "authenticated" || isSarla || isSatidham) return;

    const fetchAccountData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const a = accounts.find(acc => acc.qcode === selectedAccount);
        if (!a) throw new Error("Selected account not found");

        const endpoint =
          a.account_type === "pms"
            ? `/api/pms-data?qcode=${selectedAccount}&viewMode=${viewMode}&accountCode=${accountCode}`
            : `/api/portfolio?viewMode=${viewMode}${selectedAccount !== "all" ? `&qcode=${selectedAccount}` : ""}&accountCode=${accountCode}`;

        const res = await fetch(endpoint, { credentials: "include" });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `Failed to load data for account ${selectedAccount} with accountCode ${accountCode}`);
        }

        const response = await res.json();
        let statsData: Stats | PmsStats | Array<any>;
        let metadataData: Metadata | null = null;

        if ("data" in response && response.data !== undefined) {
          if (viewMode === "individual" && Array.isArray(response.data)) {
            statsData = response.data;
            metadataData = null;
          } else {
            statsData = response.data as Stats | PmsStats;
            metadataData = response.metadata || null;
          }
        } else {
          if (a.account_type === "pms") {
            const pmsData = response as any;

            if (pmsData.cashInOut && !pmsData.cashFlows) {
              pmsData.cashFlows = Array.isArray(pmsData.cashInOut.transactions)
                ? pmsData.cashInOut.transactions.map((tx: any) => ({ date: tx.date, amount: parseFloat(tx.amount) }))
                : [];
            }
            if (!pmsData.cashFlows) pmsData.cashFlows = [];

            statsData = pmsData as PmsStats;

            metadataData = {
              icode: selectedAccount,
              accountCount: 1,
              inceptionDate: null,
              dataAsOfDate: null,
              lastUpdated: new Date().toISOString(),
              strategyName: a.account_name || "PMS Portfolio",
              filtersApplied: {
                accountType: a.account_type,
                broker: a.broker,
                startDate: null,
                endDate: null,
              },
              isActive: true,
            };

            if (pmsData.equityCurve?.length) {
              const sorted = [...pmsData.equityCurve].sort((x: any, y: any) => +new Date(x.date) - +new Date(y.date));
              metadataData.inceptionDate = sorted[0].date;
              metadataData.dataAsOfDate = sorted[sorted.length - 1].date;
            }
          } else {
            if (viewMode === "individual" && Array.isArray(response)) {
              statsData = response;
              metadataData = null;
            } else {
              statsData = response as Stats;
              metadataData = {
                icode: selectedAccount,
                accountCount: 1,
                inceptionDate: null,
                dataAsOfDate: null,
                lastUpdated: new Date().toISOString(),
                strategyName: a.account_name || "Portfolio",
                filtersApplied: {
                  accountType: a.account_type,
                  broker: a.broker,
                  startDate: null,
                  endDate: null,
                },
                isActive: true,
              };
            }
          }
        }

        if (!statsData) throw new Error("No valid data received from API");

        setStats(statsData);
        setMetadata(metadataData);
      } catch (err: any) {
        setError(err?.message || `An unexpected error occurred for accountCode ${accountCode}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountData();
  }, [selectedAccount, accounts, status, viewMode, isSarla, isSatidham, accountCode]);

  // -----------------------------
  // View selection + normalized stats + curves
  // -----------------------------
  const currentEntry = useMemo(() => {
    if ((isSarla || isSatidham) && sarlaData && selectedStrategy) {
      const entry = sarlaData[selectedStrategy];
      const normalized = normalizeToStats(entry.data);
      const equityCurve = filterEquityCurve(
        entry.data.equityCurve,
        entry.metadata?.filtersApplied?.startDate,
        entry.metadata?.lastUpdated
      );
      const lastDate = getLastDate(equityCurve, entry.metadata?.lastUpdated);
      return {
        mode: isSarla ? "sarla" : "satidham",
        normalized,
        raw: entry.data,
        metadata: entry.metadata,
        equityCurve,
        drawdownCurve: entry.data.drawdownCurve || [],
        lastDate,
        isTotalPortfolio: selectedStrategy === "Total Portfolio",
        isActive: entry.metadata.isActive,
        strategyName: selectedStrategy,
      } as const;
    }

    if (!Array.isArray(stats) && stats) {
      const normalized = normalizeToStats(stats as Stats | PmsStats);
      const equityCurve = filterEquityCurve(
        (stats as any).equityCurve || [],
        metadata?.filtersApplied?.startDate ?? null,
        metadata?.lastUpdated ?? null
      );
      const lastDate = getLastDate(equityCurve, metadata?.lastUpdated ?? null);
      return {
        mode: "single",
        normalized,
        raw: stats,
        metadata,
        equityCurve,
        drawdownCurve: (stats as any).drawdownCurve || [],
        lastDate,
        isActive: metadata?.isActive ?? true,
        strategyName: metadata?.strategyName,
      } as const;
    }

    if (Array.isArray(stats)) {
      return { mode: "multi", items: stats } as const;
    }

    return { mode: "empty" } as const;
  }, [isSarla, isSatidham, sarlaData, selectedStrategy, stats, metadata]);

  // -----------------------------
  // Benchmark data (BSE500) + Combined Trailing pre-render
  // -----------------------------
  const { bse500Data } = useBse500Data(
    currentEntry.mode === "sarla" || currentEntry.mode === "satidham" || currentEntry.mode === "single"
      ? currentEntry.equityCurve
      : []
  );

  const computeBenchmarkFromHook = useCallback(() => {
    const periods = [
      { key: "5d", label: "5d", duration: 5, type: "days" },
      { key: "10d", label: "10d", duration: 10, type: "days" },
      { key: "15d", label: "15d", duration: 15, type: "days" },
      { key: "1m", label: "1m", duration: 1, type: "months" },
      { key: "3m", label: "3m", duration: 3, type: "months" },
      { key: "1y", label: "1y", duration: 1, type: "years" },
      { key: "2y", label: "2y", duration: 2, type: "years" },
      { key: "sinceInception", label: "Since Inception", duration: null, type: "inception" },
      { key: "currentDD", label: "Current DD", duration: null, type: "drawdown" },
      { key: "MDD", label: "Max DD", duration: null, type: "maxDrawdown" },
    ] as const;

    const asStringMap: Record<string, string> = {};
    for (const p of periods) asStringMap[p.key] = "-";

    const eq = (currentEntry as any).equityCurve as EquityCurvePoint[] | undefined;
    if (!eq || !eq.length || !bse500Data.length) return asStringMap;

    const endDate = new Date(eq[eq.length - 1].date);
    const startDate = new Date(eq[0].date);

    const findNav = (targetDate: Date) => {
      const exact = bse500Data.find(pt => new Date(pt.date).toDateString() === targetDate.toDateString());
      if (exact) return parseFloat(exact.nav);

      let bestPrev: { diff: number; nav: number } | null = null;
      let bestNext: { diff: number; nav: number } | null = null;

      for (const pt of bse500Data) {
        const d = new Date(pt.date);
        const diff = targetDate.getTime() - d.getTime();
        if (diff >= 0) {
          if (!bestPrev || diff < bestPrev.diff) bestPrev = { diff, nav: parseFloat(pt.nav) };
        } else {
          const fdiff = Math.abs(diff);
          if (!bestNext || fdiff < bestNext.diff) bestNext = { diff: fdiff, nav: parseFloat(pt.nav) };
        }
      }
      const chosen = bestPrev || bestNext;
      return chosen ? chosen.nav : 0;
    };

    const calcReturn = (start: Date, end: Date) => {
      const s = findNav(start);
      const e = findNav(end);
      console.log(start, end, s, e, "<<< calcReturn");  
      if (!s || !e || s === 0) return "-";
      const years = (end.getTime() - start.getTime()) / (365 * 24 * 60 * 60 * 1000);
      let val: number;
      if (years >= 1) {
        val = (Math.pow(e / s, 1 / years) - 1) * 100;
      } else {
        val = ((e - s) / s) * 100;
      }
      return val.toFixed(2);
    };

    const toDays = (p: { type: string; duration: number | null }) => {
      if (p.type === "days") return p.duration || 0;
      if (p.type === "months") return (p.duration || 0) * 30;
      if (p.type === "years") return (p.duration || 0) * 365;
      return 0;
    };

    for (const p of periods) {
      if (p.type === "inception") {
        console.log(startDate, endDate, "<<< startDate endDate for inception");
        asStringMap[p.key] = calcReturn(startDate, endDate);
      } else if (p.type === "days" || p.type === "months" || p.type === "years") {
        const start = new Date(endDate);
        start.setDate(endDate.getDate() - toDays(p));
        asStringMap[p.key] = calcReturn(start, endDate);
      }
    }

    // Drawdowns
    if (bse500Data.length) {
      let peak = -Infinity;
      let maxDD = 0;
      for (const pt of bse500Data) {
        const nav = parseFloat(pt.nav);
        if (nav > peak) peak = nav;
        const dd = ((nav - peak) / peak) * 100;
        if (dd < maxDD) maxDD = dd;
      }
      const lastNav = parseFloat(bse500Data[bse500Data.length - 1].nav);
      const allTimePeak = Math.max(...bse500Data.map(pt => parseFloat(pt.nav)));
      const currDD = allTimePeak > 0 ? ((lastNav - allTimePeak) / allTimePeak) * 100 : 0;

      asStringMap["MDD"] = (-Math.abs(maxDD)).toFixed(2);
      asStringMap["currentDD"] = (-Math.abs(currDD)).toFixed(2);
    }

    return asStringMap;
  }, [bse500Data, currentEntry]);

  const combinedTrailing: CombinedTrailing | null = useMemo(() => {
    if (currentEntry.mode === "multi" || currentEntry.mode === "empty") return null;

    const portfolioTrailing = currentEntry.normalized?.trailingReturns;

    const fromApi =
      extractBenchmarkTrailing(currentEntry.raw, currentEntry.metadata) ||
      extractBenchmarkTrailing(currentEntry.normalized, currentEntry.metadata);

    let benchmarkTrailing: TrailingReturns | null = null;
    console.log(fromApi, "<<< fromApi benchmarkTrailing")
    if (fromApi) {
      benchmarkTrailing = fromApi;
    } else {
      const map = computeBenchmarkFromHook();
      benchmarkTrailing = {
        fiveDays: map["5d"],
        tenDays: map["10d"],
        fifteenDays: map["15d"],
        oneMonth: map["1m"],
        threeMonths: map["3m"],
        sixMonths: map["6m"],
        oneYear: map["1y"],
        twoYears: map["2y"],
        fiveYears: map["5y"],
        sinceInception: map["sinceInception"] ?? "-",
        MDD: map["MDD"],
        currentDD: map["currentDD"],
      };
    }
    console.log(portfolioTrailing, "{==========portfoliotrailing")
    return combineTrailing(portfolioTrailing, benchmarkTrailing);
  }, [currentEntry, computeBenchmarkFromHook]);

  // -----------------------------
  // Precomputed ReportModel (for PDF)
  // -----------------------------
  type ReportModel = {
    transactions: { date: string; amount: number }[];
    cashFlowTotals: { totalIn: number; totalOut: number; netFlow: number };
    metrics: { amountInvested: number; currentPortfolioValue: number; returns: number, returns_percent: number };

    equityCurve: EquityCurvePoint[];
    drawdownCurve: { date: string; value: number }[];
    combinedTrailing: CombinedTrailing | null;
    drawdown: string;

    monthlyPnl: Stats["monthlyPnl"] | null;
    quarterlyPnl: Stats["quarterlyPnl"] | null;

    lastDate: string | null;
    strategyName?: string;
    isTotalPortfolio?: boolean;
    isActive?: boolean;

    returnViewType: ReturnView;
    showOnlyQuarterlyCash?: boolean;
    showPmsQawView?: boolean;
  };

  const benchmarkCurves = useMemo(() => {
    if (!bse500Data?.length) return { benchmarkEquityCurve: [], benchmarkDrawdownCurve: [] };
    return makeBenchmarkCurves(
      bse500Data.map(pt => ({ date: pt.date, nav: pt.nav })),
      { alignStartTo: currentEntry?.equityCurve?.[0]?.date }
    );
  }, [bse500Data, currentEntry]);

  const reportModel: ReportModel = useMemo(() => {
    let eq: EquityCurvePoint[] = [];
    let dd: { date: string; value: number }[] = [];
    let drawdown = "0";
    let monthlyPnl: Stats["monthlyPnl"] | null = null;
    let quarterlyPnl: Stats["quarterlyPnl"] | null = null;
    let lastDate: string | null = null;
    let strategyName: string | undefined;
    let isTotalPortfolio = false;
    let isActive = true;
    let showOnlyQuarterlyCash = false;
    let showPmsQawView = false;

    // transactions
    let transactions: { date: string; amount: number }[] = [];
    if (currentEntry.mode === "sarla" || currentEntry.mode === "satidham") {
      const raw = (currentEntry as any).raw as Stats | PmsStats;
      transactions = (raw as any)?.cashFlows ?? [];
    } else if (currentEntry.mode === "single") {
      transactions = ((currentEntry as any).raw as any)?.cashFlows ?? [];
    } else if (currentEntry.mode === "multi") {
      transactions = (currentEntry as any).items.flatMap((it: any) => it.stats?.cashFlows ?? []);
    }

    const cashFlowTotals = transactions.reduce(
      (acc, tx) => {
        const amt = Number(tx.amount) || 0;
        if (amt > 0) acc.totalIn += amt;
        else if (amt < 0) acc.totalOut += amt;
        acc.netFlow += amt;
        return acc;
      },
      { totalIn: 0, totalOut: 0, netFlow: 0 }
    );

    // metrics
    let amountInvested = 0;
    let currentPortfolioValue = 0;
    let returns = 0;
    let returns_percent = 0;

    if (currentEntry.mode === "sarla" || currentEntry.mode === "satidham") {
      const raw = (currentEntry as any).raw as Stats | PmsStats;
      console.log(raw, "=======raw")
      if (isPmsStats(raw)) {
        amountInvested = raw.amountDeposited
        currentPortfolioValue = Number(raw.totalPortfolioValue ?? 0);
        returns_percent = Number(raw.return ?? 0)
        returns = Number(raw.totalPnl ?? 0);
      } else {
        amountInvested = raw.amountDeposited
        currentPortfolioValue = Number(raw.currentExposure ?? 0);
        returns_percent = Number(raw.return ?? 0)
        returns = Number(raw.totalProfit ?? 0);
      }

      eq = currentEntry.equityCurve;
      dd = currentEntry.drawdownCurve;
      drawdown = currentEntry.normalized.drawdown;
      monthlyPnl = currentEntry.normalized.monthlyPnl ?? null;
      quarterlyPnl = currentEntry.normalized.quarterlyPnl ?? null;
      lastDate = currentEntry.lastDate;
      strategyName = currentEntry.strategyName;
      isActive = currentEntry.isActive;
      isTotalPortfolio = currentEntry.isTotalPortfolio;

      // scheme toggles
      const CASH_PERCENT_STRATS_SARLA = ["Scheme A", "Scheme C", "Scheme D", "Scheme E", "Scheme F", "Scheme QAW", "Scheme B (inactive)"];
      const CASH_STRATS_SARLA = "Total Portfolio";
      const CASH_PERCENT_STRATS_SATIDHAM = ["Scheme B", "Scheme A", "Scheme A (Old)"];
      const CASH_STRATS_SATIDHAM = "Total Portfolio";

      const isCashOnly =
        (currentEntry.mode === "sarla" && strategyName === CASH_STRATS_SARLA) ||
        (currentEntry.mode === "satidham" && strategyName === CASH_STRATS_SATIDHAM);
      const isCashPercent =
        (currentEntry.mode === "sarla" && strategyName && CASH_PERCENT_STRATS_SARLA.includes(strategyName)) ||
        (currentEntry.mode === "satidham" && strategyName && CASH_PERCENT_STRATS_SATIDHAM.includes(strategyName));

      showOnlyQuarterlyCash = isCashOnly;
      showPmsQawView = isCashPercent;
    } else if (currentEntry.mode === "single") {
      const raw = (currentEntry as any).raw as Stats | PmsStats;
      if (isPmsStats(raw)) {
        amountInvested = raw.amountDeposited
        currentPortfolioValue = Number(raw.totalPortfolioValue ?? 0);
        returns_percent = Number(raw.return ?? 0)
        returns = Number(raw.totalPnl ?? 0);
      } else {
        amountInvested = raw.amountDeposited
        currentPortfolioValue = Number(raw.currentExposure ?? 0);
        returns_percent = Number(raw.return ?? 0)
        returns = Number(raw.totalProfit ?? 0);
      }

      eq = currentEntry.equityCurve;
      dd = currentEntry.drawdownCurve;
      drawdown = currentEntry.normalized.drawdown;
      monthlyPnl = currentEntry.normalized.monthlyPnl ?? null;
      quarterlyPnl = currentEntry.normalized.quarterlyPnl ?? null;
      lastDate = currentEntry.lastDate;
      strategyName = currentEntry.strategyName;
      isActive = currentEntry.isActive;
    } else if (currentEntry.mode === "multi") {
      // Merge only quarterlies for multi
      const merged = (currentEntry as any).items.reduce((acc: any, it: any) => {
        const s = isPmsStats(it.stats) ? convertPmsStatsToStats(it.stats) : (it.stats as Stats);
        return mergeQuarterly(acc, s.quarterlyPnl);
      }, {} as Record<string, { q1: number; q2: number; q3: number; q4: number; total: number }>);
      if (Object.keys(merged).length > 0) {
        const shaped: Stats["quarterlyPnl"] = {};
        for (const y of Object.keys(merged)) {
          const v = merged[y];
          shaped[y] = {
            percent: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
            cash: { q1: String(v.q1), q2: String(v.q2), q3: String(v.q3), q4: String(v.q4), total: String(v.total) },
            yearCash: String(v.total),
          };
        }
        quarterlyPnl = shaped;
      }
      // PV & returns aggregated
      for (const it of (currentEntry as any).items) {
        const st = it.stats as Stats | PmsStats;
        if (isPmsStats(st)) {
          amountInvested += Number(st.amountDeposited ?? 0);
          currentPortfolioValue += Number(st.totalPortfolioValue ?? 0);
          returns += Number(st.totalPnl ?? 0);
          returns_percent = Number(raw.return ?? 0)
        } else {
          amountInvested += Number(st.amountDeposited ?? 0);
          currentPortfolioValue += Number(st.currentExposure ?? 0);
          returns += Number(st.totalProfit ?? 0);
          returns_percent = Number(raw.return ?? 0)
        }
      }

    }

    return {
      transactions,
      cashFlowTotals,
      metrics: { amountInvested, currentPortfolioValue, returns, returns_percent },

      equityCurve: eq,
      drawdownCurve: dd,
      combinedTrailing, // ✅ precomputed
      drawdown,
      monthlyPnl,
      quarterlyPnl,

      lastDate,
      strategyName,
      isTotalPortfolio,
      isActive,

      returnViewType,
      showOnlyQuarterlyCash,
      showPmsQawView,
      ...benchmarkCurves,
    };
  }, [currentEntry, combinedTrailing, returnViewType]);

  // -----------------------------
  // PDF export (uses reportModel)
  // -----------------------------
  const handleDownloadPDF = async () => {
    try {
      setExporting(true);

      const formatter = (v: number) => v === 0 ? "-" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);

      const html = buildPortfolioReportHTML({
        // core data
        transactions: reportModel.transactions,
        cashFlowTotals: reportModel.cashFlowTotals,
        metrics: reportModel.metrics,

        equityCurve: reportModel.equityCurve,
        drawdownCurve: reportModel.drawdownCurve,
        benchmarkEquityCurve: reportModel.benchmarkEquityCurve,
        benchmarkDrawdownCurve: reportModel.benchmarkDrawdownCurve,
        combinedTrailing: reportModel.combinedTrailing || {
          sinceInception: { portfolio: "-", benchmark: "-" },
        },
        drawdown: reportModel.drawdown,

        monthlyPnl: reportModel.monthlyPnl,
        quarterlyPnl: reportModel.quarterlyPnl,

        lastDate: reportModel.lastDate,
        strategyName: reportModel.strategyName,
        isTotalPortfolio: reportModel.isTotalPortfolio,
        isActive: reportModel.isActive,

        returnViewType: "percent",
        showOnlyQuarterlyCash: reportModel.showOnlyQuarterlyCash,
        showPmsQawView: reportModel.showPmsQawView,

        // display helpers
        dateFormatter: (d) => new Date(d).toLocaleDateString("en-IN"),
        formatter: formatter,
        sessionUserName: session?.user?.name ?? "User",
        currentMetadata: {
          inceptionDate: currentMetadata?.inceptionDate ?? null,
          dataAsOfDate: currentMetadata?.dataAsOfDate ?? reportModel.lastDate ?? null,
        },
      });

      const w = window.open("", "_blank", "width=1200,height=900");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      }
    } catch (err) {
      console.error(err);
      alert("PDF export failed. See console for details.");
    } finally {
      setExporting(false);
    }
  };


  const handleDownloadCSV = () => {
    try {
      let csvData = [];
      let filename = 'portfolio_data.csv';

      if ((isSarla || isSatidham) && sarlaData && selectedStrategy) {
        // Handle Sarla/Satidham data
        const strategyData = sarlaData[selectedStrategy];
        const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;

        filename = `${selectedStrategy.replace(/\s+/g, '_')}_data.csv`;

        // Basic portfolio stats
        csvData.push(['Portfolio Statistics', '']);
        csvData.push(['Strategy Name', selectedStrategy]);
        csvData.push(['Amount Deposited', parseFloat(convertedStats.amountDeposited) || 0]);
        csvData.push(['Current Exposure', parseFloat(convertedStats.currentExposure) || 0]);
        csvData.push(['Total Return (%)', parseFloat(convertedStats.return) || 0]);
        csvData.push(['Total Profit', parseFloat(convertedStats.totalProfit) || 0]);
        csvData.push(['Max Drawdown (%)', parseFloat(convertedStats.drawdown) || 0]);
        csvData.push(['', '']); // Empty row

        // Trailing Returns
        csvData.push(['Trailing Returns', '']);
        const trailingReturns = convertedStats.trailingReturns as any;

        csvData.push(['5 Days', parseFloat(trailingReturns?.['5d'] || trailingReturns?.fiveDays) || 0]);
        csvData.push(['10 Days', parseFloat(trailingReturns?.['10d'] || trailingReturns?.tenDays) || 0]);
        csvData.push(['15 Days', parseFloat(trailingReturns?.['15d'] || trailingReturns?.fifteenDays) || 0]);
        csvData.push(['1 Month', parseFloat(trailingReturns?.['1m'] || trailingReturns?.oneMonth) || 0]);
        csvData.push(['3 Months', parseFloat(trailingReturns?.['3m'] || trailingReturns?.threeMonths) || 0]);
        csvData.push(['6 Months', parseFloat(trailingReturns?.['6m'] || trailingReturns?.sixMonths) || 0]);
        csvData.push(['1 Year', parseFloat(trailingReturns?.['1y'] || trailingReturns?.oneYear) || 0]);
        csvData.push(['2 Years', parseFloat(trailingReturns?.['2y'] || trailingReturns?.twoYears) || 0]);
        csvData.push(['Since Inception', parseFloat(trailingReturns?.sinceInception) || 0]);
        csvData.push(['Max Drawdown (MDD)', parseFloat(trailingReturns?.MDD || '') || 0]);
        csvData.push(['Current Drawdown', parseFloat(trailingReturns?.currentDD || '') || 0]);
        csvData.push(['', '']); // Empty row

        // Cash Flows Summary
        if (convertedStats.cashFlows && convertedStats.cashFlows.length > 0) {
          const cashFlowTotals = convertedStats.cashFlows.reduce(
            (acc, tx) => {
              const amount = Number(tx.amount);
              if (amount > 0) {
                acc.totalIn += amount;
              } else if (amount < 0) {
                acc.totalOut += amount;
              }
              acc.netFlow += amount;
              return acc;
            },
            { totalIn: 0, totalOut: 0, netFlow: 0 }
          );

          csvData.push(['Cash Flow Summary', '']);
          csvData.push(['Total Cash In', cashFlowTotals.totalIn]);
          csvData.push(['Total Cash Out', cashFlowTotals.totalOut]);
          csvData.push(['Net Cash Flow', cashFlowTotals.netFlow]);
          csvData.push(['', '']); // Empty row

          // Detailed Cash Flows
          csvData.push(['Cash Flows Detail', '']);
          csvData.push(['Date', 'Amount']);
          convertedStats.cashFlows.forEach(flow => {
            csvData.push([flow.date, Number(flow.amount)]);
          });
          csvData.push(['', '']); // Empty row
        }

        // Monthly P&L
        if (convertedStats.monthlyPnl) {
          csvData.push(['Monthly P&L', '']);
          csvData.push(['Year', 'Month', 'Percent Return', 'Cash Return', 'Capital In/Out']);

          Object.keys(convertedStats.monthlyPnl).forEach(year => {
            const yearData = convertedStats.monthlyPnl[year];
            Object.keys(yearData.months).forEach(month => {
              const monthData = yearData.months[month];
              csvData.push([
                year,
                month,
                parseFloat(monthData.percent) || 0,
                parseFloat(monthData.cash) || 0,
                parseFloat(monthData.capitalInOut || '0') || 0
              ]);
            });
          });
          csvData.push(['', '']); // Empty row
        }

        // Quarterly P&L
        if (convertedStats.quarterlyPnl) {
          csvData.push(['Quarterly P&L', '']);
          csvData.push(['Year', 'Quarter', 'Percent Return', 'Cash Return']);

          Object.keys(convertedStats.quarterlyPnl).forEach(year => {
            const yearData = convertedStats.quarterlyPnl[year];
            (['q1', 'q2', 'q3', 'q4'] as const).forEach(quarter => {
              csvData.push([
                year,
                quarter.toUpperCase(),
                parseFloat(yearData.percent[quarter]) || 0,
                parseFloat(yearData.cash[quarter]) || 0
              ]);
            });
          });
          csvData.push(['', '']); // Empty row
        }

      } else if (Array.isArray(stats)) {
        // Handle individual account data
        filename = 'individual_accounts_data.csv';

        stats.forEach((item, index) => {
          const convertedStats = isPmsStats(item.stats) ? convertPmsStatsToStats(item.stats) : item.stats;

          csvData.push([`Account ${index + 1}: ${item.metadata.account_name}`, '']);
          csvData.push(['Account Type', item.metadata.account_type.toUpperCase()]);
          csvData.push(['Broker', item.metadata.broker]);
          csvData.push(['Strategy', item.metadata.strategyName || 'Unknown']);
          csvData.push(['Amount Deposited', parseFloat(convertedStats.amountDeposited) || 0]);
          csvData.push(['Current Exposure', parseFloat(convertedStats.currentExposure) || 0]);
          csvData.push(['Total Return (%)', parseFloat(convertedStats.return) || 0]);
          csvData.push(['Total Profit', parseFloat(convertedStats.totalProfit) || 0]);
          csvData.push(['Max Drawdown (%)', parseFloat(convertedStats.drawdown) || 0]);
          csvData.push(['', '']); // Empty row

          // Trailing Returns for individual account
          csvData.push(['Trailing Returns', '']);
          const trailingReturns = convertedStats.trailingReturns as any;

          csvData.push(['5 Days', parseFloat(trailingReturns?.['5d'] || trailingReturns?.fiveDays) || 0]);
          csvData.push(['10 Days', parseFloat(trailingReturns?.['10d'] || trailingReturns?.tenDays) || 0]);
          csvData.push(['15 Days', parseFloat(trailingReturns?.['15d'] || trailingReturns?.fifteenDays) || 0]);
          csvData.push(['1 Month', parseFloat(trailingReturns?.['1m'] || trailingReturns?.oneMonth) || 0]);
          csvData.push(['3 Months', parseFloat(trailingReturns?.['3m'] || trailingReturns?.threeMonths) || 0]);
          csvData.push(['6 Months', parseFloat(trailingReturns?.['6m'] || trailingReturns?.sixMonths) || 0]);
          csvData.push(['1 Year', parseFloat(trailingReturns?.['1y'] || trailingReturns?.oneYear) || 0]);
          csvData.push(['2 Years', parseFloat(trailingReturns?.['2y'] || trailingReturns?.twoYears) || 0]);
          csvData.push(['5 Years', parseFloat(trailingReturns?.['5y'] || trailingReturns?.fiveYears) || 0]);
          csvData.push(['Since Inception', parseFloat(trailingReturns?.sinceInception) || 0]);
          csvData.push(['Max Drawdown (MDD)', parseFloat(trailingReturns?.MDD || '') || 0]);
          csvData.push(['Current Drawdown', parseFloat(trailingReturns?.currentDD || '') || 0]);
          csvData.push(['', '']); // Empty row

          // Cash Flow Summary for individual account
          if (convertedStats.cashFlows && convertedStats.cashFlows.length > 0) {
            const cashFlowTotals = convertedStats.cashFlows.reduce(
              (acc, tx) => {
                const amount = Number(tx.amount);
                if (amount > 0) {
                  acc.totalIn += amount;
                } else if (amount < 0) {
                  acc.totalOut += amount;
                }
                acc.netFlow += amount;
                return acc;
              },
              { totalIn: 0, totalOut: 0, netFlow: 0 }
            );

            csvData.push(['Cash Flow Summary', '']);
            csvData.push(['Total Cash In', cashFlowTotals.totalIn]);
            csvData.push(['Total Cash Out', cashFlowTotals.totalOut]);
            csvData.push(['Net Cash Flow', cashFlowTotals.netFlow]);
            csvData.push(['', '']); // Empty row
          }

          // Monthly P&L for individual account
          if (convertedStats.monthlyPnl) {
            csvData.push(['Monthly P&L', '']);
            csvData.push(['Year', 'Month', 'Percent Return', 'Cash Return', 'Capital In/Out']);

            Object.keys(convertedStats.monthlyPnl).forEach(year => {
              const yearData = convertedStats.monthlyPnl[year];
              Object.keys(yearData.months).forEach(month => {
                const monthData = yearData.months[month];
                csvData.push([
                  year,
                  month,
                  parseFloat(monthData.percent) || 0,
                  parseFloat(monthData.cash) || 0,
                  parseFloat(monthData.capitalInOut || '0') || 0
                ]);
              });
            });
            csvData.push(['', '']); // Empty row
          }

          // Quarterly P&L for individual account
          if (convertedStats.quarterlyPnl) {
            csvData.push(['Quarterly P&L', '']);
            csvData.push(['Year', 'Quarter', 'Percent Return', 'Cash Return']);

            Object.keys(convertedStats.quarterlyPnl).forEach(year => {
              const yearData = convertedStats.quarterlyPnl[year];
              (['q1', 'q2', 'q3', 'q4'] as const).forEach(quarter => {
                const percentReturn = yearData.percent[quarter];
                const cashReturn = yearData.cash[quarter];

                // Skip quarters with no data or invalid data
                if (percentReturn && cashReturn && percentReturn !== '-' && cashReturn !== '-') {
                  csvData.push([
                    year,
                    quarter.toUpperCase(),
                    parseFloat(percentReturn) || 0,
                    parseFloat(cashReturn) || 0
                  ]);
                }
              });
            });
            csvData.push(['', '']); // Empty row
          }

          csvData.push(['', '']); // Extra space between accounts
        });

      } else if (stats) {
        // Handle single account data
        const convertedStats = isPmsStats(stats) ? convertPmsStatsToStats(stats) : stats;
        const accountData = accounts.find((acc) => acc.qcode === selectedAccount);

        filename = `${accountData?.account_name?.replace(/\s+/g, '_') || 'portfolio'}_data.csv`;

        csvData.push(['Portfolio Statistics', '']);
        csvData.push(['Account Name', accountData?.account_name || 'Unknown']);
        csvData.push(['Account Type', accountData?.account_type?.toUpperCase() || 'Unknown']);
        csvData.push(['Broker', accountData?.broker || 'Unknown']);
        csvData.push(['Amount Deposited', parseFloat(convertedStats.amountDeposited) || 0]);
        csvData.push(['Current Exposure', parseFloat(convertedStats.currentExposure) || 0]);
        csvData.push(['Total Return (%)', parseFloat(convertedStats.return) || 0]);
        csvData.push(['Total Profit', parseFloat(convertedStats.totalProfit) || 0]);
        csvData.push(['Max Drawdown (%)', parseFloat(convertedStats.drawdown) || 0]);
        csvData.push(['', '']); // Empty row

        // Trailing Returns for single account
        csvData.push(['Trailing Returns', '']);
        const trailingReturns = convertedStats.trailingReturns as any;

        csvData.push(['5 Days', parseFloat(trailingReturns?.['5d'] || trailingReturns?.fiveDays) || 0]);
        csvData.push(['10 Days', parseFloat(trailingReturns?.['10d'] || trailingReturns?.tenDays) || 0]);
        csvData.push(['15 Days', parseFloat(trailingReturns?.['15d'] || trailingReturns?.fifteenDays) || 0]);
        csvData.push(['1 Month', parseFloat(trailingReturns?.['1m'] || trailingReturns?.oneMonth) || 0]);
        csvData.push(['3 Months', parseFloat(trailingReturns?.['3m'] || trailingReturns?.threeMonths) || 0]);
        csvData.push(['6 Months', parseFloat(trailingReturns?.['6m'] || trailingReturns?.sixMonths) || 0]);
        csvData.push(['1 Year', parseFloat(trailingReturns?.['1y'] || trailingReturns?.oneYear) || 0]);
        csvData.push(['2 Years', parseFloat(trailingReturns?.['2y'] || trailingReturns?.twoYears) || 0]);
        csvData.push(['5 Years', parseFloat(trailingReturns?.['5y'] || trailingReturns?.fiveYears) || 0]);
        csvData.push(['Since Inception', parseFloat(trailingReturns?.sinceInception) || 0]);
        csvData.push(['Max Drawdown (MDD)', parseFloat(trailingReturns?.MDD || '') || 0]);
        csvData.push(['Current Drawdown', parseFloat(trailingReturns?.currentDD || '') || 0]);
        csvData.push(['', '']); // Empty row

        // Cash Flow Summary for single account
        if (convertedStats.cashFlows && convertedStats.cashFlows.length > 0) {
          const cashFlowTotals = convertedStats.cashFlows.reduce(
            (acc, tx) => {
              const amount = Number(tx.amount);
              if (amount > 0) {
                acc.totalIn += amount;
              } else if (amount < 0) {
                acc.totalOut += amount;
              }
              acc.netFlow += amount;
              return acc;
            },
            { totalIn: 0, totalOut: 0, netFlow: 0 }
          );

          csvData.push(['Cash Flow Summary', '']);
          csvData.push(['Total Cash In', cashFlowTotals.totalIn]);
          csvData.push(['Total Cash Out', cashFlowTotals.totalOut]);
          csvData.push(['Net Cash Flow', cashFlowTotals.netFlow]);
          csvData.push(['', '']); // Empty row

          // Detailed Cash Flows
          csvData.push(['Cash Flows Detail', '']);
          csvData.push(['Date', 'Amount']);
          convertedStats.cashFlows.forEach(flow => {
            csvData.push([flow.date, Number(flow.amount)]);
          });
          csvData.push(['', '']); // Empty row
        }

        // Monthly P&L for single account
        if (convertedStats.monthlyPnl) {
          csvData.push(['Monthly P&L', '']);
          csvData.push(['Year', 'Month', 'Percent Return', 'Cash Return', 'Capital In/Out']);

          Object.keys(convertedStats.monthlyPnl).forEach(year => {
            const yearData = convertedStats.monthlyPnl[year];
            Object.keys(yearData.months).forEach(month => {
              const monthData = yearData.months[month];
              csvData.push([
                year,
                month,
                parseFloat(monthData.percent) || 0,
                parseFloat(monthData.cash) || 0,
                parseFloat(monthData.capitalInOut || '0') || 0
              ]);
            });
          });
          csvData.push(['', '']); // Empty row
        }

        // Quarterly P&L for single account
        if (convertedStats.quarterlyPnl) {
          csvData.push(['Quarterly P&L', '']);
          csvData.push(['Year', 'Quarter', 'Percent Return', 'Cash Return']);

          Object.keys(convertedStats.quarterlyPnl).forEach(year => {
            const yearData = convertedStats.quarterlyPnl[year];
            (['q1', 'q2', 'q3', 'q4'] as const).forEach(quarter => {
              const percentReturn = yearData.percent[quarter];
              const cashReturn = yearData.cash[quarter];

              // Skip quarters with no data or invalid data
              if (percentReturn && cashReturn && percentReturn !== '-' && cashReturn !== '-') {
                csvData.push([
                  year,
                  quarter.toUpperCase(),
                  parseFloat(percentReturn) || 0,
                  parseFloat(cashReturn) || 0
                ]);
              }
            });
          });
        }
      }

      // Convert to CSV string
      const csvContent = csvData.map(row =>
        row.map(field => {
          // Handle fields that might contain commas or quotes
          if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        }).join(',')
      ).join('\n');

      // Create and download the CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');

      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

    } catch (error) {
      console.error('Error generating CSV:', error);
      setError('Failed to generate CSV file');
    }
  };


  // -----------------------------
  // UI rendering helpers
  // -----------------------------
  const renderSarlaStrategyTabs = () => {
    if (!(isSarla || isSatidham) || !sarlaData || availableStrategies.length === 0) return null;
    return (
      <div className="mb-4 block sm:hidden">
        <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
          <SelectTrigger className="w-full border-0 card-shadow">
            <SelectValue placeholder="Select Strategy" />
          </SelectTrigger>
          <SelectContent>
            {availableStrategies.map((strategy) => {
              const active = sarlaData[strategy].metadata.isActive;
              return (
                <SelectItem key={strategy} value={strategy}>
                  {strategy} {!active ? "(Inactive)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <p><strong>Note:</strong> Inactive strategies may have limited data updates.</p>
        </div>
      </div>
    );
  };

  // -----------------------------
  // Render
  // -----------------------------
  if (status === "loading" || isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (error || !session?.user)
    return <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">{error || "Failed to load user data"}</div>;
  if (!isSarla && !isSatidham && accounts.length === 0)
    return <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">No accounts found for this user.</div>;
  if ((isSarla || isSatidham) && (!sarlaData || availableStrategies.length === 0)) {
    return <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">No strategy data found for {isSarla ? "Sarla" : "Satidham"} user.</div>;
  }

  const currentMetadata =
    (isSarla || isSatidham) && sarlaData && selectedStrategy
      ? sarlaData[selectedStrategy].metadata
      : metadata;

  console.log(currentEntry.equityCurve, "=============================equityCurve1")

  return (
    <div className="sm:p-2 space-y-6" ref={pdfRef} id="pdf-root">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-card-text-secondary font-heading">
            {getGreeting()}, {session?.user?.name || "User"}
          </h1>
          {currentMetadata && (
            <div className="flex flex-wrap items-center gap-2 text-sm mt-2 text-card-text-secondary font-heading-bold">
              <span>Inception Date: <strong>{currentMetadata.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A"}</strong></span>
              <span>|</span>
              <span>Data as of: <strong>{currentMetadata.dataAsOfDate ? dateFormatter(currentMetadata.dataAsOfDate) : "N/A"}</strong></span>
            </div>
          )}
        </div>
        <div
          className={`flex justify-content ${
            (isSarla || isSatidham) && sarlaData && availableStrategies.length > 0
              ? 'flex-col'
              : 'flex-row gap-2'
          }`}
        >
          {(isSarla || isSatidham) && sarlaData && availableStrategies.length > 0 && (
            <div className="hidden sm:block print-hide">
              <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-[400px] border-0 card-shadow text-button-text">
                  <SelectValue placeholder="Select Strategy" />
                </SelectTrigger>
                <SelectContent>
                  {availableStrategies.map(strategy => {
                    const active = sarlaData[strategy].metadata.isActive;
                    return (
                      <SelectItem key={strategy} value={strategy}>
                        {strategy} {!active ? "(Inactive)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2 flex-row w-full">
            <Button onClick={handleDownloadPDF} disabled={exporting} className="text-sm w-full max-w-4xl ml-auto mt-2">
              {exporting ? "Preparing..." : "Download PDF"}
            </Button>
            
            <Button onClick={handleDownloadCSV} disabled={exporting} className="text-sm w-full max-w-4xl ml-auto mt-2">
              {exporting ? "Preparing..." : "Download CSV"}
            </Button>
          </div>
        </div>
      </div>

      {renderSarlaStrategyTabs()}

      {(isSarla || isSatidham) ? (
        currentEntry.mode === "sarla" || currentEntry.mode === "satidham" ? (
          <div className="space-y-6">
            <div data-pdf="split" className="avoid-break space-y-6">
              <div className={`w-fit bg-logo-green font-heading text-button-text text-sm px-3 py-1 rounded-full ${!currentEntry.isActive ? "opacity-70" : ""}`}>
                <p className="text-xs">
                  {currentEntry.strategyName} {!currentEntry.isActive ? "(Inactive)" : ""}
                </p>
              </div>

              <StatsCards
                stats={currentEntry.normalized}
                accountType="sarla"
                broker="Sarla"
                isTotalPortfolio={currentEntry.isTotalPortfolio}
                isActive={currentEntry.isActive}
                returnViewType={returnViewType}
                setReturnViewType={setReturnViewType}
              />

              {!currentEntry.isTotalPortfolio ? (
                <div className="flex flex-col sm:flex-col gap-4 w-full max-w-full overflow-hidden">
                  <Card className="bg-white/50 border-0">
                    <CardContent className="p-4">
                      <TrailingReturnsTable
                        equityCurve={currentEntry.equityCurve}
                        drawdown={currentEntry.normalized.drawdown}
                        trailingReturns={currentEntry.normalized.trailingReturns as any}
                      />
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <PnlTable
                  quarterlyPnl={currentEntry.normalized.quarterlyPnl}
                  monthlyPnl={currentEntry.normalized.monthlyPnl}
                  showOnlyQuarterlyCash={reportModel.showOnlyQuarterlyCash}
                  showPmsQawView={reportModel.showPmsQawView}
                />
              )}
            </div>

            {!currentEntry.isTotalPortfolio && (
              <>
                <div data-pdf="page" className="avoid-break space-y-6">
                  <div className="flex-1">
                    <RevenueChart
                      equityCurve={currentEntry.equityCurve}
                      drawdownCurve={currentEntry.drawdownCurve}
                      trailingReturns={currentEntry.normalized.trailingReturns}
                      drawdown={currentEntry.normalized.drawdown}
                      lastDate={currentEntry.lastDate}
                    />
                  </div>
                </div>

                <div data-pdf="split" className="avoid-break">
                  <PnlTable
                    quarterlyPnl={currentEntry.normalized.quarterlyPnl}
                    monthlyPnl={currentEntry.normalized.monthlyPnl}
                    showOnlyQuarterlyCash={reportModel.showOnlyQuarterlyCash}
                    showPmsQawView={reportModel.showPmsQawView}
                  />
                </div>
              </>
            )}

            {/* CASH FLOWS (shadcn Table) */}
            <div data-pdf="split" className="avoid-break">
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0 p-4">
                <CardTitle className="text-sm sm:text-lg text-black">Cash In / Out</CardTitle>
                <CardContent className="p-0 mt-4">
                  <CashFlowTable
                    transactions={reportModel.transactions}
                    totals={reportModel.cashFlowTotals}
                    showAccountColumn={false}
                  />
                </CardContent>
              </Card>
              {!currentEntry.isActive && (
                <div className="text-sm text-yellow-600">
                  <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
                </div>
              )}
            </div>
          </div>
        ) : null
      ) : (
        // Standard user
        stats && (
          <div className="space-y-6">
            {Array.isArray((currentEntry as any).items) ? (
              (currentEntry as any).items.map((item: any, index: number) => {
                const normalized = normalizeToStats(item.stats);
                const filteredEquityCurve = filterEquityCurve(
                  item.stats.equityCurve,
                  item.metadata.filtersApplied?.startDate ?? null,
                  item.metadata.lastUpdated ?? null
                );
                const lastDate = getLastDate(filteredEquityCurve, item.metadata.lastUpdated ?? null);
                return (
                  <div key={index} className="space-y-6">
                    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                      <CardHeader>
                        <CardTitle className="text-card-text text-sm sm:text-sm">
                          {item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker})
                          {!item.metadata.isActive ? " (Inactive)" : ""}
                        </CardTitle>
                        <div className="text-sm text-card-text-secondary">
                          Strategy: <strong>{item.metadata.strategyName || "Unknown Strategy"}</strong>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div data-pdf="split" className="avoid-break">
                          <StatsCards
                            stats={normalized}
                            accountType={item.metadata.account_type}
                            broker={item.metadata.broker}
                            isActive={item.metadata.isActive}
                            returnViewType={returnViewType}
                            setReturnViewType={setReturnViewType}
                          />
                        </div>
                        <div className="flex flex-col sm:flex-col gap-4 w-full max-w-full overflow-hidden">
                          <Card className="bg-white/50 border-0">
                            <CardContent className="p-4">
                              <TrailingReturnsTable
                                equityCurve={currentEntry.equityCurve}
                                drawdown={currentEntry.normalized.drawdown}
                                trailingReturns={currentEntry.normalized.trailingReturns as any}
                              />
                            </CardContent>
                          </Card>
                        </div>
                        <div data-pdf="split" className="avoid-break">
                          <RevenueChart
                            equityCurve={filteredEquityCurve}
                            drawdownCurve={item.stats.drawdownCurve}
                            trailingReturns={normalized.trailingReturns}
                            drawdown={normalized.drawdown}
                            lastDate={lastDate}
                          />
                        </div>
                        <div data-pdf="split" className="avoid-break">
                          <PnlTable quarterlyPnl={normalized.quarterlyPnl} monthlyPnl={normalized.monthlyPnl} />
                          {!item.metadata.isActive && (
                            <div className="text-sm text-yellow-600">
                              <strong>Note:</strong> This account is inactive. Data may not be updated regularly.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })
            ) : currentEntry.mode === "single" ? (
              <>
                <div data-pdf="split" className="avoid-break">
                  <StatsCards
                    stats={currentEntry.normalized}
                    accountType={accounts.find(acc => acc.qcode === selectedAccount)?.account_type || "unknown"}
                    broker={accounts.find(acc => acc.qcode === selectedAccount)?.broker || "Unknown"}
                    isActive={currentEntry.isActive}
                    returnViewType={returnViewType}
                    setReturnViewType={setReturnViewType}
                  />
                </div>
                <div className="flex flex-col sm:flex-col gap-4 w-full max-w-full overflow-hidden">
                  <Card className="bg-white/50 border-0">
                    <CardContent className="p-4">
                      <TrailingReturnsTable
                        equityCurve={currentEntry.equityCurve}
                        drawdown={currentEntry.normalized.drawdown}
                        trailingReturns={currentEntry.normalized.trailingReturns as any}
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
                  <div className="flex-1 min-w-0 sm:w-5/6">
                    <RevenueChart
                      equityCurve={currentEntry.equityCurve}
                      drawdownCurve={currentEntry.drawdownCurve}
                      trailingReturns={currentEntry.normalized.trailingReturns}
                      drawdown={currentEntry.normalized.drawdown}
                      lastDate={currentEntry.lastDate}
                    />
                  </div>
                </div>

                <div data-pdf="split" className="avoid-break">
                  <PnlTable quarterlyPnl={currentEntry.normalized.quarterlyPnl} monthlyPnl={currentEntry.normalized.monthlyPnl} />
                </div>

                {/* CASH FLOWS (shadcn Table) */}
                <div data-pdf="split" className="avoid-break">
                  <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0 p-4">
                    <CardTitle className="text-sm sm:text-lg text-black">Cash In / Out</CardTitle>
                    <CardContent className="p-0 mt-4">
                      <CashFlowTable
                        transactions={reportModel.transactions}
                        totals={reportModel.cashFlowTotals}
                        showAccountColumn={viewMode === "individual"}
                        getAccountName={
                          viewMode === "individual" && Array.isArray(stats)
                            ? (t) => {
                              // Best-effort: find the first item whose cashFlows include a tx with same date+amount
                              const hit = (stats as any[]).find((it) =>
                                (it.stats?.cashFlows || []).some((x: any) => x.date === t.date && Number(x.amount) === Number(t.amount))
                              );
                              return hit?.metadata?.account_name;
                            }
                            : undefined
                        }
                      />
                    </CardContent>
                  </Card>
                  {!currentEntry.isActive && (
                    <div className="text-sm text-yellow-600">
                      <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )
      )}
    </div>
  );
}
