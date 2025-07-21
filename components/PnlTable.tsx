"use client";

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
    totalPercent: number;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface PnlTableProps {
  quarterlyPnl: QuarterlyPnlData;
  monthlyPnl: MonthlyPnlData;
}

// Indian currency formatter
const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function PnlTable({ quarterlyPnl, monthlyPnl }: PnlTableProps) {
  const [viewType, setViewType] = useState<"percent" | "cash">("percent");

  const getReturnColor = (value: string) => {
    if (value === "-" || value === "---" || value === "") return "text-gray-500";
    const numValue = parseFloat(value.replace(/₹|,/g, ""));
    if (numValue > 0) return "text-black";
    if (numValue < 0) return "text-black";
    return "text-gray-700";
  };

  const getCellClass = (value: string, isPercent: boolean) => {
    if (value === "-" || value === "---" || value === "") return "px-4 py-3 text-center whitespace-nowrap";
    const numValue = parseFloat(value.replace(/₹|,/g, ""));
    let cellClass = "px-4 py-3 text-center whitespace-nowrap";

    if (numValue > 0) cellClass += " bg-green-100";

    return cellClass;
  };

  const formatValue = (value: string | number) => {
    if (value === "0" || parseFloat(value.toString()) === 0) return "-";
    return value.toString();
  };

  const formatDisplayValue = (value: string, isPercent: boolean) => {
    if (!value || value === "0" || parseFloat(value) === 0) return "-";
    const numValue = parseFloat(value);
    if (isPercent) {
      return numValue > 0 ? `+${value}%` : `${value}%`;
    } else {
      const absValue = Math.abs(numValue);
      const formattedValue = absValue.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return numValue >= 0 ? `+₹${formattedValue}` : `-₹${formattedValue}`;
    }
  };

  const quarterlyYears = Object.keys(quarterlyPnl).sort((a, b) => parseInt(b) - parseInt(a));
  const monthlyYears = Object.keys(monthlyPnl).sort((a, b) => parseInt(b) - parseInt(a));

  const monthOrder = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const renderQuarterlyTable = () => (
    <Card className="bg-white/70 backdrop-blur-sm p-0 card-shadow border-0">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm sm:text-lg text-gray-900">
            Quarterly Profit and Loss ({viewType === "percent" ? "%" : "₹"})
          </CardTitle>
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
        </div>
      </CardHeader>
      <CardContent className="p-0 px-4 py-5">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full border-collapse divide-y">
            <thead className="bg-lightBeige">
              <tr className="bg-gray-100 border-gray-300 border-b text-sm">
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[60px]">
                  Year
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                  Q1
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                  Q2
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                  Q3
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                  Q4
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] border-l-2 border-gray-300">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quarterlyYears.map((year) => (
                <tr key={`${year}-${viewType}`} className="hover:bg-gray-50 border-gray-300 text-xs">
                  <td className="px-4 py-3 text-center whitespace-nowrap text-black min-w-[60px]">{year}</td>
                  {["q1", "q2", "q3", "q4", "total"].map((quarter) => {
                    const rawValue = viewType === "percent"
                      ? quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[string]["percent"]]
                      : quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[string]["cash"]];

                    const displayValue = formatDisplayValue(rawValue, viewType === "percent");
                    const cellClass = getCellClass(rawValue, viewType === "percent");
                    const isTotal = quarter === "total";

                    return (
                      <td key={quarter} className={`${cellClass} ${isTotal ? 'border-l-2 border-gray-300' : ''}`}>
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
                  <td colSpan={6} className="text-center py-3 px-4 text-gray-500">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
            <div className="space-y-1">
              <p><strong>Legend:</strong> Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec</p>
            </div>
            <div className="flex gap-4">
              <p className="text-green-600">Green: Positive values</p>
              <p className="text-red-600">Red: Negative values</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderMonthlyTable = () => (
    <Card className="bg-white/70 backdrop-blur-sm p-0 card-shadow border-0">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm sm:text-lg text-gray-900">
            Monthly Profit and Loss ({viewType === "percent" ? "%" : "₹"})
          </CardTitle>
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
        </div>
      </CardHeader>
      <CardContent className="p-0 px-4 py-5">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full border-collapse divide-y">
            <thead className="bg-lightBeige">
              <tr className="bg-gray-100 border-gray-300 border-b text-xs">
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[60px]">
                  Year
                </th>
                {monthOrder.map((month) => (
                  <th
                    key={month}
                    className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]"
                  >
                    {month.substring(0, 3)}
                  </th>
                ))}
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px] border-l-2 border-gray-300">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthlyYears.map((year) => (
                <tr key={`${year}-${viewType}`} className="hover:bg-gray-50 border-gray-300 text-xs">
                  <td className="px-4 py-3 text-center whitespace-nowrap min-w-[60px] text-black">{year}</td>
                  {monthOrder.map((month) => {
                    const rawValue = viewType === "percent"
                      ? monthlyPnl[year]?.months[month]?.percent
                      : monthlyPnl[year]?.months[month]?.cash;

                    const displayValue = formatDisplayValue(rawValue || "", viewType === "percent");
                    const cellClass = getCellClass(rawValue || "", viewType === "percent");

                    return (
                      <td key={month} className={cellClass}>
                        <span className={getReturnColor(rawValue || "-")}>
                          {displayValue}
                        </span>
                      </td>
                    );
                  })}
                  <td className={(() => {
                    const totalValue = viewType === "percent"
                      ? monthlyPnl[year]?.totalPercent.toString() || "-"
                      : monthlyPnl[year]?.totalCash.toString() || "-";
                    return getCellClass(totalValue, viewType === "percent") + " border-l-2 border-gray-300";
                  })()}>
                    <span className={getReturnColor(
                      viewType === "percent"
                        ? monthlyPnl[year]?.totalPercent.toString() || "-"
                        : monthlyPnl[year]?.totalCash.toString() || "-"
                    )}>
                      {viewType === "percent"
                        ? monthlyPnl[year]?.totalPercent && monthlyPnl[year].totalPercent !== 0
                          ? monthlyPnl[year].totalPercent > 0
                            ? `+${monthlyPnl[year].totalPercent.toFixed(2)}%`
                            : `${monthlyPnl[year].totalPercent.toFixed(2)}%`
                          : "-"
                        : monthlyPnl[year]?.totalCash && monthlyPnl[year].totalCash !== 0
                          ? monthlyPnl[year].totalCash >= 0
                            ? `+₹${Math.abs(monthlyPnl[year].totalCash).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : `-₹${Math.abs(monthlyPnl[year].totalCash).toLocaleString('en-IN', {
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
                  <td colSpan={14} className="text-center py-3 px-4 text-gray-500">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
            <div className="space-y-1">
              <p>Monthly data sorted by month</p>
            </div>
            <div className="flex gap-4">
              <p className="text-green-600">Green: Positive values</p>
              <p className="text-red-600">Red: Negative values</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      {renderQuarterlyTable()}
      {renderMonthlyTable()}
    </div>
  );
}