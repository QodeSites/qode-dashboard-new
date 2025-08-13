"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuarterlyPnlData {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface QuarterlyPnlTableProps {
  quarterlyPnl: QuarterlyPnlData;
}

export function QuarterlyPnlTable({ quarterlyPnl }: QuarterlyPnlTableProps) {
  const getReturnColor = (value: string) => {
    if (value === "---" || value === "") return "text-gray-500";
    const numValue = parseFloat(value);
    if (numValue > 0) return "text-green-600";
    if (numValue < 0) return "text-red-600";
    return "text-gray-700";
  };

  // Sort years in descending order (most recent first)
  const years = Object.keys(quarterlyPnl).sort((a, b) => Number(b) - Number(a));

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardHeader>
        <CardTitle className="text-card-text font-heading">Quarterly Profit and Loss</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Percentage Returns */}
          <div>
            <h3 className="text-sm sm:text-lg font-semibold text-card-text mb-3">Percentage Returns (%)</h3>
            <div className="overflow-x-auto">
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
                  {years.map((year) => (
                    <tr key={`${year}-percent`} className="border-b border-gray-100 /50">
                      <td className="py-3 px-4 font-medium text-card-text border-r border-gray-200">{year}</td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].percent.q1)}`}>
                          {quarterlyPnl[year].percent.q1}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].percent.q2)}`}>
                          {quarterlyPnl[year].percent.q2}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].percent.q3)}`}>
                          {quarterlyPnl[year].percent.q3}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].percent.q4)}`}>
                          {quarterlyPnl[year].percent.q4}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-2">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].percent.total)}`}>
                          {quarterlyPnl[year].percent.total}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {years.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-3 px-4 text-gray-500">
                        No percentage data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Side - Cash P&L */}
          <div>
            <h3 className="text-sm sm:text-lg font-semibold text-card-text mb-3">Cash P&L</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="text-left py-3 px-4 font-semibold text-card-text border-r border-gray-200">Year</th>
                    <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q1</th>
                    <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q2</th>
                    <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q3</th>
                    <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Q4</th>
                    <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[60px] border-r border-gray-200">Total</th>
                    <th className="text-center py-3 px-2 font-semibold text-card-text min-w-[80px]">Year Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((year) => (
                    <tr key={`${year}-cash`} className="border-b border-gray-100 /50">
                      <td className="py-3 px-4 font-medium text-card-text border-r border-gray-200">{year}</td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].cash.q1)}`}>
                          {quarterlyPnl[year].cash.q1}
                        </span>
                      </td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].cash.q2)}`}>
                          {quarterlyPnl[year].cash.q2}
                        </span>
                      </td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].cash.q3)}`}>
                          {quarterlyPnl[year].cash.q3}
                        </span>
                      </td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].cash.q4)}`}>
                          {quarterlyPnl[year].cash.q4}
                        </span>
                      </td>
                      <td className="text-center py-3 px-2 border-r border-gray-200">
                        <span className={`font-medium ${getReturnColor(quarterlyPnl[year].cash.total)}`}>
                          {quarterlyPnl[year].cash.total}
                        </span>
                      </td>
                      <td className="text-center py-3 px-2">
                        <span className="font-medium text-gray-700">{quarterlyPnl[year].yearCash}</span>
                      </td>
                    </tr>
                  ))}
                  {years.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-3 px-4 text-gray-500">
                        No cash data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Legend at bottom */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
            <div>
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
}