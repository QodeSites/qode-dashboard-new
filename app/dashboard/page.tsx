"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { PnlTable } from "@/components/PnlTable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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

export default function Portfolio() {
  const { data: session, status } = useSession();
  const isSarla = session?.user?.icode === "QUS0007";
  const isSatidham = session?.user?.icode === "QUS0010";
  const isDinesh = session?.user?.icode === "QUS00072";
  const isMangesh = session?.user?.icode === "QUS00079";
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountCode = searchParams.get("accountCode") || "AC5";
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
      } else if (isDinesh) {
        const fetchDineshData = async () => {
          try {
            const res = await fetch(`/api/dinesh-api?qcode=QAC00053&accountCode=AC9`, { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to load Dinesh data`);
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

        fetchDineshData();
      } else if (isMangesh) {
        const fetchMangeshData = async () => {
          try {
            const res = await fetch(`/api/mangesh-api?qcode=QAC00064&accountCode=AC10`, { credentials: "include" });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to load Mangesh data`);
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

        fetchMangeshData();
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
  }, [status, router, isSarla, isSatidham, isDinesh, isMangesh, accountCode]);

  useEffect(() => {
    if (selectedAccount && status === "authenticated" && !isSarla && !isSatidham && !isDinesh && !isMangesh) {
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
          console.log("Raw API response:", response);
          console.log("Response type:", selectedAccountData.account_type);
          console.log("Has 'data' property?", 'data' in response);
          console.log("Response keys:", Object.keys(response));

          let statsData: Stats | PmsStats | Array<any>;
          let metadataData: Metadata | null = null;

          if ('data' in response && response.data !== undefined) {
            console.log("Processing wrapped response structure");
            if (viewMode === "individual" && Array.isArray(response.data)) {
              statsData = response.data;
              metadataData = null;
            } else {
              statsData = response.data as Stats | PmsStats;
              metadataData = response.metadata || null;
            }
          } else {
            console.log("Processing flat response structure");

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

          console.log("Final processed stats data:", statsData);
          console.log("Final processed metadata:", metadataData);

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

    if ((isSarla || isSatidham || isDinesh || isMangesh) && sarlaData && selectedStrategy) {
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

  const renderSarlaStrategyTabs = () => {
    if (!(isSarla || isSatidham || isDinesh || isMangesh) || !sarlaData || availableStrategies.length === 0) return null;

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
        <Button
          variant="outline"
          className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
        >
          {selectedStrategy} {!isActive ? "(Inactive)" : ""}
        </Button>
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
        <Button
          variant="outline"
          className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
        >
          {selectedStrategy} {!isActive ? "(Inactive)" : ""}
        </Button>
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
    if (!isDinesh || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
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
        <Button
          variant="outline"
          className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
        >
          {selectedStrategy} {!isActive ? "(Inactive)" : ""}
        </Button>
        <StatsCards
          stats={convertedStats}
          accountType="sarla"
          broker="Dinesh"
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
              />
            </div>
          </div>
        )}
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={false}
          showPmsQawView={false}
        />
        {renderCashFlowsTable()}
        {isDinesh && !isActive && (
          <div className="text-sm text-[#ca8a04]">
            <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
          </div>
        )}
      </div>
    );
  };

  const renderMangeshContent = () => {
    if (!isMangesh || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
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
        <Button
          variant="outline"
          className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
        >
          {selectedStrategy} {!isActive ? "(Inactive)" : ""}
        </Button>
        <StatsCards
          stats={convertedStats}
          accountType="sarla"
          broker="Mangesh"
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
              />
            </div>
          </div>
        )}
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={false}
          showPmsQawView={false}
        />
        {renderCashFlowsTable()}
        {isMangesh && !isActive && (
          <div className="text-sm text-[#ca8a04]">
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
      <div className="p-6 text-center bg-[#fee2e2] rounded-lg text-[#dc2626]">
        {error || "Failed to load user data"}
      </div>
    );
  }

  if (!isSarla && !isSatidham && !isDinesh && accounts.length === 0) {
    return (
      <div className="p-6 text-center bg-[#f3f4f6] rounded-lg text-card-text">
        No accounts found for this user.
      </div>
    );
  }

  if ((isSarla || isSatidham || isDinesh || isMangesh) && (!sarlaData || availableStrategies.length === 0)) {
    return (
      <div className="p-6 text-center bg-[#f3f4f6] rounded-lg text-card-text">
        No strategy data found for {isSarla ? "Sarla" : isSatidham ? "Satidham" : isDinesh ? "Dinesh" : "Mangesh"} user.
      </div>
    );
  }

  const currentMetadata = (isSarla || isSatidham || isDinesh || isMangesh) && sarlaData && selectedStrategy
    ? sarlaData[selectedStrategy].metadata
    : metadata;

  return (
    <div className="sm:p-2 space-y-6">
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
          {(isSarla || isSatidham || isDinesh || isMangesh) && sarlaData && availableStrategies.length > 0 && (
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

        {!isSarla && !isSatidham && !isDinesh && currentMetadata?.strategyName && (
          <Button
            variant="outline"
            className={`bg-logo-green mt-4 font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${(isSarla || isSatidham || isDinesh || isMangesh) && !currentMetadata.isActive ? "opacity-70" : ""
              }`}
          >
            {currentMetadata.strategyName} {(isSarla || isSatidham || isDinesh || isMangesh) && !currentMetadata.isActive ? "(Inactive)" : ""}
          </Button>
        )}
        {(isSarla || isSatidham || isDinesh || isMangesh) && sarlaData && availableStrategies.length > 0 && (
          <div className="mt-2 text-xs text-card-text-secondary">
            <p><strong>Note:</strong> Inactive strategies may have limited data updates.</p>
          </div>
        )}
      </div>

      {renderSarlaStrategyTabs()}

      {(isSarla || isSatidham || isDinesh || isMangesh) ? (
        isSarla ? renderSarlaContent() : isSatidham ? renderSatidhamContent() : isDinesh ? renderDineshContent() : renderMangeshContent()
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
                        <CardTitle className="text-card-text text-sm sm:text-sm">
                          {item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker})
                          {(isSarla || isSatidham || isDinesh || isMangesh) && !item.metadata.isActive ? " (Inactive)" : ""}
                        </CardTitle>
                        <div className="text-sm text-card-text-secondary">
                          Strategy: <strong>{item.metadata.strategyName || "Unknown Strategy"}</strong>
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
                        {(isSarla || isSatidham || isDinesh || isMangesh) && !item.metadata.isActive && (
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
                  return (
                    <>
                      <StatsCards
                        stats={convertedStats}
                        accountType={accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"}
                        broker={accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"}
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
                          />
                        </div>
                      </div>
                      <PnlTable
                        quarterlyPnl={convertedStats.quarterlyPnl}
                        monthlyPnl={convertedStats.monthlyPnl}
                      />
                      {renderCashFlowsTable()}
                      {(isSarla || isSatidham || isDinesh || isMangesh) && metadata && !metadata.isActive && (
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