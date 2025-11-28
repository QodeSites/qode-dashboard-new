"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Save, X, Check } from "lucide-react";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { CashFlowTable } from "@/components/CashFlowTable";
import { PnlTable } from "@/components/PnlTable";
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
  Stats,
  Account,
  Metadata,
  ReturnView,
  CombinedTrailing,
} from "@/app/lib/dashboard-types";

interface SystemTag {
  tag: string;
  category: 'deposit' | 'nav' | 'exposure' | 'other';
  lastUpdated: Date;
  recordCount: number;
}

interface PropAccountsProps {
  account: Account;
  sessionUserName: string;
}

// Sentinel value for "use deposit tag"
const USE_DEPOSIT_TAG = "__USE_DEPOSIT_TAG__";

export function PropAccounts({ account, sessionUserName }: PropAccountsProps) {
  const [availableTags, setAvailableTags] = useState<SystemTag[]>([]);
  const [depositTag, setDepositTag] = useState<string>("");
  const [navTag, setNavTag] = useState<string>("");
  const [cashflowTag, setCashflowTag] = useState<string>(USE_DEPOSIT_TAG);
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [returnViewType, setReturnViewType] = useState<ReturnView>("percent");
  const [exporting, setExporting] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Default tags state
  const [hasDefaults, setHasDefaults] = useState(false);
  const [showDefaultsSettings, setShowDefaultsSettings] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // Fetch default tags on mount
// === REPLACE BOTH useEffects (defaults + available tags) WITH THIS ONE ===
useEffect(() => {
  let isMounted = true;

  const loadEverything = async () => {
    try {
      setIsLoadingTags(true);

      // 1. First: Try to load saved defaults
      const defaultsRes = await fetch(`/api/prop/default-tags?qcode=${account.qcode}`, {
        credentials: 'include',
      });

      let savedDepositTag = "";
      let savedNavTag = "";
      let savedCashflowTag = USE_DEPOSIT_TAG;
      let hasSavedDefaults = false;

      if (defaultsRes.ok) {
        const defaultsData = await defaultsRes.json();
        if (defaultsData.hasDefaults && defaultsData.defaultTags) {
          savedDepositTag = defaultsData.defaultTags.depositTag || "";
          savedNavTag = defaultsData.defaultTags.navTag || "";
          savedCashflowTag = defaultsData.defaultTags.cashflowTag
            ? defaultsData.defaultTags.cashflowTag
            : USE_DEPOSIT_TAG;

          // APPLY DEFAULTS IMMEDIATELY
          hasSavedDefaults = true;
          setHasDefaults(true);
          setDepositTag(savedDepositTag);
          setNavTag(savedNavTag);
          setCashflowTag(savedCashflowTag);
        }
      }

      // 2. Then: Load available tags (for dropdowns only)
      const tagsRes = await fetch('/api/prop?tagsOnly=true', {
        credentials: 'include',
      });

      if (tagsRes.ok && isMounted) {
        const tagsData = await tagsRes.json();
        setAvailableTags(tagsData.tags || []);

        // ONLY auto-select if NO defaults were found
        if (!hasSavedDefaults) {
          const firstDeposit = tagsData.tags?.find((t: SystemTag) =>
            t.category === 'deposit' || t.category === 'exposure'
          );
          const firstNav = tagsData.tags?.find((t: SystemTag) => t.category === 'nav');

          if (firstDeposit) setDepositTag(firstDeposit.tag);
          if (firstNav) setNavTag(firstNav.tag);
        }
      }
    } catch (err) {
      console.error("Error loading defaults or tags:", err);
      setError("Failed to load configuration");
    } finally {
      if (isMounted) setIsLoadingTags(false);
    }
  };

  loadEverything();

  return () => {
    isMounted = false;
  };
}, [account.qcode]); // Only re-run if qcode changes

  // Fetch portfolio data when tags are selected
  useEffect(() => {
    if (!depositTag || !navTag) {
      setStats(null);
      setMetadata(null);
      return;
    }

    const fetchPortfolioData = async () => {
      try {
        setIsLoadingData(true);
        setError(null);

        const params = new URLSearchParams({
          depositTag,
          navTag,
        });

        // Only add cashflow tag if it's not the sentinel value
        if (cashflowTag && cashflowTag !== USE_DEPOSIT_TAG) {
          params.append('cashflowTag', cashflowTag);
        }

        const response = await fetch(`/api/prop?${params}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch portfolio data');
        }

        const data = await response.json();
        setStats(data.data);
        setMetadata(data.metadata);

      } catch (err: any) {
        setError(err.message || 'Failed to load portfolio data');
        setStats(null);
        setMetadata(null);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchPortfolioData();
  }, [depositTag, navTag, cashflowTag]);

  // Save default tags
  const handleSaveDefaults = async () => {
    if (!depositTag || !navTag) {
      alert("Please select deposit and NAV tags before saving defaults");
      return;
    }

    try {
      setIsSavingDefaults(true);
      const response = await fetch('/api/prop/default-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          qcode: account.qcode,
          depositTag,
          navTag,
          cashflowTag: cashflowTag !== USE_DEPOSIT_TAG ? cashflowTag : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save default tags');
      }

      setHasDefaults(true);
      setDefaultsSaved(true);
      setTimeout(() => setDefaultsSaved(false), 3000);
      
    } catch (err: any) {
      alert(err.message || 'Failed to save default tags');
    } finally {
      setIsSavingDefaults(false);
    }
  };

  // Remove default tags
  const handleRemoveDefaults = async () => {
    if (!confirm("Are you sure you want to remove the default tag configuration?")) {
      return;
    }

    try {
      const response = await fetch(`/api/prop/default-tags?qcode=${account.qcode}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove default tags');
      }

      setHasDefaults(false);
      alert('Default tags removed successfully');
      
    } catch (err: any) {
      alert(err.message || 'Failed to remove default tags');
    }
  };

  const currentEntry = useMemo(() => {
    if (!stats || !metadata) return null;

    const normalized = normalizeToStats(stats);
    const equityCurve = filterEquityCurve(
      stats.equityCurve,
      metadata?.filtersApplied?.startDate,
      metadata?.lastUpdated
    );
    const lastDate = getLastDate(equityCurve, metadata?.lastUpdated);

    return {
      normalized,
      raw: stats,
      metadata,
      equityCurve,
      drawdownCurve: stats.drawdownCurve || [],
      lastDate,
      strategyName: metadata.strategyName || account.account_name,
    };
  }, [stats, metadata, account.account_name]);

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

    const amountInvested = Number(currentEntry.raw.amountDeposited || 0);
    const currentPortfolioValue = Number(currentEntry.raw.currentExposure ?? 0);
    const returns_percent = Number(currentEntry.raw.return ?? 0);
    const returns = Number(currentEntry.raw.totalProfit ?? 0);

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
      lastDate: currentEntry.lastDate,
      strategyName: currentEntry.strategyName,
      returnViewType,
      ...benchmarkCurves,
    };
  }, [currentEntry, combinedTrailing, returnViewType, bse500Data]);

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
        isTotalPortfolio: false,
        isActive: true,
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
      const csvData = [];
      const filename = `${account.account_name.replace(/\s+/g, "_")}_prop_data.csv`;

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
      csvData.push(["Account Name", account.account_name]);
      csvData.push(["Deposit Tag", depositTag]);
      csvData.push(["NAV Tag", navTag]);
      csvData.push(["Cash Flow Tag", cashflowTag === USE_DEPOSIT_TAG ? "Same as Deposit Tag" : cashflowTag]);
      csvData.push(["Amount Deposited", formatCurrency(currentEntry.normalized.amountDeposited)]);
      csvData.push(["Current Exposure", formatCurrency(currentEntry.normalized.currentExposure)]);
      csvData.push(["Total Return (%)", currentEntry.normalized.return + "%"]);
      csvData.push(["Total Profit", formatCurrency(currentEntry.normalized.totalProfit)]);
      csvData.push(["Max Drawdown (%)", formatPercentage(currentEntry.normalized.drawdown, true)]);
      csvData.push(["", ""]);

      // Trailing Returns
      if (combinedTrailing) {
        csvData.push(["Trailing Returns", ""]);
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

  // Group tags by category for better organization
  const groupedTags = useMemo(() => {
    const groups: { [key: string]: SystemTag[] } = {
      deposit: [],
      exposure: [],
      nav: [],
      other: [],
    };

    availableTags.forEach(tag => {
      if (tag.category === 'deposit') {
        groups.deposit.push(tag);
      } else if (tag.category === 'exposure') {
        groups.exposure.push(tag);
      } else if (tag.category === 'nav') {
        groups.nav.push(tag);
      } else {
        groups.other.push(tag);
      }
    });

    return groups;
  }, [availableTags]);

  // Render tag select items with grouping
  const renderTagOptions = () => {
    const sections = [];

    if (groupedTags.deposit.length > 0) {
      sections.push(
        <div key="deposit-header" className="px-2 py-1.5 text-xs font-semibold text-gray-500">
          Deposit Tags
        </div>
      );
      sections.push(
        ...groupedTags.deposit.map((tag) => (
          <SelectItem key={`deposit-${tag.tag}`} value={tag.tag}>
            <div className="flex flex-col">
              <span>{tag.tag}</span>
              <span className="text-xs text-gray-500">
                {tag.recordCount} records • Last: {new Date(tag.lastUpdated).toLocaleDateString()}
              </span>
            </div>
          </SelectItem>
        ))
      );
    }

    if (groupedTags.exposure.length > 0) {
      sections.push(
        <div key="exposure-header" className="px-2 py-1.5 text-xs font-semibold text-gray-500 mt-2">
          Exposure Tags
        </div>
      );
      sections.push(
        ...groupedTags.exposure.map((tag) => (
          <SelectItem key={`exposure-${tag.tag}`} value={tag.tag}>
            <div className="flex flex-col">
              <span>{tag.tag}</span>
              <span className="text-xs text-gray-500">
                {tag.recordCount} records • Last: {new Date(tag.lastUpdated).toLocaleDateString()}
              </span>
            </div>
          </SelectItem>
        ))
      );
    }

    if (groupedTags.nav.length > 0) {
      sections.push(
        <div key="nav-header" className="px-2 py-1.5 text-xs font-semibold text-gray-500 mt-2">
          NAV & P&L Tags
        </div>
      );
      sections.push(
        ...groupedTags.nav.map((tag) => (
          <SelectItem key={`nav-${tag.tag}`} value={tag.tag}>
            <div className="flex flex-col">
              <span>{tag.tag}</span>
              <span className="text-xs text-gray-500">
                {tag.recordCount} records • Last: {new Date(tag.lastUpdated).toLocaleDateString()}
              </span>
            </div>
          </SelectItem>
        ))
      );
    }

    if (groupedTags.other.length > 0) {
      sections.push(
        <div key="other-header" className="px-2 py-1.5 text-xs font-semibold text-gray-500 mt-2">
          Other Tags
        </div>
      );
      sections.push(
        ...groupedTags.other.map((tag) => (
          <SelectItem key={`other-${tag.tag}`} value={tag.tag}>
            <div className="flex flex-col">
              <span>{tag.tag}</span>
              <span className="text-xs text-gray-500">
                {tag.recordCount} records • Last: {new Date(tag.lastUpdated).toLocaleDateString()}
              </span>
            </div>
          </SelectItem>
        ))
      );
    }

    return sections;
  };

  // Get display text for cash flow tag
  const getCashflowTagDisplay = () => {
    if (cashflowTag === USE_DEPOSIT_TAG) {
      return `${depositTag} (default)`;
    }
    return cashflowTag;
  };

  // Show loading state
  if (isLoadingTags) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-logo-green mx-auto"></div>
          <p className="mt-4 text-card-text-secondary">Loading available tags...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !stats) {
    return (
      <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="sm:p-2 space-y-6" ref={pdfRef}>
      {/* Tag Selection Section */}
      <Card className="bg-white/50 border-0 card-shadow p-6">
        <CardHeader className="px-0 pt-0 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-card-text-secondary">
              Configure Prop Account Tags
              {hasDefaults && (
                <span className="ml-2 text-xs bg-logo-green text-white px-2 py-1 rounded-full">
                  Defaults Set
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-card-text-secondary/70 mt-2">
              Select the mastersheet tags to use for calculating portfolio metrics. All dropdowns show the same tags.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDefaultsSettings(!showDefaultsSettings)}
            className="flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Defaults
          </Button>
        </CardHeader>

        {/* Default Settings Panel */}
        {showDefaultsSettings && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-blue-900">Default Tags Settings</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDefaultsSettings(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-blue-800 mb-3">
              Save current tag selection as defaults. These will be automatically loaded when you visit this account.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveDefaults}
                disabled={isSavingDefaults || !depositTag || !navTag}
                className="flex items-center gap-2"
                size="sm"
              >
                {defaultsSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {isSavingDefaults ? "Saving..." : "Save as Default"}
                  </>
                )}
              </Button>
              {hasDefaults && (
                <Button
                  variant="outline"
                  onClick={handleRemoveDefaults}
                  size="sm"
                >
                  Remove Defaults
                </Button>
              )}
            </div>
          </div>
        )}

        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Deposit/Exposure Tag */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-text-secondary">
                Deposit/Exposure Tag
                <span className="text-xs text-gray-500 block mt-1">(Amount Deposited & Current Value)</span>
              </label>
              <Select value={depositTag} onValueChange={setDepositTag}>
                <SelectTrigger className="w-full border-0 card-shadow text-button-text">
                  <SelectValue placeholder="Select deposit tag..." />
                </SelectTrigger>
                <SelectContent>
                  {renderTagOptions()}
                </SelectContent>
              </Select>
            </div>

            {/* NAV/P&L Tag */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-text-secondary">
                NAV/P&L Tag
                <span className="text-xs text-gray-500 block mt-1">(NAV & P&L Calculations)</span>
              </label>
              <Select value={navTag} onValueChange={setNavTag}>
                <SelectTrigger className="w-full border-0 card-shadow text-button-text">
                  <SelectValue placeholder="Select NAV tag..." />
                </SelectTrigger>
                <SelectContent>
                  {renderTagOptions()}
                </SelectContent>
              </Select>
            </div>

            {/* Cash Flow Tag (Optional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-text-secondary">
                Cash Flow Tag (Optional)
                <span className="text-xs text-gray-500 block mt-1">(Defaults to Deposit Tag if not set)</span>
              </label>
              <Select value={cashflowTag} onValueChange={setCashflowTag}>
                <SelectTrigger className="w-full border-0 card-shadow text-button-text">
                  <SelectValue placeholder="Optional - leave blank to use deposit tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={USE_DEPOSIT_TAG}>Use Deposit Tag (Default)</SelectItem>
                  {renderTagOptions()}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selected Tags Display */}
          {depositTag && navTag && (
            <div className="mt-4 p-3 bg-logo-green/10 rounded-lg">
              <p className="text-sm text-card-text-secondary">
                <strong>Current Configuration:</strong>
              </p>
              <div className="mt-2 space-y-1 text-sm text-card-text-secondary/80">
                <p>• Deposit/Exposure: <strong>{depositTag}</strong></p>
                <p>• NAV/P&L: <strong>{navTag}</strong></p>
                <p>• Cash Flow: <strong>{getCashflowTagDisplay()}</strong></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State for Portfolio Data */}
      {isLoadingData && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-logo-green mx-auto"></div>
            <p className="mt-4 text-card-text-secondary">Loading portfolio data...</p>
          </div>
        </div>
      )}

      {/* Portfolio Data Display */}
      {!isLoadingData && currentEntry && reportModel && (
        <>
          {/* Header with Account Name and Export Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="w-fit bg-logo-green font-heading text-button-text text-sm px-3 py-1 rounded-full">
              <p className="text-sm p-2">{currentEntry.strategyName}</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleDownloadPDF} disabled={exporting} className="text-sm">
                {exporting ? "Preparing..." : "Download PDF"}
              </Button>
              <Button onClick={handleDownloadCSV} disabled={exporting} className="text-sm">
                {exporting ? "Preparing..." : "Download CSV"}
              </Button>
            </div>
          </div>

          {/* Portfolio Content */}
          <div className="space-y-6">
            {/* Stats Cards */}
            <div data-pdf="split" className="avoid-break space-y-6">
              <StatsCards
                stats={currentEntry.normalized}
                accountType="prop"
                broker={account.broker}
                isTotalPortfolio={false}
                isActive={true}
                returnViewType={returnViewType}
                setReturnViewType={setReturnViewType}
              />
            </div>

            {/* Charts */}
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

            {/* P&L Table */}
            <div data-pdf="split" className="avoid-break">
              <PnlTable
                quarterlyPnl={currentEntry.normalized.quarterlyPnl}
                monthlyPnl={currentEntry.normalized.monthlyPnl}
                showOnlyQuarterlyCash={false}
                showPmsQawView={false}
              />
            </div>

            {/* Cash Flows */}
            <div data-pdf="split" className="avoid-break">
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0 p-4">
                <CardTitle className="text-sm sm:text-lg text-black">
                  Cash In / Out
                  {cashflowTag !== USE_DEPOSIT_TAG && (
                    <span className="ml-2 text-xs text-gray-500">
                      (Using tag: {cashflowTag})
                    </span>
                  )}
                </CardTitle>
                <CardContent className="p-0 mt-4">
                  <CashFlowTable
                    transactions={reportModel.transactions}
                    totals={reportModel.cashFlowTotals}
                    showAccountColumn={false}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* No Data State */}
      {!isLoadingData && !currentEntry && depositTag && navTag && (
        <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900">
          No portfolio data available for the selected tags. Please try different tags.
        </div>
      )}

      {/* Prompt to Select Tags */}
      {(!depositTag || !navTag) && !isLoadingData && (
        <div className="p-6 text-center bg-blue-50 rounded-lg text-blue-700">
          Please select both Deposit/Exposure Tag and NAV/P&L Tag to view portfolio data.
        </div>
      )}
    </div>
  );
}