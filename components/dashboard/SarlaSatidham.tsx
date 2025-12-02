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
} from "@/app/lib/dashboard-utils";
import type {
  SarlaApiResponse,
  Stats,
  PmsStats,
  ReturnView,
  CombinedTrailing,
  TrailingReturns,
  EquityCurvePoint,
} from "@/app/lib/dashboard-types";
import { PnlTable } from "../PnlTable";

interface SarlaSatidhamProps {
  sarlaData: SarlaApiResponse;
  isSarla: boolean;
  sessionUserName: string;
}

interface FeesTableProps {
  fees: Stats["fees"];
}

function FeesTable({ fees }: FeesTableProps) {
  if (!fees || Object.keys(fees).length === 0) {
    return null;
  }

  const formatDisplayValue = (value: string) => {
    if (value === "-" || value === "" || value === undefined || value === null) {
      return "-";
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return "-";
    }
    const absValue = Math.abs(numValue);
    const formattedValue = absValue.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `-₹${formattedValue}`;
  };

  const quarterlyYears = Object.keys(fees).sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <Card className="bg-white/50 border-0 p-4">
      <CardTitle className="text-sm sm:text-lg text-black">
        Quarterly Fees (₹)
      </CardTitle>
      <CardContent className="p-0 mt-4">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full border-collapse divide-y">
            <thead className="border-none border-gray-100">
              <tr className="bg-black/5 border-black/5 text-sm">
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[60px]">
                  Year
                </th>
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q1
                </th>
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q2
                </th>
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q3
                </th>
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Q4
                </th>
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quarterlyYears.map((year) => (
                <tr key={year} className="border-gray-300 text-sm">
                  <td className="px-4 py-3 text-center whitespace-nowrap text-black min-w-[60px]">{year}</td>
                  {["q1", "q2", "q3", "q4", "total"].map((quarter) => {
                    const rawValue = fees[year][quarter as keyof typeof fees[string]];
                    const displayValue = formatDisplayValue(rawValue);
                    return (
                      <td key={quarter} className="px-4 py-3 text-center whitespace-nowrap text-black">
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {quarterlyYears.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-3 px-4 text-black">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
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

    return combineTrailing(portfolioTrailing, fromApi);
  }, [currentEntry]);

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
      const csvData = [];
      const filename = `${selectedStrategy?.replace(/\s+/g, "_")}_data.csv`;

      const formatPercentage = (value: any, isDrawdown = false) => {
        if (value === null || value === undefined) return "N/A";
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

      // Basic portfolio stats
      csvData.push(["Portfolio Statistics", ""]);
      csvData.push(["Strategy Name", selectedStrategy]);
      csvData.push(["Amount Deposited", formatCurrency(currentEntry.normalized.amountDeposited)]);
      csvData.push(["Current Exposure", formatCurrency(currentEntry.normalized.currentExposure)]);
      csvData.push(["Total Return (%)", currentEntry.normalized.return + "%"]);
      csvData.push(["Total Profit", formatCurrency(currentEntry.normalized.totalProfit)]);
      csvData.push(["Max Drawdown (%)", formatPercentage(currentEntry.normalized.drawdown, true)]);
      csvData.push(["", ""]);

      // Trailing Returns
      if (combinedTrailing) {
        csvData.push(["Trailing Returns - Portfolio", ""]);
        csvData.push(["Period", "Return"]);

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
          if (cell?.portfolio !== null && cell?.portfolio !== undefined) {
            const isDrawdown = horizon.key === "MDD" || horizon.key === "currentDD";
            csvData.push([horizon.label, formatPercentage(cell.portfolio, isDrawdown)]);
          }
        }
      }

      csvData.push(["", ""]);

      // Cash flows
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

  if (!currentEntry || !reportModel) {
    return <div>No data available</div>;
  }

  return (
    <div className="sm:p-2 space-y-6" ref={pdfRef}>
      {/* Strategy Name, Selector and Export Buttons - Desktop */}
      <div className="hidden sm:flex items-center gap-4 print-hide justify-between">
        <div
          className={`w-fit bg-logo-green font-heading text-button-text text-sm px-3 py-1 rounded-full ${!currentEntry.isActive ? "opacity-70" : ""
            }`}
        >
          <p className="text-sm p-2">
            {currentEntry.strategyName} {!currentEntry.isActive ? "(Inactive)" : ""}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
            <SelectTrigger className="w-[400px] border-0 card-shadow text-button-text">
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

          <div className="flex gap-2">
            <Button onClick={handleDownloadPDF} disabled={exporting} className="text-sm">
              {exporting ? "Preparing..." : "Download PDF"}
            </Button>
            <Button onClick={handleDownloadCSV} disabled={exporting} className="text-sm">
              {exporting ? "Preparing..." : "Download CSV"}
            </Button>
          </div>
        </div>
      </div>

      {/* Strategy Name, Selector and Export Buttons - Mobile */}
      <div className="mb-4 flex flex-col gap-4 sm:hidden">
        <div
          className={`w-fit bg-logo-green font-heading text-button-text text-sm px-3 py-1 rounded-full ${!currentEntry.isActive ? "opacity-70" : ""
            }`}
        >
          <p className="text-sm p-2">
            {currentEntry.strategyName} {!currentEntry.isActive ? "(Inactive)" : ""}
          </p>
        </div>

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

        <div className="flex gap-2">
          <Button onClick={handleDownloadPDF} disabled={exporting} className="text-sm">
            {exporting ? "Preparing..." : "Download PDF"}
          </Button>
          <Button onClick={handleDownloadCSV} disabled={exporting} className="text-sm">
            {exporting ? "Preparing..." : "Download CSV"}
          </Button>
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

          {/* Fees Toggle for Total Portfolio */}
          {currentEntry.isTotalPortfolio && (
            <div className="flex justify-end space-x-2 mb-4">
              <button
                onClick={() => setAfterFees(false)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${!afterFees ? "bg-button-text text-logo-green" : "text-button-text bg-logo-green"
                  }`}
              >
                Before Fees
              </button>
              <button
                onClick={() => setAfterFees(true)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${afterFees ? "bg-button-text text-logo-green" : "text-button-text bg-logo-green"
                  }`}
              >
                After Fees
              </button>
            </div>
          )}

          {!currentEntry.isTotalPortfolio ? (
            <div className="flex flex-col sm:flex-col gap-4 w-full max-w-full overflow-hidden">
              {/* <Card className="bg-white/50 border-0">
                <CardContent className="p-4">
                  <TrailingReturnsTable
                    equityCurve={currentEntry.equityCurve}
                    drawdown={currentEntry.normalized.drawdown}
                    trailingReturns={currentEntry.normalized.trailingReturns as any}
                  />
                </CardContent>
              </Card> */}
            </div>
          ) : (
            <PnlTable
              quarterlyPnl={currentEntry.normalized.quarterlyPnl}
              monthlyPnl={currentEntry.normalized.monthlyPnl}
              showOnlyQuarterlyCash={reportModel.showOnlyQuarterlyCash}
              showPmsQawView={reportModel.showPmsQawView}
              afterFees={afterFees}
              fees={currentEntry.normalized.fees}
            />
          )}
        </div>

        {/* Fees Table for Total Portfolio */}
        {currentEntry.isTotalPortfolio && reportModel.fees && <FeesTable fees={reportModel.fees} />}

        {/* Charts and Additional Tables for Non-Total Portfolio */}
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
              <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}