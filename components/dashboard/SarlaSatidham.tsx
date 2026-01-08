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
import * as XLSX from 'xlsx-js-style';
import {
  normalizeToStats,
  filterEquityCurve,
  getLastDate,
  extractBenchmarkTrailing,
  combineTrailing,
} from "@/app/lib/dashboard-utils";
import type {
  SarlaApiResponse,
  ReturnView,
  CombinedTrailing,
} from "@/app/lib/dashboard-types";
import { PnlTable } from "../PnlTable";

interface SarlaSatidhamProps {
  sarlaData: SarlaApiResponse;
  isSarla: boolean;
  sessionUserName: string;
}

export function SarlaSatidham({ sarlaData, isSarla, sessionUserName }: SarlaSatidhamProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [returnViewType, setReturnViewType] = useState<ReturnView>("percent");
  const [afterFees, setAfterFees] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const availableStrategies = Object.keys(sarlaData);

  // Set initial strategy
  useState(() => {
    if (availableStrategies.length > 0 && !selectedStrategy) {
      setSelectedStrategy(availableStrategies[0]);
    }
  });

  const currentEntry = useMemo(() => {
    if (!selectedStrategy || !sarlaData[selectedStrategy]) return null;

    const entry = sarlaData[selectedStrategy];
    const normalized = normalizeToStats(entry.data);
    const equityCurve = filterEquityCurve(
      entry.data.equityCurve,
      entry.metadata?.filtersApplied?.startDate,
      entry.metadata?.lastUpdated
    );
    const lastDate = getLastDate(equityCurve, entry.metadata?.lastUpdated);

    return {
      normalized,
      raw: entry.data,
      metadata: entry.metadata,
      equityCurve,
      drawdownCurve: entry.data.drawdownCurve || [],
      lastDate,
      isTotalPortfolio: selectedStrategy === "Total Portfolio",
      isActive: entry.metadata.isActive,
      strategyName: selectedStrategy,
    };
  }, [sarlaData, selectedStrategy]);

  const { bse500Data } = useBse500Data(currentEntry?.equityCurve || []);

  const combinedTrailing: CombinedTrailing | null = useMemo(() => {
    if (!currentEntry) return null;

    const portfolioTrailing = currentEntry.normalized?.trailingReturns;
    const fromApi =
      extractBenchmarkTrailing(currentEntry.raw, currentEntry.metadata) ||
      extractBenchmarkTrailing(currentEntry.normalized, currentEntry.metadata);

    // Compute benchmark from BSE500 if not in API - using same logic as ManagedAccounts
    let benchmarkTrailing = fromApi;
    if (!benchmarkTrailing && bse500Data.length > 0 && currentEntry.equityCurve?.length > 0) {
      const allPeriods = [
        { key: "5d", duration: 5, type: "days" },
        { key: "10d", duration: 10, type: "days" },
        { key: "15d", duration: 15, type: "days" },
        { key: "1m", duration: 1, type: "months" },
        { key: "3m", duration: 3, type: "months" },
        { key: "1y", duration: 1, type: "years" },
        { key: "2y", duration: 2, type: "years" },
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
        sixMonths: "-",
        oneYear: map["1y"],
        twoYears: map["2y"],
        fiveYears: "-",
        sinceInception: map["sinceInception"],
        MDD: (-Math.abs(maxDrawdown)).toFixed(2),
        currentDD: (-Math.abs(currentDrawdown)).toFixed(2),
      };
    }

    return combineTrailing(portfolioTrailing, benchmarkTrailing);
  }, [currentEntry, bse500Data]);

  const reportModel = useMemo(() => {
    if (!currentEntry) return null;

    const transactions = currentEntry.raw?.cashFlows ?? [];
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

    let amountInvested = 0;
    let currentPortfolioValue = 0;
    let returns = 0;
    let returns_percent = 0;

    if ("totalPortfolioValue" in currentEntry.raw) {
      amountInvested = Number(currentEntry.raw.amountDeposited || 0);
      currentPortfolioValue = Number(currentEntry.raw.totalPortfolioValue ?? 0);
      returns_percent = Number(currentEntry.raw.cumulativeReturn ?? 0);
      returns = Number(currentEntry.raw.totalPnl ?? 0);
    } else {
      amountInvested = Number(currentEntry.raw.amountDeposited || 0);
      currentPortfolioValue = Number(currentEntry.raw.currentExposure ?? 0);
      returns_percent = Number(currentEntry.raw.return ?? 0);
      returns = Number(currentEntry.raw.totalProfit ?? 0);
    }

    // Determine scheme toggles
    const CASH_PERCENT_STRATS_SARLA = [
      "Scheme A",
      "Scheme C",
      "Scheme D",
      "Scheme E",
      "Scheme F",
      "Scheme QAW",
      "Scheme B (inactive)",
    ];
    const CASH_STRATS_SARLA = "Total Portfolio";
    const CASH_PERCENT_STRATS_SATIDHAM = ["Scheme B", "Scheme A", "Scheme A (Old)"];
    const CASH_STRATS_SATIDHAM = "Total Portfolio";

    const isCashOnly =
      (isSarla && currentEntry.strategyName === CASH_STRATS_SARLA) ||
      (!isSarla && currentEntry.strategyName === CASH_STRATS_SATIDHAM);
    const isCashPercent =
      (isSarla && CASH_PERCENT_STRATS_SARLA.includes(currentEntry.strategyName || "")) ||
      (!isSarla && CASH_PERCENT_STRATS_SATIDHAM.includes(currentEntry.strategyName || ""));

    const benchmarkCurves = bse500Data?.length
      ? makeBenchmarkCurves(
        bse500Data.map((pt) => ({ date: pt.date, nav: pt.nav })),
        { alignStartTo: currentEntry.equityCurve?.[0]?.date }
      )
      : { benchmarkEquityCurve: [], benchmarkDrawdownCurve: [] };

    return {
      transactions,
      cashFlowTotals,
      metrics: { amountInvested, currentPortfolioValue, returns, returns_percent },
      equityCurve: currentEntry.equityCurve,
      drawdownCurve: currentEntry.drawdownCurve,
      combinedTrailing,
      drawdown: currentEntry.normalized.drawdown,
      monthlyPnl: currentEntry.normalized.monthlyPnl ?? null,
      quarterlyPnl: currentEntry.normalized.quarterlyPnl ?? null,
      fees: currentEntry.normalized.fees ?? null,
      lastDate: currentEntry.lastDate,
      strategyName: currentEntry.strategyName,
      isTotalPortfolio: currentEntry.isTotalPortfolio,
      isActive: currentEntry.isActive,
      returnViewType,
      showOnlyQuarterlyCash: isCashOnly,
      showPmsQawView: isCashPercent,
      ...benchmarkCurves,
    };
  }, [currentEntry, combinedTrailing, returnViewType, bse500Data, isSarla]);

  const handleDownloadPDF = async () => {
    if (!reportModel) return;

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
        isTotalPortfolio: reportModel.isTotalPortfolio,
        isActive: reportModel.isActive,
        returnViewType: "percent",
        showOnlyQuarterlyCash: reportModel.showOnlyQuarterlyCash,
        showPmsQawView: reportModel.showPmsQawView,
        dateFormatter: (d) => new Date(d).toLocaleDateString("en-IN"),
        formatter: formatter,
        sessionUserName: sessionUserName,
        currentMetadata: {
          inceptionDate: currentEntry?.metadata?.inceptionDate ?? null,
          dataAsOfDate: currentEntry?.metadata?.dataAsOfDate ?? reportModel.lastDate ?? null,
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
      const filename = `${selectedStrategy?.replace(/\s+/g, "_")}_data.csv`;

      const wsData: any[][] = [];

      // 1. Portfolio Statistics Section
      wsData.push(["Portfolio Statistics"]);
      wsData.push(["Strategy Name", selectedStrategy]);
      wsData.push(["Amount Deposited", parseFloat(currentEntry.normalized.amountDeposited) || 0]);
      wsData.push(["Current Exposure", parseFloat(currentEntry.normalized.currentExposure) || 0]);
      wsData.push(["Total Return (%)", parseFloat(currentEntry.normalized.return) || 0]);
      wsData.push(["Total Profit", parseFloat(currentEntry.normalized.totalProfit) || 0]);
      const drawdownValue = parseFloat(currentEntry.normalized.drawdown) || 0;
      wsData.push(["Max Drawdown (%)", drawdownValue > 0 ? -drawdownValue : drawdownValue]);
      wsData.push([]);

      // 2. Trailing Returns Section (skip for Total Portfolio)
      if (combinedTrailing && selectedStrategy !== "Total Portfolio") {
        wsData.push(["Trailing Returns (Portfolio vs Benchmark)"]);
        wsData.push(["Period", "Portfolio Return", "Benchmark Return"]);

        const horizons = [
          { key: "fiveDays", label: "5 Days" },
          { key: "tenDays", label: "10 Days" },
          { key: "fifteenDays", label: "15 Days" },
          { key: "oneMonth", label: "1 Month" },
          { key: "threeMonths", label: "3 Months" },
          { key: "oneYear", label: "1 Year" },
          { key: "twoYears", label: "2 Years" },
          { key: "sinceInception", label: "Since Inception" },
          { key: "MDD", label: "Max Drawdown (MDD)" },
          { key: "currentDD", label: "Current Drawdown" },
        ];

        for (const horizon of horizons) {
          const cell = combinedTrailing[horizon.key as keyof CombinedTrailing];
          if (cell?.portfolio !== null && cell?.portfolio !== undefined) {
            let portfolioNum = parseFloat(cell.portfolio as string);
            let benchmarkNum = cell?.benchmark && cell.benchmark !== "-" ? parseFloat(cell.benchmark as string) : null;

            // Ensure negative values for drawdowns
            if (horizon.key === "MDD" || horizon.key === "currentDD") {
              portfolioNum = portfolioNum > 0 ? -portfolioNum : portfolioNum;
              if (benchmarkNum !== null) {
                benchmarkNum = benchmarkNum > 0 ? -benchmarkNum : benchmarkNum;
              }
            }

            wsData.push([
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
        wsData.push(["Cash Flow Summary"]);
        wsData.push(["Total Cash In", parseFloat(reportModel.cashFlowTotals.totalIn) || 0]);
        wsData.push(["Total Cash Out", parseFloat(reportModel.cashFlowTotals.totalOut) || 0]);
        wsData.push(["Net Cash Flow", parseFloat(reportModel.cashFlowTotals.netFlow) || 0]);
        wsData.push([]);

        wsData.push(["Cash Flows Detail"]);
        wsData.push(["Date", "Amount"]);
        reportModel.transactions.forEach((flow) => {
          wsData.push([flow.date, Number(flow.amount)]);
        });
        wsData.push([]);
      }

      // 4. Monthly PnL Section
      if (reportModel.monthlyPnl && Object.keys(reportModel.monthlyPnl).length > 0) {
        wsData.push(["Monthly P&L"]);
        wsData.push(["Year", "Month", "Percent Return", "Cash Return", "Capital In/Out"]);

        // Sort years
        const years = Object.keys(reportModel.monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        years.forEach((year) => {
          const yearData = reportModel.monthlyPnl![year];

          monthNames.forEach((month) => {
            if (yearData.months[month]) {
              const monthData = yearData.months[month];
              wsData.push([
                year,
                month,
                parseFloat(monthData.percent) || 0,
                parseFloat(monthData.cash) || 0,
                parseFloat(monthData.capitalInOut) || 0
              ]);
            }
          });
        });
        wsData.push([]);
      }

      // 5. Quarterly PnL Section
      if (reportModel.quarterlyPnl && Object.keys(reportModel.quarterlyPnl).length > 0) {
        wsData.push(["Quarterly P&L"]);
        wsData.push(["Year", "Quarter", "Percent Return", "Cash Return"]);

        // Sort years
        const years = Object.keys(reportModel.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

        years.forEach((year) => {
          const yearData = reportModel.quarterlyPnl![year];

          // Q1
          wsData.push([year, "Q1", parseFloat(yearData.percent.q1) || 0, parseFloat(yearData.cash.q1) || 0]);
          // Q2
          wsData.push([year, "Q2", parseFloat(yearData.percent.q2) || 0, parseFloat(yearData.cash.q2) || 0]);
          // Q3
          wsData.push([year, "Q3", parseFloat(yearData.percent.q3) || 0, parseFloat(yearData.cash.q3) || 0]);
          // Q4
          wsData.push([year, "Q4", parseFloat(yearData.percent.q4) || 0, parseFloat(yearData.cash.q4) || 0]);
        });
        wsData.push([]);
      }

      // 6. Fees Section (only for Total Portfolio)
      if (selectedStrategy === "Total Portfolio" && currentEntry.normalized.fees && Object.keys(currentEntry.normalized.fees).length > 0) {
        wsData.push(["Fee Schedule (INR)"]);

        const years = Object.keys(currentEntry.normalized.fees).sort((a, b) => parseInt(a) - parseInt(b));
        wsData.push(["Year", "Q1", "Q2", "Q3", "Q4", "Total"]);

        years.forEach((year) => {
          const yearFees = currentEntry.normalized.fees![year];
          wsData.push([
            year,
            parseFloat(yearFees.q1) || 0,
            parseFloat(yearFees.q2) || 0,
            parseFloat(yearFees.q3) || 0,
            parseFloat(yearFees.q4) || 0,
            parseFloat(yearFees.total) || 0
          ]);
        });
        wsData.push([]);
      }

      // Create worksheet and convert to CSV
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const csv = XLSX.utils.sheet_to_csv(ws);

      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

    } catch (error) {
      console.error("Error generating CSV:", error);
      alert("Failed to generate CSV file");
    }
  };

  // Excel Download Function with dark green headers and % formatting
  const handleDownloadExcel = () => {
    if (!currentEntry || !reportModel) return;

    try {
      const filename = `${selectedStrategy?.replace(/\s+/g, "_")}_data.xlsx`;
      const wb = XLSX.utils.book_new();
      const wsData: any[][] = [];
      const headerRows: number[] = [];
      const subHeaderRows: number[] = [];

      // Add Qode symbol/logo as title and empty row (Q in column B)
      wsData.push(["", "Q"]);
      wsData.push([]);

      // Add empty column (will be column A, data starts from column B)
      // We'll handle this by shifting all data one column right

      // 1. Portfolio Statistics Section
      headerRows.push(wsData.length);
      wsData.push(["", "Portfolio Statistics"]);
      wsData.push(["", "Account Name", sessionUserName || selectedStrategy]);
      wsData.push(["", "Account Type", "MANAGED_ACCOUNT"]);
      wsData.push(["", "Broker", isSarla ? "ZERODHA" : "ZERODHA"]);
      wsData.push(["", "Strategy", selectedStrategy]);
      wsData.push(["", "Status", currentEntry.isActive ? "Active" : "Inactive"]);
      wsData.push(["", "Amount Deposited", parseFloat(currentEntry.normalized.amountDeposited) || 0]);
      wsData.push(["", "Current Exposure", parseFloat(currentEntry.normalized.currentExposure) || 0]);
      wsData.push(["", "Total Profit", parseFloat(currentEntry.normalized.totalProfit) || 0]);
      // Add Total Return % for non-Total Portfolio strategies
      if (selectedStrategy !== "Total Portfolio") {
        wsData.push(["", "Total Return (%)", parseFloat(currentEntry.normalized.return) || 0]);
      }
      wsData.push([]);

      // 2. Trailing Returns Section (skip for Total Portfolio)
      if (combinedTrailing && selectedStrategy !== "Total Portfolio") {
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

            // Ensure negative values for drawdowns
            if (horizon.key === "MDD" || horizon.key === "currentDD") {
              portfolioNum = -Math.abs(portfolioNum);
              benchmarkNum = benchmarkNum !== 0 ? -Math.abs(benchmarkNum) : 0;
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
                parseFloat(monthData.cash) || 0,
              ]);
            }
          });
        });
        wsData.push([]);
      }

      // 5. Quarterly PnL Section (Before Fees) - Always show for all strategies
      if (reportModel.quarterlyPnl && Object.keys(reportModel.quarterlyPnl).length > 0) {
        headerRows.push(wsData.length);
        // Only add "(Before Fees)" suffix for Total Portfolio
        if (selectedStrategy === "Total Portfolio") {
          wsData.push(["", "Quarterly P&L (Before Fees)"]);
        } else {
          wsData.push(["", "Quarterly P&L"]);
        }
        subHeaderRows.push(wsData.length);
        // For Total Portfolio strategy, exclude the Percent Return (%) column
        if (selectedStrategy === "Total Portfolio") {
          wsData.push(["", "Year", "Quarter", "Cash Return"]);
        } else {
          wsData.push(["", "Year", "Quarter", "Percent Return (%)", "Cash Return"]);
        }

        const years = Object.keys(reportModel.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

        years.forEach((year) => {
          const yearData = reportModel.quarterlyPnl![year];
          if (selectedStrategy === "Total Portfolio") {
            wsData.push(["", year, "Q1", parseFloat(yearData.cash.q1) || 0]);
            wsData.push(["", year, "Q2", parseFloat(yearData.cash.q2) || 0]);
            wsData.push(["", year, "Q3", parseFloat(yearData.cash.q3) || 0]);
            wsData.push(["", year, "Q4", parseFloat(yearData.cash.q4) || 0]);
          } else {
            wsData.push(["", year, "Q1", parseFloat(yearData.percent.q1) || 0, parseFloat(yearData.cash.q1) || 0]);
            wsData.push(["", year, "Q2", parseFloat(yearData.percent.q2) || 0, parseFloat(yearData.cash.q2) || 0]);
            wsData.push(["", year, "Q3", parseFloat(yearData.percent.q3) || 0, parseFloat(yearData.cash.q3) || 0]);
            wsData.push(["", year, "Q4", parseFloat(yearData.percent.q4) || 0, parseFloat(yearData.cash.q4) || 0]);
          }
        });
        wsData.push([]);
      }

      // 6. Quarterly PnL Section (After Fees) - Only for Total Portfolio
      if (selectedStrategy === "Total Portfolio" && reportModel.quarterlyPnl && Object.keys(reportModel.quarterlyPnl).length > 0) {
        headerRows.push(wsData.length);
        wsData.push(["", "Quarterly P&L (After Fees)"]);
        subHeaderRows.push(wsData.length);
        wsData.push(["", "Year", "Quarter", "Cash Return"]);

        const years = Object.keys(reportModel.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

        years.forEach((year) => {
          const yearData = reportModel.quarterlyPnl![year];
          const yearFees = currentEntry.normalized.fees?.[year];

          // Calculate after-fees values by subtracting fees from quarterly cash returns
          const q1AfterFees = (parseFloat(yearData.cash.q1) || 0) - (yearFees ? parseFloat(yearFees.q1) || 0 : 0);
          const q2AfterFees = (parseFloat(yearData.cash.q2) || 0) - (yearFees ? parseFloat(yearFees.q2) || 0 : 0);
          const q3AfterFees = (parseFloat(yearData.cash.q3) || 0) - (yearFees ? parseFloat(yearFees.q3) || 0 : 0);
          const q4AfterFees = (parseFloat(yearData.cash.q4) || 0) - (yearFees ? parseFloat(yearFees.q4) || 0 : 0);

          wsData.push(["", year, "Q1", q1AfterFees]);
          wsData.push(["", year, "Q2", q2AfterFees]);
          wsData.push(["", year, "Q3", q3AfterFees]);
          wsData.push(["", year, "Q4", q4AfterFees]);
        });
        wsData.push([]);
      }

      // 7. Fees Section (only for Total Portfolio)
      if (selectedStrategy === "Total Portfolio" && currentEntry.normalized.fees && Object.keys(currentEntry.normalized.fees).length > 0) {
        headerRows.push(wsData.length);
        wsData.push(["", "Quarterly Fees"]);
        subHeaderRows.push(wsData.length);
        wsData.push(["", "Year", "Q1", "Q2", "Q3", "Q4", "Total"]);

        const years = Object.keys(currentEntry.normalized.fees).sort((a, b) => parseInt(a) - parseInt(b));

        years.forEach((year) => {
          const yearFees = currentEntry.normalized.fees![year];
          wsData.push([
            "",
            year,
            parseFloat(yearFees.q1) || 0,
            parseFloat(yearFees.q2) || 0,
            parseFloat(yearFees.q3) || 0,
            parseFloat(yearFees.q4) || 0,
            parseFloat(yearFees.total) || 0
          ]);
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

      // Style for empty/non-table cells - explicitly no borders
      const emptyStyle = {
        font: {
          name: "Aptos Narrow",
          sz: 11
        }
        // No border
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

          // Apply title style to first row (QODE) - now with borders
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
      XLSX.utils.book_append_sheet(wb, ws, "Strategy Data");

      // Write file
      XLSX.writeFile(wb, filename);

    } catch (error) {
      console.error("Error generating Excel:", error);
      alert("Failed to generate Excel file");
    }
  };
  if (!currentEntry || !reportModel) {
    return <div>No data available</div>;
  }

  return (
    <div className="space-y-6" ref={pdfRef}>
      {/* Header Section - Strategy Badge, Selector and Export Buttons */}
      <div className="print-hide">
        {/* Desktop Layout */}
        <div className="hidden sm:block">
          <div className="flex items-center justify-between gap-6 mb-6">
            {/* Strategy Badge */}
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

            {/* Strategy Selector and Export Buttons - aligned to the right */}
            <div className="flex items-center gap-3">
              {/* Strategy Selector */}
              <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-[320px] h-11 border-0 card-shadow text-sm font-heading">
                  <SelectValue placeholder="Select Strategy" />
                </SelectTrigger>
                <SelectContent>
                  {availableStrategies.map((strategy) => {
                    const active = sarlaData[strategy].metadata.isActive;
                    return (
                      <SelectItem key={strategy} value={strategy} className="text-sm font-heading">
                        {strategy} {!active && <span className="text-xs opacity-70">(Inactive)</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Export Buttons */}
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
          {/* Strategy Badge */}
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

          {/* Strategy Selector */}
          <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
            <SelectTrigger className="w-full h-11 border-0 card-shadow font-heading">
              <SelectValue placeholder="Select Strategy" />
            </SelectTrigger>
            <SelectContent>
              {availableStrategies.map((strategy) => {
                const active = sarlaData[strategy].metadata.isActive;
                return (
                  <SelectItem key={strategy} value={strategy} className="font-heading">
                    {strategy} {!active && <span className="text-xs opacity-70">(Inactive)</span>}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

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
      <div className="space-y-6">
        <div data-pdf="split" className="avoid-break space-y-6">

          <StatsCards
            stats={currentEntry.normalized}
            accountType="sarla"
            broker="Sarla"
            isTotalPortfolio={currentEntry.isTotalPortfolio}
            isActive={currentEntry.isActive}
            returnViewType={returnViewType}
            setReturnViewType={setReturnViewType}
            afterFees={afterFees}
            setAfterFees={setAfterFees}
          />

          {currentEntry.isTotalPortfolio && (
            <PnlTable
              quarterlyPnl={currentEntry.normalized.quarterlyPnl}
              monthlyPnl={currentEntry.normalized.monthlyPnl}
              showOnlyQuarterlyCash={reportModel.showOnlyQuarterlyCash}
              showPmsQawView={reportModel.showPmsQawView}
              afterFees={afterFees}
              fees={currentEntry.normalized.fees}
              setAfterFees={setAfterFees}
              isTotalPortfolio={currentEntry.isTotalPortfolio}
            />
          )}
        </div>

        {/* Charts and Additional Tables for Non-Total Portfolio */}
        {!currentEntry.isTotalPortfolio && (
          <>
            <div data-pdf="page" className="avoid-break">
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

        {/* Cash Flows */}
        <div data-pdf="split" className="avoid-break">
          <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0 p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg  text-black mb-4">
              Cash In / Out (₹)
            </CardTitle>
            <CardContent className="p-0">
              <CashFlowTable
                transactions={reportModel.transactions}
                totals={reportModel.cashFlowTotals}
                showAccountColumn={false}
              />
            </CardContent>
          </Card>
          {!currentEntry.isActive && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong className="font-semibold">Note:</strong> This strategy is inactive. Data may not be updated regularly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}