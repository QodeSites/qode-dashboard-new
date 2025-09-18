"use client";

import { useEffect, useState, useRef } from "react";
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
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
}

interface HoldingsSummary {
  totalBuyValue: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdingsCount: number;
  equityHoldings: Holding[];
  debtHoldings: Holding[];
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
  holdings?: HoldingsSummary;
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
    "5d": number | null;
    "10d": number | null;
    "15d": number | null;
    "1m": number | null;
    "3m": number | null;
    "6m": number | null;
    "1y": number | null;
    "2y": number | null;
    "5y"?: number | null;  // Optional in case some APIs don't include this
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
      // Map the API property names to your expected property names
      fiveDays: pmsStats.trailingReturns["5d"] !== null ? pmsStats.trailingReturns["5d"].toString() : null,
      tenDays: pmsStats.trailingReturns["10d"] !== null ? pmsStats.trailingReturns["10d"].toString() : null,
      fifteenDays: pmsStats.trailingReturns["15d"] !== null ? pmsStats.trailingReturns["15d"].toString() : null,
      oneMonth: pmsStats.trailingReturns["1m"] !== null ? pmsStats.trailingReturns["1m"].toString() : null,
      threeMonths: pmsStats.trailingReturns["3m"] !== null ? pmsStats.trailingReturns["3m"].toString() : null,
      sixMonths: pmsStats.trailingReturns["6m"] !== null ? pmsStats.trailingReturns["6m"].toString() : null,
      oneYear: pmsStats.trailingReturns["1y"] !== null ? pmsStats.trailingReturns["1y"].toString() : null,
      twoYears: pmsStats.trailingReturns["2y"] !== null ? pmsStats.trailingReturns["2y"].toString() : null,
      fiveYears: pmsStats.trailingReturns["5y"] !== null ? pmsStats.trailingReturns["5y"].toString() : null,
      sinceInception: pmsStats.trailingReturns.sinceInception.toString(),
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
  const isInternalViewer = session?.user?.accessType === 'internal_viewer';

  console.log('Access type:', session?.user?.accessType);
  const isSarla = session?.user?.icode === "QUS0007";
  const isSatidham = session?.user?.icode === "QUS0010";
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
  const portfolioRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
  }, [status, router, isSarla, isSatidham, accountCode]);

  useEffect(() => {
    if (selectedAccount && status === "authenticated" && !isSarla && !isSatidham) {
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

const handlePdfDownload = async () => {
  try {
    setIsGeneratingPdf(true);

    // Get current stats and metadata based on user type
    let currentStats;
    let currentMetadata;

    if ((isSarla || isSatidham) && sarlaData && selectedStrategy) {
      // For Sarla/Satidham users
      const strategyData = sarlaData[selectedStrategy];
      currentStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
      currentMetadata = strategyData.metadata;
    } else if (Array.isArray(stats)) {
      // For individual accounts view
      const firstAccount = stats[0];
      currentStats = isPmsStats(firstAccount.stats) ? convertPmsStatsToStats(firstAccount.stats) : firstAccount.stats;
      currentMetadata = firstAccount.metadata;
    } else if (stats) {
      // For single account view
      currentStats = isPmsStats(stats) ? convertPmsStatsToStats(stats) : stats;
      currentMetadata = metadata;
    } else {
      throw new Error('No data available for PDF generation');
    }

    // Prepare the data - using the same logic as your statItems
    const labels = {
      amountDeposited: "Amount Invested",
      currentExposure: "Current Portfolio Value",
      return: "Returns"
    };

    const statItems = [
      {
        name: labels.amountDeposited,
        value: `₹${parseFloat(currentStats.amountDeposited).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      {
        name: labels.currentExposure,
        value: `₹${parseFloat(currentStats.currentExposure).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      {
        name: labels.return,
        value: `${parseFloat(currentStats.return).toFixed(2)}%`, // Always show percentage in PDF
      },
    ];

    // Prepare trailing returns data
    const trailingReturnsData = currentStats.trailingReturns;

    // Prepare quarterly P&L data with proper formatting
    const quarterlyData = Object.entries(currentStats.quarterlyPnl)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([year, data]) => ({
        year,
        q1: data.percent.q1,
        q2: data.percent.q2,
        q3: data.percent.q3,
        q4: data.percent.q4,
        total: data.percent.total
      }));

    // Prepare monthly P&L data
    const monthlyData = Object.entries(currentStats.monthlyPnl)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([year, data]) => ({
        year,
        months: data.months,
        totalPercent: data.totalPercent
      }));

    const monthOrder = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];

    // Prepare drawdown metrics
    const drawdownMetrics = {
      maxDrawdown: currentStats.trailingReturns.MDD || currentStats.drawdown,
      currentDrawdown: currentStats.trailingReturns.currentDD || "0.00"
    };

    // Prepare cash flows data with totals
    const allCashFlows = currentStats.cashFlows || [];
    const cashFlowTotals = allCashFlows.reduce(
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

    // Show recent cash flows for display
    const recentCashFlows = allCashFlows.slice(-15).map(flow => ({
      date: new Date(flow.date).toLocaleDateString('en-IN'),
      amount: Number(flow.amount),
      formattedAmount: Number(flow.amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    }));

    // Format helper functions
    const formatPnlValue = (value) => {
      if (!value || value === "-" || value === "") return "-";
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return "-";
      return numValue > 0 ? `+${numValue.toFixed(2)}%` : `${numValue.toFixed(2)}%`;
    };

    const getPnlColorClass = (value) => {
      if (!value || value === "-" || value === "") return "neutral";
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return "neutral";
      return numValue > 0 ? "positive" : numValue < 0 ? "negative" : "neutral";
    };

    const formatCashAmount = (amount) => {
      const absAmount = Math.abs(amount);
      return `₹${absAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portfolio Report - ${session?.user?.name || 'User'}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;500;600&display=swap" rel="stylesheet">
    <script src="https://code.highcharts.com/highcharts.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Lato', sans-serif;
            background-color: #EFECD3;
            color: #333;
            line-height: 1.5;
            font-size: 12px;
        }
        
        .page {
            width: 210mm;
            height: 297mm;
            padding: 5mm;
            margin: 0;
            background-color: #EFECD3;
            box-sizing: border-box;
            page-break-after: always;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        
        .page:last-child {
            page-break-after: auto;
        }
        
        /* Header styles */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #02422B;
        }
        
        .header-left h1 {
            font-family: 'Playfair Display', serif;
            font-size: 24px;
            font-weight: 700;
            color: #02422B;
            margin-bottom: 5px;
        }
        
        .header-left p {
            font-size: 14px;
            color: #666;
            font-weight: 400;
        }
        
        .header-right {
            text-align: right;
        }
        
        .header-right .date {
            font-size: 11px;
            color: #666;
            margin-bottom: 5px;
        }
        
        .header-right .status {
            background-color: #02422B;
            color: #DABD38;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 25px;
        }
        
        .stat-card {
            background: #EFECD3;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #DABD38;
        }
        
        .stat-card h3 {
            font-family: 'Lato', sans-serif;
            font-size: 11px;
            color: #666;
            margin-bottom: 8px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .stat-card .value {
            font-family: 'Playfair Display', serif;
            font-size: 18px;
            font-weight: 600;
            color: #02422B;
        }
        
        .section {
            background: #EFECD3;
            border-radius: 8px;
            margin-bottom: 20px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            page-break-inside: avoid;
        }
        
        .section-header {
            background-color: #02422B;
            color: white;
            padding: 12px 20px;
            font-family: 'Playfair Display', serif;
            font-size: 16px;
            font-weight: 600;
        }
        
        .section-content {
            padding: 0px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            page-break-inside: auto;
        }
        
        th {
            background-color: #02422B;
            color: white;
            padding: 10px 8px;
            text-align: center;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        td {
            padding: 8px;
            text-align: center;
            border-bottom: 1px solid #eee;
        }
        
        tr {
            page-break-inside: avoid;
            page-break-after: auto;
        }
        
        thead {
            display: table-header-group;
        }
        
        tbody {
            display: table-row-group;
        }
        
        tr:nth-child(even) {
            background-color: rgba(255, 255, 255, 0.3);
        }
        
        .positive {
            color: #059669;
        }
        
        .negative {
            color: #dc2626;
        }
        
        .neutral {
            color: #374151;
        }
        
        .cash-flow-positive {
            color: #059669;
            font-weight: 600;
        }
        
        .cash-flow-negative {
            color: #dc2626;
            font-weight: 600;
        }
        
        .summary-row {
            background-color: rgba(243, 244, 246, 0.5);
            font-weight: 600;
        }
        
        .trailing-returns-table th:first-child,
        .trailing-returns-table td:first-child {
            text-align: left;
            font-weight: 500;
        }
        
        .quarterly-table th {
            background-color: #02422B;
        }
        
        .cash-flows-table th {
            background-color: #02422B;
        }
        
        .cash-flows-section {
            page-break-before: always;
            page-break-inside: avoid;
        }
        
        .cash-flows-wrapper {
            page-break-inside: auto;
        }
        
        .cash-flows-table tbody tr {
            page-break-inside: avoid;
            page-break-after: auto;
        }
        
        .note {
            font-size: 10px;
            color: #666;
            margin-top: 10px;
            font-style: italic;
        }
        
        .footer {
            margin-top: auto;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: #666;
        }
        
        .disclaimer {
            font-size: 9px;
            color: #999;
            line-height: 1.4;
            max-width: 75%;
        }
        
        .page-number {
            font-family: 'Playfair Display', serif;
            font-size: 12px;
            color: #02422B;
            font-weight: 600;
        }
        
        .chart-container {
            width: 100%;
            height: 300px;
            margin-bottom: 20px;
        }
        
        @page {
            size: A4 portrait;
            margin: 0;
        }
        
        @media print {
            body {
                background-color: #EFECD3 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .page {
                background-color: #EFECD3 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .stat-card {
                background: #EFECD3 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .section {
                background: #EFECD3 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .header {
                border-bottom-color: #02422B !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            th {
                background-color: #02422B !important;
                color: white !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .section-header {
                background-color: #02422B !important;
                color: white !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .header-right .status {
                background-color: #02422B !important;
                color: #DABD38 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .section {
                page-break-inside: avoid;
            }
            
            .cash-flows-section {
                page-blank-before: always;
                page-break-inside: auto;
            }
            
            .cash-flows-table tbody tr {
                page-break-inside: avoid;
            }
            
            .chart-container {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <!-- Page 1: Summary, Trailing Returns, Drawdown, and Chart -->
    <div class="page">
        <div class="header">
            <div class="header-left">
                <h1>Total Portfolio</h1>
                <p>Performance Summary</p>
            </div>
            <div class="header-right">
                <div class="date">Inception Date: ${currentMetadata?.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A"}</div>
                <div class="date">Data as of: ${currentMetadata?.dataAsOfDate ? dateFormatter(currentMetadata.dataAsOfDate) : "N/A"}</div>
                <span class="status">ACTIVE PORTFOLIO</span>
            </div>
        </div>
        
        <div class="stats-grid">
            ${statItems.map(item => `
                <div class="stat-card">
                    <h3>${item.name}</h3>
                    <div class="value">${item.value}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="section">
            <div class="section-header">Trailing Returns & Drawdown</div>
            <div class="section-content">
                <table class="trailing-returns-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>5d</th>
                            <th>10d</th>
                            <th>15d</th>
                            <th>1m</th>
                            <th>3m</th>
                            <th>1y</th>
                            <th>2y</th>
                            <th>Since Inception</th>
                            <th style="border-left: 2px solid #DABD38;">Current DD</th>
                            <th>Max DD</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="text-align: left; font-weight: 600;">Scheme (%)</td>
                            <td>${trailingReturnsData.fiveDays ? `${parseFloat(trailingReturnsData.fiveDays).toFixed(2)}%` : '-'}</td>
                            <td>${trailingReturnsData.tenDays ? `${parseFloat(trailingReturnsData.tenDays).toFixed(2)}%` : '-'}</td>
                            <td>${trailingReturnsData.fifteenDays ? `${parseFloat(trailingReturnsData.fifteenDays).toFixed(2)}%` : '-'}</td>
                            <td>${trailingReturnsData.oneMonth ? `${parseFloat(trailingReturnsData.oneMonth).toFixed(2)}%` : '-'}</td>
                            <td>${trailingReturnsData.threeMonths ? `${parseFloat(trailingReturnsData.threeMonths).toFixed(2)}%` : '-'}</td>
                            <td>${trailingReturnsData.oneYear ? `${parseFloat(trailingReturnsData.oneYear).toFixed(2)}%` : '-'}</td>
                            <td>${trailingReturnsData.twoYears ? `${parseFloat(trailingReturnsData.twoYears).toFixed(2)}%` : '-'}</td>
                            <td>${trailingReturnsData.sinceInception ? `${parseFloat(trailingReturnsData.sinceInception).toFixed(2)}%` : '-'}</td>
                            <td style="border-left: 2px solid #DABD38;" class="negative">${trailingReturnsData.currentDD ? `${parseFloat(trailingReturnsData.currentDD).toFixed(2)}%` : '-'}</td>
                            <td class="negative">${trailingReturnsData.MDD ? `${parseFloat(trailingReturnsData.MDD).toFixed(2)}%` : '-'}</td>
                        </tr>
                        <tr>
                            <td style="text-align: left; font-weight: 600;">Benchmark (%)</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td style="border-left: 2px solid #DABD38;">-</td>
                            <td>-</td>
                        </tr>
                    </tbody>
                </table>
                <div class="note">
                    <strong>Returns:</strong> Periods under 1 year are presented as absolute, while those over 1 year are annualized (CAGR)
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">Drawdown Metrics</div>
            <div class="section-content">
                <table>
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="font-weight: 600;">Maximum Drawdown</td>
                            <td class="negative">${formatPnlValue(drawdownMetrics.maxDrawdown)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 600;">Current Drawdown</td>
                            <td class="negative">${formatPnlValue(drawdownMetrics.currentDrawdown)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">Portfolio Performance & Drawdown</div>
            <div class="section-content">
                <div id="chart-container" class="chart-container"></div>
            </div>
        </div>
        
        <div class="footer">
            <div class="disclaimer">
                <strong>Portfolio Analysis:</strong> This report provides comprehensive insights into your investment performance and portfolio composition. All figures are based on the latest available market data.
            </div>
            <div class="page-number">1 | Qode</div>
        </div>
    </div>
    
    <!-- Page 2: P&L Analysis -->
    <div class="page">
        <div class="header">
            <div class="header-left">
                <h1>Total Portfolio</h1>
                <p>Profit & Loss Analysis</p>
            </div>
            <div class="header-right">
                <div class="date">Inception Date: ${currentMetadata?.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A"}</div>
                <div class="date">Data as of: ${currentMetadata?.dataAsOfDate ? dateFormatter(currentMetadata.dataAsOfDate) : "N/A"}</div>
                <span class="status">ACTIVE PORTFOLIO</span>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">Quarterly Profit and Loss (%)</div>
            <div class="section-content">
                <table class="quarterly-table">
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Q1</th>
                            <th>Q2</th>
                            <th>Q3</th>
                            <th>Q4</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${quarterlyData.map(row => `
                            <tr>
                                <td style="font-weight: 600;">${row.year}</td>
                                <td class="${getPnlColorClass(row.q1)}">${formatPnlValue(row.q1)}</td>
                                <td class="${getPnlColorClass(row.q2)}">${formatPnlValue(row.q2)}</td>
                                <td class="${getPnlColorClass(row.q3)}">${formatPnlValue(row.q3)}</td>
                                <td class="${getPnlColorClass(row.q4)}">${formatPnlValue(row.q4)}</td>
                                <td class="${getPnlColorClass(row.total)}" style="font-weight: 600;">${formatPnlValue(row.total)}</td>
                            </tr>
                        `).join('')}
                        ${quarterlyData.length === 0 ? '<tr><td colspan="6" style="text-align: center;">No data available</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">Monthly Profit and Loss (%)</div>
            <div class="section-content">
                <table class="monthly-table">
                    <thead>
                        <tr>
                            <th>Year</th>
                            ${monthOrder.map(month => `<th>${month.substring(0, 3)}</th>`).join('')}
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${monthlyData.map(row => `
                            <tr>
                                <td style="font-weight: 600;">${row.year}</td>
                                ${monthOrder.map(month => {
                                    const value = row.months[month]?.percent || "";
                                    return `<td class="${getPnlColorClass(value)}">${formatPnlValue(value)}</td>`;
                                }).join('')}
                                <td class="${getPnlColorClass(row.totalPercent?.toString())}" style="font-weight: 600;">
                                    ${row.totalPercent ? formatPnlValue(row.totalPercent.toString()) : '-'}
                                </td>
                            </tr>
                        `).join('')}
                        ${monthlyData.length === 0 ? '<tr><td colspan="14" style="text-align: center;">No data available</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="footer">
            <div class="disclaimer">
                <strong>P&L Analysis:</strong> Quarterly and monthly performance breakdowns help identify seasonal trends and periodic returns patterns in your portfolio performance.
            </div>
            <div class="page-number">2 | Qode</div>
        </div>
    </div>
    
    <!-- Page 3: Risk & Cash Flow Analysis -->
    <div class="page">
        <div class="header">
            <div class="header-left">
                <h1>Total Portfolio</h1>
                <p>Risk & Cash Flow Analysis</p>
            </div>
            <div class="header-right">
                <div class="date">Inception Date: ${currentMetadata?.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A"}</div>
                <div class="date">Data as of: ${currentMetadata?.dataAsOfDate ? dateFormatter(currentMetadata.dataAsOfDate) : "N/A"}</div>
                <span class="status">ACTIVE PORTFOLIO</span>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">Cash In / Cash Out</div>
            <div class="section-content cash-flows-wrapper">
                ${recentCashFlows.length > 0 ? `
                    <table class="cash-flows-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recentCashFlows.map(flow => `
                                <tr>
                                    <td>${flow.date}</td>
                                    <td class="${flow.amount > 0 ? 'cash-flow-positive' : 'cash-flow-negative'}">
                                        ${flow.amount > 0 ? '+' : ''}${formatCashAmount(flow.amount)}
                                    </td>
                                    <td>${flow.amount > 0 ? 'Cash In' : 'Cash Out'}</td>
                                </tr>
                            `).join('')}
                            <tr class="summary-row">
                                <td style="font-weight: 600;">Total Cash In</td>
                                <td class="cash-flow-positive">+${formatCashAmount(cashFlowTotals.totalIn)}</td>
                                <td>-</td>
                            </tr>
                            <tr class="summary-row">
                                <td style="font-weight: 600;">Total Cash Out</td>
                                <td class="cash-flow-negative">${formatCashAmount(cashFlowTotals.totalOut)}</td>
                                <td>-</td>
                            </tr>
                            <tr class="summary-row">
                                <td style="font-weight: 600;">Net Cash Flow</td>
                                <td class="${cashFlowTotals.netFlow >= 0 ? 'cash-flow-positive' : 'cash-flow-negative'}">
                                    ${cashFlowTotals.netFlow >= 0 ? '+' : ''}${formatCashAmount(cashFlowTotals.netFlow)}
                                </td>
                                <td>-</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="note" style="margin-top: 15px;">
                        <strong>Notes:</strong><br>
                        • Positive amounts represent cash inflows to the portfolio<br>
                        • Negative amounts represent cash outflows from the portfolio<br>
                        • Showing most recent ${recentCashFlows.length} transactions
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px; color: #666;">
                        No cash flow data available
                    </div>
                `}
            </div>
        </div>
        
        <div class="footer">
            <div class="disclaimer">
                <strong>Risk & Cash Flow:</strong> Drawdown metrics measure portfolio risk while cash flow analysis tracks investment and withdrawal patterns affecting overall performance.
            </div>
            <div class="page-number">3 | Qode</div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Prepare data for Highcharts
            const equityCurve = ${JSON.stringify(currentStats.equityCurve || [])};
            const drawdownCurve = ${JSON.stringify(currentStats.drawdownCurve || [])};

            // Process equity curve data
            const portfolioData = equityCurve
                .map(p => {
                    const value = parseFloat(p.value || p.nav);
                    if (isNaN(value) || !isFinite(value)) return null;
                    return [new Date(p.date).getTime(), value];
                })
                .filter(point => point !== null);

            const firstValue = portfolioData[0]?.[1] || 100;
            const processedPortfolioData = portfolioData.map(d => [d[0], (d[1] / firstValue) * 100]);
            const firstPortfolioDate = processedPortfolioData[0]?.[0];

            // Process drawdown curve data
            const portfolioDrawdownData = drawdownCurve
                .map(point => {
                    const dd = parseFloat(point.value || point.drawdown);
                    if (isNaN(dd) || !isFinite(dd)) return null;
                    return [new Date(point.date).getTime(), dd === 0 ? 0 : -Math.abs(dd)];
                })
                .filter(item => item !== null);

            if (portfolioDrawdownData.length && firstPortfolioDate && portfolioDrawdownData[0][0] > firstPortfolioDate) {
                portfolioDrawdownData.unshift([firstPortfolioDate, 0]);
            }

            // Calculate scaling parameters
            function calculateScalingParams(data) {
                if (!data.length) return { min: 0, max: 100, buffer: 10 };
                const min = Math.min(...data);
                const max = Math.max(...data);
                const range = max - min;
                const bufferPercent = range < 5 ? 0.5 : range < 20 ? 0.3 : range < 50 ? 0.2 : 0.1;
                const buffer = range * bufferPercent;
                return {
                    min: Math.max(0, min - buffer),
                    max: max + buffer,
                    buffer: buffer
                };
            }

            function calculateDrawdownScaling(portfolioDD) {
                const allDrawdowns = portfolioDD.filter(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
                if (!allDrawdowns.length) return { min: -10, max: 0 };
                const minDrawdown = Math.min(...allDrawdowns, 0);
                const maxDrawdown = Math.max(...allDrawdowns, 0);
                const range = Math.abs(minDrawdown - maxDrawdown);
                const buffer = Math.max(range * 0.1, 1);
                return {
                    min: Math.min(minDrawdown - buffer, -2),
                    max: Math.max(maxDrawdown + buffer / 2, 1)
                };
            }

            const navValues = processedPortfolioData.map(d => d[1]);
            const navScaling = calculateScalingParams(navValues);
            const portfolioDrawdownValues = portfolioDrawdownData.map(d => d[1]);
            const drawdownScaling = calculateDrawdownScaling(portfolioDrawdownValues);

            const navRange = navScaling.max - navScaling.min;
            const navTickAmount = Math.max(5, Math.min(12, Math.ceil(navRange / 10)));
            const drawdownRange = Math.abs(drawdownScaling.max - drawdownScaling.min);
            const drawdownTickAmount = Math.max(3, Math.min(4, Math.ceil(drawdownRange / 2)));

            // Calculate tick interval
            const dateRange = equityCurve.length > 1
                ? new Date(equityCurve[equityCurve.length - 1].date).getTime() - new Date(equityCurve[0].date).getTime()
                : 0;
            const tickInterval = dateRange > 0
                ? Math.max(7 * 24 * 60 * 60 * 1000, Math.ceil(dateRange / 20))
                : undefined;

            // Initialize Highcharts
            const chart = Highcharts.chart('chart-container', {
                chart: {
                    zoomType: 'xy',
                    height: 300,
                    backgroundColor: 'transparent',
                    plotBackgroundColor: 'transparent',
                    style: { fontFamily: 'Lato, sans-serif' }
                },
                title: { text: '' },
                xAxis: {
                    type: 'datetime',
                    title: {
                        text: 'Date',
                        style: { color: '#2E8B57', fontSize: '12px', fontFamily: 'Lato, sans-serif' }
                    },
                    labels: {
                        format: '{value:%d-%m-%Y}',
                        style: { color: '#2E8B57', fontSize: '12px', fontFamily: 'Lato, sans-serif' }
                    },
                    tickInterval: tickInterval,
                    gridLineColor: '#e6e6e6',
                    tickWidth: 1,
                    lineColor: '#2E8B57'
                },
                yAxis: [
                    {
                        title: {
                            text: 'Performance',
                            style: { color: '#2E8B57', fontSize: '12px', fontFamily: 'Lato, sans-serif' }
                        },
                        height: '50%',
                        top: '0%',
                        labels: {
                            formatter: function() { return Math.round(this.value * 100) / 100 + ''; },
                            style: { color: '#2E8B57', fontSize: '12px', fontFamily: 'Lato, sans-serif' }
                        },
                        min: navScaling.min,
                        max: navScaling.max,
                        tickAmount: navTickAmount,
                        lineColor: '#2E8B57',
                        tickColor: '#2E8B57',
                        tickWidth: 1,
                        gridLineColor: '#e6e6e6',
                        plotLines: [{ value: 100, color: '#2E8B57', width: 1, zIndex: 5, dashStyle: 'dot' }]
                    },
                    {
                        title: {
                            text: 'Drawdown',
                            style: { color: '#FF4560', fontSize: '12px', fontFamily: 'Lato, sans-serif' }
                        },
                        height: '30%',
                        top: '65%',
                        offset: 0,
                        min: drawdownScaling.min,
                        max: 0,
                        tickAmount: drawdownTickAmount,
                        labels: {
                            formatter: function() { return (Math.round(this.value * 100) / 100) + '%'; },
                            style: { color: '#FF4560', fontSize: '12px', fontFamily: 'Lato, sans-serif' }
                        },
                        lineColor: '#FF4560',
                        tickColor: '#FF4560',
                        tickWidth: 1,
                        gridLineColor: '#e6e6e6'
                    }
                ],
                tooltip: {
                    shared: true,
                    xDateFormat: '%d-%m-%Y',
                    valueDecimals: 2,
                    style: { fontFamily: 'Lato, sans-serif' },
                    formatter: function() {
                        const portfolioPoint = this.points.find(p => p.series.name === 'Portfolio');
                        const portfolioDrawdownPoint = this.points.find(p => p.series.name === 'Portfolio Drawdown');
                        let tooltipText = '<b>' + Highcharts.dateFormat('%d-%m-%Y', this.x) + '</b><br/><br/>';
                        tooltipText += '<span style="font-weight: bold;">Performance:</span><br/>';
                        tooltipText += '<span style="color:#2E8B57;">\u25CF</span> Portfolio: ' + (portfolioPoint ? portfolioPoint.y.toFixed(2) : 'N/A') + '<br/>';
                        tooltipText += '<br/><span style="font-weight: bold;">Drawdown:</span><br/>';
                        tooltipText += '<span style="color:#FF4560;">\u25CF</span> Portfolio: ' + (portfolioDrawdownPoint ? portfolioDrawdownPoint.y.toFixed(2) + '%' : 'N/A') + '<br/>';
                        return tooltipText;
                    }
                },
                legend: {
                    enabled: true,
                    layout: 'horizontal',
                    align: 'center',
                    verticalAlign: 'bottom',
                    itemStyle: { fontSize: '12px', color: '#2E8B57', fontFamily: 'Lato, sans-serif' }
                },
                plotOptions: {
                    line: { marker: { enabled: false } },
                    area: { fillOpacity: 0.2, marker: { enabled: false } },
                     series: { animation: false }
                },
                series: [
                    {
                        name: 'Portfolio',
                        data: processedPortfolioData,
                        color: '#2E8B57',
                        zIndex: 2,
                        yAxis: 0,
                        type: 'line',
                        marker: { enabled: false }
                    },
                    {
                        name: 'Portfolio Drawdown',
                        data: portfolioDrawdownData,
                        color: '#FF4560',
                        zIndex: 2,
                        yAxis: 1,
                        type: 'area',
                        marker: { enabled: false },
                        fillOpacity: 0.2,
                        threshold: 0,
                        tooltip: { valueSuffix: '%' }
                    }
                ],
                credits: { enabled: false }
            });

            // Wait for chart to render before printing
            chart.events.load = function() {
                setTimeout(() => {
                    window.print();
                }, 500); // Small delay after load to ensure rendering
            };

            // Fallback if load event doesn't trigger
            setTimeout(() => {
                if (!window.printCalled) {
                    window.print();
                    window.printCalled = true;
                }
            }, 3000);
        });
    </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
if (!printWindow) {
    throw new Error('Could not open print window. Please allow popups for this site.');
}

printWindow.document.write(htmlContent);
printWindow.document.close();

await new Promise(resolve => setTimeout(resolve, 1000));  // Fonts
await new Promise(resolve => setTimeout(resolve, 2000));  // Chart render

printWindow.focus();
printWindow.print();

printWindow.addEventListener('afterprint', () => {
    printWindow.close();
});

setTimeout(() => {
    if (!printWindow.closed) {
        printWindow.close();
    }
}, 5000);

  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF. Please try again.');
  } finally {
    setIsGeneratingPdf(false);
  }
};

  const renderCashFlowsTable = () => {
    let transactions: { date: string; amount: number }[] = [];

    if ((isSarla || isSatidham) && sarlaData && selectedStrategy) {
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
        <Card className="bg-white/50   border-0">
          <CardHeader>
            <CardTitle className="text-sm sm:text-lg text-black">Cash In / Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-3 text-gray-900 dark:text-gray-100">
              No cash flow data available
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-white/50   border-0 p-4">
        <CardTitle className="text-sm sm:text-lg text-black">Cash In / Out</CardTitle>
        <CardContent className="p-0 mt-4">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow className="bg-black/5 hover:bg-gray-200 border-b border-gray-200 dark:border-gray-700">
                  <TableHead className="py-1 text-left text-xs font-medium text-black uppercase tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                    Amount (₹)
                  </TableHead>
                  {viewMode === "individual" && (
                    <TableHead className="py-1 text-left text-xs font-medium text-black uppercase tracking-wider">
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
                    <TableRow key={`${transaction.date}-${index}`} className="border-b border-gray-200 dark:border-gray-700">
                      <TableCell className="py-2 text-xs text-gray-700 dark:text-gray-100">
                        {dateFormatter(transaction.date)}
                      </TableCell>
                      <TableCell
                        className={`py-2 text-xs font-medium text-right ${Number(transaction.amount) > 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatter.format(Number(transaction.amount))}
                      </TableCell>
                      {viewMode === "individual" && (
                        <TableCell className="py-2 text-xs text-gray-700 dark:text-gray-100">
                          {accountName || "Unknown"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                <TableRow className="border-t border-gray-200 dark:border-gray-700 font-semibold">
                  <TableCell className="py-2 text-xs text-gray-800 dark:text-gray-100">Total In</TableCell>
                  <TableCell className="py-2 text-xs text-right text-green-800 dark:text-green-600">
                    {formatter.format(cashFlowTotals.totalIn)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="py-2 text-xs text-gray-800 dark:text-gray-100">Total Out</TableCell>
                  <TableCell className="py-2 text-xs text-right text-red-800 dark:text-red-600">
                    {formatter.format(cashFlowTotals.totalOut)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="py-2 text-xs text-gray-800 dark:text-gray-100">Net Flow</TableCell>
                  <TableCell
                    className={`py-2 text-xs text-right font-semibold ${cashFlowTotals.netFlow >= 0 ? "text-green-800" : "text-red-800"} dark:${cashFlowTotals.netFlow >= 0 ? "text-green-600" : "text-red-600"}`}
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
    if (!(isSarla || isSatidham) || !sarlaData || availableStrategies.length === 0) return null;

    return (
      <div className="mb-4 block sm:hidden">
        <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
          <SelectTrigger className="w-full border-0 ">
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
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <p><strong>Note:</strong> Inactive strategies may have limited data updates.</p>
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
          isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}
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
              />
            </div>
          </div>
        )}
        <PnlTable
          quarterlyPnl={convertedStats.quarterlyPnl}
          monthlyPnl={convertedStats.monthlyPnl}
          showOnlyQuarterlyCash={isCashOnlyView}
          showPmsQawView={isCashPercentView}
          isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}
        />
        {renderCashFlowsTable()}
        {isSatidham && !isActive && (
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

  if (!isSarla && !isSatidham && accounts.length === 0) {
    return (
      <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">
        No accounts found for this user.
      </div>
    );
  }

  if ((isSarla || isSatidham) && (!sarlaData || availableStrategies.length === 0)) {
    return (
      <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">
        No strategy data found for {isSarla ? "Sarla" : "Satidham"} user.
      </div>
    );
  }

  // Add this function to your Portfolio component
  const handleDownloadCSV = () => {
    try {
      let csvData = [];
      let filename = 'portfolio_data.csv';

      // Helper function to format percentage values
      const formatPercentage = (value) => {
        if (value === null || value === undefined) return 'N/A';
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        return (numValue).toFixed(2) + '%';
      };

      // Helper function to format currency values without symbol
      const formatCurrency = (value) => {
        if (value === null || value === undefined || value === '' || isNaN(value)) return 'N/A';
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) return 'N/A';
        return new Intl.NumberFormat('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(numValue);
      };

      if ((isSarla || isSatidham) && sarlaData && selectedStrategy) {
        // Handle Sarla/Satidham data
        const strategyData = sarlaData[selectedStrategy];
        const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;

        filename = `${selectedStrategy.replace(/\s+/g, '_')}_data.csv`;

        // Basic portfolio stats
        csvData.push(['Portfolio Statistics', '']);
        csvData.push(['Strategy Name', selectedStrategy]);
        csvData.push(['Amount Deposited', formatCurrency(convertedStats.amountDeposited)]);
        csvData.push(['Current Exposure', formatCurrency(convertedStats.currentExposure)]);
        csvData.push(['Total Return (%)', convertedStats.return + '%']);
        csvData.push(['Total Profit', formatCurrency(convertedStats.totalProfit)]);
        csvData.push(['Max Drawdown (%)', (convertedStats.drawdown || convertedStats.maxDrawdown) + '%']);
        csvData.push(['', '']); // Empty row

        // Trailing Returns
        csvData.push(['Trailing Returns', '']);
        const trailingReturns = convertedStats.trailingReturns;

        csvData.push(['5 Days', formatPercentage(trailingReturns['5d'] || trailingReturns.fiveDays)]);
        csvData.push(['10 Days', formatPercentage(trailingReturns['10d'] || trailingReturns.tenDays)]);
        csvData.push(['15 Days', formatPercentage(trailingReturns['15d'] || trailingReturns.fifteenDays)]);
        csvData.push(['1 Month', formatPercentage(trailingReturns['1m'] || trailingReturns.oneMonth)]);
        csvData.push(['3 Months', formatPercentage(trailingReturns['3m'] || trailingReturns.threeMonths)]);
        csvData.push(['6 Months', formatPercentage(trailingReturns['6m'] || trailingReturns.sixMonths)]);
        csvData.push(['1 Year', formatPercentage(trailingReturns['1y'] || trailingReturns.oneYear)]);
        csvData.push(['2 Years', formatPercentage(trailingReturns['2y'] || trailingReturns.twoYears)]);

        // Since Inception - handle both number and string
        const sinceInceptionValue = trailingReturns.sinceInception;
        if (typeof sinceInceptionValue === 'number') {
          csvData.push(['Since Inception', formatPercentage(sinceInceptionValue)]);
        } else if (typeof sinceInceptionValue === 'string') {
          csvData.push(['Since Inception', sinceInceptionValue.includes('%') ? sinceInceptionValue : parseFloat(sinceInceptionValue).toFixed(2) + '%']);
        } else {
          csvData.push(['Since Inception', 'N/A']);
        }

        csvData.push(['Max Drawdown (MDD)', trailingReturns.MDD ? trailingReturns.MDD + '%' : 'N/A']);
        csvData.push(['Current Drawdown', trailingReturns.currentDD ? trailingReturns.currentDD + '%' : 'N/A']);
        csvData.push(['', '']); // Empty row



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
                monthData.percent,
                formatCurrency(monthData.cash),
                formatCurrency(monthData.capitalInOut || '0')
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
            ['q1', 'q2', 'q3', 'q4'].forEach(quarter => {
              csvData.push([
                year,
                quarter.toUpperCase(),
                yearData.percent[quarter],
                formatCurrency(yearData.cash[quarter])
              ]);
            });
          });
          csvData.push(['', '']); // Empty row
        }

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
          csvData.push(['Total Cash In', formatCurrency(cashFlowTotals.totalIn)]);
          csvData.push(['Total Cash Out', formatCurrency(cashFlowTotals.totalOut)]);
          csvData.push(['Net Cash Flow', formatCurrency(cashFlowTotals.netFlow)]);
          csvData.push(['', '']); // Empty row

          // Detailed Cash Flows
          csvData.push(['Cash Flows Detail', '']);
          csvData.push(['Date', 'Amount']);
          convertedStats.cashFlows.forEach(flow => {
            csvData.push([flow.date, formatCurrency(flow.amount)]);
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
          csvData.push(['Amount Deposited', formatCurrency(convertedStats.amountDeposited)]);
          csvData.push(['Current Exposure', formatCurrency(convertedStats.currentExposure)]);
          csvData.push(['Total Return (%)', convertedStats.return + '%']);
          csvData.push(['Total Profit', formatCurrency(convertedStats.totalProfit)]);
          csvData.push(['Max Drawdown (%)', convertedStats.drawdown + '%']);
          csvData.push(['', '']); // Empty row

          // Trailing Returns for individual account
          csvData.push(['Trailing Returns', '']);
          const trailingReturns = convertedStats.trailingReturns;

          csvData.push(['5 Days', formatPercentage(trailingReturns['5d'] || trailingReturns.fiveDays)]);
          csvData.push(['10 Days', formatPercentage(trailingReturns['10d'] || trailingReturns.tenDays)]);
          csvData.push(['15 Days', formatPercentage(trailingReturns['15d'] || trailingReturns.fifteenDays)]);
          csvData.push(['1 Month', formatPercentage(trailingReturns['1m'] || trailingReturns.oneMonth)]);
          csvData.push(['3 Months', formatPercentage(trailingReturns['3m'] || trailingReturns.threeMonths)]);
          csvData.push(['6 Months', formatPercentage(trailingReturns['6m'] || trailingReturns.sixMonths)]);
          csvData.push(['1 Year', formatPercentage(trailingReturns['1y'] || trailingReturns.oneYear)]);
          csvData.push(['2 Years', formatPercentage(trailingReturns['2y'] || trailingReturns.twoYears)]);
          csvData.push(['5 Years', formatPercentage(trailingReturns['5y'] || trailingReturns.fiveYears)]);
          csvData.push(['Since Inception', trailingReturns.sinceInception + '%']);
          csvData.push(['Max Drawdown (MDD)', trailingReturns.MDD ? trailingReturns.MDD + '%' : 'N/A']);
          csvData.push(['Current Drawdown', trailingReturns.currentDD ? trailingReturns.currentDD + '%' : 'N/A']);
          csvData.push(['', '']); // Empty row



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
                  monthData.percent,
                  formatCurrency(monthData.cash),
                  formatCurrency(monthData.capitalInOut || '0')
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
              ['q1', 'q2', 'q3', 'q4'].forEach(quarter => {
                const percentReturn = yearData.percent[quarter];
                const cashReturn = yearData.cash[quarter];

                // Skip quarters with no data or invalid data
                if (percentReturn && cashReturn && percentReturn !== '-' && cashReturn !== '-') {
                  csvData.push([
                    year,
                    quarter.toUpperCase(),
                    percentReturn,
                    formatCurrency(cashReturn)
                  ]);
                }
              });
            });
            csvData.push(['', '']); // Empty row
          }

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
            csvData.push(['Total Cash In', formatCurrency(cashFlowTotals.totalIn)]);
            csvData.push(['Total Cash Out', formatCurrency(cashFlowTotals.totalOut)]);
            csvData.push(['Net Cash Flow', formatCurrency(cashFlowTotals.netFlow)]);
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
        csvData.push(['Amount Deposited', formatCurrency(convertedStats.amountDeposited)]);
        csvData.push(['Current Exposure', formatCurrency(convertedStats.currentExposure)]);
        csvData.push(['Total Return (%)', convertedStats.return + '%']);
        csvData.push(['Total Profit', formatCurrency(convertedStats.totalProfit)]);
        csvData.push(['Max Drawdown (%)', convertedStats.drawdown + '%']);
        csvData.push(['', '']); // Empty row

        // Trailing Returns for single account
        csvData.push(['Trailing Returns', '']);
        const trailingReturns = convertedStats.trailingReturns;

        csvData.push(['5 Days', formatPercentage(trailingReturns['5d'] || trailingReturns.fiveDays)]);
        csvData.push(['10 Days', formatPercentage(trailingReturns['10d'] || trailingReturns.tenDays)]);
        csvData.push(['15 Days', formatPercentage(trailingReturns['15d'] || trailingReturns.fifteenDays)]);
        csvData.push(['1 Month', formatPercentage(trailingReturns['1m'] || trailingReturns.oneMonth)]);
        csvData.push(['3 Months', formatPercentage(trailingReturns['3m'] || trailingReturns.threeMonths)]);
        csvData.push(['6 Months', formatPercentage(trailingReturns['6m'] || trailingReturns.sixMonths)]);
        csvData.push(['1 Year', formatPercentage(trailingReturns['1y'] || trailingReturns.oneYear)]);
        csvData.push(['2 Years', formatPercentage(trailingReturns['2y'] || trailingReturns.twoYears)]);
        csvData.push(['5 Years', formatPercentage(trailingReturns['5y'] || trailingReturns.fiveYears)]);
        csvData.push(['Since Inception', trailingReturns.sinceInception + '%']);
        csvData.push(['Max Drawdown (MDD)', trailingReturns.MDD ? trailingReturns.MDD + '%' : 'N/A']);
        csvData.push(['Current Drawdown', trailingReturns.currentDD ? trailingReturns.currentDD + '%' : 'N/A']);
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
          csvData.push(['Total Cash In', formatCurrency(cashFlowTotals.totalIn)]);
          csvData.push(['Total Cash Out', formatCurrency(cashFlowTotals.totalOut)]);
          csvData.push(['Net Cash Flow', formatCurrency(cashFlowTotals.netFlow)]);
          csvData.push(['', '']); // Empty row

          // Detailed Cash Flows
          csvData.push(['Cash Flows Detail', '']);
          csvData.push(['Date', 'Amount']);
          convertedStats.cashFlows.forEach(flow => {
            csvData.push([flow.date, formatCurrency(flow.amount)]);
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
                monthData.percent,
                formatCurrency(monthData.cash),
                formatCurrency(monthData.capitalInOut || '0')
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
            ['q1', 'q2', 'q3', 'q4'].forEach(quarter => {
              const percentReturn = yearData.percent[quarter];
              const cashReturn = yearData.cash[quarter];

              // Skip quarters with no data or invalid data
              if (percentReturn && cashReturn && percentReturn !== '-' && cashReturn !== '-') {
                csvData.push([
                  year,
                  quarter.toUpperCase(),
                  percentReturn,
                  formatCurrency(cashReturn)
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
  const currentMetadata = (isSarla || isSatidham) && sarlaData && selectedStrategy
    ? sarlaData[selectedStrategy].metadata
    : metadata;

  return (
    <div className="sm:p-2 space-y-6" ref={portfolioRef}>
      <div>
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
          <Button onClick={handlePdfDownload} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full">
            Download PDF
          </Button>
          <div className="flex items-center gap-4">
            {(isSarla || isSatidham) && sarlaData && availableStrategies.length > 0 && (
              <div className="hidden sm:block">
                <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
                  <SelectTrigger className="w-[400px] border-0  text-button-text">
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
            {/* <Button
            {/* <Button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="bg-logo-green text-button-text px-4 py-2 rounded-full"
            >
              {isGeneratingPdf ? "Generating PDF..." : "Download PDF"}
            </Button> */}
          </div>
        </div>
        {!isSarla && !isSatidham && currentMetadata?.strategyName && (
          <Button
            variant="outline"
            className={`bg-logo-green mt-4 font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${(isSarla || isSatidham) && !currentMetadata.isActive ? "opacity-70" : ""}`}
          >
            {currentMetadata.strategyName} {(isSarla || isSatidham) && !currentMetadata.isActive ? "(Inactive)" : ""}
          </Button>
        )}
        {(isSarla || isSatidham) && sarlaData && availableStrategies.length > 0 && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            <p><strong>Note:</strong> Inactive strategies may have limited data updates.</p>
          </div>
        )}
      </div>
      {renderSarlaStrategyTabs()}
      {(isSarla || isSatidham) ? (
        isSarla ? renderSarlaContent() : renderSatidhamContent()
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
                    <Card className="bg-white/50   border-0">
                      <CardHeader>
                        <CardTitle className="text-card-text text-sm sm:text-sm">
                          {item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker})
                          {(isSarla || isSatidham) && !item.metadata.isActive ? " (Inactive)" : ""}
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
                          isTotalPortfolio={false}
                          isActive={item.metadata.isActive}
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
                          isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}

                        />
                        {(isSarla || isSatidham) && !item.metadata.isActive && (
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
                      {/* <StockTable holdings={convertedStats.holdings} viewMode="individual" /> */}
                      {/* <StockTable holdings={convertedStats.holdings} viewMode="individual" /> */}
                      <PnlTable
                        quarterlyPnl={convertedStats.quarterlyPnl}
                        monthlyPnl={convertedStats.monthlyPnl}
                        isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}
                      />
                      {renderCashFlowsTable()}
                      {(isSarla || isSatidham) && metadata && !metadata.isActive && (
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