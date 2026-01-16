
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QuarterlyPnlData {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface MonthlyPnlData {
  [year: string]: {
    months: {
      [month: string]: {
        percent: string;
        cash: string;
        capitalInOut: string;
      };
    };
    totalPercent: number | string;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface FeesData {
  [year: string]: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
    total: string;
  };
}

interface PnlTableProps {
  quarterlyPnl: QuarterlyPnlData;
  monthlyPnl: MonthlyPnlData;
  showOnlyQuarterlyCash?: boolean;
  showPmsQawView?: boolean;
  isPdfExport?: boolean; // New prop to force percent view during PDF export
  afterFees?: boolean;
  fees?: FeesData;
  setAfterFees?: (value: boolean) => void;
  isTotalPortfolio?: boolean;
}

export function PnlTable({
  quarterlyPnl,
  monthlyPnl,
  showOnlyQuarterlyCash = false,
  showPmsQawView = false,
  isPdfExport = false,
  afterFees = false,
  fees,
  setAfterFees,
  isTotalPortfolio = false,
}: PnlTableProps) {
  console.log(showOnlyQuarterlyCash);

  const [viewType, setViewType] = useState<"percent" | "cash">("percent");


  // Use percent view for PDF export, otherwise use state or props
  const effectiveViewType = isPdfExport ? "percent" : viewType;

  const getReturnColor = (value: string) => {
    if (value === "-" || value === "---") return "text-black";
    const numValue = parseFloat(value.replace(/₹|,/g, ""));
    if (numValue > 0) return "text-black";
    if (numValue < 0) return "text-black";
    return "text-gray-700";
  };

  const getCellClass = (value: string, isPercent: boolean) => {
    if (value === "-" || value === "---" || value === "") return "px-4 py-3 text-center whitespace-nowrap";
    const numValue = parseFloat(value.replace(/₹|,/g, ""));
    let cellClass = "px-4 py-3 text-center whitespace-nowrap";
    if (numValue > 0) cellClass += " bg-[#BEE1AC]";
    return cellClass;
  };

  const formatDisplayValue = (value: string, isPercent: boolean) => {
    if (value === "-" || value === "" || value === undefined || value === null) {
      return "-";
    }
    if (value === "-") {
      return isPercent ? "-%" : "₹-";
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return "-";
    }
    if (isPercent) {
      return numValue > 0 ? `+${numValue.toFixed(2)}%` : `${numValue.toFixed(2)}%`;
    } else {
      const absValue = Math.abs(numValue);
      const formattedValue = absValue.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return numValue >= 0 ? `+₹${formattedValue}` : `-₹${formattedValue}`;
    }
  };

  // Helper to subtract fees from cash value
  const subtractFeesFromCash = (cashValue: string, quarter: string, year: string): string => {
    if (!afterFees || !fees || !fees[year] || !fees[year][quarter as keyof FeesData[string]]) {
      return cashValue;
    }
    const cashNum = parseFloat(cashValue) || 0;
    const feeNum = parseFloat(fees[year][quarter as keyof FeesData[string]]) || 0;
    const result = cashNum - feeNum;
    return isNaN(result) ? cashValue : result.toFixed(2);
  };

  const quarterlyYears = Object.keys(quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));
  const monthlyYears = Object.keys(monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

  const monthOrder = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const renderQuarterlyTable = () => {
    // Use percent view for PDF export, otherwise respect showOnlyQuarterlyCash, showPmsQawView, or viewType
    const displayType = isPdfExport ? "percent" : (showOnlyQuarterlyCash || showPmsQawView ? "cash" : viewType);
    const isPercentView = displayType === "percent";

    return (
      <Card className="bg-white/50 border-0 p-4">
        <div className="flex justify-between items-center mb-4">
          <CardTitle className="text-sm sm:text-lg text-black">
            Quarterly Profit and Loss ({displayType === "percent" ? "%" : "₹"})
          </CardTitle>
          <div className="flex gap-2 items-center">
            {!showOnlyQuarterlyCash && !showPmsQawView && !isPdfExport && (
              <div className="space-x-2">
                <Button
                  onClick={() => setViewType("percent")}
                  size="sm"
                  variant={viewType === "percent" ? "default" : "outline"}
                  className="border-green-700 text-xs"
                >
                  %
                </Button>
                <Button
                  onClick={() => setViewType("cash")}
                  size="sm"
                  variant={viewType === "cash" ? "default" : "outline"}
                  className="border-green-700 text-xs"
                >
                  ₹
                </Button>
              </div>
            )}
            {isTotalPortfolio && setAfterFees && !isPdfExport && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setAfterFees(false)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    !afterFees
                      ? "bg-button-text text-logo-green"
                      : "text-button-text bg-logo-green"
                  }`}
                >
                  Before Fees
                </button>
                <button
                  onClick={() => setAfterFees(true)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    afterFees
                      ? "bg-button-text text-logo-green"
                      : "text-button-text bg-logo-green"
                  }`}
                >
                  After Fees
                </button>
              </div>
            )}
          </div>
        </div>
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
                  <tr key={`${year}-${displayType}`} className="border-gray-300 text-sm">
                    <td className="px-4 py-3 text-center whitespace-nowrap text-black min-w-[60px]">{year}</td>
                    {["q1", "q2", "q3", "q4", "total"].map((quarter) => {
                      let rawValue = isPercentView
                        ? quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[string]["percent"]]
                        : quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[string]["cash"]];

                      // Apply fees subtraction for cash view in total portfolio
                      if (!isPercentView && showOnlyQuarterlyCash && afterFees) {
                        rawValue = subtractFeesFromCash(rawValue, quarter, year);
                      }

                      const displayValue = formatDisplayValue(rawValue, isPercentView);
                      const cellClass = getCellClass(rawValue, isPercentView);
                      const isTotal = quarter === "total";

                      return (
                        <td key={quarter} className={`${cellClass} ${isTotal ? "" : ""}`}>
                          <span className={getReturnColor(rawValue)}>
                            {displayValue}
                          </span>
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
  };

  const renderMonthlyTable = () => {
    // Use percent view for PDF export, otherwise respect showPmsQawView or viewType
    const displayType = isPdfExport ? "percent" : (showPmsQawView ? "percent" : viewType);
    const isPercentView = displayType === "percent";

    return (
      <Card className="bg-white/50 border-0 p-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm sm:text-lg text-gray-900">
            Monthly Profit and Loss ({displayType === "percent" ? "%" : "₹"})
          </CardTitle>
          {!showPmsQawView && !isPdfExport && (
            <div className="space-x-2">
              <Button
                onClick={() => setViewType("percent")}
                size="sm"
                variant={viewType === "percent" ? "default" : "outline"}
                className="border-green-700"
              >
                %
              </Button>
              <Button
                onClick={() => setViewType("cash")}
                size="sm"
                variant={viewType === "cash" ? "default" : "outline"}
                className="border-green-700"
              >
                ₹
              </Button>
            </div>
          )}
        </div>
        <CardContent className="p-0 mt-4">
          <div className="w-full overflow-x-auto">
            <table className="min-w-full border-collapse divide-y">
              <thead className="border-none border-gray-100">
                <tr className="bg-black/5 text-sm">
                  <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[60px]">
                    Year
                  </th>
                  {monthOrder.map((month) => (
                    <th
                      key={month}
                      className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]"
                    >
                      {month.substring(0, 3)}
                    </th>
                  ))}
                  <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monthlyYears.map((year) => (
                  <tr key={`${year}-${displayType}`} className="border-gray-300 text-sm">
                    <td className="px-4 py-3 text-center whitespace-nowrap min-w-[60px] text-black">{year}</td>
                    {monthOrder.map((month) => {
                      const rawValue = isPercentView
                        ? monthlyPnl[year]?.months[month]?.percent
                        : monthlyPnl[year]?.months[month]?.cash;

                      const displayValue = formatDisplayValue(rawValue || "", isPercentView);
                      const rawValueString = rawValue || "-";
                      const cellClass = getCellClass(rawValueString, isPercentView);

                      return (
                        <td key={month} className={cellClass}>
                          <span className={getReturnColor(rawValueString)}>
                            {displayValue}
                          </span>
                        </td>
                      );
                    })}
                    <td
                      className={`${getCellClass(
                        isPercentView
                          ? monthlyPnl[year]?.totalPercent.toString() || "-"
                          : monthlyPnl[year]?.totalCash.toString() || "-",
                        isPercentView
                      )}`}
                    >
                      <span
                        className={getReturnColor(
                          isPercentView
                            ? monthlyPnl[year]?.totalPercent.toString() || "-"
                            : monthlyPnl[year]?.totalCash.toString() || "-"
                        )}
                      >
                        {isPercentView
                          ? monthlyPnl[year]?.totalPercent.toString() === "-"
                            ? "-%"
                            : monthlyPnl[year]?.totalPercent && monthlyPnl[year].totalPercent !== 0
                              ? monthlyPnl[year].totalPercent > 0
                                ? `+${monthlyPnl[year].totalPercent.toFixed(2)}%`
                                : `${monthlyPnl[year].totalPercent.toFixed(2)}%`
                              : "-"
                          : monthlyPnl[year]?.totalCash.toString() === "-"
                            ? "₹-"
                            : monthlyPnl[year]?.totalCash && monthlyPnl[year].totalCash !== 0
                              ? monthlyPnl[year].totalCash >= 0
                                ? `+₹${Math.abs(monthlyPnl[year].totalCash).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}`
                                : `-₹${Math.abs(monthlyPnl[year].totalCash).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}`
                              : "-"}
                      </span>
                    </td>
                  </tr>
                ))}
                {monthlyYears.length === 0 && (
                  <tr>
                    <td colSpan={14} className="text-center py-3 px-4 text-black">
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
  };

  return (
    <div className="flex flex-col gap-6">
      {renderQuarterlyTable()}
      {isTotalPortfolio && (
  <p className="text-sm text-gray-700">
    Note: After-fee profit figures account for all Zerodha and PMS fee collections and accruals up to 31 December 2025.
    (These amounts exclude the Performance Fee charged in PMS which is accrued at the end of the financial year)
  </p>
)}

      {!showOnlyQuarterlyCash && renderMonthlyTable()}

    </div>
  );
}