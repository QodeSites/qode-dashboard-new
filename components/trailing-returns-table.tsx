"use client";

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBse500Data } from "@/hooks/useBse500Data";

interface EquityCurvePoint {
  date: string;
  value: number;
}

interface TrailingReturnsData {
  tenDays: string;
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

  const allPeriods = [
    { key: "5d", label: "5d", duration: 5, type: "days" },
    { key: "10d", label: "10d", duration: 10, type: "days" },
    { key: "15d", label: "15d", duration: 15, type: "days" },
    { key: "1m", label: "1m", duration: 1, type: "months" },
    { key: "1y", label: "1y", duration: 1, type: "years" },
    { key: "2y", label: "2y", duration: 2, type: "years" },
    { key: "3y", label: "3y", duration: 3, type: "years" },
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
        return "-";
      case "10d":
        return isValidReturn(trailingReturns.tenDays) ? trailingReturns.tenDays : "-";
      case "15d":
        return "-";
      case "1m":
        return isValidReturn(trailingReturns.oneMonth) ? trailingReturns.oneMonth : "-";
      case "1y":
        return isValidReturn(trailingReturns.oneYear) ? trailingReturns.oneYear : "-";
      case "2y":
        return isValidReturn(trailingReturns.twoYears) ? trailingReturns.twoYears : "-";
      case "3y":
        return isValidReturn(trailingReturns.threeMonths) ? trailingReturns.threeMonths : "-";
      case "sinceInception":
        return isValidReturn(trailingReturns.sinceInception) ? trailingReturns.sinceInception : "-";
      case "maxDD":
        return isValidReturn(drawdown) ? drawdown : "-";
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
    return currentDD.toFixed(2);
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
      
      benchmarkReturns.maxDD = maxDrawdown.toFixed(2);
      benchmarkReturns.currentDD = currentDrawdown.toFixed(2);
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
    if (numValue > 0) return "text-green-600";
    if (numValue < 0) return "text-red-600";
    return "text-gray-700";
  };

  return (
    <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
      <CardHeader>
        <CardTitle className="text-card-text text-md sm:text-sm">
          Trailing Returns
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-center py-3 px-4 text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-100 border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-card-text border-gray-200 w-32">
                      Name
                    </th>
                    {allPeriods.map((period, index) => (
                      <th
                        key={period.key}
                        className={`text-center py-3 px-2 text-sm font-semibold text-card-text w-20
                          ${period.key === "currentDD" ? "border-l-2 border-gray-200" : ""}
                          ${index < allPeriods.length - 1 ? "border-gray-200" : ""}`}
                      >
                        <div className="truncate" title={period.label}>
                          {period.label}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Scheme Row */}
                  <tr className="border-b border-gray-100 hover:bg-gray-50/50 text-sm">
                    <td className="py-3 px-4 font-medium text-sm text-card-text border-gray-200">
                      Scheme (%)
                    </td>
                    {allPeriods.map((period, index) => (
                      <td
                        key={period.key}
                        className={`text-center py-3 px-2
                          ${period.key === "currentDD" ? "border-l-2 border-gray-200" : ""}
                          ${index < allPeriods.length - 1 ? "border-gray-200" : ""}`}
                      >
                        <span
                          className={`font-medium ${getReturnColor(
                            getDisplayValue(period.key, true)
                          )}`}
                        >
                          {getDisplayValue(period.key, true)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Benchmark Row */}
                  <tr className="hover:bg-gray-50/50 text-sm">
                    <td className="py-3 px-4 font-medium text-sm text-card-text border-gray-200">
                      Benchmark (%)
                    </td>
                    {allPeriods.map((period, index) => (
                      <td
                        key={period.key}
                        className={`text-center py-3 px-2 text-sm
                          ${period.key === "currentDD" ? "border-l-2 border-gray-200" : ""}
                          ${index < allPeriods.length - 1 ? "border-gray-200" : ""}`}
                      >
                        <span
                          className={`font-medium ${getReturnColor(
                            getDisplayValue(period.key, false)
                          )}`}
                        >
                          {getDisplayValue(period.key, false)}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}