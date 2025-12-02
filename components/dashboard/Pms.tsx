"use client";
import { useState, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "@/app/lib/dashboard-utils";
import type {
  Stats,
  PmsStats,
  Account,
  Metadata,
  ReturnView,
  CombinedTrailing,
} from "@/app/lib/dashboard-types";
import { PnlTable } from "../PnlTable";

interface PmsProps {
  account: Account;
  stats: Stats | PmsStats;
  metadata: Metadata | null;
  sessionUserName: string;
}

export function Pms({ account, stats, metadata, sessionUserName }: PmsProps) {
  const [returnViewType, setReturnViewType] = useState<ReturnView>("percent");
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const currentEntry = useMemo(() => {
    const normalized = normalizeToStats(stats);
    const equityCurve = filterEquityCurve(
      (stats as any).equityCurve || [],
      metadata?.filtersApplied?.startDate ?? null,
      metadata?.lastUpdated ?? null
    );
    const lastDate = getLastDate(equityCurve, metadata?.lastUpdated ?? null);

    return {
      normalized,
      raw: stats,
      metadata,
      equityCurve,
      drawdownCurve: (stats as any).drawdownCurve || [],
      lastDate,
      isActive: metadata?.isActive ?? true,
      strategyName: metadata?.strategyName || account.account_name,
    };
  }, [stats, metadata, account]);

  const { bse500Data } = useBse500Data(currentEntry.equityCurve);

  const combinedTrailing: CombinedTrailing | null = useMemo(() => {
    const portfolioTrailing = currentEntry.normalized?.trailingReturns;
    const fromApi =
      extractBenchmarkTrailing(currentEntry.raw, currentEntry.metadata) ||
      extractBenchmarkTrailing(currentEntry.normalized, currentEntry.metadata);

    // Compute benchmark from BSE500 if not in API
    let benchmarkTrailing = fromApi;
    if (!benchmarkTrailing && bse500Data.length > 0) {
      const periods = [
        { key: "5d", duration: 5 },
        { key: "10d", duration: 10 },
        { key: "15d", duration: 15 },
        { key: "1m", duration: 30 },
        { key: "3m", duration: 90 },
        { key: "6m", duration: 180 },
        { key: "1y", duration: 365 },
        { key: "2y", duration: 730 },
        { key: "5y", duration: 1825 },
      ];

      const map: Record<string, string> = {};
      const endDate = new Date(bse500Data[bse500Data.length - 1].date);

      for (const p of periods) {
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - p.duration);

        const startNav = bse500Data.find((pt) => new Date(pt.date) >= startDate)?.nav;
        const endNav = bse500Data[bse500Data.length - 1].nav;

        if (startNav && endNav) {
          const ret = ((parseFloat(endNav) - parseFloat(startNav)) / parseFloat(startNav)) * 100;
          map[p.key] = ret.toFixed(2);
        } else {
          map[p.key] = "-";
        }
      }

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
        sinceInception: "-",
        MDD: "-",
        currentDD: "-",
      };
    }

    return combineTrailing(portfolioTrailing, benchmarkTrailing);
  }, [currentEntry, bse500Data]);

  const benchmarkCurves = useMemo(() => {
    if (!bse500Data?.length) return { benchmarkEquityCurve: [], benchmarkDrawdownCurve: [] };
    return makeBenchmarkCurves(
      bse500Data.map((pt) => ({ date: pt.date, nav: pt.nav })),
      { alignStartTo: currentEntry.equityCurve?.[0]?.date }
    );
  }, [bse500Data, currentEntry]);

  const reportModel = useMemo(() => {
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

    if (isPmsStats(currentEntry.raw)) {
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
      isActive: currentEntry.isActive,
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
    // CSV generation logic
    console.log("CSV download for PMS account");
    // Implement CSV export logic here
  };

  return (
    <div className="sm:p-2 space-y-6" ref={pdfRef}>
      {/* Export Buttons */}
      <div className="flex gap-2 justify-end">
        <Button onClick={handleDownloadPDF} disabled={exporting} className="text-sm">
          {exporting ? "Preparing..." : "Download PDF"}
        </Button>
        <Button onClick={handleDownloadCSV} disabled={exporting} className="text-sm">
          {exporting ? "Preparing..." : "Download CSV"}
        </Button>
      </div>

      {/* Account Info */}
      <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
        <CardHeader>
          <CardTitle className="text-card-text text-sm sm:text-lg">
            {account.account_name} (PMS - {account.broker})
            {!currentEntry.isActive ? " (Inactive)" : ""}
          </CardTitle>
          <div className="text-sm text-card-text-secondary">
            Strategy: <strong>{currentEntry.strategyName}</strong>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Cards */}
      <div data-pdf="split" className="avoid-break">
        <StatsCards
          stats={currentEntry.normalized}
          accountType="pms"
          broker={account.broker}
          isActive={currentEntry.isActive}
          returnViewType={returnViewType}
          setReturnViewType={setReturnViewType}
        />

        {/* Return View Toggle */}
        <div className="flex justify-center space-x-2 mt-4">
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
        </div>
      </div>

      {/* Trailing Returns Table */}
      <div className="flex flex-col sm:flex-col gap-4 w-full max-w-full overflow-hidden">
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
      </div>

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
    </div>
  );
}