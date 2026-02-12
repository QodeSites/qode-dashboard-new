"use client";

import { useEffect, useState } from "react";

interface Bse500DataPoint {
  date: string;
  nav: string;
}

interface EquityCurvePoint {
  date: string;
  value: number;
}

interface UseBse500DataResult {
  bse500Data: Bse500DataPoint[];
  error: string | null;
}

export function useBse500Data(equityCurve: EquityCurvePoint[], adjustStartDateByOneDay: boolean = false): UseBse500DataResult {
  const [bse500Data, setBse500Data] = useState<Bse500DataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBse500Data = async () => {
      if (!equityCurve?.length) {
        setError("No portfolio data available to define date range.");
        return;
      }

      try {
        const startDate = equityCurve[0].date;
        const endDate = equityCurve[equityCurve.length - 1].date;

        // Determine the fetch start date
        // When adjustStartDateByOneDay is true, we need to find the last trading day
        // BEFORE the equity curve starts. We fetch extra days (10) to handle weekends
        // and holidays (e.g., if inception falls on a Monday after a long weekend).
        // This is needed regardless of whether baseline is prepended, because the
        // baseline date itself might be a non-trading day (weekend/holiday).
        let fetchStartDate = startDate;
        if (adjustStartDateByOneDay) {
          const startDateObj = new Date(startDate);
          startDateObj.setDate(startDateObj.getDate() - 10);
          fetchStartDate = startDateObj.toISOString().split('T')[0];
        }

        const queryParams = new URLSearchParams({
          indices: "NIFTY 50",
          start_date: fetchStartDate,
          end_date: endDate,
        });

        const response = await fetch(
          `https://research.qodeinvest.com/api/getIndices?${queryParams.toString()}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch BSE500 data");
        }
        const result = await response.json();

        let processedData: Bse500DataPoint[] = [];
        if (result.data && Array.isArray(result.data)) {
          processedData = result.data;
        } else if (result["BSE500"] && Array.isArray(result["BSE500"])) {
          processedData = result["BSE500"];
        } else if (Array.isArray(result)) {
          processedData = result;
        }

        // Determine the effective start date for filtering
        let effectiveStartDate = startDate;

        if (adjustStartDateByOneDay) {
          // We need to find the appropriate benchmark start date.
          // The goal is to use the last trading day ON OR BEFORE the equity curve start date.
          //
          // Case 1: startDate IS a trading day (exists in benchmark data)
          //         → Use startDate directly
          // Case 2: startDate is NOT a trading day (weekend/holiday)
          //         → Find the previous trading day
          //
          // This ensures clients with weekday inception dates are unaffected,
          // while fixing the issue for weekend/holiday inception dates.

          const startDateTime = new Date(startDate).getTime();

          // Check if startDate exists in benchmark data
          const startDateExists = processedData.some(
            d => new Date(d.date).getTime() === startDateTime
          );

          if (startDateExists) {
            // startDate is a trading day, use it directly
            effectiveStartDate = startDate;
          } else {
            // startDate is not a trading day (weekend/holiday)
            // Find the last trading day strictly BEFORE the start date
            const previousTradingDays = processedData
              .filter(d => new Date(d.date).getTime() < startDateTime)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (previousTradingDays.length > 0) {
              effectiveStartDate = previousTradingDays[0].date;
            }
            // If no previous trading day found, fall back to startDate
          }
        }

        const filteredBse500Data = processedData.filter(
          (d) =>
            new Date(d.date) >= new Date(effectiveStartDate) &&
            new Date(d.date) <= new Date(endDate)
        );

        setBse500Data(filteredBse500Data);
      } catch (err) {
        console.error("Error fetching BSE500 data:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    };

    fetchBse500Data();
  }, [equityCurve, adjustStartDateByOneDay]);

  return { bse500Data, error };
}