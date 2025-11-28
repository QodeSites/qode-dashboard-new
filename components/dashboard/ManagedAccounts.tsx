"use client";
import { useState, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { TrailingReturnsTable } from "@/components/trailing-returns-table";
import { CashFlowTable } from "@/components/CashFlowTable";
import { useBse500Data } from "@/hooks/useBse500Data";
import { buildPortfolioReportHTML } from "@/components/buildPortfolioReportHTML";
import { makeBenchmarkCurves } from "@/components/benchmarkCurves";
import {
  normalizeToStats,
  filterEquityCurve,
  dateFormatter,
  getLastDate,
  extractBenchmarkTrailing,
  combineTrailing,
  isPmsStats,
  convertPmsStatsToStats,
  mergeQuarterly,
  sumNum,
} from "@/app/lib/dashboard-utils";
import type {
  Stats,
  PmsStats,
  Account,
  Metadata,
  ReturnView,
  CombinedTrailing,
  EquityCurvePoint,
} from "@/app/lib/dashboard-types";
import { PnlTable } from "../PnlTable";

interface ManagedAccountsProps {
  accounts: Account[];
  selectedAccount: string | null;
  onAccountChange: (qcode: string) => void;
  stats:
  | (Stats | PmsStats)
  | {
    stats: Stats | PmsStats;
    metadata: Account & { strategyName: string; isActive: boolean };
  }[]
  | null;
  metadata: Metadata | null;
  viewMode: "consolidated" | "individual";
  sessionUserName: string;
  selectedTag: string | null;
  availableTags: string[];
  onTagChange: (tag: string) => void;
}

export function ManagedAccounts({
  accounts,
  selectedAccount,
  onAccountChange,
  stats,
  metadata,
  viewMode,
  sessionUserName,
  selectedTag,
  availableTags,
  onTagChange,
}: ManagedAccountsProps) {
  const [returnViewType, setReturnViewType] = useState<ReturnView>("percent");
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const currentEntry = useMemo(() => {
    if (!stats) return { mode: "empty" } as const;

    if (Array.isArray(stats)) {
      return { mode: "multi", items: stats } as const;
    }

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
  }, [stats, metadata]);

  const { bse500Data } = useBse500Data(
    currentEntry.mode === "single" ? currentEntry.equityCurve : []
  );

  const combinedTrailing: CombinedTrailing | null = useMemo(() => {
    if (currentEntry.mode !== "single") return null;

    const portfolioTrailing = currentEntry.normalized?.trailingReturns;
    const fromApi =
      extractBenchmarkTrailing(currentEntry.raw, currentEntry.metadata) ||
      extractBenchmarkTrailing(currentEntry.normalized, currentEntry.metadata);

    // Compute benchmark from BSE500 if not in API - using same logic as TrailingReturnsTable
    let benchmarkTrailing = fromApi;
    if (!benchmarkTrailing && bse500Data.length > 0 && currentEntry.equityCurve.length > 0) {
      const allPeriods = [
        { key: "5d", duration: 5, type: "days" },
        { key: "10d", duration: 10, type: "days" },
        { key: "15d", duration: 15, type: "days" },
        { key: "1m", duration: 1, type: "months" },
        { key: "3m", duration: 3, type: "months" },
        { key: "6m", duration: 6, type: "months" },
        { key: "1y", duration: 1, type: "years" },
        { key: "2y", duration: 2, type: "years" },
        { key: "5y", duration: 5, type: "years" },
        { key: "sinceInception", duration: null, type: "inception" },
      ];

      const endDate = new Date(currentEntry.equityCurve[currentEntry.equityCurve.length - 1].date);
      const startDate = new Date(currentEntry.equityCurve[0].date);

      const findNav = (targetDate: Date) => {
        const exactMatch = bse500Data.find(point => {
          const pointDate = new Date(point.date);
          return pointDate.toDateString() === targetDate.toDateString();
        });

        if (exactMatch) return parseFloat(exactMatch.nav);

        let closestPrevious: { nav: number } | null = null;
        let closestPreviousDiff = Infinity;
        let closestFuture: { nav: number } | null = null;
        let closestFutureDiff = Infinity;

        bse500Data.forEach(point => {
          const pointDate = new Date(point.date);
          const timeDiff = targetDate.getTime() - pointDate.getTime();

          if (timeDiff >= 0) {
            if (timeDiff < closestPreviousDiff) {
              closestPreviousDiff = timeDiff;
              closestPrevious = { nav: parseFloat(point.nav) };
            }
          } else {
            const futureDiff = Math.abs(timeDiff);
            if (futureDiff < closestFutureDiff) {
              closestFutureDiff = futureDiff;
              closestFuture = { nav: parseFloat(point.nav) };
            }
          }
        });

        const selectedPoint = closestPrevious || closestFuture;
        return selectedPoint ? selectedPoint.nav : 0;
      };

      const getDaysForPeriod = (period: typeof allPeriods[0]) => {
        if (period.type === "days") return period.duration!;
        if (period.type === "months") return period.duration! * 30;
        if (period.type === "years") return period.duration! * 365;
        return 0;
      };

      const calculateReturn = (start: Date, end: Date) => {
        const startNav = findNav(start);
        const endNav = findNav(end);

        if (startNav && endNav && startNav !== 0) {
          const durationYears = (end.getTime() - start.getTime()) / (365 * 24 * 60 * 60 * 1000);
          
          if (durationYears >= 1) {
            // CAGR for periods >= 1 year
            return ((Math.pow(endNav / startNav, 1 / durationYears) - 1) * 100).toFixed(2);
          } else {
            // Absolute return for shorter periods
            return (((endNav - startNav) / startNav) * 100).toFixed(2);
          }
        }
        return "-";
      };

      const map: Record<string, string> = {};

      // Calculate returns for all periods
      allPeriods.forEach(period => {
        if (period.type === "days" || period.type === "months" || period.type === "years") {
          const start = new Date(endDate);
          const daysToSubtract = getDaysForPeriod(period);
          start.setDate(endDate.getDate() - daysToSubtract);
          map[period.key] = calculateReturn(start, endDate);
        } else if (period.type === "inception") {
          map[period.key] = calculateReturn(startDate, endDate);
        }
      });

      // Calculate benchmark drawdowns
      let maxDrawdown = 0;
      let peakNav = -Infinity;
      let currentNav = parseFloat(bse500Data[bse500Data.length - 1].nav);

      bse500Data.forEach(point => {
        const nav = parseFloat(point.nav);
        if (nav > peakNav) peakNav = nav;
        const drawdownValue = ((nav - peakNav) / peakNav) * 100;
        if (drawdownValue < maxDrawdown) maxDrawdown = drawdownValue;
      });

      let allTimePeak = -Infinity;
      bse500Data.forEach(point => {
        const nav = parseFloat(point.nav);
        if (nav > allTimePeak) allTimePeak = nav;
      });

      const currentDrawdown = allTimePeak > 0 ? ((currentNav - allTimePeak) / allTimePeak) * 100 : 0;

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
        sinceInception: map["sinceInception"],
        MDD: (-Math.abs(maxDrawdown)).toFixed(2),
        currentDD: (-Math.abs(currentDrawdown)).toFixed(2),
      };
    }

    return combineTrailing(portfolioTrailing, benchmarkTrailing);
  }, [currentEntry, bse500Data]);

  const benchmarkCurves = useMemo(() => {
    if (!bse500Data?.length) return { benchmarkEquityCurve: [], benchmarkDrawdownCurve: [] };
    return makeBenchmarkCurves(
      bse500Data.map((pt) => ({ date: pt.date, nav: pt.nav })),
      {
        alignStartTo:
          currentEntry.mode === "single" ? currentEntry.equityCurve?.[0]?.date : undefined,
      }
    );
  }, [bse500Data, currentEntry]);

  const reportModel = useMemo(() => {
    let transactions: { date: string; amount: number }[] = [];
    let eq: EquityCurvePoint[] = [];
    let dd: { date: string; value: number }[] = [];
    let drawdown = "0";
    let monthlyPnl: Stats["monthlyPnl"] | null = null;
    let quarterlyPnl: Stats["quarterlyPnl"] | null = null;
    let fees: Stats["fees"] | null = null;
    let lastDate: string | null = null;
    let strategyName: string | undefined;
    let isActive = true;

    let amountInvested = 0;
    let currentPortfolioValue = 0;
    let returns = 0;
    let returns_percent = 0;

    if (currentEntry.mode === "single") {
      transactions = ((currentEntry as any).raw as any)?.cashFlows ?? [];
      const raw = (currentEntry as any).raw as Stats | PmsStats;

      if (isPmsStats(raw)) {
        amountInvested = Number(raw.amountDeposited || 0);
        currentPortfolioValue = Number(raw.totalPortfolioValue ?? 0);
        returns_percent = Number(raw.cumulativeReturn ?? 0);
        returns = Number(raw.totalPnl ?? 0);
      } else {
        amountInvested = Number(raw.amountDeposited || 0);
        currentPortfolioValue = Number(raw.currentExposure ?? 0);
        returns_percent = Number(raw.return ?? 0);
        returns = Number(raw.totalProfit ?? 0);
      }

      eq = currentEntry.equityCurve;
      dd = currentEntry.drawdownCurve;
      drawdown = currentEntry.normalized.drawdown;
      monthlyPnl = currentEntry.normalized.monthlyPnl ?? null;
      quarterlyPnl = currentEntry.normalized.quarterlyPnl ?? null;
      fees = currentEntry.normalized.fees ?? null;
      lastDate = currentEntry.lastDate;
      strategyName = currentEntry.strategyName;
      isActive = currentEntry.isActive;
    } else if (currentEntry.mode === "multi") {
      transactions = (currentEntry as any).items.flatMap(
        (it: any) => it.stats?.cashFlows ?? []
      );

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
            cash: {
              q1: String(v.q1),
              q2: String(v.q2),
              q3: String(v.q3),
              q4: String(v.q4),
              total: String(v.total),
            },
            yearCash: String(v.total),
          };
        }
        quarterlyPnl = shaped;
      }

      for (const it of (currentEntry as any).items) {
        const st = it.stats as Stats | PmsStats;
        if (isPmsStats(st)) {
          amountInvested += Number(st.amountDeposited ?? 0);
          currentPortfolioValue += Number(st.totalPortfolioValue ?? 0);
          returns += Number(st.totalPnl ?? 0);
        } else {
          amountInvested += Number(st.amountDeposited ?? 0);
          currentPortfolioValue += Number(st.currentExposure ?? 0);
          returns += Number(st.totalProfit ?? 0);
        }
      }
      returns_percent = amountInvested > 0 ? (returns / amountInvested) * 100 : 0;
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

    return {
      transactions,
      cashFlowTotals,
      metrics: { amountInvested, currentPortfolioValue, returns, returns_percent },
      equityCurve: eq,
      drawdownCurve: dd,
      combinedTrailing,
      drawdown,
      monthlyPnl,
      quarterlyPnl,
      fees,
      lastDate,
      strategyName,
      isActive,
      returnViewType,
      showOnlyQuarterlyCash: false,
      showPmsQawView: false,
      ...benchmarkCurves,
    };
  }, [currentEntry, combinedTrailing, returnViewType, benchmarkCurves]);

  const handleDownloadPDF = async () => {
    try {
      setExporting(true);
      const formatter = (v: number) =>
        v === 0
          ? "-"
          : new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2,
          }).format(v);

      const html = buildPortfolioReportHTML({
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
        isTotalPortfolio: false,
        isActive: reportModel.isActive,
        returnViewType: "percent",
        showOnlyQuarterlyCash: false,
        showPmsQawView: false,
        dateFormatter: (d) => new Date(d).toLocaleDateString("en-IN"),
        formatter: formatter,
        sessionUserName: sessionUserName,
        currentMetadata: {
          inceptionDate: metadata?.inceptionDate ?? null,
          dataAsOfDate: metadata?.dataAsOfDate ?? reportModel.lastDate ?? null,
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
    if (!currentEntry || !reportModel) return;

    try {
      const csvData: (string | number)[][] = [];
      let filename = "managed_accounts_data.csv";

      const formatPercentage = (value: any, isDrawdown = false) => {
        if (value === null || value === undefined || value === "-" || value === "") return "N/A";
        const numValue = typeof value === "string" ? parseFloat(value) : value;
        if (isNaN(numValue)) return "N/A";
        let formattedValue = numValue;
        if (isDrawdown) {
          formattedValue = -Math.abs(numValue);
        }
        return formattedValue.toFixed(2) + "%";
      };

      const formatCurrency = (value: any) => {
        if (value === null || value === undefined || value === "" || isNaN(value)) return "N/A";
        const numValue = typeof value === "string" ? parseFloat(value) : value;
        if (isNaN(numValue)) return "N/A";
        return new Intl.NumberFormat("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(numValue);
      };

      // Helper function to format PnL values for CSV
      const formatPnlValue = (value: string | undefined, isPercent: boolean) => {
        if (!value || value === "-" || value === "") return "-";
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return "-";
        if (isPercent) {
          return numValue.toFixed(2) + "%";
        }
        return new Intl.NumberFormat("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(numValue);
      };

      if (currentEntry.mode === "single") {
        // Single account export
        const accountName = currentAccount?.account_name || "Account";
        filename = `${accountName.replace(/\s+/g, "_")}_data.csv`;

        // Basic portfolio stats
        csvData.push(["Portfolio Statistics", ""]);
        csvData.push(["Account Name", accountName]);
        csvData.push(["Account Type", currentAccount?.account_type?.toUpperCase() || "N/A"]);
        csvData.push(["Broker", currentAccount?.broker || "N/A"]);
        csvData.push(["Strategy", currentEntry.strategyName || "N/A"]);
        csvData.push(["Status", currentEntry.isActive ? "Active" : "Inactive"]);
        csvData.push(["Amount Deposited", formatCurrency(currentEntry.normalized.amountDeposited)]);
        csvData.push(["Current Exposure", formatCurrency(currentEntry.normalized.currentExposure)]);
        csvData.push(["Total Return (%)", currentEntry.normalized.return + "%"]);
        csvData.push(["Total Profit", formatCurrency(currentEntry.normalized.totalProfit)]);
        csvData.push(["Max Drawdown (%)", formatPercentage(currentEntry.normalized.drawdown, true)]);
        csvData.push(["", ""]);

        // Trailing Returns - use pre-calculated combinedTrailing values
        if (combinedTrailing) {
          csvData.push(["Trailing Returns", ""]);
          csvData.push(["Period", "Portfolio", "Benchmark"]);

          const horizons = [
            { key: "fiveDays", label: "5 Days" },
            { key: "tenDays", label: "10 Days" },
            { key: "fifteenDays", label: "15 Days" },
            { key: "oneMonth", label: "1 Month" },
            { key: "threeMonths", label: "3 Months" },
            { key: "sixMonths", label: "6 Months" },
            { key: "oneYear", label: "1 Year" },
            { key: "twoYears", label: "2 Years" },
            { key: "fiveYears", label: "5 Years" },
            { key: "sinceInception", label: "Since Inception" },
            { key: "MDD", label: "Max Drawdown (MDD)" },
            { key: "currentDD", label: "Current Drawdown" },
          ];

          for (const horizon of horizons) {
            const cell = combinedTrailing[horizon.key as keyof CombinedTrailing];
            if (cell) {
              const isDrawdown = horizon.key === "MDD" || horizon.key === "currentDD";
              const portfolioValue = formatPercentage(cell.portfolio, isDrawdown);
              const benchmarkValue = cell.benchmark && cell.benchmark !== "-" 
                ? formatPercentage(cell.benchmark, isDrawdown) 
                : "N/A";

              csvData.push([horizon.label, portfolioValue, benchmarkValue]);
            }
          }
        }

        csvData.push(["", ""]);

      } else if (currentEntry.mode === "multi") {
        // Multiple accounts export
        filename = "consolidated_accounts_data.csv";

        csvData.push(["Consolidated Portfolio Statistics", ""]);
        csvData.push(["View Mode", "Consolidated"]);
        csvData.push(["Number of Accounts", currentEntry.items.length.toString()]);
        csvData.push(["Total Amount Invested", formatCurrency(reportModel.metrics.amountInvested)]);
        csvData.push(["Total Portfolio Value", formatCurrency(reportModel.metrics.currentPortfolioValue)]);
        csvData.push(["Total Returns", formatCurrency(reportModel.metrics.returns)]);
        csvData.push(["Total Returns (%)", reportModel.metrics.returns_percent.toFixed(2) + "%"]);
        csvData.push(["", ""]);

        // Individual accounts summary
        csvData.push(["Individual Accounts Summary", ""]);
        csvData.push(["Account Name", "Account Type", "Broker", "Strategy", "Status", "Amount Deposited", "Current Exposure", "Return (%)", "Total Profit"]);

        for (const item of currentEntry.items) {
          const normalized = normalizeToStats(item.stats);
          csvData.push([
            item.metadata.account_name,
            item.metadata.account_type?.toUpperCase() || "N/A",
            item.metadata.broker || "N/A",
            item.metadata.strategyName || "N/A",
            item.metadata.isActive ? "Active" : "Inactive",
            formatCurrency(normalized.amountDeposited),
            formatCurrency(normalized.currentExposure),
            normalized.return + "%",
            formatCurrency(normalized.totalProfit),
          ]);
        }

        csvData.push(["", ""]);
      }

      // Cash flows (common for both single and multi)
      if (reportModel.transactions?.length > 0) {
        csvData.push(["Cash Flow Summary", ""]);
        csvData.push(["Total Cash In", formatCurrency(reportModel.cashFlowTotals.totalIn)]);
        csvData.push(["Total Cash Out", formatCurrency(reportModel.cashFlowTotals.totalOut)]);
        csvData.push(["Net Cash Flow", formatCurrency(reportModel.cashFlowTotals.netFlow)]);
        csvData.push(["", ""]);

        csvData.push(["Cash Flows Detail", ""]);
        csvData.push(["Date", "Amount"]);
        reportModel.transactions.forEach((flow) => {
          csvData.push([flow.date, formatCurrency(flow.amount)]);
        });
        csvData.push(["", ""]);
      }

      // Quarterly PnL - Row format
      if (reportModel.quarterlyPnl && Object.keys(reportModel.quarterlyPnl).length > 0) {
        const quarterlyYears = Object.keys(reportModel.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

        csvData.push(["Quarterly P&L", "", "", ""]);
        csvData.push(["Year", "Quarter", "Percent Return", "Cash Return"]);

        for (const year of quarterlyYears) {
          const data = reportModel.quarterlyPnl[year];
          const quarters = ["q1", "q2", "q3", "q4"] as const;
          const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];

          for (let i = 0; i < quarters.length; i++) {
            const qKey = quarters[i];
            const percentVal = data.percent?.[qKey];
            const cashVal = data.cash?.[qKey];

            // Only add row if there's data for this quarter
            if (percentVal && percentVal !== "-" && percentVal !== "0" && percentVal !== "") {
              csvData.push([
                year,
                quarterLabels[i],
                parseFloat(percentVal).toFixed(2),
                formatPnlValue(cashVal, false),
              ]);
            }
          }
        }
        csvData.push(["", "", "", ""]);
      }

      // Monthly PnL - Row format
      if (reportModel.monthlyPnl && Object.keys(reportModel.monthlyPnl).length > 0) {
        const monthOrder = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December",
        ];
        const monthlyYears = Object.keys(reportModel.monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

        csvData.push(["Monthly P&L", "", "", "", ""]);
        csvData.push(["Year", "Month", "Percent Return", "Cash Return", "Capital In/Out"]);

        for (const year of monthlyYears) {
          const yearData = reportModel.monthlyPnl[year];

          for (const month of monthOrder) {
            const monthData = yearData?.months?.[month];

            // Only add row if there's data for this month
            if (monthData && (monthData.percent || monthData.cash)) {
              const percentVal = monthData.percent;
              const cashVal = monthData.cash;
              const capitalInOut = monthData.capitalInOut;

              if (percentVal && percentVal !== "-" && percentVal !== "") {
                csvData.push([
                  year,
                  month,
                  parseFloat(percentVal).toFixed(2),
                  formatPnlValue(cashVal, false),
                  formatPnlValue(capitalInOut, false),
                ]);
              }
            }
          }
        }
        csvData.push(["", "", "", "", ""]);
      }

      // Convert to CSV string
      const csvContent = csvData
        .map((row) =>
          row
            .map((field) => {
              if (
                typeof field === "string" &&
                (field.includes(",") || field.includes('"') || field.includes("\n"))
              ) {
                return `"${field.replace(/"/g, '""')}"`;
              }
              return field;
            })
            .join(",")
        )
        .join("\n");

      // Download CSV
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error("Error generating CSV:", error);
      alert("Failed to generate CSV file");
    }
  };

  const currentAccount = accounts.find((acc) => acc.qcode === selectedAccount);
  const showTagSelector =
    currentAccount?.account_type === "prop" && availableTags.length > 0;

  return (
    <div className="sm:p-2 space-y-6" ref={pdfRef}>
      {/* Account and Tag Selectors */}
      <div className="flex flex-col sm:flex-row gap-4">
        {showTagSelector && (
          <div className="w-full sm:w-auto">
            <Select value={selectedTag || ""} onValueChange={onTagChange}>
              <SelectTrigger className="w-full sm:w-[300px] border-0 card-shadow text-button-text">
                <SelectValue placeholder="Select Tag" />
              </SelectTrigger>
              <SelectContent>
                {availableTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-600 mt-1">Filter data by mastersheet tag</p>
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          <Button onClick={handleDownloadPDF} disabled={exporting} className="text-sm">
            {exporting ? "Preparing..." : "Download PDF"}
          </Button>
          <Button onClick={handleDownloadCSV} disabled={exporting} className="text-sm">
            {exporting ? "Preparing..." : "Download CSV"}
          </Button>
        </div>
      </div>

      {/* Content */}
      {currentEntry.mode === "multi" ? (
        // Multiple accounts view
        <div className="space-y-6">
          {(currentEntry as any).items.map((item: any, index: number) => {
            const normalized = normalizeToStats(item.stats);
            const filteredEquityCurve = filterEquityCurve(
              item.stats.equityCurve,
              item.metadata.filtersApplied?.startDate ?? null,
              item.metadata.lastUpdated ?? null
            );
            const lastDate = getLastDate(
              filteredEquityCurve,
              item.metadata.lastUpdated ?? null
            );

            return (
              <div key={index} className="space-y-6">
                <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                  <CardHeader>
                    <CardTitle className="text-card-text text-sm sm:text-sm">
                      {item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} -{" "}
                      {item.metadata.broker})
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
                            equityCurve={filteredEquityCurve}
                            drawdown={normalized.drawdown}
                            trailingReturns={normalized.trailingReturns as any}
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
                      <PnlTable
                        quarterlyPnl={normalized.quarterlyPnl}
                        monthlyPnl={normalized.monthlyPnl}
                      />
                      {!item.metadata.isActive && (
                        <div className="text-sm text-yellow-600">
                          <strong>Note:</strong> This account is inactive. Data may not be updated
                          regularly.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : currentEntry.mode === "single" ? (
        // Single account view
        <>
          <div data-pdf="split" className="avoid-break">
            <StatsCards
              stats={currentEntry.normalized}
              accountType={
                accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"
              }
              broker={accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"}
              isActive={currentEntry.isActive}
              returnViewType={returnViewType}
              setReturnViewType={setReturnViewType}
            />

            {/* Return View Toggle */}
            {/* <div className="flex justify-center space-x-2 mt-4">
              <button
                onClick={() => setReturnViewType("cash")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${returnViewType === "cash"
                    ? "bg-button-text text-logo-green"
                    : "text-button-text bg-logo-green"
                  }`}
              >
                Value
              </button>
              <button
                onClick={() => setReturnViewType("percent")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${returnViewType === "percent"
                    ? "bg-button-text text-logo-green"
                    : "text-button-text bg-logo-green"
                  }`}
              >
                Percentage
              </button>
            </div> */}
          </div>

          {/* Trailing Returns Table */}
          {/* <div className="flex flex-col sm:flex-col gap-4 w-full max-w-full overflow-hidden">
            <Card className="bg-white/50 border-0">
              <CardContent className="p-4">
                <TrailingReturnsTable
                  equityCurve={currentEntry.equityCurve}
                  drawdown={currentEntry.normalized.drawdown}
                  trailingReturns={currentEntry.normalized.trailingReturns as any}
                  combinedTrailing={combinedTrailing}
                />
              </CardContent>
            </Card>
          </div> */}

          {/* Revenue Chart */}
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
            <div className="flex-1 min-w-0 sm:w-5/6">
              <RevenueChart
                equityCurve={currentEntry.equityCurve}
                drawdownCurve={currentEntry.drawdownCurve}
                trailingReturns={currentEntry.normalized.trailingReturns}
                drawdown={currentEntry.normalized.drawdown}
                lastDate={currentEntry.lastDate}
                benchmarkEquityCurve={benchmarkCurves.benchmarkEquityCurve}
                benchmarkDrawdownCurve={benchmarkCurves.benchmarkDrawdownCurve}
              />
            </div>
          </div>

          {/* PnL Table */}
          <div data-pdf="split" className="avoid-break">
            <PnlTable
              quarterlyPnl={currentEntry.normalized.quarterlyPnl}
              monthlyPnl={currentEntry.normalized.monthlyPnl}
            />
          </div>

          {/* Cash Flows */}
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
                <strong>Note:</strong> This account is inactive. Data may not be updated regularly.
              </div>
            )}
          </div>
        </>
      ) : (
        <div>No data available</div>
      )}
    </div>
  );
}