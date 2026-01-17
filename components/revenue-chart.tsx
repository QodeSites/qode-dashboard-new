"use client";

import { useEffect, useRef, useCallback } from "react";
import Highcharts from "highcharts";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useBse500Data } from "@/hooks/useBse500Data";
import { TrailingReturnsTable } from "./trailing-returns-table";

interface EquityCurvePoint {
  date: string;
  value: number;
}

interface DrawdownCurvePoint {
  date: string;
  value: number;
}

interface RevenueChartProps {
  equityCurve: EquityCurvePoint[];
  drawdownCurve: DrawdownCurvePoint[];
  trailingReturns: {
    fiveDays?: string;
    tenDays: string;
    fifteenDays?: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
    MDD?: string;
    currentDD?: string;
  };
  drawdown: string;
  chart_animation:boolean;
}

export function RevenueChart({ equityCurve, drawdownCurve, trailingReturns, drawdown, chart_animation = true }: RevenueChartProps) {
  
  console.log(equityCurve,"=============================equityCurve2")
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<any>(null);
  const { bse500Data, error } = useBse500Data(equityCurve);

  // Calculate dynamic scaling parameters
  const calculateScalingParams = useCallback((data: number[]) => {
    if (!data.length) return { min: 0, max: 100, buffer: 10 };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;

    let bufferPercent;
    if (range < 5) bufferPercent = 0.5;
    else if (range < 20) bufferPercent = 0.3;
    else if (range < 50) bufferPercent = 0.2;
    else bufferPercent = 0.1;

    const buffer = range * bufferPercent;

    return {
      min: Math.max(0, min - buffer),
      max: max + buffer,
      buffer: buffer
    };
  }, []);

  const calculateDrawdownScaling = useCallback((portfolioDD: number[], benchmarkDD: number[]) => {
    const allDrawdowns = [...portfolioDD, ...benchmarkDD]
      .filter(val => typeof val === 'number' && !isNaN(val) && isFinite(val));

    if (!allDrawdowns.length) return { min: -10, max: 0 };

    const minDrawdown = Math.min(...allDrawdowns, 0);
    const maxDrawdown = Math.max(...allDrawdowns, 0);

    const range = Math.abs(minDrawdown - maxDrawdown);
    const buffer = Math.max(range * 0.1, 1);

    return {
      min: Math.min(minDrawdown - buffer, -2),
      max: Math.max(maxDrawdown + buffer / 2, 1)
    };
  }, []);

  const processDataSeries = useCallback(
    (data: Array<[number, number] | { date: string; nav: string }>, isBenchmark: boolean = false, baseValue?: number, prependDate?: number) => {
      if (!data.length) return [];
      const firstValue =
        baseValue !== undefined
          ? baseValue
          : "nav" in data[0]
            ? parseFloat(data[0].nav)
            : data[0][1];
      const firstDate = "date" in data[0] ? new Date(data[0].date).getTime() : data[0][0];

      if (isBenchmark) {
        const result = data.map((d) => {
          const timestamp = "date" in d ? new Date(d.date).getTime() : d[0];
          const value = "nav" in d ? parseFloat(d.nav) : d[1];
          return [timestamp, (value / firstValue) * 100];
        });
        if (prependDate && prependDate < firstDate) {
          return [[prependDate, 100], ...result];
        }
        return result;
      }

      return data.map((d) => {
        const timestamp = "date" in d ? new Date(d.date).getTime() : d[0];
        const value = "nav" in d ? parseFloat(d.nav) : d[1];
        return [timestamp, (value / firstValue) * 100];
      });
    },
    []
  );

  useEffect(() => {
    const initChart = () => {
      if (!equityCurve?.length || !chartRef.current) return;
      if (chart.current) {
        chart.current.destroy();
      }

      const firstPortfolioDate = new Date(equityCurve[0].date).getTime();
      const earliestDate = firstPortfolioDate;

      const portfolioData = equityCurve
        .map((p) => {
          let navValue;

          if (p.value !== undefined && p.value !== null) {
            navValue = p.value;
          } else if (p.nav !== undefined && p.nav !== null) {
            navValue = p.nav;
          } else {
            console.warn(`No NAV value found for date ${p.date}:`, p);
            return null;
          }

          const value = typeof navValue === "string" ? parseFloat(navValue) : Number(navValue);

          if (isNaN(value) || !isFinite(value)) {
            console.warn(`Invalid NAV value for date ${p.date}:`, navValue);
            return null;
          }

          return [new Date(p.date).getTime(), value];
        })
        .filter(point => point !== null);

      const processedPortfolioData = processDataSeries(portfolioData, false, portfolioData[0][1]);

      // Process benchmark data aligned to portfolio start
      let processedBenchmarkData: [number, number][] = [];
      if (bse500Data.length > 0) {
        const benchmarkDataPoints = bse500Data.map((item) => [
          new Date(item.date).getTime(),
          parseFloat(item.nav),
        ]);

        // Find the benchmark NAV at or just before portfolio start date
        let benchmarkBaseNav = benchmarkDataPoints[0][1];
        for (let i = benchmarkDataPoints.length - 1; i >= 0; i--) {
          if (benchmarkDataPoints[i][0] <= firstPortfolioDate) {
            benchmarkBaseNav = benchmarkDataPoints[i][1];
            break;
          }
        }

        processedBenchmarkData = processDataSeries(benchmarkDataPoints, true, benchmarkBaseNav);

        // Insert a point exactly at firstPortfolioDate with y=100 if not present
        const hasExact = processedBenchmarkData.some(p => p[0] === firstPortfolioDate);
        if (!hasExact) {
          const insertIndex = processedBenchmarkData.findIndex(p => p[0] > firstPortfolioDate);
          const newPoint: [number, number] = [firstPortfolioDate, 100];
          if (insertIndex === -1) {
            processedBenchmarkData.push(newPoint);
          } else {
            processedBenchmarkData.splice(insertIndex, 0, newPoint);
          }
        }

        // Filter to start from firstPortfolioDate
        processedBenchmarkData = processedBenchmarkData.filter(d => d[0] >= firstPortfolioDate);
      }

      console.log("Raw drawdown data:", drawdownCurve.slice(-3));

      const portfolioDrawdownData = drawdownCurve
        .map((point) => {
          let drawdownValue;

          if (point.value !== undefined && point.value !== null) {
            drawdownValue = point.value;
          } else if (point.drawdown !== undefined && point.drawdown !== null) {
            drawdownValue = point.drawdown;
          } else {
            console.warn(`No valid drawdown data for ${point.date}:`, point);
            return null;
          }

          const dd = typeof drawdownValue === "string" ? parseFloat(drawdownValue) : Number(drawdownValue);

          if (isNaN(dd) || !isFinite(dd)) {
            console.warn(`Invalid drawdown value for ${point.date}: ${drawdownValue} -> ${dd}`);
            return null;
          }

          const finalValue = dd === 0 ? 0 : -Math.abs(dd);

          return [new Date(point.date).getTime(), finalValue];
        })
        .filter(item => item !== null);

      console.log("Processed drawdown data:", portfolioDrawdownData.slice(-3));

      if (portfolioDrawdownData.length && portfolioDrawdownData[0][0] > earliestDate) {
        portfolioDrawdownData.unshift([earliestDate, 0]);
      }

      let benchmarkDrawdownCurve: [number, number][] = [];
      if (bse500Data.length > 0) {
        const benchmarkDataPoints = bse500Data.map((item) => [
          new Date(item.date).getTime(),
          parseFloat(item.nav),
        ]);

        // Use the same benchmarkBaseNav for drawdown initial max
        let startBenchmarkNav = benchmarkDataPoints[0][1];
        for (let i = benchmarkDataPoints.length - 1; i >= 0; i--) {
          if (benchmarkDataPoints[i][0] <= firstPortfolioDate) {
            startBenchmarkNav = benchmarkDataPoints[i][1];
            break;
          }
        }

        let maxBenchmark = startBenchmarkNav;
        benchmarkDrawdownCurve.push([earliestDate, 0]);

        // Only process points >= firstPortfolioDate
        const futurePoints = benchmarkDataPoints.filter(p => p[0] >= firstPortfolioDate);
        futurePoints.forEach((point) => {
          const timestamp = point[0];
          const nav = point[1];
          maxBenchmark = Math.max(maxBenchmark, nav);
          const dd = ((nav - maxBenchmark) / maxBenchmark) * 100;
          benchmarkDrawdownCurve.push([timestamp, dd]);
        });
      }

      const allNavValues = [
        ...processedPortfolioData.map(d => d[1]),
        ...processedBenchmarkData.map(d => d[1]),
      ].filter(val => !isNaN(val));

      const navScaling = calculateScalingParams(allNavValues);

      const portfolioDrawdownValues = portfolioDrawdownData.map(d => d[1]);
      const benchmarkDrawdownValues = benchmarkDrawdownCurve.map(d => d[1]);
      const drawdownScaling = calculateDrawdownScaling(portfolioDrawdownValues, benchmarkDrawdownValues);

      const navRange = navScaling.max - navScaling.min;
      const navTickAmount = Math.max(5, Math.min(12, Math.ceil(navRange / 10)));

      const drawdownRange = Math.abs(drawdownScaling.max - drawdownScaling.min);
      const drawdownTickAmount = Math.max(3, Math.min(4, Math.ceil(drawdownRange / 2)));

      // Calculate dynamic tick interval based on data range
      const dateRange = equityCurve.length > 1
        ? new Date(equityCurve[equityCurve.length - 1].date).getTime() - new Date(equityCurve[0].date).getTime()
        : 0;
      const tickInterval = dateRange > 0
        ? Math.max(7 * 24 * 60 * 60 * 1000, Math.ceil(dateRange / 20)) // At least 1 month, max 10 ticks
        : undefined;

      const mergedSeries = [];
      if (processedPortfolioData.length > 0) {
        mergedSeries.push({
          name: "Portfolio",
          data: processedPortfolioData,
          color: "#2E8B57",
          zIndex: 2,
          yAxis: 0,
          type: "line",
          marker: { enabled: false },
        });
      }
      if (processedBenchmarkData.length > 0) {
        mergedSeries.push({
          name: "Nifty 50",
          data: processedBenchmarkData,
          color: "#4169E1",
          zIndex: 1,
          yAxis: 0,
          type: "line",
          marker: { enabled: false },
        });
      }
      if (portfolioDrawdownData.length > 0) {
        mergedSeries.push({
          name: "Portfolio Drawdown",
          data: portfolioDrawdownData,
          color: "#FF4560",
          zIndex: 2,
          yAxis: 1,
          type: "area",
          marker: { enabled: false },
          fillOpacity: 0.2,
          threshold: 0,
          tooltip: { valueSuffix: "%" },
        });
      }
      if (benchmarkDrawdownCurve.length > 0) {
        mergedSeries.push({
          name: "Nifty 50 Drawdown",
          data: benchmarkDrawdownCurve,
          color: "#FF8F00",
          zIndex: 1,
          yAxis: 1,
          type: "area",
          marker: { enabled: false },
          fillOpacity: 0.2,
          threshold: 0,
          tooltip: { valueSuffix: "%" },
        });
      }

      const options = {
        chart: {
          zoomType: "xy",
          height: 600,
          backgroundColor: "transparent",
          plotBackgroundColor: "transparent",
          style: {
            fontFamily: "Plus Jakarta Sans", // Set global font
          },
        },
        title: {
          text: "",
        },
        xAxis: {
          type: "datetime",
          title: {
            text: "Date",
            style: {
              color: "#2E8B57",
              fontSize: "12px",
              fontFamily: "Plus Jakarta Sans",
            },
          },
          labels: {
            format: "{value:%d-%m-%Y}", // Use DD-MM-YYYY format
            // rotation: -45, // Rotate labels for better readability
            // autoRotation: [-45, -90], // Allow dynamic rotation if needed
            style: {
              color: "#2E8B57",
              fontSize: "12px",
              fontFamily: "Plus Jakarta Sans",
            },
          },
          tickInterval: tickInterval, // Dynamic tick interval
          gridLineColor: "#e6e6e6",
          tickWidth: 1,
          lineColor: "#2E8B57",
        },
        yAxis: [
          {
            title: {
              text: "Performance",
              style: {
                color: "#2E8B57",
                fontSize: "12px",
                fontFamily: "Plus Jakarta Sans",
              },
            },
            height: "50%",
            top: "0%",
            labels: {
              formatter: function () {
                return Math.round(this.value * 100) / 100 + "";
              },
              style: {
                color: "#2E8B57",
                fontSize: "12px",
                fontFamily: "Plus Jakarta Sans",
              },
            },
            min: navScaling.min,
            max: navScaling.max,
            tickAmount: navTickAmount,
            lineColor: "#2E8B57",
            tickColor: "#2E8B57",
            tickWidth: 1,
            gridLineColor: "#e6e6e6",
            plotLines: [
              {
                value: 100,
                color: "#2E8B57",
                width: 1,
                zIndex: 5,
                dashStyle: "dot",
              },
            ],
          },
          {
            title: {
              text: "Drawdown",
              style: {
                color: "#FF4560",
                fontSize: "12px",
                fontFamily: "Plus Jakarta Sans",
              },
            },
            height: "30%",
            top: "65%",
            offset: 0,
            min: drawdownScaling.min,
            max: 0,
            tickAmount: drawdownTickAmount,
            labels: {
              formatter: function () {
                return (Math.round(this.value * 100) / 100) + "%";
              },
              style: {
                color: "#FF4560",
                fontSize: "12px",
                fontFamily: "Plus Jakarta Sans",
              },
            },
            lineColor: "#FF4560",
            tickColor: "#FF4560",
            tickWidth: 1,
            gridLineColor: "#e6e6e6",
          },
        ],
        tooltip: {
          shared: true,
          xDateFormat: "%d-%m-%Y",
          valueDecimals: 2,
          style: {
            fontFamily: "Plus Jakarta Sans",
          },
          formatter: function () {
            const hoveredX = this.x;
            const chart = this.points[0].series.chart;

            function getNearestPoint(series: any, x: number) {
              if (!series || !series.data || series.data.length === 0) {
                return null;
              }

              let nearestPoint = null;
              let minDiff = Infinity;

              series.data.forEach((point: any) => {
                if (point && typeof point.x === 'number' && typeof point.y === 'number' && !isNaN(point.y)) {
                  const diff = Math.abs(point.x - x);
                  if (diff < minDiff) {
                    minDiff = diff;
                    nearestPoint = point;
                  }
                }
              });

              return nearestPoint;
            }

            const portfolioSeries = chart.series.find((s: any) => s.name === "Portfolio");
            const benchmarkSeries = chart.series.find((s: any) => s.name === "Nifty 50");
            const portfolioDrawdownSeries = chart.series.find((s: any) => s.name === "Portfolio Drawdown");
            const benchmarkDrawdownSeries = chart.series.find((s: any) => s.name === "Nifty 50 Drawdown");

            const portfolioPoint = portfolioSeries ? getNearestPoint(portfolioSeries, hoveredX) : null;
            const benchmarkPoint = benchmarkSeries ? getNearestPoint(benchmarkSeries, hoveredX) : null;
            const portfolioDrawdownPoint = portfolioDrawdownSeries
              ? getNearestPoint(portfolioDrawdownSeries, hoveredX)
              : null;
            const benchmarkDrawdownPoint = benchmarkDrawdownSeries
              ? getNearestPoint(benchmarkDrawdownSeries, hoveredX)
              : null;

            let tooltipText = `<b style="font-family: 'Plus Jakarta Sans';">${Highcharts.dateFormat("%d-%m-%Y", hoveredX)}</b><br/><br/>`;
            tooltipText += `<span style="font-weight: bold; font-size: 12px; font-family: 'Plus Jakarta Sans';">Performance:</span><br/>`;
            tooltipText += `<span style="color:#2E8B57; font-family: 'Plus Jakarta Sans';">\u25CF</span> Portfolio: ${portfolioPoint && !isNaN(portfolioPoint.y) ? portfolioPoint.y.toFixed(2) + "" : "N/A"
              }<br/>`;
            tooltipText += `<span style="color:#4169E1; font-family: 'Plus Jakarta Sans';">\u25CF</span> Benchmark: ${benchmarkPoint && !isNaN(benchmarkPoint.y) ? benchmarkPoint.y.toFixed(2) + "" : "N/A"
              }<br/>`;
            tooltipText += `<br/><span style="font-weight: bold; font-size: 12px; font-family: 'Plus Jakarta Sans';">Drawdown:</span><br/>`;
            tooltipText += `<span style="color:#FF4560; font-family: 'Plus Jakarta Sans';">\u25CF</span> Portfolio: ${portfolioDrawdownPoint && !isNaN(portfolioDrawdownPoint.y)
                ? portfolioDrawdownPoint.y.toFixed(2) + "%"
                : "N/A"
              }<br/>`;
            tooltipText += `<span style="color:#FF8F00; font-family: 'Plus Jakarta Sans';">\u25CF</span> Benchmark: ${benchmarkDrawdownPoint && !isNaN(benchmarkDrawdownPoint.y)
                ? benchmarkDrawdownPoint.y.toFixed(2) + "%"
                : "N/A"
              }<br/>`;

            return tooltipText;
          },
        },
        legend: {
          enabled: true,
          layout: "horizontal", // force horizontal row
          align: "center",
          verticalAlign: "bottom",
          itemStyle: {
            fontSize: "12px",
            color: "#2E8B57",
            fontFamily: "Plus Jakarta Sans",
          },
        },
        responsive: {
          rules: [
            {
              condition: {
                maxWidth: 768, // apply on mobile screens
              },
              chartOptions: {
                legend: {
                  layout: "horizontal",
                  align: "center",
                  verticalAlign: "bottom",
                  itemMarginTop: 2,
                  itemMarginBottom: 2,
                  itemWidth: 100, // adjust width for better fit
                },
              },
            },
          ],
        },
        plotOptions: {
          line: { marker: { enabled: false } },
          area: { fillOpacity: 0.2, marker: { enabled: false } },
          series: { animation: chart_animation } 
        },
        series: mergedSeries,
        credits: { enabled: false },
      };

      chart.current = Highcharts.chart(chartRef.current!, options);
    };

    initChart();

    return () => {
      if (chart.current && typeof chart.current.destroy === "function") {
        chart.current.destroy();
        chart.current = null;
      }
    };
  }, [equityCurve, drawdownCurve, bse500Data, processDataSeries, calculateScalingParams, calculateDrawdownScaling]);

  if (!equityCurve?.length || error) {
    return (
      <Card className="bg-white/50   border-0">
        <CardContent>
          <div className="w-full h-[700px] flex items-center justify-center">
            <p>{error || "No data available."}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white/50   border-0">
        <CardContent className="p-4">
          <TrailingReturnsTable
            trailingReturns={trailingReturns}
            drawdown={drawdown}
            equityCurve={equityCurve}
          />
        </CardContent>
      </Card>
      <Card className="bg-white/50   border-0">
        <CardContent className="p-4">
          <CardTitle className="text-card-text text-sm sm:text-lg mb-4">Portfolio Performance & Drawdown</CardTitle>
          <div className="w-full">
            <div ref={chartRef} className="w-full h-[600px]" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}