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
}

export function TrailingReturnsTable({
  trailingReturns,
  drawdown,
  equityCurve,
}: TrailingReturnsTableProps) {

  console.log(trailingReturns)
  const { bse500Data, error } = useBse500Data(equityCurve);

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
    console.log("🔍 Starting benchmark returns calculation...");
    console.log("BSE500 data length:", bse500Data.length);
    console.log("Equity curve length:", equityCurve.length);

    const benchmarkReturns: { [key: string]: string } = {};

    // Initialize all periods with "-"
    allPeriods.forEach(period => {
      benchmarkReturns[period.key] = "-";
    });

    if (!bse500Data.length || !equityCurve.length) {
      console.log("❌ Missing data - BSE500:", bse500Data.length, "EquityCurve:", equityCurve.length);
      return benchmarkReturns;
    }

    const endDate = new Date(equityCurve[equityCurve.length - 1].date);
    const startDate = new Date(equityCurve[0].date);

    console.log("📅 Portfolio Date range:");
    console.log("Portfolio Start date:", startDate.toISOString());
    console.log("Portfolio End date:", endDate.toISOString());

    // Log benchmark data date range
    if (bse500Data.length > 0) {
      const benchmarkStartDate = new Date(bse500Data[0].date);
      const benchmarkEndDate = new Date(bse500Data[bse500Data.length - 1].date);
      console.log("📊 Benchmark (BSE500) Date range:");
      console.log("Benchmark Start date:", benchmarkStartDate.toISOString());
      console.log("Benchmark End date:", benchmarkEndDate.toISOString());
      console.log("Benchmark First NAV:", bse500Data[0].nav);
      console.log("Benchmark Last NAV:", bse500Data[bse500Data.length - 1].nav);
    }

    const findNav = (targetDate: Date): number => {
      // Normalize dates to YYYY-MM-DD string for comparison (ignoring time/timezone)
      const getDateString = (d: Date | string): string => {
        if (typeof d === 'string') {
          return d.split('T')[0];
        }
        const isoString = d.toISOString();
        return isoString.split('T')[0];
      };

      const targetDateStr = getDateString(targetDate);
      console.log(`🔍 Finding NAV for target date: ${targetDateStr}`);
      console.log(`📋 Available benchmark dates:`, bse500Data.map(p => p.date.split('T')[0]));

      const exactMatch = bse500Data.find(point => {
        const pointDateStr = point.date.split('T')[0];
        return pointDateStr === targetDateStr;
      });

      if (exactMatch) {
        console.log(`✅ Exact match found for ${targetDateStr}: NAV=${exactMatch.nav}, Date=${exactMatch.date}`);
        return parseFloat(exactMatch.nav);
      }

      interface NavPoint {
        dateStr: string;
        nav: number;
        date: string;
      }

      let closestPrevious: NavPoint | null = null;

      bse500Data.forEach(point => {
        const pointDateStr = point.date.split('T')[0];

        // String comparison works for YYYY-MM-DD format
        if (pointDateStr <= targetDateStr) {
          if (!closestPrevious || pointDateStr > closestPrevious.dateStr) {
            closestPrevious = {
              dateStr: pointDateStr,
              nav: parseFloat(point.nav),
              date: point.date
            };
          }
        }
      });

      if (closestPrevious !== null) {
        console.log(`⬅️ No exact match for ${targetDateStr}, using closest previous: NAV=${closestPrevious.nav}, Date=${closestPrevious.date}`);
        return closestPrevious.nav;
      }

      // If no previous date found, look for closest future date as fallback
      let closestFuture: NavPoint | null = null;

      bse500Data.forEach(point => {
        const pointDateStr = point.date.split('T')[0];

        if (pointDateStr > targetDateStr) {
          if (!closestFuture || pointDateStr < closestFuture.dateStr) {
            closestFuture = {
              dateStr: pointDateStr,
              nav: parseFloat(point.nav),
              date: point.date
            };
          }
        }
      });

      if (closestFuture !== null) {
        console.log(`➡️ No previous date for ${targetDateStr}, using closest future: NAV=${closestFuture.nav}, Date=${closestFuture.date}`);
        return closestFuture.nav;
      }

      console.log(`❌ No matching date found for ${targetDateStr}`);
      return 0;
    };

    const calculateReturn = (start: Date, end: Date, periodKey: string) => {
      const startNav = findNav(start);
      const endNav = findNav(end);

      if (startNav && endNav && startNav !== 0) {
        // Calculate the duration in years
        const durationYears = (end.getTime() - start.getTime()) / (365 * 24 * 60 * 60 * 1000);

        console.log(`📊 Period ${periodKey}: Start=${start.toISOString().split('T')[0]}, End=${end.toISOString().split('T')[0]}, Duration=${durationYears.toFixed(2)} years`);
        console.log(`📊 NAV values: Start=${startNav}, End=${endNav}`);

        let returnValue: number;

        // Use CAGR for periods >= 1 year, absolute return for shorter periods
        if (durationYears >= 1) {
          // CAGR formula: (End Value / Start Value)^(1/years) - 1
          returnValue = (Math.pow(endNav / startNav, 1 / durationYears) - 1) * 100;
          console.log(`📊 Using CAGR: ${returnValue.toFixed(2)}%`);
        } else {
          // Absolute return formula: (End Value - Start Value) / Start Value
          returnValue = ((endNav - startNav) / startNav) * 100;
          console.log(`📊 Using Absolute Return: ${returnValue.toFixed(2)}%`);
        }

        return returnValue.toFixed(2);
      }

      return "-";
    };

    // Calculate returns for all periods
    allPeriods.forEach(period => {
      if (period.type === "days" || period.type === "months" || period.type === "years") {
        // Calculate the target start date by going back the specified period
        const start = new Date(endDate);

        if (period.duration !== null) {
          if (period.type === "days") {
            start.setDate(endDate.getDate() - period.duration);
          } else if (period.type === "months") {
            start.setMonth(endDate.getMonth() - period.duration);
          } else if (period.type === "years") {
            start.setFullYear(endDate.getFullYear() - period.duration);
          }

          const returnValue = calculateReturn(start, endDate, period.key);
          benchmarkReturns[period.key] = returnValue;
        }

      } else if (period.type === "inception") {
        console.log(`🎯 Calculating ${period.key} - Portfolio Start Date: ${startDate.toISOString()}, End Date: ${endDate.toISOString()}`);
        const returnValue = calculateReturn(startDate, endDate, period.key);
        benchmarkReturns[period.key] = returnValue;
      }
    });

    // Calculate benchmark drawdowns
    if (bse500Data.length) {
      const portfolioStartDateStr = startDate.toISOString().split('T')[0];
      const portfolioEndDateStr = endDate.toISOString().split('T')[0];

      // For MDD calculation, we need to start from the previous trading day before portfolio inception
      // to get the initial benchmark value (similar to how we calculate "Since Inception" returns)
      // This ensures we're comparing apples to apples with the portfolio's performance
      const portfolioRangeBenchmarkData = bse500Data.filter(point => {
        const pointDateStr = point.date.split('T')[0];
        return pointDateStr <= portfolioEndDateStr;
      });

      // Find the starting point - closest date on or before portfolio start
      let startingNav: number | null = null;
      let startingDate = '';

      portfolioRangeBenchmarkData.forEach(point => {
        const pointDateStr = point.date.split('T')[0];
        if (pointDateStr <= portfolioStartDateStr) {
          if (!startingDate || pointDateStr > startingDate) {
            startingDate = pointDateStr;
            startingNav = parseFloat(point.nav);
          }
        }
      });

      console.log(`📉 Starting benchmark DD calculation from ${startingDate} (NAV: ${startingNav})`);

      // Filter to only include data from starting point onwards
      const relevantData = portfolioRangeBenchmarkData.filter(point => {
        const pointDateStr = point.date.split('T')[0];
        return pointDateStr >= startingDate;
      });

      console.log(`📉 Calculating drawdowns for ${relevantData.length} benchmark points (from ${startingDate} to ${portfolioEndDateStr})`);

      let maxDrawdown = 0;
      let peakNav = startingNav || -Infinity;

      // Calculate MDD from the starting point
      relevantData.forEach(point => {
        const nav = parseFloat(point.nav);

        if (nav > peakNav) {
          peakNav = nav;
        }

        const drawdownValue = ((nav - peakNav) / peakNav) * 100;

        if (drawdownValue < maxDrawdown) {
          maxDrawdown = drawdownValue;
        }
      });

      // Calculate current drawdown
      const currentNav = relevantData.length > 0
        ? parseFloat(relevantData[relevantData.length - 1].nav)
        : 0;

      let allTimePeak = startingNav || -Infinity;
      relevantData.forEach(point => {
        const nav = parseFloat(point.nav);
        if (nav > allTimePeak) {
          allTimePeak = nav;
        }
      });

      const currentDrawdown = allTimePeak > 0 ? ((currentNav - allTimePeak) / allTimePeak) * 100 : 0;

      console.log(`📉 Peak NAV: ${peakNav}, Current NAV: ${currentNav}`);
      console.log(`📉 Benchmark MDD: ${maxDrawdown.toFixed(2)}%, Current DD: ${currentDrawdown.toFixed(2)}%`);

      benchmarkReturns.MDD = (-Math.abs(maxDrawdown)).toFixed(2);
      benchmarkReturns.currentDD = (-Math.abs(currentDrawdown)).toFixed(2);
    }

    console.log("🎯 Final benchmark returns:", benchmarkReturns);
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
                    <div className=" text-sm" title={period.label}>
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