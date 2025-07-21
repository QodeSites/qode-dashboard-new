"use client";

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBse500Data } from "@/hooks/useBse500Data";

interface EquityCurvePoint {
  date: string;
  value: number;
}

interface TrailingReturnsData {
  fiveDays: string;
  tenDays: string;
  fifteenDays: string;
  oneMonth: string;
  threeMonths: string;
  sixMonths: string;
  oneYear: string;
  twoYears: string;
  fiveYears: string;
  sinceInception: string;
}

interface TrailingReturnsTableProps {
  trailingReturns: TrailingReturnsData;
  drawdown: string;
  equityCurve: EquityCurvePoint[];
  accountType?: string;
  broker?: string;
}

export function TrailingReturnsTable({
  trailingReturns,
  drawdown,
  equityCurve,
  accountType,
  broker,
}: TrailingReturnsTableProps) {
  const { bse500Data, error } = useBse500Data(equityCurve);
  console.log(trailingReturns);

  const allPeriods = [
    { key: "5d", label: "5d", duration: 5, type: "days" },
    { key: "10d", label: "10d", duration: 10, type: "days" },
    { key: "15d", label: "15d", duration: 15, type: "days" },
    { key: "1m", label: "1m", duration: 1, type: "months" },
    { key: "3m", label: "3m", duration: 3, type: "months" },
    { key: "1y", label: "1y", duration: 1, type: "years" },
    { key: "2y", label: "2y", duration: 2, type: "years" },
    { key: "sinceInception", label: "Since Inception", duration: null, type: "inception" },
    { key: "currentDD", label: "Current DD", duration: null, type: "drawdown" },
    { key: "maxDD", label: "Max DD", duration: null, type: "maxDrawdown" }
  ];

  const isValidReturn = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "---" || value === "") return false;
    const stringValue = String(value);
    if (stringValue === "0.00" || stringValue === "0") return false;
    const numValue = parseFloat(stringValue);
    return !isNaN(numValue);
  };

  const getSchemeReturn = (periodKey: string) => {
    switch (periodKey) {
      case "5d":
        return isValidReturn(trailingReturns.fiveDays) ? trailingReturns.fiveDays : "-";
      case "10d":
        return isValidReturn(trailingReturns.tenDays) ? trailingReturns.tenDays : "-";
      case "15d":
        return isValidReturn(trailingReturns.fifteenDays) ? trailingReturns.fifteenDays : "-";
      case "1m":
        return isValidReturn(trailingReturns.oneMonth) ? trailingReturns.oneMonth : "-";
      case "1y":
        return isValidReturn(trailingReturns.oneYear) ? trailingReturns.oneYear : "-";
      case "2y":
        return isValidReturn(trailingReturns.twoYears) ? trailingReturns.twoYears : "-";
      case "3m":
        return isValidReturn(trailingReturns.threeMonths) ? trailingReturns.threeMonths : "-";
      case "sinceInception":
        return isValidReturn(trailingReturns.sinceInception) ? trailingReturns.sinceInception : "-";
      case "maxDD":
        return isValidReturn(drawdown) ? (-Math.abs(parseFloat(drawdown))).toFixed(2) : "-";
      case "currentDD":
        return calculatePortfolioCurrentDD();
      default:
        return "-";
    }
  };

  const calculatePortfolioCurrentDD = useCallback(() => {
    if (!equityCurve.length) return "-";

    let peakValue = -Infinity;
    let currentValue = equityCurve[equityCurve.length - 1].value;

    equityCurve.forEach(point => {
      peakValue = Math.max(peakValue, point.value);
    });

    if (peakValue <= 0) return "-";

    const currentDD = ((currentValue - peakValue) / peakValue) * 100;
    return (-Math.abs(currentDD)).toFixed(2);
  }, [equityCurve]);

  const calculateBenchmarkReturns = useCallback(() => {
    const benchmarkReturns: { [key: string]: string } = {};

    allPeriods.forEach(period => {
      benchmarkReturns[period.key] = "-";
    });

    if (!bse500Data.length || !equityCurve.length) {
      return benchmarkReturns;
    }

    const endDate = new Date(equityCurve[equityCurve.length - 1].date);
    const startDate = new Date(equityCurve[0].date);

    const findNav = (targetDate: Date) => {
      const closestPoint = bse500Data.reduce(
        (closest, point) => {
          const pointDate = new Date(point.date);
          const diff = Math.abs(pointDate.getTime() - targetDate.getTime());
          if (diff < closest.diff) {
            return { diff, nav: parseFloat(point.nav) };
          }
          return closest;
        },
        { diff: Infinity, nav: 0 }
      );
      return closestPoint.nav;
    };

    const calculateReturn = (start: Date, end: Date) => {
      const startNav = findNav(start);
      const endNav = findNav(end);
      if (startNav && endNav && startNav !== 0) {
        return (((endNav - startNav) / startNav) * 100).toFixed(2);
      }
      return "-";
    };

    allPeriods.forEach(period => {
      if (period.type === "days" || period.type === "months" || period.type === "years") {
        const start = new Date(endDate);

        if (period.type === "days") {
          start.setDate(endDate.getDate() - period.duration!);
        } else if (period.type === "months") {
          start.setMonth(endDate.getMonth() - period.duration!);
        } else if (period.type === "years") {
          start.setFullYear(endDate.getFullYear() - period.duration!);
        }

        benchmarkReturns[period.key] = calculateReturn(start, endDate);
      } else if (period.type === "inception") {
        benchmarkReturns[period.key] = calculateReturn(startDate, endDate);
      }
    });

    if (bse500Data.length) {
      let maxDrawdown = 0;
      let peakNav = -Infinity;
      let currentNav = parseFloat(bse500Data[bse500Data.length - 1].nav);

      bse500Data.forEach(point => {
        const nav = parseFloat(point.nav);

        if (nav > peakNav) {
          peakNav = nav;
        }

        const drawdownValue = ((nav - peakNav) / peakNav) * 100;

        if (drawdownValue < maxDrawdown) {
          maxDrawdown = drawdownValue;
        }
      });

      let allTimePeak = -Infinity;
      bse500Data.forEach(point => {
        const nav = parseFloat(point.nav);
        if (nav > allTimePeak) {
          allTimePeak = nav;
        }
      });

      const currentDrawdown = allTimePeak > 0 ? ((currentNav - allTimePeak) / allTimePeak) * 100 : 0;

      benchmarkReturns.maxDD = (-Math.abs(maxDrawdown)).toFixed(2);
      benchmarkReturns.currentDD = (-Math.abs(currentDrawdown)).toFixed(2);
    }

    return benchmarkReturns;
  }, [bse500Data, equityCurve, allPeriods]);

  const benchmarkReturns = calculateBenchmarkReturns();

  const getDisplayValue = (periodKey: string, isScheme: boolean) => {
    const schemeValue = getSchemeReturn(periodKey);
    const benchmarkValue = benchmarkReturns[periodKey];

    if (periodKey === "currentDD" || periodKey === "maxDD") {
      return isScheme ? schemeValue : benchmarkValue;
    }

    const bothHaveData = schemeValue !== "-" && benchmarkValue !== "-";

    if (bothHaveData) {
      return isScheme ? schemeValue : benchmarkValue;
    }

    return "-";
  };

  const getReturnColor = (value: string) => {
    if (value === "-" || value === "---") return "text-gray-500";
    const numValue = parseFloat(value);
    if (numValue > 0) return "text-black";
    if (numValue < 0) return "text-black";
    return "text-gray-700";
  };

  const getCellClass = (value: string) => {
    if (value === "-" || value === "---" || value === "") return "px-4 py-3 text-center whitespace-nowrap";
    const numValue = parseFloat(value);
    let cellClass = "px-4 py-3 text-center whitespace-nowrap";

    // Only apply green background for positive values
    // if (numValue > 0) cellClass += " bg-green-100";

    return cellClass;
  };

  const formatDisplayValue = (value: string) => {
    if (!value || value === "-" || value === "0" || parseFloat(value) === 0) return "-";
    const numValue = parseFloat(value);
    return numValue > 0 ? `+${value}%` : `${value}%`;
  };

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-6">
        <CardTitle className="text-card-text text-lg">
          Trailing Returns & Drawdown
        </CardTitle>
      </div>

      {error ? (
        <div className="text-center py-3 px-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="min-w-full border-collapse divide-y">
            <thead className="bg-lightBeige">
              <tr className="bg-gray-100 border-gray-300 border-b text-xs">
                <th className="text-start px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                  Name
                </th>
                {allPeriods.map((period) => (
                  <th
                    key={period.key}
                    className={`text-center px-4 py-2  font-medium text-gray-500 uppercase tracking-wider min-w-[80px]
                      ${period.key === "currentDD" ? "border-l-2 border-gray-300" : ""}`}
                  >
                    <div className="truncate text-[10px]" title={period.label}>
                      {period.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className=" divide-y">
              {/* Scheme Row */}
              <tr className="hover:bg-gray-50 border-gray-300 text-xs">
                <td className="px-4 py-3 text-start whitespace-nowrap min-w-[100px] font-medium text-gray-900">
                  Scheme (%)
                </td>
                {allPeriods.map((period) => {
                  const rawValue = getDisplayValue(period.key, true);
                  const displayValue = formatDisplayValue(rawValue);
                  const cellClass = getCellClass(rawValue);

                  return (
                    <td
                      key={period.key}
                      className={`${cellClass} ${period.key === "currentDD" ? "border-l-2 border-gray-300" : ""}`}
                    >
                      <span className={getReturnColor(rawValue)}>
                        {displayValue}
                      </span>
                    </td>
                  );
                })}
              </tr>

              {/* Benchmark Row */}
              <tr className="hover:bg-gray-50 border-gray-300 text-xs">
                <td className="px-4 py-3 text-start whitespace-nowrap min-w-[100px] font-medium text-gray-900">
                  Benchmark (%)
                </td>
                {allPeriods.map((period) => {
                  const rawValue = getDisplayValue(period.key, false);
                  const displayValue = formatDisplayValue(rawValue);
                  const cellClass = getCellClass(rawValue);

                  return (
                    <td
                      key={period.key}
                      className={`${cellClass} ${period.key === "currentDD" ? "border-l-2 border-gray-300" : ""}`}
                    >
                      <span className={getReturnColor(rawValue)}>
                        {displayValue}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
          <div>
            <p><strong>Legend:</strong> 5d = 5 days, 1m = 1 month, 1y = 1 year, DD = Drawdown</p>
            <p><strong>Returns:</strong> Periods under 1 year are presented as absolute, while those over 1 year are annualized</p>
          </div>
          <div className="flex gap-4">
            <p className="text-green-600">Green: Positive values</p>
            <p className="text-red-600">Red: Negative values</p>
          </div>
        </div>
      </div>
    </div>
  );
}