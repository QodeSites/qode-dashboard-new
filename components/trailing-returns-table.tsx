"use client";

import { useCallback } from "react";
import { CardTitle } from "@/components/ui/card";
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
  maxDrawdown: string;
  currentDrawdown: string;
}

interface TrailingReturnsTableProps {
  trailingReturns: Partial<TrailingReturnsData> & { [key: string]: string | number };
  drawdown: string;
  equityCurve: EquityCurvePoint[];
  accountType?: string;
  broker?: string;
  adjustBenchmarkStartDate?: boolean;
}

export function TrailingReturnsTable({
  trailingReturns,
  drawdown,
  equityCurve,
  adjustBenchmarkStartDate = false,
}: TrailingReturnsTableProps) {

  console.log(trailingReturns)
  const { bse500Data, error } = useBse500Data(equityCurve, adjustBenchmarkStartDate);

  // Normalize trailingReturns for internal use
  const normalizeTrailingReturns = (
    input: TrailingReturnsTableProps["trailingReturns"]
  ): TrailingReturnsData => ({
    fiveDays: String(input["fiveDays"] ?? input["5d"] ?? "-"),
    tenDays: String(input["tenDays"] ?? input["10d"] ?? "-"),
    fifteenDays: String(input["fifteenDays"] ?? input["15d"] ?? "-"),
    oneMonth: String(input["oneMonth"] ?? input["1m"] ?? "-"),
    threeMonths: String(input["threeMonths"] ?? input["3m"] ?? "-"),
    sixMonths: String(input["sixMonths"] ?? input["6m"] ?? "-"),
    oneYear: String(input["oneYear"] ?? input["1y"] ?? "-"),
    twoYears: String(input["twoYears"] ?? input["2y"] ?? "-"),
    fiveYears: String(input["fiveYears"] ?? input["5y"] ?? "-"),
    sinceInception: String(input["sinceInception"] ?? "-"),
    maxDrawdown: String(input["maxDrawdown"] ?? input["MDD"] ?? "-"),
    currentDrawdown: String(input["currentDrawdown"] ?? input["currentDD"] ?? "-"),
  });

  const normalizedTrailingReturns = normalizeTrailingReturns(trailingReturns);

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
    { key: "MDD", label: "Max DD", duration: null, type: "maxDrawdown" },
  ];

  const isValidReturn = (value: string | number | null | undefined): boolean => {
    if (value === null || value === undefined || value === "---" || value === "") {
      return false;
    }
    return true;
  };

  const getSchemeReturn = (periodKey: string) => {
    switch (periodKey) {
      case "5d":
        return isValidReturn(normalizedTrailingReturns.fiveDays) ? normalizedTrailingReturns.fiveDays : "-";
      case "10d":
        return isValidReturn(normalizedTrailingReturns.tenDays) ? normalizedTrailingReturns.tenDays : "-";
      case "15d":
        return isValidReturn(normalizedTrailingReturns.fifteenDays) ? normalizedTrailingReturns.fifteenDays : "-";
      case "1m":
        return isValidReturn(normalizedTrailingReturns.oneMonth) ? normalizedTrailingReturns.oneMonth : "-";
      case "1y":
        return isValidReturn(normalizedTrailingReturns.oneYear) ? normalizedTrailingReturns.oneYear : "-";
      case "2y":
        return isValidReturn(normalizedTrailingReturns.twoYears) ? normalizedTrailingReturns.twoYears : "-";
      case "3m":
        return isValidReturn(normalizedTrailingReturns.threeMonths) ? normalizedTrailingReturns.threeMonths : "-";
      case "sinceInception":
        return isValidReturn(normalizedTrailingReturns.sinceInception) ? normalizedTrailingReturns.sinceInception : "-";
      case "MDD":
        return isValidReturn(normalizedTrailingReturns.maxDrawdown) ? normalizedTrailingReturns.maxDrawdown : "-";
      case "currentDD":
        return isValidReturn(normalizedTrailingReturns.currentDrawdown) ? normalizedTrailingReturns.currentDrawdown : "-";
      default:
        return "-";
    }
  };

const calculateBenchmarkReturns = useCallback(() => {
    // console.log("🔍 Starting benchmark returns calculation...");
    // console.log("BSE500 data length:", bse500Data.length);
    // console.log("Equity curve length:", equityCurve.length);

    const benchmarkReturns: { [key: string]: string } = {};

    // Initialize all periods with "-"
    allPeriods.forEach(period => {
      benchmarkReturns[period.key] = "-";
    });

    if (!bse500Data.length || !equityCurve.length) {
      // console.log("❌ Missing data - BSE500:", bse500Data.length, "EquityCurve:", equityCurve.length);
      return benchmarkReturns;
    }

    const endDate = new Date(equityCurve[equityCurve.length - 1].date);
    const startDate = new Date(equityCurve[0].date);

    // console.log("📅 Date range:");
    // console.log("Start date:", startDate.toISOString());
    // console.log("End date:", endDate.toISOString());

    const findNav = (targetDate: Date) => {
      const exactMatch = bse500Data.find(point => {
        const pointDate = new Date(point.date);
        return pointDate.toDateString() === targetDate.toDateString();
      });

      if (exactMatch) {
        return parseFloat(exactMatch.nav);
      }

      let closestPrevious = null;
      let closestPreviousDiff = Infinity;
      let closestFuture = null;
      let closestFutureDiff = Infinity;

      bse500Data.forEach(point => {
        const pointDate = new Date(point.date);
        const timeDiff = targetDate.getTime() - pointDate.getTime();

        if (timeDiff >= 0) {
          if (timeDiff < closestPreviousDiff) {
            closestPreviousDiff = timeDiff;
            closestPrevious = {
              diff: timeDiff,
              nav: parseFloat(point.nav),
              date: point.date
            };
          }
        } else {
          const futureDiff = Math.abs(timeDiff);
          if (futureDiff < closestFutureDiff) {
            closestFutureDiff = futureDiff;
            closestFuture = {
              diff: futureDiff,
              nav: parseFloat(point.nav),
              date: point.date
            };
          }
        }
      });

      const selectedPoint = closestPrevious || closestFuture;
      return selectedPoint ? selectedPoint.nav : 0;
    };

    const calculateReturn = (start: Date, end: Date, periodKey: string) => {
      const startNav = findNav(start);
      const endNav = findNav(end);

      if (startNav && endNav && startNav !== 0) {
        // Calculate the duration in years
        const durationYears = (end.getTime() - start.getTime()) / (365 * 24 * 60 * 60 * 1000);
        
        // console.log(`📊 Period ${periodKey}: Start=${start.toISOString().split('T')[0]}, End=${end.toISOString().split('T')[0]}, Duration=${durationYears.toFixed(2)} years`);
        // console.log(`📊 NAV values: Start=${startNav}, End=${endNav}`);
        
        let returnValue: number;
        
        // Use CAGR for periods >= 1 year, absolute return for shorter periods
        if (durationYears >= 1) {
          // CAGR formula: (End Value / Start Value)^(1/years) - 1
          returnValue = (Math.pow(endNav / startNav, 1 / durationYears) - 1) * 100;
          // console.log(`📊 Using CAGR: ${returnValue.toFixed(2)}%`);
        } else {
          // Absolute return formula: (End Value - Start Value) / Start Value
          returnValue = ((endNav - startNav) / startNav) * 100;
          // console.log(`📊 Using Absolute Return: ${returnValue.toFixed(2)}%`);
        }
        
        return returnValue.toFixed(2);
      }

      return "-";
    };

    // Helper function to convert period type to days
    const getDaysForPeriod = (period: any) => {
      if (period.type === "days") {
        return period.duration;
      } else if (period.type === "months") {
        // Convert months to approximate days
        return period.duration * 30;
      } else if (period.type === "years") {
        // Convert years to days (accounting for leap years)
        return period.duration * 365; // Using 366 to match your original logic
      }
      return 0;
    };

    // Calculate returns for all periods
    allPeriods.forEach(period => {
      if (period.type === "days" || period.type === "months" || period.type === "years") {
        const start = new Date(endDate);

        // Fix: Use consistent day-based calculation
        const daysToSubtract = getDaysForPeriod(period);
        start.setDate(endDate.getDate() - daysToSubtract);

        const returnValue = calculateReturn(start, endDate, period.key);
        benchmarkReturns[period.key] = returnValue;

      } else if (period.type === "inception") {
        const returnValue = calculateReturn(startDate, endDate, period.key);
        benchmarkReturns[period.key] = returnValue;
      }
    });

    // Calculate benchmark drawdowns
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

      benchmarkReturns.MDD = (-Math.abs(maxDrawdown)).toFixed(2);
      benchmarkReturns.currentDD = (-Math.abs(currentDrawdown)).toFixed(2);
    }

    // console.log("🎯 Final benchmark returns:", benchmarkReturns);
    return benchmarkReturns;
  }, [bse500Data, equityCurve, allPeriods]);

  const benchmarkReturns = calculateBenchmarkReturns();

  const getDisplayValue = (periodKey: string, isScheme: boolean) => {
    const schemeValue = getSchemeReturn(periodKey);
    const benchmarkValue = benchmarkReturns[periodKey];

    if (isScheme) {
      return schemeValue;
    }

    // For benchmark: only show benchmark value if scheme value is available and not "-"
    if (schemeValue === "-" || schemeValue === "---" || schemeValue === "" || !schemeValue) {
      return "-";
    }

    // If scheme value is available, show the benchmark value
    return benchmarkValue;
  };

  const getReturnColor = (value: string) => {
    if (value === "-" || value === "---") return "text-gray-500";
    const numValue = parseFloat(value);
    if (numValue > 0) return "text-black";
    if (numValue < 0) return "text-black";
    return "text-gray-700";
  };

  const getCellClass = (value: string) => {
    return "px-4 py-3 text-center whitespace-nowrap";
  };

  const formatDisplayValue = (value: string, periodKey: string, isScheme: boolean): string => {
    if (value === "-" || value === "" || value === undefined || value === null) {
      return "-";
    }

    if (value === "0.00") {
      return "0.00%";
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return "-";
    }

    // For MDD and currentDD, ensure negative display
    if (periodKey === "MDD" || periodKey === "currentDD") {
      return `${(-Math.abs(numValue)).toFixed(2)}%`;
    }

    const sign = numValue > 0 ? "+" : "";
    return `${sign}${numValue.toFixed(2)}%`;
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-4">
        <CardTitle className="text-card-text text-sm sm:text-lg">
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
              <tr className="bg-black/5 border-black border-b text-sm">
                <th className="text-start px-4 py-2 text-sm font-medium text-black uppercase tracking-wider min-w-[100px]">
                  Name
                </th>
                {allPeriods.map((period) => (
                  <th
                    key={period.key}
                    className={`text-center px-4 py-2 font-medium text-black uppercase tracking-wider min-w-[80px]
                      ${period.key === "currentDD" ? "border-l border-black" : ""}`}
                  >
                    <div className="truncate text-sm" title={period.label}>
                      {period.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr className=" border-black text-xs">
                <td className="px-4 py-3 text-start whitespace-nowrap min-w-[100px]  font-medium text-gray-900">
                  Scheme (%)
                </td>
                {allPeriods.map((period) => {
                  const rawValue = getDisplayValue(period.key, true);
                  const displayValue = formatDisplayValue(rawValue, period.key, true);
                  const cellClass = getCellClass(rawValue);

                  return (
                    <td
                      key={period.key}
                      className={`${cellClass} ${period.key === "currentDD" ? "border-l  border-black" : ""}`}
                    >
                      <span className={getReturnColor(rawValue)}>
                        {displayValue}
                      </span>
                    </td>
                  );
                })}
              </tr>
              <tr className=" border-black text-xs">
                <td className="px-4 py-3 text-start whitespace-nowrap min-w-[100px] font-medium text-gray-900">
                  Benchmark (%)
                </td>
                {allPeriods.map((period) => {
                  const rawValue = getDisplayValue(period.key, false);
                  const displayValue = formatDisplayValue(rawValue, period.key, false);
                  const cellClass = getCellClass(rawValue);

                  return (
                    <td
                      key={period.key}
                      className={`${cellClass} ${period.key === "currentDD" ? "border-l border-black" : ""}`}
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

      <div className="mt-3 pt-4  border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
          <div>
            <p><strong>Returns:</strong> Periods under 1 year are presented as absolute, while those over 1 year are annualized (CAGR)</p>
          </div>
        </div>
      </div>
    </div>
  );
}