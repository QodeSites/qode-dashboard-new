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
  };
  drawdown: string;
}

export function RevenueChart({ equityCurve, drawdownCurve, trailingReturns, drawdown }: RevenueChartProps) {
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
    const allDrawdowns = [...portfolioDD, ...benchmarkDD].filter(val => !isNaN(val));
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

      const portfolioData = equityCurve.map((p) => [
        new Date(p.date).getTime(),
        p.value,
      ]);
      const processedPortfolioData = processDataSeries(portfolioData, false, portfolioData[0][1]);

      const portfolioFirstValue = portfolioData[0][1];
      const firstPortfolioDate = processedPortfolioData[0][0];
      const prependDate = Math.abs(portfolioFirstValue - 100) > 0.01
        ? firstPortfolioDate - 24 * 60 * 60 * 1000
        : undefined;

      const benchmarkDataPoints = bse500Data.map((item) => [
        new Date(item.date).getTime(),
        parseFloat(item.nav),
      ]);
      const processedBenchmarkData = processDataSeries(benchmarkDataPoints, true, benchmarkDataPoints[0]?.[1], prependDate);

      const firstBenchmarkDate = processedBenchmarkData[0]?.[0];
      const earliestDate = firstPortfolioDate && firstBenchmarkDate
        ? Math.min(firstPortfolioDate, firstBenchmarkDate)
        : firstPortfolioDate || firstBenchmarkDate;

      const portfolioDrawdownData = drawdownCurve.map((point) => {
        const dd = typeof point.value === "string" ? parseFloat(point.value) : point.value;
        return [new Date(point.date).getTime(), -Math.abs(dd)];
      });
      if (portfolioDrawdownData.length && earliestDate && portfolioDrawdownData[0][0] > earliestDate) {
        portfolioDrawdownData.unshift([earliestDate, 0]);
      }

      let benchmarkDrawdownCurve: [number, number][] = [];
      if (bse500Data.length > 0) {
        let maxBenchmark = parseFloat(bse500Data[0]?.nav) || 100;
        benchmarkDrawdownCurve = [[earliestDate, 0]];
        bse500Data.forEach((point) => {
          const timestamp = new Date(point.date).getTime();
          const nav = parseFloat(point.nav);
          maxBenchmark = Math.max(maxBenchmark, nav);
          const dd = ((nav - maxBenchmark) / maxBenchmark) * 100;
          benchmarkDrawdownCurve.push([timestamp, dd]);
        });
      }

      const allNavValues = [
        ...processedPortfolioData.map(d => d[1]),
        ...(processedBenchmarkData.length > 0 ? processedBenchmarkData.map(d => d[1]) : []),
      ].filter(val => !isNaN(val));

      const navScaling = calculateScalingParams(allNavValues);

      const portfolioDrawdownValues = portfolioDrawdownData.map(d => d[1]);
      const benchmarkDrawdownValues = benchmarkDrawdownCurve.length > 0 ? benchmarkDrawdownCurve.map(d => d[1]) : [];
      const drawdownScaling = calculateDrawdownScaling(portfolioDrawdownValues, benchmarkDrawdownValues);

      const navRange = navScaling.max - navScaling.min;
      const navTickAmount = Math.max(5, Math.min(12, Math.ceil(navRange / 10)));

      const drawdownRange = Math.abs(drawdownScaling.max - drawdownScaling.min);
      const drawdownTickAmount = Math.max(3, Math.min(4, Math.ceil(drawdownRange / 2)));

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
          name: "BSE500",
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
          name: "BSE500 Drawdown",
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
        },
        title: {
          text: "",
          style: { fontSize: "16px" },
        },
        xAxis: {
          type: "datetime",
          title: { text: "Date" },
          labels: {
            formatter: function () {
              return Highcharts.dateFormat("%Y", this.value);
            },
            style: {
              color: "#2E8B57",
              fontSize: "10px",
            },
          },
          gridLineColor: "#e6e6e6",
          tickWidth: 1,
        },
        yAxis: [
          {
            title: { text: "NAV Curve" },
            height: "50%",
            top: "0%",
            labels: {
              formatter: function () {
                return Math.round(this.value * 100) / 100;
              },
              style: {
                color: "#2E8B57",
                fontSize: "8px",
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
            title: { text: "Drawdown" },
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
                fontSize: "10px",
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
          xDateFormat: "%Y-%m-%d",
          valueDecimals: 2,
          formatter: function () {
            const hoveredX = this.x;
            const chart = this.points[0].series.chart;

            function getNearestPoint(series: any, x: number) {
              let nearestPoint = null;
              let minDiff = Infinity;
              series.data.forEach((point: any) => {
                const diff = Math.abs(point.x - x);
                if (diff < minDiff) {
                  minDiff = diff;
                  nearestPoint = point;
                }
              });
              return nearestPoint;
            }

            const portfolioSeries = chart.series.find((s: any) => s.name === "Portfolio");
            const benchmarkSeries = chart.series.find((s: any) => s.name === "BSE500");
            const portfolioDrawdownSeries = chart.series.find((s: any) => s.name === "Portfolio Drawdown");
            const benchmarkDrawdownSeries = chart.series.find((s: any) => s.name === "BSE500 Drawdown");

            const portfolioPoint = portfolioSeries ? getNearestPoint(portfolioSeries, hoveredX) : null;
            const benchmarkPoint = benchmarkSeries ? getNearestPoint(benchmarkSeries, hoveredX) : null;
            const portfolioDrawdownPoint = portfolioDrawdownSeries
              ? getNearestPoint(portfolioDrawdownSeries, hoveredX)
              : null;
            const benchmarkDrawdownPoint = benchmarkDrawdownSeries
              ? getNearestPoint(benchmarkDrawdownSeries, hoveredX)
              : null;

            let tooltipText = `<b>${Highcharts.dateFormat("%d-%m-%Y", hoveredX)}</b><br/><br/>`;
            tooltipText += "<span style='font-weight: bold; font-size: 12px'>Performance:</span><br/>";
            tooltipText += `<span style="color:#2E8B57">\u25CF</span> Portfolio: ${portfolioPoint ? portfolioPoint.y.toFixed(2) : "N/A"
              }<br/>`;
            tooltipText += `<span style="color:#4169E1">\u25CF</span> Benchmark: ${benchmarkPoint ? benchmarkPoint.y.toFixed(2) : "N/A"
              }<br/>`;
            tooltipText += "<br/><span style='font-weight: bold; font-size: 12px'>Drawdown:</span><br/>";
            tooltipText += `<span style="color:#FF4560">\u25CF</span> Portfolio: ${portfolioDrawdownPoint ? portfolioDrawdownPoint.y.toFixed(2) + "%" : "N/A"
              }<br/>`;
            tooltipText += `<span style="color:#FF8F00">\u25CF</span> Benchmark: ${benchmarkDrawdownPoint ? benchmarkDrawdownPoint.y.toFixed(2) + "%" : "N/A"
              }<br/>`;

            return tooltipText;
          },
        },
        legend: {
          enabled: true,
          itemStyle: { fontSize: "12px" },
        },
        plotOptions: {
          line: { marker: { enabled: false } },
          area: { fillOpacity: 0.2, marker: { enabled: false } },
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
      <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
        <CardContent>
          <div className="w-full h-[700px] flex items-center justify-center">
            <p>{error || "No data available."}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/70 backdrop-blur-sm p-0 card-shadow border-0">
      <CardContent className="p-0 px-4 py-5">
        <TrailingReturnsTable
          trailingReturns={trailingReturns}
          drawdown={drawdown}
          equityCurve={equityCurve}
        />
        <div className="flex items-center justify-between text-center">
          <CardTitle className="text-card-text text-lg py-5">Portfolio Performance & Drawdown</CardTitle>
        </div>
        <div className="w-full py-4">
          <div ref={chartRef} className="w-full h-[600px]" />
        </div>
      </CardContent>
    </Card>
  );
}