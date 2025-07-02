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
        if (numValue > 0) return "text-green-600";
        if (numValue < 0) return "text-red-600";
        return "text-gray-700";
    };

    // Sort years in descending order (most recent first)
    const quarterlyYears = Object.keys(quarterlyPnl).sort((a, b) => Number(b) - Number(a));
    const monthlyYears = Object.keys(monthlyPnl).sort((a, b) => Number(b) - Number(a));

    // Month order for consistent display
    const monthOrder = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const renderQuarterlyTable = () => (
        <div>
            <h3 className="text-lg font-semibold text-card-text mb-3">
                Quarterly Returns {viewType === "percent" ? "(%)" : "(₹)"}
            </h3>
            <div className="overflow-x-auto text-md">
                <table className="w-full border-collapse border border-gray-200">
                    <thead>
                        <tr className="border-b border-gray-200 bg-gray-50/50">
                            <th className="text-left py-3 px-4 font-semibold text-card-text border-r border-gray-200">Year</th>
                            <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q1</th>
                            <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q2</th>
                            <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q3</th>
                            <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q4</th>
                            <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px]">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quarterlyYears.map((year) => (
                            <tr key={`${year}-${viewType}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                                <td className="py-3 px-4 font-small text-card-text border-r border-gray-200">{year}</td>
                                {["q1", "q2", "q3", "q4", "total"].map((quarter, index) => (
                                    <td key={quarter} className="text-center py-3 px-2 border-r border-gray-200">
                                        <span className={`font-small ${getReturnColor(
                                            viewType === "percent"
                                                ? quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[string]["percent"]]
                                                : quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[string]["cash"]]
                                        )}`}>
                                            {viewType === "percent"
                                                ? quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[string]["percent"]] || "---"
                                                : quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[string]["cash"]]
                                                    ? formatter.format(Number(quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[string]["cash"]]))
                                                    : "---"}
                                            {viewType === "percent" && quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[string]["percent"]] ? "%" : ""}
                                        </span>
                                    </td>
                                ))}
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
        </div>
    );

    const renderMonthlyTable = () => (
        <div>
            <h3 className="text-lg font-semibold text-card-text mb-3">
                Monthly Returns {viewType === "percent" ? "(%)" : "(₹)"}
            </h3>
            <div className="overflow-x-auto text-sm">
                <table className="w-full border-collapse border border-gray-200">
                    <thead>
                        <tr className="border-b border-gray-200 bg-gray-50/50">
                            <th className="text-left py-3 px-4 font-semibold text-card-text border-r border-gray-200">Year</th>
                            {monthOrder.map((month) => (
                                <th
                                    key={month}
                                    className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200"
                                >
                                    {month}
                                </th>
                            ))}
                            <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px]">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyYears.map((year) => (
                            <tr key={`${year}-${viewType}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                                <td className="py-3 px-4 font-small text-card-text border-r border-gray-200">{year}</td>
                                {monthOrder.map((month) => (
                                    <td key={month} className="text-center py-3 px-2 border-r border-gray-200">
                                        <span className={`font-small ${getReturnColor(
                                            viewType === "percent"
                                                ? monthlyPnl[year]?.months[month]?.percent || "-"
                                                : monthlyPnl[year]?.months[month]?.cash || "-"
                                        )}`}>
                                            {viewType === "percent"
                                                ? monthlyPnl[year]?.months[month]?.percent || "-"
                                                : monthlyPnl[year]?.months[month]?.cash
                                                    ? formatter.format(Number(monthlyPnl[year].months[month].cash))
                                                    : "-"}
                                            {viewType === "percent" && monthlyPnl[year]?.months[month]?.percent ? "%" : ""}
                                        </span>
                                    </td>
                                ))}
                                <td className="text-center py-3 px-2">
                                    <span className={`font-small ${getReturnColor(
                                        viewType === "percent"
                                            ? monthlyPnl[year]?.totalPercent.toString() || "-"
                                            : monthlyPnl[year]?.totalCash.toString() || "-"
                                    )}`}>
                                        {viewType === "percent"
                                            ? monthlyPnl[year]?.totalPercent
                                                ? monthlyPnl[year].totalPercent.toFixed(2)
                                                : "-"
                                            : monthlyPnl[year]?.totalCash
                                                ? formatter.format(monthlyPnl[year].totalCash)
                                                : "-"}
                                        {viewType === "percent" && monthlyPnl[year]?.totalPercent ? "%" : ""}
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
        </div>
    );

    return (
        <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-card-text ">
                        Profit and Loss ({viewType === "percent" ? "%" : "₹"})
                    </CardTitle>
                    <div className="space-x-2">
                        <Button
                            variant={viewType === "percent" ? "default" : "transparent"}
                            onClick={() => setViewType("percent")}
                            size="sm"
                        >
                            %
                        </Button>
                        <Button
                            variant={viewType === "cash" ? "default" : "transparent"}
                            onClick={() => setViewType("cash")}
                            size="sm"
                        >
                            ₹
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {renderQuarterlyTable()}
                    {renderMonthlyTable()}
                </div>

                {/* Legend */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
                        <div>
                            <p><strong>Legend:</strong> Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec; Monthly data sorted by month</p>
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
}