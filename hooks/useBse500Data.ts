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

export function useBse500Data(equityCurve: EquityCurvePoint[]): UseBse500DataResult {
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

        const queryParams = new URLSearchParams({
          indices: "NIFTY 50",
          start_date: startDate,
          end_date: endDate,
        });

        const response = await fetch(
          `https://portfolio.qodeinvest.com/api/getIndices?${queryParams.toString()}`
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

        const filteredBse500Data = processedData.filter(
          (d) =>
            new Date(d.date) >= new Date(startDate) &&
            new Date(d.date) <= new Date(endDate)
        );

        setBse500Data(filteredBse500Data);
      } catch (err) {
        console.error("Error fetching BSE500 data:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    };

    fetchBse500Data();
  }, [equityCurve]);

  return { bse500Data, error };
}