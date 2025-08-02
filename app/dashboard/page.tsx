"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { TrailingReturnsTable } from "@/components/trailing-returns-table";
import { PnlTable } from "@/components/PnlTable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import DashboardLayout from "./layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StockTable from "@/components/StockTable";

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
  isActive: boolean; // Added isActive
}

interface ApiResponse {
  data: Stats | PmsStats | { stats: Stats | PmsStats; metadata: Account & { strategyName: string; isActive: boolean } }[];
  metadata?: Metadata;
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
  return {
    amountDeposited: pmsStats.totalPortfolioValue,
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
  style: "currency",
  currency: "INR",
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

export default function Portfolio() {
  const { data: session, status } = useSession();
  const isSarla = session?.user?.icode === "QUS0007";
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountCode = searchParams.get("accountCode") || "AC5"; // Default to AC5
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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated") {
      if (isSarla) {
        const fetchSarlaData = async () => {
          try {
            console.log(`Fetching Sarla data with accountCode: ${accountCode}`);
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
            }
            setIsLoading(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred");
            setIsLoading(false);
          }
        };

        fetchAccounts();
      }
    }
  }, [status, router, isSarla, accountCode]);

  useEffect(() => {
    if (selectedAccount && status === "authenticated" && !isSarla) {
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
          const response: ApiResponse = await res.json();

          if (viewMode === "individual" && Array.isArray(response.data)) {
            setStats(response.data);
            setMetadata(null);
          } else {
            setStats(response.data as Stats | PmsStats);
            setMetadata(response.metadata || null);
          }
          setIsLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : `An unexpected error occurred for accountCode ${accountCode}`);
          setIsLoading(false);
        }
      };

      fetchAccountData();
    }
  }, [selectedAccount, accounts, status, viewMode, isSarla, accountCode]);

  const renderCashFlowsTable = () => {
    let transactions: { date: string; amount: number }[] = [];

    if (isSarla && sarlaData && selectedStrategy) {
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
        <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
          <CardHeader>
            <CardTitle className="text-card-text text-sm sm:text-lg">Cash In / Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-3 px-4 text-gray-900 dark:text-gray-100">
              No cash flow data available
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
        <CardHeader>
          <CardTitle className="text-card-text text-sm sm:text-lg">Cash In / Out</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-2">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow className="bg-gray-200 hover:bg-gray-200 border-b border-gray-200 dark:border-gray-700">
                  <TableHead className="px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Amount (₹)
                  </TableHead>
                  {viewMode === "individual" && (
                    <TableHead className="px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
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
                    <TableRow key={`${transaction.date}-${index}`} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50">
                      <TableCell className="px-4 py-2 text-xs text-gray-700 dark:text-gray-100">
                        {dateFormatter(transaction.date)}
                      </TableCell>
                      <TableCell
                        className={`px-4 py-2 text-xs font-medium text-right ${Number(transaction.amount) > 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatter.format(Number(transaction.amount))}
                      </TableCell>
                      {viewMode === "individual" && (
                        <TableCell className="px-4 py-2 text-xs text-gray-700 dark:text-gray-100">
                          {accountName || "Unknown"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                <TableRow className="border-t border-gray-200 dark:border-gray-700 font-semibold">
                  <TableCell className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">Total In</TableCell>
                  <TableCell className="px-4 py-2 text-xs text-right text-green-800 dark:text-green-600">
                    {formatter.format(cashFlowTotals.totalIn)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">Total Out</TableCell>
                  <TableCell className="px-4 py-2 text-xs text-right text-red-800 dark:text-red-600">
                    {formatter.format(cashFlowTotals.totalOut)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="px-4 py-2 text-xs text-gray-800 dark:text-gray-100">Net Flow</TableCell>
                  <TableCell
                    className={`px-4 py-2 text-xs text-right font-semibold ${cashFlowTotals.netFlow >= 0 ? "text-green-800" : "text-red-800"} dark:${cashFlowTotals.netFlow >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {formatter.format(cashFlowTotals.netFlow)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p><strong>Note:</strong></p>
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

  const renderSarlaStrategyTabs = () => {
    if (!isSarla || !sarlaData || availableStrategies.length === 0) return null;

    return (
      <div className="mb-6">
        {/* Mobile dropdown */}
        <div className="block sm:hidden">
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
        </div>

        {/* Desktop tabs */}
        <div className="hidden sm:block">
          <div className="flex flex-wrap gap-2">
            {availableStrategies.map((strategy) => {
              const isActive = sarlaData[strategy].metadata.isActive;
              return (
                <Button
                  key={strategy}
                  variant={selectedStrategy === strategy ? "default" : "outline"}
                  onClick={() => setSelectedStrategy(strategy)}
                  className={`px-4 py-2 text-sm font-medium font-heading rounded-full transition-colors ${
                    selectedStrategy === strategy
                      ? "bg-logo-green text-button-text"
                      : isActive
                      ? "bg-white/70 text-card-text hover:bg-logo-green/20"
                      : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                  }`}
                >
                  {strategy} {!isActive ? "(Inactive)" : ""}
                </Button>
              );
            })}
          </div>
        </div>
        {isSarla && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            <p><strong>Note:</strong> Inactive strategies may have limited data updates.</p>
          </div>
        )}
      </div>
    );
  };

  const renderSarlaContent = () => {
    if (!isSarla || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
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

    return (
      <div className="space-y-6">
        <StatsCards
          stats={convertedStats}
          accountType="sarla"
          broker="Sarla"
          isTotalPortfolio={isTotalPortfolio}
          isActive={isActive} // Pass isActive to StatsCards
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
            <div className="flex-1 min-w-0 sm:w-1/6 sm:max-w-[25%]">
              <StockTable />
            </div>
          </div>
        )}
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={isTotalPortfolio}
        />
        {renderCashFlowsTable()}
        {isSarla && !isActive && (
          <div className="text-sm text-yellow-600 dark:text-yellow-400">
            <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
          </div>
        )}
      </div>
    );
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">Loading...</div>
    );
  }

  if (error || !session?.user) {
    return (
      <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
        {error || "Failed to load user data"}
      </div>
    );
  }

  if (!isSarla && accounts.length === 0) {
    return (
      <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">
        No accounts found for this user.
      </div>
    );
  }

  if (isSarla && (!sarlaData || availableStrategies.length === 0)) {
    return (
      <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">
        No strategy data found for Sarla user.
      </div>
    );
  }

  const currentMetadata = isSarla && sarlaData && selectedStrategy
    ? sarlaData[selectedStrategy].metadata
    : metadata;

  return (
    <div className="sm:p-2 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold text-card-text-secondary font-heading">
            Welcome, {session?.user?.name || "User"}
          </h1>
        </div>
        <div>
          {currentMetadata && (
            <div className="flex items-center gap-2 text-sm mt-4 text-card-text-secondary font-heading-bold">
              <span>Inception Date: <strong>{currentMetadata.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A"}</strong></span>
              <span>|</span>
              <span>Data as of: <strong>{currentMetadata.dataAsOfDate ? dateFormatter(currentMetadata.dataAsOfDate) : "N/A"}</strong></span>
              <span>|</span>
            </div>
          )}
        </div>
        {/* Only show strategy name button for non-Sarla users */}
        {!isSarla && currentMetadata?.strategyName && (
          <Button
            variant="outline"
            className={`bg-logo-green mt-4 font-heading text-button-text text-sm sm:text-lg px-3 py-1 rounded-full ${
              isSarla && !currentMetadata.isActive ? "opacity-70" : ""
            }`}
          >
            {currentMetadata.strategyName} {isSarla && !currentMetadata.isActive ? "(Inactive)" : ""}
          </Button>
        )}
      </div>

      {renderSarlaStrategyTabs()}

      {isSarla ? (
        renderSarlaContent()
      ) : (
        stats && (
          <div className="space-y-6">
            {Array.isArray(stats) ? (
              stats.map((item, index) => {
                const convertedStats = isPmsStats(item.stats) ? convertPmsStatsToStats(item.stats) : item.stats;
                const filteredEquityCurve = filterEquityCurve(
                  item.stats.equityCurve,
                  item.metadata.startDate,
                  item.metadata.lastUpdated
                );
                const lastDate = getLastDate(filteredEquityCurve, item.metadata.lastUpdated);
                return (
                  <div key={index} className="space-y-6">
                    <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
                      <CardHeader>
                        <CardTitle className="text-card-text text-sm sm:text-lg">
                          {item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker})
                          {isSarla && !item.metadata.isActive ? " (Inactive)" : ""}
                        </CardTitle>
                        <div className="text-sm text-card-text-secondary">
                          Strategy: <strong>{item.metadata.strategyName || "Unknown Strategy"}</strong>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <StatsCards
                          stats={convertedStats}
                          accountType={item.metadata.account_type}
                          broker={item.metadata.broker}
                          isActive={item.metadata.isActive} // Pass isActive to StatsCards
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
                        {isSarla && !item.metadata.isActive && (
                          <div className="text-sm text-yellow-600 dark:text-yellow-400">
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
                  return (
                    <>
                      <StatsCards
                        stats={convertedStats}
                        accountType={accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"}
                        broker={accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"}
                        isActive={metadata?.isActive ?? true} // Pass isActive to StatsCards
                      />
                      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
                        <div className="flex-1 min-w-0 sm:w-5/6">
                          <RevenueChart
                            equityCurve={filteredEquityCurve}
                            drawdownCurve={stats.drawdownCurve}
                            trailingReturns={convertedStats.trailingReturns}
                            drawdown={convertedStats.drawdown}
                            lastDate={lastDate}
                          />
                        </div>
                        <div className="flex-1 min-w-0 sm:w-1/6 sm:max-w-[25%]">
                          <StockTable />
                        </div>
                      </div>
                      <PnlTable
                        quarterlyPnl={convertedStats.quarterlyPnl}
                        monthlyPnl={convertedStats.monthlyPnl}
                      />
                      {renderCashFlowsTable()}
                      {isSarla && metadata && !metadata.isActive && (
                        <div className="text-sm text-yellow-600 dark:text-yellow-400">
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