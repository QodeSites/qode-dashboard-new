"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { findByIcode } from "@/app/lib/bifurcated-clients-registry";
import { useRouter } from "next/navigation";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { PnlTable } from "@/components/PnlTable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StockTable from "@/components/StockTable";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { Download } from "lucide-react";
import { buildPortfolioReportHTML } from "@/components/buildPortfolioReportHTML";
import { generateExcelReport } from "@/components/generateExcelReport";

// Interfaces for stats
interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: {
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
  drawdown: string;
  equityCurve: { date: string; value: number }[];
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
  equityCurve: { date: string; value: number }[];
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
  trailingReturns: {
    fiveDays: string | null;
    tenDays: string | null;
    oneMonth: string | null;
    threeMonths: string | null;
    sixMonths: string | null;
    oneYear: string | null;
    twoYears: string | null;
    fiveYears: string | null;
    sinceInception: string;
    MDD: string;
    currentDD: string;
  };
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
}

interface SarlaApiResponse {
  [strategyName: string]: {
    data: Stats | PmsStats;
    metadata: Metadata;
  };
}

function isPmsStats(stats: Stats | PmsStats): stats is PmsStats {
  return "totalPortfolioValue" in stats;
}

function convertPmsStatsToStats(pmsStats: PmsStats): Stats {
  const amountDeposited = pmsStats.cashFlows
    .filter(flow => flow.amount > 0)
    .reduce((sum, flow) => sum + flow.amount, 0);

  return {
    amountDeposited: amountDeposited.toFixed(2),
    currentExposure: pmsStats.totalPortfolioValue,
    return: pmsStats.cumulativeReturn,
    totalProfit: pmsStats.totalPnl,
    trailingReturns: {
      fiveDays: pmsStats.trailingReturns.fiveDays,
      tenDays: pmsStats.trailingReturns.tenDays,
      fifteenDays: pmsStats.trailingReturns.oneMonth,
      oneMonth: pmsStats.trailingReturns.oneMonth,
      threeMonths: pmsStats.trailingReturns.threeMonths,
      sixMonths: pmsStats.trailingReturns.sixMonths,
      oneYear: pmsStats.trailingReturns.oneYear,
      twoYears: pmsStats.trailingReturns.twoYears,
      fiveYears: pmsStats.trailingReturns.fiveYears,
      sinceInception: pmsStats.trailingReturns.sinceInception,
      MDD: pmsStats.trailingReturns.MDD,
      currentDD: pmsStats.trailingReturns.currentDD,
    },
    drawdown: pmsStats.maxDrawdown,
    equityCurve: pmsStats.equityCurve,
    drawdownCurve: pmsStats.drawdownCurve,
    quarterlyPnl: Object.keys(pmsStats.quarterlyPnl).reduce((acc, year) => {
      acc[year] = {
        ...pmsStats.quarterlyPnl[year],
        yearCash: pmsStats.quarterlyPnl[year].yearCash || pmsStats.quarterlyPnl[year].cash.total,
      };
      return acc;
    }, {} as Stats["quarterlyPnl"]),
    monthlyPnl: Object.keys(pmsStats.monthlyPnl).reduce((acc, year) => {
      const yearData = pmsStats.monthlyPnl[year];
      acc[year] = {
        ...yearData,
        months: Object.keys(yearData.months).reduce((monthAcc, month) => {
          monthAcc[month] = {
            ...yearData.months[month],
            capitalInOut: yearData.months[month].capitalInOut || "0",
          };
          return monthAcc;
        }, {} as { [month: string]: { percent: string; cash: string; capitalInOut: string } }),
        totalCapitalInOut: yearData.totalCapitalInOut || 0,
      };
      return acc;
    }, {} as Stats["monthlyPnl"]),
    cashFlows: pmsStats.cashFlows,
  };
}

function filterEquityCurve(equityCurve: { date: string; value: number }[], startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return equityCurve;

  const start = new Date(startDate);
  const end = new Date(endDate);

  return equityCurve.filter((entry) => {
    const entryDate = new Date(entry.date);
    return entryDate >= start && entryDate <= end;
  });
}

const formatter = new Intl.NumberFormat("en-IN", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getGreeting = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();

  if (hours >= 0 && hours < 12) {
    return "Good Morning";
  } else if (hours >= 12 && hours < 17) {
    return "Good Afternoon";
  } else {
    return "Good Evening";
  }
};

// Helper function to fetch and calculate benchmark returns for PDF/Excel export
interface BenchmarkResult {
  returns: { [key: string]: string };
  equityCurve: { date: string; nav: number }[];
  drawdownCurve: { date: string; value: number }[];
}

async function fetchBenchmarkReturns(
  equityCurve: { date: string; value: number }[]
): Promise<BenchmarkResult> {
  const emptyResult: BenchmarkResult = {
    returns: {
      "5d": "-", "10d": "-", "15d": "-", "1m": "-", "3m": "-", "6m": "-",
      "1y": "-", "2y": "-", "sinceInception": "-", "MDD": "-", "currentDD": "-"
    },
    equityCurve: [],
    drawdownCurve: [],
  };

  if (!equityCurve?.length) return emptyResult;

  const benchmarkReturns = { ...emptyResult.returns };

  try {
    const startDate = equityCurve[0].date;
    const endDate = equityCurve[equityCurve.length - 1].date;

    const fetchStartDateObj = new Date(startDate);
    fetchStartDateObj.setDate(fetchStartDateObj.getDate() - 10);
    const fetchStartDate = fetchStartDateObj.toISOString().split('T')[0];

    const response = await fetch(
      "https://qode360-backend.qodeinvest.com/api/v1/returns/indices/?downloadNav=true",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          startDate: fetchStartDate,
          endDate: endDate,
          indices: ["NIFTY 50"],
        }),
      }
    );
    if (!response.ok) return emptyResult;

    const result = await response.json();
    const rawData = result?.data?.data?.["NIFTY 50"];
    const rawBenchmarkData: { date: string; nav: string }[] = Array.isArray(rawData)
      ? rawData.map((d: { date: string; nav: number }) => ({
          date: d.date,
          nav: d.nav.toString(),
        }))
      : [];

    if (!rawBenchmarkData.length) return emptyResult;

    let effectiveStartDate = startDate;
    const startDateTime = new Date(startDate).getTime();
    const startDateExists = rawBenchmarkData.some(
      (d) => new Date(d.date).getTime() === startDateTime
    );

    if (!startDateExists) {
      const previousTradingDays = rawBenchmarkData
        .filter((d) => new Date(d.date).getTime() < startDateTime)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (previousTradingDays.length > 0) {
        effectiveStartDate = previousTradingDays[0].date;
      }
    }

    const bse500Data = rawBenchmarkData.filter(
      (d) => new Date(d.date) >= new Date(effectiveStartDate) && new Date(d.date) <= new Date(endDate)
    );

    if (!bse500Data.length) return emptyResult;

    const endDateObj = new Date(endDate);

    const findNav = (targetDate: Date): number => {
      const exactMatch = bse500Data.find(
        (point) => new Date(point.date).toDateString() === targetDate.toDateString()
      );
      if (exactMatch) return parseFloat(exactMatch.nav);

      let closestPrevious: { nav: number } | null = null;
      let closestPreviousDiff = Infinity;

      bse500Data.forEach((point) => {
        const pointDate = new Date(point.date);
        const timeDiff = targetDate.getTime() - pointDate.getTime();
        if (timeDiff >= 0 && timeDiff < closestPreviousDiff) {
          closestPreviousDiff = timeDiff;
          closestPrevious = { nav: parseFloat(point.nav) };
        }
      });

      return closestPrevious?.nav || 0;
    };

    const calculateReturn = (start: Date, end: Date): string => {
      const startNav = findNav(start);
      const endNav = findNav(end);

      if (startNav && endNav && startNav !== 0) {
        const durationYears = (end.getTime() - start.getTime()) / (365 * 24 * 60 * 60 * 1000);
        let returnValue: number;

        if (durationYears >= 1) {
          returnValue = (Math.pow(endNav / startNav, 1 / durationYears) - 1) * 100;
        } else {
          returnValue = ((endNav - startNav) / startNav) * 100;
        }
        return returnValue.toFixed(2);
      }
      return "-";
    };

    const periods = [
      { key: "5d", days: 5 },
      { key: "10d", days: 10 },
      { key: "15d", days: 15 },
      { key: "1m", days: 30 },
      { key: "3m", days: 90 },
      { key: "6m", days: 180 },
      { key: "1y", days: 365 },
      { key: "2y", days: 730 },
    ];

    periods.forEach(({ key, days }) => {
      const start = new Date(endDateObj);
      start.setDate(endDateObj.getDate() - days);
      benchmarkReturns[key] = calculateReturn(start, endDateObj);
    });

    const inceptionStart = new Date(bse500Data[0].date);
    benchmarkReturns["sinceInception"] = calculateReturn(inceptionStart, endDateObj);

    let maxDrawdown = 0;
    let peakNav = -Infinity;
    const currentNav = parseFloat(bse500Data[bse500Data.length - 1].nav);

    // Build benchmark equity curve and drawdown curve for chart rendering
    const benchmarkEquityCurve: { date: string; nav: number }[] = [];
    const benchmarkDrawdownCurve: { date: string; value: number }[] = [];

    bse500Data.forEach((point) => {
      const nav = parseFloat(point.nav);
      if (nav > peakNav) peakNav = nav;
      const drawdownValue = ((nav - peakNav) / peakNav) * 100;
      if (drawdownValue < maxDrawdown) maxDrawdown = drawdownValue;

      benchmarkEquityCurve.push({ date: point.date, nav });
      benchmarkDrawdownCurve.push({ date: point.date, value: Math.abs(drawdownValue) });
    });

    const currentDrawdown = peakNav > 0 ? ((currentNav - peakNav) / peakNav) * 100 : 0;

    benchmarkReturns["MDD"] = (-Math.abs(maxDrawdown)).toFixed(2);
    benchmarkReturns["currentDD"] = (-Math.abs(currentDrawdown)).toFixed(2);

    return {
      returns: benchmarkReturns,
      equityCurve: benchmarkEquityCurve,
      drawdownCurve: benchmarkDrawdownCurve,
    };

  } catch (err) {
    console.error("Error fetching benchmark data for export:", err);
  }

  return emptyResult;
}

export default function Portfolio() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

  // Admin impersonation: use impersonated icode if available
  const isAdmin = session?.user?.accessType === "admin";
  const isImpersonating = isAdmin && !!session?.user?.impersonating;
  const effectiveIcode = isImpersonating
    ? session.user.impersonating!.icode
    : session?.user?.icode;

  const isSarla = effectiveIcode === "QUS0007";
  const isSatidham = effectiveIcode === "QUS0010";
  // Registry-driven for all bifurcated_master_sheet_test clients.
  const bifurcatedClient = findByIcode(effectiveIcode);
  // Single-strategy clients (renderMode: "single") render through the
  // existing no-dropdown single-strategy path, NOT the dropdown bifurcated
  // path — so they are deliberately excluded from isBifurcatedClient.
  const isSingleStrategyBifurcated = bifurcatedClient?.renderMode === "single";
  const isBifurcatedClient = !!bifurcatedClient && !isSingleStrategyBifurcated;
  // Read URL params directly to avoid useSearchParams() which triggers a Suspense boundary
  // and causes a loading flicker (Suspense fallback → page loading state).
  // Safe because during SSR status="loading" so the loading UI renders regardless of param values.
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const accountCode = urlParams?.get("accountCode") || "AC5";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"consolidated" | "individual">("consolidated");
  const [stats, setStats] = useState<(Stats | PmsStats) | { stats: Stats | PmsStats; metadata: Account & { strategyName: string; isActive: boolean } }[] | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sarlaData, setSarlaData] = useState<SarlaApiResponse | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [availableStrategies, setAvailableStrategies] = useState<string[]>([]);
const [returnViewType, setReturnViewType] = useState<"percent" | "cash">("percent");
  const [exporting, setExporting] = useState(false);
  const hasFetchedRef = useRef(false);

  // Exit impersonation handler
  const handleExitImpersonation = async () => {
    await updateSession({ impersonating: null });
    router.push("/admin");
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    // Admins can use this page only while impersonating.
    if (status === "authenticated" && isAdmin && !isImpersonating) {
      router.push("/admin");
      return;
    }

    if (status === "authenticated") {
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;
      if (isSarla) {
        const fetchSarlaData = async () => {
          try {
            const res = await fetch(`/api/sarla-api?qcode=QAC00041&accountCode=${accountCode}`, { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to load Sarla data for accountCode ${accountCode}`);
            }
            const data: SarlaApiResponse = await res.json();
            setSarlaData(data);

            const strategies = Object.keys(data);
            setAvailableStrategies(strategies);

            if (strategies.length > 0) {
              setSelectedStrategy(strategies[0]);
            }

            setIsLoading(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : `An unexpected error occurred for accountCode ${accountCode}`);
            setIsLoading(false);
          }
        };

        fetchSarlaData();
      } else if (isSatidham) {
        const fetchSatidhamData = async () => {
          try {
            const res = await fetch(`/api/sarla-api?qcode=QAC00046&accountCode=${accountCode}`, { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to load Satidham data for accountCode ${accountCode}`);
            }
            const data: SarlaApiResponse = await res.json();
            setSarlaData(data);

            const strategies = Object.keys(data);
            setAvailableStrategies(strategies);

            if (strategies.length > 0) {
              setSelectedStrategy(strategies[0]);
            }

            setIsLoading(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : `An unexpected error occurred for accountCode ${accountCode}`);
            setIsLoading(false);
          }
        };

        fetchSatidhamData();
      } else if (isBifurcatedClient && bifurcatedClient) {
        const bifurcatedConfig = {
          api: "/api/bifurcated-portfolio",
          qcode: bifurcatedClient.qcode,
          name: bifurcatedClient.displayName,
        };

        const fetchBifurcatedData = async () => {
          try {
            const res = await fetch(`${bifurcatedConfig.api}?qcode=${bifurcatedConfig.qcode}`, { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to load ${bifurcatedConfig.name} data`);
            }
            const data: SarlaApiResponse = await res.json();
            setSarlaData(data);

            const strategies = Object.keys(data);
            setAvailableStrategies(strategies);

            if (strategies.length > 0) {
              setSelectedStrategy(strategies[0]);
            }

            setIsLoading(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : `An unexpected error occurred`);
            setIsLoading(false);
          }
        };

        fetchBifurcatedData();
      } else if (isSingleStrategyBifurcated && bifurcatedClient) {
        // Single-strategy bifurcated client: fetch the same parameterized
        // route, but the response has exactly one scheme key. Unwrap it into
        // the `stats`/`metadata` state so the existing single-strategy render
        // path (no dropdown) displays it.
        const ssClient = bifurcatedClient;
        const fetchSingleStrategyData = async () => {
          try {
            const res = await fetch(`/api/bifurcated-portfolio?qcode=${ssClient.qcode}`, { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to load ${ssClient.displayName} data`);
            }
            const data: SarlaApiResponse = await res.json();
            const entry = Object.values(data)[0] as { data: Stats; metadata: Metadata | null };
            if (!entry?.data) {
              throw new Error(`No scheme data returned for ${ssClient.displayName}`);
            }
            setStats(entry.data as Stats);
            setMetadata(entry.metadata ?? null);
            setIsLoading(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : `An unexpected error occurred`);
            setIsLoading(false);
          }
        };

        fetchSingleStrategyData();
      } else {
        const fetchAccounts = async () => {
          try {
            const res = await fetch("/api/accounts", { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || "Failed to load accounts");
            }
            const data: Account[] = await res.json();
            setAccounts(data);
            if (data.length > 0) {
              setSelectedAccount(data[0].qcode);
              // Don't set isLoading=false here — the portfolio fetch (triggered by
              // selectedAccount change) will set it once the actual data is loaded.
            } else {
              setIsLoading(false);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred");
            setIsLoading(false);
          }
        };

        fetchAccounts();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router, isSarla, isSatidham, isBifurcatedClient, isSingleStrategyBifurcated, accountCode, isAdmin, isImpersonating]);

  useEffect(() => {
    if (selectedAccount && status === "authenticated" && !isSarla && !isSatidham && !isBifurcatedClient && !isSingleStrategyBifurcated) {
      const fetchAccountData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const selectedAccountData = accounts.find((acc) => acc.qcode === selectedAccount);
          if (!selectedAccountData) {
            throw new Error("Selected account not found");
          }

          const endpoint =
            selectedAccountData.account_type === "pms"
              ? `/api/pms-data?qcode=${selectedAccount}&viewMode=${viewMode}&accountCode=${accountCode}`
              : `/api/portfolio?viewMode=${viewMode}${selectedAccount !== "all" ? `&qcode=${selectedAccount}` : ""}&accountCode=${accountCode}`;

          const res = await fetch(endpoint, { credentials: "include" });
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || `Failed to load data for account ${selectedAccount} with accountCode ${accountCode}`);
          }

          const response = await res.json();

          let statsData: Stats | PmsStats | Array<any>;
          let metadataData: Metadata | null = null;

          if ('data' in response && response.data !== undefined) {
            if (viewMode === "individual" && Array.isArray(response.data)) {
              statsData = response.data;
              metadataData = null;
            } else {
              statsData = response.data as Stats | PmsStats;
              metadataData = response.metadata || null;
            }
          } else {
            if (selectedAccountData.account_type === "pms") {
              const pmsData = response as any;

              if (pmsData.cashInOut && !pmsData.cashFlows) {
                if (pmsData.cashInOut.transactions) {
                  pmsData.cashFlows = pmsData.cashInOut.transactions.map((tx: any) => ({
                    date: tx.date,
                    amount: parseFloat(tx.amount)
                  }));
                } else {
                  pmsData.cashFlows = [];
                }
              }

              if (!pmsData.cashFlows) {
                pmsData.cashFlows = [];
              }

              statsData = pmsData as PmsStats;

              metadataData = {
                icode: selectedAccount,
                accountCount: 1,
                inceptionDate: null,
                dataAsOfDate: null,
                lastUpdated: new Date().toISOString(),
                strategyName: selectedAccountData.account_name || "PMS Portfolio",
                filtersApplied: {
                  accountType: selectedAccountData.account_type,
                  broker: selectedAccountData.broker,
                  startDate: null,
                  endDate: null
                },
                isActive: true
              };

              if (pmsData.equityCurve && pmsData.equityCurve.length > 0) {
                const sortedCurve = [...pmsData.equityCurve].sort(
                  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                metadataData.inceptionDate = sortedCurve[0].date;
                metadataData.dataAsOfDate = sortedCurve[sortedCurve.length - 1].date;
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
                  strategyName: selectedAccountData.account_name || "Portfolio",
                  filtersApplied: {
                    accountType: selectedAccountData.account_type,
                    broker: selectedAccountData.broker,
                    startDate: null,
                    endDate: null
                  },
                  isActive: true
                };
              }
            }
          }

          if (statsData) {
            setStats(statsData);
            setMetadata(metadataData);
          } else {
            throw new Error("No valid data received from API");
          }

          setIsLoading(false);
        } catch (err) {
          console.error("Error in fetchAccountData:", err);
          setError(err instanceof Error ? err.message : `An unexpected error occurred for accountCode ${accountCode}`);
          setIsLoading(false);
        }
      };

      fetchAccountData();
    }
  }, [selectedAccount, accounts, status, viewMode, isSarla, isSatidham, accountCode]);

  const renderCashFlowsTable = () => {
    let transactions: { date: string; amount: number }[] = [];

    if ((isSarla || isSatidham || isBifurcatedClient) && sarlaData && selectedStrategy) {
      transactions = sarlaData[selectedStrategy]?.data?.cashFlows || [];
    } else if (Array.isArray(stats)) {
      transactions = stats.flatMap((item) => item.stats.cashFlows || []);
    } else {
      transactions = stats?.cashFlows || [];
    }

    const cashFlowTotals = transactions.reduce(
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

    if (!transactions.length) {
      return (
        <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
          <CardHeader>
            <CardTitle className="text-sm sm:text-lg text-card-text">Cash In / Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-3 text-card-text">
              No cash flow data available
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0 p-4">
          <CardTitle className="text-sm sm:text-lg text-card-text">Cash In / Out</CardTitle>
        <CardContent className="p-0 mt-4">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow className="bg-black/5 hover:bg-[#e5e7eb] border-b border-[#e5e7eb]">
                  <TableHead className="py-1 text-left text-xs font-medium text-card-text uppercase tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="py-1 text-right text-xs font-medium text-card-text uppercase tracking-wider">
                    Amount (₹)
                  </TableHead>
                  {viewMode === "individual" && (
                    <TableHead className="py-1 text-left text-xs font-medium text-card-text uppercase tracking-wider">
                      Account
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction, index) => {
                  const accountName = Array.isArray(stats)
                    ? stats.find((item) => item.stats.cashFlows?.includes(transaction))?.metadata.account_name
                    : undefined;
                  return (
                    <TableRow key={`${transaction.date}-${index}`} className="border-b border-[#e5e7eb]">
                      <TableCell className="py-2 text-xs text-card-text-secondary">
                        {dateFormatter(transaction.date)}
                      </TableCell>
                      <TableCell
                        className={`py-2 text-xs font-medium text-right ${Number(transaction.amount) > 0 ? "text-[#166534]" : "text-[#dc2626]"}`}
                      >
                        {formatter.format(Number(transaction.amount))}
                      </TableCell>
                      {viewMode === "individual" && (
                        <TableCell className="py-2 text-xs text-card-text-secondary">
                          {accountName || "Unknown"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                <TableRow className="border-t border-[#e5e7eb] font-semibold">
                  <TableCell className="py-2 text-xs text-card-text">Total In</TableCell>
                  <TableCell className="py-2 text-xs text-right text-[#166534]">
                    {formatter.format(cashFlowTotals.totalIn)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="py-2 text-xs text-card-text">Total Out</TableCell>
                  <TableCell className="py-2 text-xs text-right text-[#dc2626]">
                    {formatter.format(cashFlowTotals.totalOut)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="py-2 text-xs text-card-text">Net Flow</TableCell>
                  <TableCell
                    className={`py-2 text-xs text-right font-semibold ${cashFlowTotals.netFlow >= 0 ? "text-[#166534]" : "text-[#dc2626]"}`}
                  >
                    {formatter.format(cashFlowTotals.netFlow)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 pt-3 border-t border-[#e5e7eb]">
            <div className="text-xs text-card-text-secondary space-y-1">
              <p><strong className="text-card-text">Note:</strong></p>
              <p>• Positive numbers represent cash inflows</p>
              <p>• Negative numbers represent cash outflows</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const getLastDate = (
    equityCurve: { date: string; value: number }[],
    lastUpdated: string | null
  ): string | null => {
    if (equityCurve.length > 0) {
      const sortedCurve = [...equityCurve].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      return sortedCurve[0].date;
    }
    return lastUpdated || null;
  };

  // Export handler functions
  const handleDownloadPDF = async (convertedStats: Stats, strategyName: string, isTotalPortfolio: boolean, exportMetadata?: { inceptionDate?: string | null; dataAsOfDate?: string | null }, hasNavBasedTotalPortfolio: boolean = false, pmsBlendedTP: boolean = false) => {
    try {
      setExporting(true);
      const cashFlows = convertedStats.cashFlows || [];
      const cashFlowTotals = cashFlows.reduce(
        (acc, tx) => {
          const amount = Number(tx.amount);
          if (amount > 0) acc.totalIn += amount;
          else if (amount < 0) acc.totalOut += amount;
          acc.netFlow += amount;
          return acc;
        },
        { totalIn: 0, totalOut: 0, netFlow: 0 }
      );

      const tr = convertedStats.trailingReturns as Record<string, unknown>;
      const getTrailingValue = (longKey: string, shortKey: string) =>
        tr[longKey] ?? tr[shortKey] ?? null;

      const benchmark = await fetchBenchmarkReturns(convertedStats.equityCurve);
      const benchmarkReturns = benchmark.returns;

      const html = buildPortfolioReportHTML({
        transactions: cashFlows,
        cashFlowTotals,
        metrics: {
          amountInvested: parseFloat(convertedStats.amountDeposited) || 0,
          currentPortfolioValue: parseFloat(convertedStats.currentExposure) || 0,
          returns: parseFloat(convertedStats.totalProfit) || 0,
          returns_percent: parseFloat(convertedStats.return) || 0,
        },
        equityCurve: convertedStats.equityCurve,
        drawdownCurve: convertedStats.drawdownCurve,
        benchmarkEquityCurve: benchmark.equityCurve,
        benchmarkDrawdownCurve: benchmark.drawdownCurve,
        combinedTrailing: {
          fiveDays: { portfolio: getTrailingValue("fiveDays", "5d"), benchmark: benchmarkReturns["5d"] },
          tenDays: { portfolio: getTrailingValue("tenDays", "10d"), benchmark: benchmarkReturns["10d"] },
          fifteenDays: { portfolio: getTrailingValue("fifteenDays", "15d"), benchmark: benchmarkReturns["15d"] },
          oneMonth: { portfolio: getTrailingValue("oneMonth", "1m"), benchmark: benchmarkReturns["1m"] },
          threeMonths: { portfolio: getTrailingValue("threeMonths", "3m"), benchmark: benchmarkReturns["3m"] },
          sixMonths: { portfolio: getTrailingValue("sixMonths", "6m"), benchmark: benchmarkReturns["6m"] },
          oneYear: { portfolio: getTrailingValue("oneYear", "1y"), benchmark: benchmarkReturns["1y"] },
          twoYears: { portfolio: getTrailingValue("twoYears", "2y"), benchmark: benchmarkReturns["2y"] },
          sinceInception: { portfolio: getTrailingValue("sinceInception", "sinceInception"), benchmark: benchmarkReturns["sinceInception"] },
          MDD: { portfolio: getTrailingValue("MDD", "MDD"), benchmark: benchmarkReturns["MDD"] },
          currentDD: { portfolio: getTrailingValue("currentDD", "currentDD"), benchmark: benchmarkReturns["currentDD"] },
        },
        drawdown: convertedStats.drawdown,
        monthlyPnl: convertedStats.monthlyPnl,
        quarterlyPnl: convertedStats.quarterlyPnl,
        strategyName,
        isTotalPortfolio,
        hasNavBasedTotalPortfolio,
        pmsBlendedTP,
        isActive: true,
        dateFormatter,
        formatter: (v) =>
          v === 0
            ? "-"
            : `₹ ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        sessionUserName: session?.user?.name || "User",
        currentMetadata: {
          inceptionDate: exportMetadata?.inceptionDate || convertedStats.equityCurve?.[0]?.date || null,
          dataAsOfDate: exportMetadata?.dataAsOfDate || convertedStats.equityCurve?.[convertedStats.equityCurve.length - 1]?.date || null,
        },
      });

      // Use a hidden iframe for printing (matches holdings page pattern)
      const existingFrame = document.getElementById('portfolio-print-frame') as HTMLIFrameElement;
      if (existingFrame) existingFrame.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'portfolio-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.width = '297mm';
      iframe.style.height = '210mm';
      iframe.style.border = 'none';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.overflow = 'hidden';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      const iframeWin = iframe.contentWindow;
      if (!iframeDoc || !iframeWin) {
        iframe.remove();
        throw new Error('Failed to create print frame');
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Wait for fonts + chart/pagination to finish, then print
      const cleanup = () => {
        iframe.remove();
        setExporting(false);
      };

      const onReady = (e: MessageEvent) => {
        if (e.data !== 'portfolio-report-ready') return;
        window.removeEventListener('message', onReady);
        iframeDoc.fonts.ready.then(() => {
          try {
            iframeWin.print();
          } catch (e) {
            console.error('Print error:', e);
          }
          cleanup();
        });
      };
      window.addEventListener('message', onReady);

      // Fallback if message never arrives (e.g. script error in iframe)
      setTimeout(() => {
        window.removeEventListener('message', onReady);
        try { iframeWin.print(); } catch (_) { /* ignore */ }
        cleanup();
      }, 5000);
      return;
    } catch (err) {
      console.error(err);
      alert("PDF export failed. See console for details.");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadExcel = async (
    convertedStats: Stats,
    strategyName: string,
    isTotalPortfolio: boolean,
    overrideAccountInfo?: { accountName: string; accountType: string; broker: string },
    exportMetadata?: { dataAsOfDate?: string | null; isActive?: boolean },
    hasNavBasedTotalPortfolio: boolean = false,
    pmsBlendedTP: boolean = false
  ) => {
    try {
      setExporting(true);

      const benchmarkReturns = (await fetchBenchmarkReturns(convertedStats.equityCurve)).returns;

      const tr = convertedStats.trailingReturns as Record<string, unknown>;
      const getTrailingValue = (longKey: string, shortKey: string): string | number | null => {
        const val = tr[longKey] ?? tr[shortKey];
        return val !== null && val !== undefined ? val as string | number : null;
      };

      const combinedTrailing = {
        fiveDays: { portfolio: getTrailingValue("fiveDays", "5d"), benchmark: benchmarkReturns["5d"] },
        tenDays: { portfolio: getTrailingValue("tenDays", "10d"), benchmark: benchmarkReturns["10d"] },
        fifteenDays: { portfolio: getTrailingValue("fifteenDays", "15d"), benchmark: benchmarkReturns["15d"] },
        oneMonth: { portfolio: getTrailingValue("oneMonth", "1m"), benchmark: benchmarkReturns["1m"] },
        threeMonths: { portfolio: getTrailingValue("threeMonths", "3m"), benchmark: benchmarkReturns["3m"] },
        sixMonths: { portfolio: getTrailingValue("sixMonths", "6m"), benchmark: benchmarkReturns["6m"] },
        oneYear: { portfolio: getTrailingValue("oneYear", "1y"), benchmark: benchmarkReturns["1y"] },
        twoYears: { portfolio: getTrailingValue("twoYears", "2y"), benchmark: benchmarkReturns["2y"] },
        fiveYears: { portfolio: getTrailingValue("fiveYears", "5y"), benchmark: benchmarkReturns["5y"] || null },
        sinceInception: { portfolio: getTrailingValue("sinceInception", "sinceInception"), benchmark: benchmarkReturns["sinceInception"] },
        MDD: { portfolio: getTrailingValue("MDD", "MDD"), benchmark: benchmarkReturns["MDD"] },
        currentDD: { portfolio: getTrailingValue("currentDD", "currentDD"), benchmark: benchmarkReturns["currentDD"] },
      };

      const currentAccount = accounts.find((acc) => acc.qcode === selectedAccount);
      const accountInfo = overrideAccountInfo || (currentAccount ? {
        accountName: currentAccount.account_name,
        accountType: currentAccount.account_type,
        broker: currentAccount.broker,
      } : undefined);

      generateExcelReport({
        strategyName,
        isTotalPortfolio,
        hasNavBasedTotalPortfolio,
        pmsBlendedTP,
        isActive: exportMetadata?.isActive ?? metadata?.isActive ?? true,
        sessionUserName: session?.user?.name || "User",
        dataAsOfDate: exportMetadata?.dataAsOfDate ?? metadata?.dataAsOfDate,
        accountInfo,
        metrics: {
          amountDeposited: parseFloat(convertedStats.amountDeposited) || 0,
          currentExposure: parseFloat(convertedStats.currentExposure) || 0,
          totalProfit: parseFloat(convertedStats.totalProfit) || 0,
          totalReturn: parseFloat(convertedStats.return) || 0,
        },
        combinedTrailing,
        cashFlows: convertedStats.cashFlows || [],
        monthlyPnl: convertedStats.monthlyPnl || null,
        quarterlyPnl: convertedStats.quarterlyPnl || null,
      });

    } catch (error) {
      console.error("Error generating Excel:", error);
      alert("Failed to generate Excel file");
    } finally {
      setExporting(false);
    }
  };

  const renderSarlaStrategyTabs = () => {
    if (!(isSarla || isSatidham || isBifurcatedClient) || !sarlaData || availableStrategies.length === 0) return null;

    return (
      <div className="mb-4 block sm:hidden">
        <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
          <SelectTrigger className="w-full border-0 card-shadow">
            <SelectValue placeholder="Select Strategy" />
          </SelectTrigger>
          <SelectContent>
            {availableStrategies.map((strategy) => {
              const isActive = sarlaData[strategy].metadata.isActive;
              return (
                <SelectItem key={strategy} value={strategy}>
                  {strategy} {!isActive ? "(Inactive)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="mt-2 text-xs text-card-text-secondary">
          <p><strong className="text-card-text">Note:</strong> Inactive strategies may have limited data updates.</p>
        </div>
      </div>
    );
  };

  const CASH_PERCENT_STRATS_SARLA = ["Scheme A", "Scheme C", "Scheme D", "Scheme E", "Scheme F", "Scheme QAW", "Scheme B (inactive)"];
  const CASH_STRATS_SARLA = "Total Portfolio";
  const SARLA_TOTAL_FEES: { [year: string]: { q1?: number; q2?: number; q3?: number; q4?: number } } = {
    "2022": { q3: 35297.87, q4: 191023.76 },
    "2023": { q1: 186871.07, q2: 188947.41, q3: 432749.52, q4: 1499186.69 },
    "2024": { q1: 1771936.35, q2: 3419092.44, q3: 4658621.93, q4: 5687534.29 },
    "2025": { q1: 7802830.42, q2: 7732665.25, q3: 5297606.19, q4: 5582892.53 },
  };
  const SARLA_TOTAL_FEES_SUM = Object.values(SARLA_TOTAL_FEES).reduce(
    (sum, year) => sum + Object.values(year).reduce((qSum, val) => qSum + val, 0),
    0
  );
  const CASH_PERCENT_STRATS_SATIDHAM = ["Scheme B", "Scheme A", "Scheme A (Old)"];
  const CASH_STRATS_SATIDHAM = "Total Portfolio";

  const renderSarlaContent = () => {
    if (!isSarla || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
      return null;
    }

    const isCashOnlyView = selectedStrategy === CASH_STRATS_SARLA;
    const isCashPercentView = CASH_PERCENT_STRATS_SARLA.includes(selectedStrategy);

    const strategyData = sarlaData[selectedStrategy];
    const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
    const filteredEquityCurve = filterEquityCurve(
      strategyData.data.equityCurve,
      strategyData.metadata?.filtersApplied?.startDate,
      strategyData.metadata?.lastUpdated
    );
    const lastDate = getLastDate(filteredEquityCurve, strategyData.metadata?.lastUpdated);
    const isTotalPortfolio = selectedStrategy === "Total Portfolio";
    const isActive = strategyData.metadata.isActive;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
          >
            {selectedStrategy} {!isActive ? "(Inactive)" : ""}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button
              onClick={() => handleDownloadPDF(convertedStats, selectedStrategy, isTotalPortfolio, { inceptionDate: strategyData.metadata?.inceptionDate, dataAsOfDate: strategyData.metadata?.dataAsOfDate })}
              disabled={exporting}
              className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button
              onClick={() => handleDownloadExcel(convertedStats, selectedStrategy, isTotalPortfolio, undefined, { dataAsOfDate: strategyData.metadata?.dataAsOfDate, isActive })}
              disabled={exporting}
              className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>
        <StatsCards
  stats={convertedStats}
  accountType="sarla"
  broker="Sarla"
  isTotalPortfolio={isTotalPortfolio}
  isActive={isActive}
  returnViewType={returnViewType}
  setReturnViewType={setReturnViewType}
  totalFees={isTotalPortfolio ? SARLA_TOTAL_FEES_SUM : undefined}
/>
        {!isTotalPortfolio && (
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
            <div className="flex-1 min-w-0 sm:w-5/6">
              <RevenueChart
                equityCurve={filteredEquityCurve}
                drawdownCurve={strategyData.data.drawdownCurve}
                trailingReturns={convertedStats.trailingReturns}
                drawdown={convertedStats.drawdown}
                lastDate={lastDate}
              />
            </div>
          </div>
        )}
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={isCashOnlyView}
          showPmsQawView={isCashPercentView}
          fees={isTotalPortfolio ? SARLA_TOTAL_FEES : undefined}
        />
        {renderCashFlowsTable()}
        {isSarla && !isActive && (
          <div className="text-sm text-[#ca8a04]">
            <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
          </div>
        )}
      </div>
    );
  };

  const renderSatidhamContent = () => {
    if (!isSatidham || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
      return null;
    }

    const isCashOnlyView = selectedStrategy === CASH_STRATS_SATIDHAM;
    const isCashPercentView = CASH_PERCENT_STRATS_SATIDHAM.includes(selectedStrategy);

    const strategyData = sarlaData[selectedStrategy];
    const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
    const filteredEquityCurve = filterEquityCurve(
      strategyData.data.equityCurve,
      strategyData.metadata?.filtersApplied?.startDate,
      strategyData.metadata?.lastUpdated
    );
    const lastDate = getLastDate(filteredEquityCurve, strategyData.metadata?.lastUpdated);
    const isTotalPortfolio = selectedStrategy === "Total Portfolio";
    const isActive = strategyData.metadata.isActive;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
          >
            {selectedStrategy} {!isActive ? "(Inactive)" : ""}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button
              onClick={() => handleDownloadPDF(convertedStats, selectedStrategy, isTotalPortfolio, { inceptionDate: strategyData.metadata?.inceptionDate, dataAsOfDate: strategyData.metadata?.dataAsOfDate })}
              disabled={exporting}
              className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button
              onClick={() => handleDownloadExcel(convertedStats, selectedStrategy, isTotalPortfolio, undefined, { dataAsOfDate: strategyData.metadata?.dataAsOfDate, isActive })}
              disabled={exporting}
              className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>
        <StatsCards
  stats={convertedStats}
  accountType="sarla"
  broker="Sarla"
  isTotalPortfolio={isTotalPortfolio}
  isActive={isActive}
  returnViewType={returnViewType}
  setReturnViewType={setReturnViewType}
/>
        {!isTotalPortfolio && (
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
            <div className="flex-1 min-w-0 sm:w-5/6">
              <RevenueChart
                equityCurve={filteredEquityCurve}
                drawdownCurve={strategyData.data.drawdownCurve}
                trailingReturns={convertedStats.trailingReturns}
                drawdown={convertedStats.drawdown}
                lastDate={lastDate}
                adjustBenchmarkStartDate={true}
              />
            </div>
          </div>
        )}
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={isCashOnlyView}
          showPmsQawView={isCashPercentView}
        />
        {renderCashFlowsTable()}
        {isSatidham && !isActive && (
          <div className="text-sm text-[#ca8a04]">
            <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
          </div>
        )}
      </div>
    );
  };

  const renderDineshContent = () => {
    if (!isBifurcatedClient || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
      return null;
    }

    const strategyData = sarlaData[selectedStrategy];
    const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
    const filteredEquityCurve = filterEquityCurve(
      strategyData.data.equityCurve,
      strategyData.metadata?.filtersApplied?.startDate,
      strategyData.metadata?.lastUpdated
    );
    const lastDate = getLastDate(filteredEquityCurve, strategyData.metadata?.lastUpdated);
    const isTotalPortfolio = selectedStrategy === "Total Portfolio";
    const isActive = strategyData.metadata.isActive;
    const hasNavBasedTotalPortfolio = bifurcatedClient?.hasNavBasedTotalPortfolio ?? false;

    // PMS-blended clients (Ashok) render their Total Portfolio Sarla/Satidham-style:
    // absolute ₹ only, no NAV curve, no trailing table — but keep monthly.
    const pmsBlendedTP =
      isTotalPortfolio && (bifurcatedClient?.config?.pmsSchemes?.length ?? 0) > 0;
    const effectiveNavBased = hasNavBasedTotalPortfolio && !pmsBlendedTP;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
          >
            {selectedStrategy} {!isActive ? "(Inactive)" : ""}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button
              onClick={() => handleDownloadPDF(convertedStats, selectedStrategy, isTotalPortfolio, { inceptionDate: strategyData.metadata?.inceptionDate, dataAsOfDate: strategyData.metadata?.dataAsOfDate }, hasNavBasedTotalPortfolio, pmsBlendedTP)}
              disabled={exporting}
              className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button
              onClick={() => handleDownloadExcel(convertedStats, selectedStrategy, isTotalPortfolio, undefined, { dataAsOfDate: strategyData.metadata?.dataAsOfDate, isActive }, hasNavBasedTotalPortfolio, pmsBlendedTP)}
              disabled={exporting}
              className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>
        <StatsCards
          stats={convertedStats}
          accountType="sarla"
          broker={bifurcatedClient?.displayName ?? ""}
          isTotalPortfolio={isTotalPortfolio}
          isActive={isActive}
          returnViewType={returnViewType}
          setReturnViewType={setReturnViewType}
          hasNavBasedTotalPortfolio={effectiveNavBased}
        />
        {(!isTotalPortfolio || effectiveNavBased) && (
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
            <div className="flex-1 min-w-0 sm:w-5/6">
              <RevenueChart
                equityCurve={filteredEquityCurve}
                drawdownCurve={strategyData.data.drawdownCurve}
                trailingReturns={convertedStats.trailingReturns}
                drawdown={convertedStats.drawdown}
                lastDate={lastDate}
                adjustBenchmarkStartDate={true}
              />
            </div>
          </div>
        )}
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={false}
          showPmsQawView={false}
          cashOnly={pmsBlendedTP}
        />
        {renderCashFlowsTable()}
        {isBifurcatedClient && !isActive && (
          <div className="text-sm text-[#ca8a04]">
            <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
          </div>
        )}
      </div>
    );
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-primary-bg flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-logo-green text-2xl font-heading">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !session?.user) {
    return (
      <div className="p-6 text-center bg-[#fee2e2] rounded-lg text-[#dc2626]">
        {error || "Failed to load user data"}
      </div>
    );
  }

  if (!isSarla && !isSatidham && !isBifurcatedClient && !isSingleStrategyBifurcated && accounts.length === 0) {
    return (
      <div className="p-6 text-center bg-[#f3f4f6] rounded-lg text-card-text">
        No accounts found for this user.
      </div>
    );
  }

  if ((isSarla || isSatidham || isBifurcatedClient) && (!sarlaData || availableStrategies.length === 0)) {
    return (
      <div className="p-6 text-center bg-[#f3f4f6] rounded-lg text-card-text">
        No strategy data found for {isSarla ? "Sarla" : isSatidham ? "Satidham" : bifurcatedClient?.displayName ?? "this"} user.
      </div>
    );
  }

  const currentMetadata = (isSarla || isSatidham || isBifurcatedClient) && sarlaData && selectedStrategy
    ? sarlaData[selectedStrategy].metadata
    : metadata;

  return (
    <div className="sm:p-2 space-y-6">
      {isImpersonating && session?.user?.impersonating && (
        <ImpersonationBanner
          name={session.user.impersonating.name}
          icode={session.user.impersonating.icode}
          onExit={handleExitImpersonation}
        />
      )}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Greeting and Metadata */}
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

          {/* Dropdown */}
          {(isSarla || isSatidham || isBifurcatedClient) && sarlaData && availableStrategies.length > 0 && (
            <div className="hidden sm:block">
              <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-[400px] border-0 card-shadow text-button-text">
                  <SelectValue placeholder="Select Strategy" />
                </SelectTrigger>
                <SelectContent>
                  {availableStrategies.map((strategy) => {
                    const isActive = sarlaData[strategy].metadata.isActive;
                    return (
                      <SelectItem key={strategy} value={strategy}>
                        {strategy} {!isActive ? "(Inactive)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {!isSarla && !isSatidham && !isBifurcatedClient && (currentMetadata?.strategyName || (stats && !Array.isArray(stats))) && (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {currentMetadata?.strategyName && (
              <Button
                variant="outline"
                className="bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full"
              >
                {currentMetadata.strategyName}
              </Button>
            )}
            {stats && !Array.isArray(stats) && (
              <div className="flex gap-2 ml-auto">
                <Button
                  onClick={() => {
                    const convertedStats = isPmsStats(stats) ? convertPmsStatsToStats(stats) : stats;
                    handleDownloadPDF(convertedStats, currentMetadata?.strategyName || "Portfolio", false, { inceptionDate: metadata?.inceptionDate, dataAsOfDate: metadata?.dataAsOfDate });
                  }}
                  disabled={exporting}
                  className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
                  variant="default"
                >
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button
                  onClick={() => {
                    const convertedStats = isPmsStats(stats) ? convertPmsStatsToStats(stats) : stats;
                    handleDownloadExcel(convertedStats, currentMetadata?.strategyName || "Portfolio", false);
                  }}
                  disabled={exporting}
                  className="h-9 px-3 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
                  variant="default"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Excel
                </Button>
              </div>
            )}
          </div>
        )}
        {(isSarla || isSatidham || isBifurcatedClient) && sarlaData && availableStrategies.length > 0 && (
          <div className="mt-2 text-xs text-card-text-secondary">
            <p><strong>Note:</strong> Inactive strategies may have limited data updates.</p>
          </div>
        )}
      </div>

      {renderSarlaStrategyTabs()}

      {(isSarla || isSatidham || isBifurcatedClient) ? (
        isSarla ? renderSarlaContent() : isSatidham ? renderSatidhamContent() : renderDineshContent()
      ) : (
        stats && (
          <div className="space-y-6">
            {Array.isArray(stats) ? (
              stats.map((item, index) => {
                const convertedStats = isPmsStats(item.stats) ? convertPmsStatsToStats(item.stats) : item.stats;
                const filteredEquityCurve = filterEquityCurve(
                  item.stats.equityCurve,
                  item.metadata.filtersApplied?.startDate,
                  item.metadata.lastUpdated
                );
                const lastDate = getLastDate(filteredEquityCurve, item.metadata.lastUpdated);
                return (
                  <div key={index} className="space-y-6">
                    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-card-text text-sm sm:text-sm">
                              {item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker})
                              {(isSarla || isSatidham || isBifurcatedClient) && !item.metadata.isActive ? " (Inactive)" : ""}
                            </CardTitle>
                            <div className="text-sm text-card-text-secondary mt-1">
                              Strategy: <strong>{item.metadata.strategyName || "Unknown Strategy"}</strong>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleDownloadPDF(convertedStats, item.metadata.strategyName || "Unknown Strategy", false, { inceptionDate: item.metadata.inceptionDate, dataAsOfDate: item.metadata.dataAsOfDate })}
                              disabled={exporting}
                              className="h-8 px-2 text-xs font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
                              variant="default"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              PDF
                            </Button>
                            <Button
                              onClick={() => handleDownloadExcel(convertedStats, item.metadata.strategyName || "Unknown Strategy", false, {
                                accountName: item.metadata.account_name,
                                accountType: item.metadata.account_type,
                                broker: item.metadata.broker,
                              })}
                              disabled={exporting}
                              className="h-8 px-2 text-xs font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
                              variant="default"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Excel
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <StatsCards
  stats={convertedStats}
  accountType="sarla"
  broker="Sarla"
  isTotalPortfolio={isTotalPortfolio}
  isActive={isActive}
  returnViewType={returnViewType}
  setReturnViewType={setReturnViewType}
/>
                        <RevenueChart
                          equityCurve={filteredEquityCurve}
                          drawdownCurve={item.stats.drawdownCurve}
                          trailingReturns={convertedStats.trailingReturns}
                          drawdown={convertedStats.drawdown}
                          lastDate={lastDate}
                        />
                        <PnlTable
                          quarterlyPnl={convertedStats.quarterlyPnl}
                          monthlyPnl={convertedStats.monthlyPnl}
                        />
                        {(isSarla || isSatidham || isBifurcatedClient) && !item.metadata.isActive && (
                          <div className="text-sm text-[#ca8a04]">
                            <strong>Note:</strong> This account is inactive. Data may not be updated regularly.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })
            ) : (
              <>
                {(() => {
                  const convertedStats = isPmsStats(stats) ? convertPmsStatsToStats(stats) : stats;
                  const filteredEquityCurve = filterEquityCurve(
                    stats.equityCurve,
                    metadata?.filtersApplied.startDate,
                    metadata?.lastUpdated
                  );
                  const lastDate = getLastDate(filteredEquityCurve, metadata?.lastUpdated);
                  const strategyName = metadata?.strategyName || "Portfolio";
                  return (
                    <>
                      <StatsCards
                        stats={convertedStats}
                        accountType={
                          isSingleStrategyBifurcated
                            ? "managed_account"
                            : accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"
                        }
                        broker={
                          isSingleStrategyBifurcated
                            ? bifurcatedClient?.broker || "Unknown"
                            : accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"
                        }
                        isActive={metadata?.isActive ?? true}
                        returnViewType={returnViewType}
                        setReturnViewType={setReturnViewType}
                      />
                      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
                        <div className="flex-1 min-w-0 sm:w-5/6">
                          <RevenueChart
                            equityCurve={filteredEquityCurve}
                            drawdownCurve={stats.drawdownCurve}
                            trailingReturns={convertedStats.trailingReturns}
                            drawdown={convertedStats.drawdown}
                            lastDate={lastDate}
                            adjustBenchmarkStartDate={true}
                          />
                        </div>
                      </div>
                      <PnlTable
                        quarterlyPnl={convertedStats.quarterlyPnl}
                        monthlyPnl={convertedStats.monthlyPnl}
                      />
                      {renderCashFlowsTable()}
                      {(isSarla || isSatidham || isBifurcatedClient) && metadata && !metadata.isActive && (
                        <div className="text-sm text-[#ca8a04]">
                          <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}
