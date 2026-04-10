"use client";

import { Card, CardContent, CardTitle } from "@/components/ui/card";

/**
 * Percent-only quarterly + monthly P&L tables for the distributor view.
 *
 * Built as a separate component instead of reusing the shared `PnlTable`
 * because the shared one always shows the percent/cash toggle and the
 * distributor view must hide all rupee values (no toggle, no cash columns).
 *
 * Data shapes match the existing `Stats.quarterlyPnl` and `Stats.monthlyPnl`
 * shapes from portfolio-utils.ts so we can pass them through unchanged.
 */

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

interface DistributorPnlTableProps {
  quarterlyPnl: QuarterlyPnlData;
  monthlyPnl: MonthlyPnlData;
}

const MONTH_ORDER = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatPercentCell(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null || raw === "" || raw === "-") return "-";
  const num = typeof raw === "number" ? raw : parseFloat(raw);
  if (Number.isNaN(num) || num === 0) return raw === "-" ? "-" : num === 0 ? "-" : "-";
  return num > 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`;
}

function getCellClass(raw: string | number | undefined | null): string {
  const base = "px-4 py-3 text-center whitespace-nowrap";
  if (raw === undefined || raw === null || raw === "" || raw === "-") return base;
  const num = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (Number.isNaN(num)) return base;
  if (num > 0) return `${base} bg-[#BEE1AC]`;
  return base;
}

export function DistributorPnlTable({
  quarterlyPnl,
  monthlyPnl,
}: DistributorPnlTableProps) {
  const quarterlyYears = Object.keys(quarterlyPnl).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  const monthlyYears = Object.keys(monthlyPnl).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  const renderQuarterly = () => (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0 p-4">
      <div className="flex justify-between items-center">
        <CardTitle className="text-sm sm:text-lg text-black">
          Quarterly Profit and Loss (%)
        </CardTitle>
      </div>
      <CardContent className="p-0 mt-4">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full border-collapse divide-y">
            <thead>
              <tr className="bg-black/5 text-sm">
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[60px]">
                  Year
                </th>
                {(["Q1", "Q2", "Q3", "Q4", "Total"] as const).map((label) => (
                  <th
                    key={label}
                    className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[80px]"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {quarterlyYears.map((year) => {
                const row = quarterlyPnl[year].percent;
                const cells: { key: string; raw: string }[] = [
                  { key: "q1", raw: row.q1 },
                  { key: "q2", raw: row.q2 },
                  { key: "q3", raw: row.q3 },
                  { key: "q4", raw: row.q4 },
                  { key: "total", raw: row.total },
                ];
                return (
                  <tr key={year} className="border-gray-300 text-sm">
                    <td className="px-4 py-3 text-center whitespace-nowrap text-black min-w-[60px]">
                      {year}
                    </td>
                    {cells.map((c) => (
                      <td key={c.key} className={getCellClass(c.raw)}>
                        <span className="text-black">{formatPercentCell(c.raw)}</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
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

  const renderMonthly = () => (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0 p-4">
      <div className="flex justify-between items-center">
        <CardTitle className="text-sm sm:text-lg text-gray-900">
          Monthly Profit and Loss (%)
        </CardTitle>
      </div>
      <CardContent className="p-0 mt-4">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full border-collapse divide-y">
            <thead>
              <tr className="bg-black/5 text-sm">
                <th className="text-center px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[60px]">
                  Year
                </th>
                {MONTH_ORDER.map((month) => (
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
              {monthlyYears.map((year) => {
                const yearData = monthlyPnl[year];
                return (
                  <tr key={year} className="border-gray-300 text-sm">
                    <td className="px-4 py-3 text-center whitespace-nowrap min-w-[60px] text-black">
                      {year}
                    </td>
                    {MONTH_ORDER.map((month) => {
                      const raw = yearData?.months?.[month]?.percent;
                      return (
                        <td key={month} className={getCellClass(raw)}>
                          <span className="text-black">{formatPercentCell(raw)}</span>
                        </td>
                      );
                    })}
                    <td className={getCellClass(yearData?.totalPercent)}>
                      <span className="text-black">
                        {formatPercentCell(yearData?.totalPercent)}
                      </span>
                    </td>
                  </tr>
                );
              })}
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

  return (
    <div className="flex flex-col gap-6">
      {renderQuarterly()}
      {renderMonthly()}
    </div>
  );
}
