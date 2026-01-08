"use client";
import { useState, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { TrailingReturnsTable } from "@/components/trailing-returns-table";
import { CashFlowTable } from "@/components/CashFlowTable";
import { useBse500Data } from "@/hooks/useBse500Data";
import { buildPortfolioReportHTML } from "@/components/buildPortfolioReportHTML";
import { makeBenchmarkCurves } from "@/components/benchmarkCurves";
import * as XLSX from "xlsx-js-style";
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
        csvData.push(["Amount Deposited", parseFloat(currentEntry.normalized.amountDeposited) || 0]);
        csvData.push(["Current Exposure", parseFloat(currentEntry.normalized.currentExposure) || 0]);
        csvData.push(["Total Return (%)", parseFloat(currentEntry.normalized.return) || 0]);
        csvData.push(["Total Profit", parseFloat(currentEntry.normalized.totalProfit) || 0]);
        const drawdownValue = parseFloat(currentEntry.normalized.drawdown) || 0;
        csvData.push(["Max Drawdown (%)", drawdownValue > 0 ? -drawdownValue : drawdownValue]);
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
              let portfolioNum = parseFloat(cell.portfolio as string);
              let benchmarkNum = cell.benchmark && cell.benchmark !== "-" ? parseFloat(cell.benchmark as string) : null;

              // Ensure negative values for drawdowns
              if (horizon.key === "MDD" || horizon.key === "currentDD") {
                portfolioNum = portfolioNum > 0 ? -portfolioNum : portfolioNum;
                if (benchmarkNum !== null) {
                  benchmarkNum = benchmarkNum > 0 ? -benchmarkNum : benchmarkNum;
                }
              }

              csvData.push([
                horizon.label,
                isNaN(portfolioNum) ? 0 : portfolioNum,
                benchmarkNum !== null && !isNaN(benchmarkNum) ? benchmarkNum : 0
              ]);
            }
          }
        }

        csvData.push(["", ""]);

      } else if (currentEntry.mode === "multi") {
        // Multiple accounts export
        filename = "consolidated_accounts_data.csv";

        csvData.push(["Consolidated Portfolio Statistics", ""]);
        csvData.push(["View Mode", "Consolidated"]);
        csvData.push(["Number of Accounts", currentEntry.items.length]);
        csvData.push(["Total Amount Invested", reportModel.metrics.amountInvested]);
        csvData.push(["Total Portfolio Value", reportModel.metrics.currentPortfolioValue]);
        csvData.push(["Total Returns", reportModel.metrics.returns]);
        csvData.push(["Total Returns (%)", reportModel.metrics.returns_percent]);
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
            parseFloat(normalized.amountDeposited) || 0,
            parseFloat(normalized.currentExposure) || 0,
            parseFloat(normalized.return) || 0,
            parseFloat(normalized.totalProfit) || 0,
          ]);
        }

        csvData.push(["", ""]);
      }

      // Cash flows (common for both single and multi)
      if (reportModel.transactions?.length > 0) {
        csvData.push(["Cash Flow Summary", ""]);
        csvData.push(["Total Cash In", reportModel.cashFlowTotals.totalIn]);
        csvData.push(["Total Cash Out", reportModel.cashFlowTotals.totalOut]);
        csvData.push(["Net Cash Flow", reportModel.cashFlowTotals.netFlow]);
        csvData.push(["", ""]);

        csvData.push(["Cash Flows Detail", ""]);
        csvData.push(["Date", "Amount"]);
        reportModel.transactions.forEach((flow) => {
          csvData.push([flow.date, Number(flow.amount)]);
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
              const numPercent = parseFloat(percentVal);
              const numCash = parseFloat(cashVal);
              csvData.push([
                year,
                quarterLabels[i],
                isNaN(numPercent) ? 0 : numPercent,
                isNaN(numCash) ? 0 : numCash,
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
                const numPercent = parseFloat(percentVal);
                const numCash = parseFloat(cashVal || "0");
                const numCapitalInOut = parseFloat(capitalInOut || "0");
                csvData.push([
                  year,
                  month,
                  isNaN(numPercent) ? 0 : numPercent,
                  isNaN(numCash) ? 0 : numCash,
                  isNaN(numCapitalInOut) ? 0 : numCapitalInOut,
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

  const handleDownloadExcel = () => {
    if (!currentEntry || !reportModel) return;

    try {
      const accountName = currentAccount?.account_name || "Account";
      const filename = currentEntry.mode === "single"
        ? `${accountName.replace(/\s+/g, "_")}_data.xlsx`
        : "consolidated_accounts_data.xlsx";
      const wb = XLSX.utils.book_new();
      const wsData: any[][] = [];
      const headerRows: number[] = [];
      const subHeaderRows: number[] = [];

      // Add Qode symbol/logo as title and empty row (Q in column B)
      wsData.push(["", "Q"]);
      wsData.push([]);

      // 1. Portfolio Statistics Section
      if (currentEntry.mode === "single") {
        headerRows.push(wsData.length);
        wsData.push(["", "Portfolio Statistics"]);
        wsData.push(["", "Account Name", accountName]);
        wsData.push(["", "Account Type", currentAccount?.account_type?.toUpperCase() || "N/A"]);
        wsData.push(["", "Broker", currentAccount?.broker?.toUpperCase() || "N/A"]);
        wsData.push(["", "Strategy", currentEntry.strategyName || "N/A"]);
        wsData.push(["", "Status", currentEntry.isActive ? "Active" : "Inactive"]);
        wsData.push(["", "Amount Deposited", parseFloat(currentEntry.normalized.amountDeposited) || 0]);
        wsData.push(["", "Current Exposure", parseFloat(currentEntry.normalized.currentExposure) || 0]);
        wsData.push(["", "Total Profit", parseFloat(currentEntry.normalized.totalProfit) || 0]);
        wsData.push([]);
      } else if (currentEntry.mode === "multi") {
        headerRows.push(wsData.length);
        wsData.push(["", "Consolidated Portfolio Statistics"]);
        wsData.push(["", "View Mode", "Consolidated"]);
        wsData.push(["", "Number of Accounts", currentEntry.items.length]);
        wsData.push(["", "Total Amount Invested", parseFloat(String(reportModel.metrics.amountInvested)) || 0]);
        wsData.push(["", "Total Portfolio Value", parseFloat(String(reportModel.metrics.currentPortfolioValue)) || 0]);
        wsData.push(["", "Total Returns", parseFloat(String(reportModel.metrics.returns)) || 0]);
        wsData.push(["", "Total Returns (%)", parseFloat(String(reportModel.metrics.returns_percent)) || 0]);
        wsData.push([]);
        // Individual accounts summary
        headerRows.push(wsData.length);
        wsData.push(["", "Individual Accounts Summary"]);
        subHeaderRows.push(wsData.length);
        wsData.push(["", "Account Name", "Account Type", "Broker", "Strategy", "Status", "Amount Deposited", "Current Exposure", "Return (%)", "Total Profit"]);
        for (const item of currentEntry.items) {
          const normalized = normalizeToStats(item.stats);
          wsData.push([
            "",
            item.metadata.account_name,
            item.metadata.account_type?.toUpperCase() || "N/A",
            item.metadata.broker?.toUpperCase() || "N/A",
            item.metadata.strategyName || "N/A",
            item.metadata.isActive ? "Active" : "Inactive",
            parseFloat(normalized.amountDeposited) || 0,
            parseFloat(normalized.currentExposure) || 0,
            parseFloat(normalized.return) || 0,
            parseFloat(normalized.totalProfit) || 0,
          ]);
        }
        wsData.push([]);
      }

      // 2. Trailing Returns Section (for single account only)
      if (currentEntry.mode === "single" && combinedTrailing) {
        headerRows.push(wsData.length);
        wsData.push(["", "Trailing Returns (Portfolio vs Benchmark)"]);
        subHeaderRows.push(wsData.length);
        wsData.push(["", "Period", "Portfolio Return (%)", "Benchmark Return (%)"]);

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
          { key: "MDD", label: "Max Drawdown (%)" },
          { key: "currentDD", label: "Current Drawdown (%)" },
        ];

        for (const horizon of horizons) {
          const cell = combinedTrailing[horizon.key as keyof CombinedTrailing];
          if (cell?.portfolio !== null && cell?.portfolio !== undefined) {
            let portfolioNum = parseFloat(cell.portfolio as string);
            let benchmarkNum = cell?.benchmark && cell.benchmark !== "-" ? parseFloat(cell.benchmark as string) : 0;

            // Ensure negative values for drawdowns - they should always be negative
            if (horizon.key === "MDD" || horizon.key === "currentDD") {
              // If the value is positive, make it negative
              portfolioNum = portfolioNum > 0 ? -portfolioNum : portfolioNum;
              benchmarkNum = benchmarkNum > 0 ? -benchmarkNum : benchmarkNum;
            }

            wsData.push([
              "",
              horizon.label,
              isNaN(portfolioNum) ? 0 : portfolioNum,
              benchmarkNum !== null && !isNaN(benchmarkNum) ? benchmarkNum : 0
            ]);
          }
        }
        wsData.push([]);
      }

      // 3. Cash Flow Section
      if (reportModel.transactions?.length > 0) {
        headerRows.push(wsData.length);
        wsData.push(["", "Cash Flow Summary"]);
        wsData.push(["", "Total Cash In", parseFloat(String(reportModel.cashFlowTotals.totalIn)) || 0]);
        wsData.push(["", "Total Cash Out", parseFloat(String(reportModel.cashFlowTotals.totalOut)) || 0]);
        wsData.push(["", "Net Cash Flow", parseFloat(String(reportModel.cashFlowTotals.netFlow)) || 0]);
        wsData.push([]);

        headerRows.push(wsData.length);
        wsData.push(["", "Cash Flows Detail"]);
        subHeaderRows.push(wsData.length);
        wsData.push(["", "Date", "Amount"]);
        reportModel.transactions.forEach((flow) => {
          // Convert date to DD-MM-YYYY format
          const dateObj = new Date(flow.date);
          const day = String(dateObj.getDate()).padStart(2, '0');
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const year = dateObj.getFullYear();
          const formattedDate = `${day}-${month}-${year}`;
          wsData.push(["", formattedDate, Number(flow.amount)]);
        });
        wsData.push([]);
      }

      // 4. Monthly PnL Section
      if (reportModel.monthlyPnl && Object.keys(reportModel.monthlyPnl).length > 0) {
        headerRows.push(wsData.length);
        wsData.push(["", "Monthly P&L"]);
        subHeaderRows.push(wsData.length);
        wsData.push(["", "Year", "Month", "Percent Return (%)", "Cash Return"]);

        const years = Object.keys(reportModel.monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        years.forEach((year) => {
          const yearData = reportModel.monthlyPnl![year];
          monthNames.forEach((month) => {
            if (yearData.months[month]) {
              const monthData = yearData.months[month];
              wsData.push([
                "",
                year,
                month,
                parseFloat(monthData.percent) || 0,
                parseFloat(monthData.cash) || 0
              ]);
            }
          });
        });
        wsData.push([]);
      }

      // 5. Quarterly PnL Section
      if (reportModel.quarterlyPnl && Object.keys(reportModel.quarterlyPnl).length > 0) {
        headerRows.push(wsData.length);
        wsData.push(["", "Quarterly P&L"]);
        subHeaderRows.push(wsData.length);
        wsData.push(["", "Year", "Quarter", "Percent Return (%)", "Cash Return"]);

        const years = Object.keys(reportModel.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

        years.forEach((year) => {
          const yearData = reportModel.quarterlyPnl![year];
          wsData.push(["", year, "Q1", parseFloat(yearData.percent.q1) || 0, parseFloat(yearData.cash.q1) || 0]);
          wsData.push(["", year, "Q2", parseFloat(yearData.percent.q2) || 0, parseFloat(yearData.cash.q2) || 0]);
          wsData.push(["", year, "Q3", parseFloat(yearData.percent.q3) || 0, parseFloat(yearData.cash.q3) || 0]);
          wsData.push(["", year, "Q4", parseFloat(yearData.percent.q4) || 0, parseFloat(yearData.cash.q4) || 0]);
        });
        wsData.push([]);
      }

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Get worksheet range
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

      // Calculate auto-fit column widths based on content
      const maxCols = Math.max(...wsData.map(row => row.length));
      const colWidths: { wch: number }[] = [];

      for (let C = 0; C < maxCols; C++) {
        // Column A (index 0) should be narrow as it's empty
        if (C === 0) {
          colWidths.push({ wch: 2 });
          continue;
        }

        let maxWidth = 10; // Minimum width
        for (let R = 0; R < wsData.length; R++) {
          const cellValue = wsData[R][C];
          if (cellValue != null) {
            const cellLength = String(cellValue).length;
            maxWidth = Math.max(maxWidth, cellLength);
          }
        }
        // Add some padding and cap at reasonable max
        colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
      }
      ws['!cols'] = colWidths;

      // Define border style for tables
      const tableBorder = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      };

      // Define header style with dark green background (#02422B) and white text
      const headerStyle = {
        fill: {
          patternType: "solid",
          fgColor: { rgb: "02422B" }
        },
        font: {
          name: "Aptos Narrow",
          color: { rgb: "FFFFFF" },
          bold: true,
          sz: 11
        },
        alignment: {
          horizontal: "center",
          vertical: "center"
        },
        border: tableBorder
      };

      // Define sub-header style with #DABD38 background and #02422B text (dark green)
      const subHeaderStyle = {
        fill: {
          patternType: "solid",
          fgColor: { rgb: "DABD38" }
        },
        font: {
          name: "Aptos Narrow",
          color: { rgb: "02422B" },
          bold: true,
          sz: 11
        },
        alignment: {
          horizontal: "center",
          vertical: "center"
        },
        border: tableBorder
      };

      // Define regular cell styles with borders
      const textStyle = {
        font: {
          name: "Aptos Narrow",
          sz: 11
        },
        alignment: {
          horizontal: "left",
          vertical: "center"
        },
        border: tableBorder
      };

      const numberStyle = {
        font: {
          name: "Aptos Narrow",
          sz: 11
        },
        alignment: {
          horizontal: "right",
          vertical: "center"
        },
        numFmt: "0.00", // 2 decimal places
        border: tableBorder
      };

      const titleStyle = {
        font: {
          name: "Playfair Display",
          bold: true,
          sz: 32,
          color: { rgb: "02422B" }
        },
        alignment: {
          horizontal: "left",
          vertical: "center"
        }
        // No border for title
      };

      // Helper function to check if a row is part of a table (has data in column B or later)
      const isTableRow = (rowIdx: number) => {
        // Skip title and empty rows
        if (rowIdx <= 1) return false;

        // Check if this row has any data in columns B onwards
        const rowData = wsData[rowIdx];
        if (!rowData) return false;

        for (let i = 1; i < rowData.length; i++) {
          if (rowData[i] !== undefined && rowData[i] !== null && rowData[i] !== '') {
            return true;
          }
        }
        return false;
      };

      // Apply styles to all cells
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;

          const cellValue = ws[cellAddress].v;

          // Skip styling for truly empty cells
          if (cellValue === null || cellValue === undefined || cellValue === '') {
            continue;
          }

          // Apply title style to first row (QODE)
          if (R === 0) {
            ws[cellAddress].s = titleStyle;
            continue;
          }

          // Skip styling for empty rows (row 1)
          if (R >= 1 && R <= 1) {
            continue;
          }

          // Ensure numbers are typed correctly and format to 2 decimal places
          // But keep years as integers (4-digit numbers like 2024, 2025)
          if (typeof ws[cellAddress].v === 'number') {
            ws[cellAddress].t = 'n';
            // Check if it's a year (4-digit integer between 1900-2100)
            if (Number.isInteger(ws[cellAddress].v) && ws[cellAddress].v >= 1900 && ws[cellAddress].v <= 2100) {
              ws[cellAddress].z = '0'; // Format years as integers
            } else {
              ws[cellAddress].z = '0.00'; // Format other numbers with 2 decimal places
            }
          } else if (typeof ws[cellAddress].v === 'string') {
            // Only convert to number if the ENTIRE string is numeric
            const trimmed = ws[cellAddress].v.trim();
            const num = parseFloat(trimmed);
            if (!isNaN(num) && trimmed === String(num)) {
              ws[cellAddress].v = num;
              ws[cellAddress].t = 'n';
              // Check if it's a year (4-digit integer)
              if (Number.isInteger(num) && num >= 1900 && num <= 2100) {
                ws[cellAddress].z = '0'; // Format years as integers
              } else {
                ws[cellAddress].z = '0.00'; // Format other numbers with 2 decimal places
              }
            } else {
              ws[cellAddress].t = 's'; // Keep as string (for text labels like "5 Days", "2024", etc.)
            }
          }

          // Only apply styles with borders if this is a table row and cell has content
          if (isTableRow(R)) {
            // Skip column A (index 0) - it should remain empty with no styling
            if (C === 0) {
              continue;
            } else if (headerRows.includes(R)) {
              // Apply header style to header rows (only columns B onwards)
              ws[cellAddress].s = headerStyle;
            } else if (subHeaderRows.includes(R)) {
              // Apply sub-header style with #DABD38 background (only columns B onwards)
              ws[cellAddress].s = subHeaderStyle;
            } else {
              // Regular cell styling based on type and column
              // First data column (B = column 1) contains labels, should be left-aligned
              if (C === 1) {
                ws[cellAddress].s = textStyle;
              } else if (ws[cellAddress].t === 'n') {
                // Numbers (values) should be right-aligned with 2 decimal places
                ws[cellAddress].s = numberStyle;
              } else {
                // Text values in columns > 1 (column C onwards) should be right-aligned
                // Create a right-aligned text style for non-numeric values
                const rightAlignedTextStyle = {
                  ...textStyle,
                  alignment: {
                    horizontal: "right",
                    vertical: "center"
                  }
                };
                ws[cellAddress].s = rightAlignedTextStyle;
              }
            }
          } else {
            // For any other content-filled cells outside tables (e.g., title already handled), apply a bordered text style
            ws[cellAddress].s = textStyle;
          }
        }
      }

      // Merge cells for headers (merge across full table width)
      const merges: any[] = [];

      // Helper function to find the max column width for a section
      const getTableWidth = (startRow: number) => {
        let maxCol = 1;
        // Look at the next few rows after the header to determine table width
        for (let r = startRow; r < Math.min(startRow + 15, wsData.length); r++) {
          if (wsData[r]) {
            for (let c = 1; c < wsData[r].length; c++) {
              if (wsData[r][c] !== undefined && wsData[r][c] !== null && wsData[r][c] !== '') {
                maxCol = Math.max(maxCol, c);
              }
            }
          }
          // Stop at empty row (section break)
          if (wsData[r] && wsData[r].every((cell: any, idx: number) => idx === 0 || !cell)) {
            break;
          }
        }
        return maxCol;
      };

      // Merge header rows across full table width
      headerRows.forEach(rowIdx => {
        const tableWidth = getTableWidth(rowIdx);

        if (tableWidth > 1) {
          merges.push({
            s: { r: rowIdx, c: 1 },
            e: { r: rowIdx, c: tableWidth }
          });
        }
      });

      if (merges.length > 0) {
        ws['!merges'] = merges;
      }

      // Set worksheet view to hide gridlines BEFORE adding to workbook
      (ws as any)['!views'] = [{
        showGridLines: false
      }];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Portfolio Data");

      // Write file
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error("Error generating Excel:", error);
      alert("Failed to generate Excel file");
    }
  };

  const currentAccount = accounts.find((acc) => acc.qcode === selectedAccount);
  const showTagSelector =
    currentAccount?.account_type === "prop" && availableTags.length > 0;

  return (
    <div className="space-y-6 sm:space-y-8" ref={pdfRef}>
      {/* Header Section - Strategy Badge, Tag Selector and Export Buttons */}
      <div className="print-hide">
        {/* Desktop Layout */}
        <div className="hidden sm:block">
          <div className="flex items-center justify-between gap-6 mb-6">
            {/* Strategy Badge - only show for single account view */}
            {currentEntry.mode === "single" && currentEntry.strategyName && (
              <div
                className={`bg-logo-green text-button-text px-4 py-2 rounded-full ${
                  !currentEntry.isActive ? "opacity-70" : ""
                }`}
              >
                <p className="text-base font-heading font-medium">
                  {currentEntry.strategyName}
                  {!currentEntry.isActive && (
                    <span className="ml-2 text-xs opacity-80">(Inactive)</span>
                  )}
                </p>
              </div>
            )}

            {/* Tag Selector for Prop accounts */}
            {showTagSelector ? (
              <div className="flex-1 max-w-xs">
                <Select value={selectedTag || ""} onValueChange={onTagChange}>
                  <SelectTrigger className="h-11 border-0 card-shadow text-base font-heading">
                    <SelectValue placeholder="Select Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag} value={tag} className="text-base font-heading">
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-600 mt-2">Filter data by mastersheet tag</p>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {/* Export Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleDownloadPDF}
                disabled={exporting}
                className="h-11 px-4 text-sm font-medium"
                variant="default"
              >
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button
                onClick={handleDownloadExcel}
                disabled={exporting}
                className="h-11 px-4 text-sm font-medium"
                variant="default"
              >
                <Download className="h-4 w-4 mr-2" />
                Excel
              </Button>
              {/* <Button
                onClick={handleDownloadCSV}
                disabled={exporting}
                className="h-11 px-4 text-sm font-medium"
                variant="default"
              >
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button> */}
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="sm:hidden space-y-4">
          {/* Strategy Badge - only show for single account view */}
          {currentEntry.mode === "single" && currentEntry.strategyName && (
            <div
              className={`w-fit bg-logo-green text-button-text px-4 py-2 rounded-full ${
                !currentEntry.isActive ? "opacity-70" : ""
              }`}
            >
              <p className="text-sm font-heading font-medium">
                {currentEntry.strategyName}
                {!currentEntry.isActive && (
                  <span className="ml-2 text-xs opacity-80">(Inactive)</span>
                )}
              </p>
            </div>
          )}

          {/* Tag Selector for Prop accounts */}
          {showTagSelector && (
            <div>
              <Select value={selectedTag || ""} onValueChange={onTagChange}>
                <SelectTrigger className="w-full h-11 border-0 card-shadow font-heading">
                  <SelectValue placeholder="Select Tag" />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag} className="font-heading">
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600 mt-2">Filter data by mastersheet tag</p>
            </div>
          )}

          {/* Export Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={handleDownloadPDF}
              disabled={exporting}
              className="h-10 text-xs"
              variant="default"
            >
              <Download className="h-3 w-3 mr-1" />
              PDF
            </Button>
            <Button
              onClick={handleDownloadExcel}
              disabled={exporting}
              className="h-10 text-xs"
              variant="default"
            >
              <Download className="h-3 w-3 mr-1" />
              Excel
            </Button>
            <Button
              onClick={handleDownloadCSV}
              disabled={exporting}
              className="h-10 text-xs"
              variant="default"
            >
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
          </div>
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
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base sm:text-lg font-semibold text-card-text">
                      {item.metadata.account_name}
                      <span className="ml-2 text-sm font-normal text-card-text-secondary">
                        ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker})
                      </span>
                      {!item.metadata.isActive && (
                        <span className="ml-2 text-xs text-yellow-600">(Inactive)</span>
                      )}
                    </CardTitle>
                    <div className="text-sm text-card-text-secondary mt-1">
                      Strategy: <strong className="font-medium">{item.metadata.strategyName || "Unknown Strategy"}</strong>
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
              <CardTitle className="text-sm sm:text-lg text-black">Cash In / Out (₹)</CardTitle>
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