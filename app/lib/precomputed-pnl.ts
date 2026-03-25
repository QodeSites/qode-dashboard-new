/**
 * Queries pre-computed PnL data from the database and returns it in the shapes
 * expected by the frontend PnlTable component.
 *
 * Tables: monthly_pnl, quarterly_pnl, yearly_performance
 *
 * SAFETY: READ-ONLY — uses only findMany() (SELECT) queries.
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types matching frontend expectations
// ---------------------------------------------------------------------------

interface MonthlyPnl {
  [year: string]: {
    months: {
      [monthName: string]: {
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

interface QuarterlyPnl {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decimalToString(val: any): string {
  if (val === null || val === undefined) return "-";
  const s = val.toString();
  if (s === "" || s === "NaN") return "-";
  return s;
}

// ---------------------------------------------------------------------------
// Public API — READ-ONLY queries (findMany only)
// ---------------------------------------------------------------------------

export async function getPrecomputedMonthlyPnl(
  icode: string,
  scheme: string
): Promise<MonthlyPnl | null> {
  try {
    const [monthlyRows, yearlyRows] = await Promise.all([
      prisma.monthly_pnl.findMany({
        where: { identifier: icode, scheme_or_strategy: scheme },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.yearly_performance.findMany({
        where: { identifier: icode, scheme_or_strategy: scheme },
      }),
    ]);

    if (monthlyRows.length === 0) return null;

    // Index yearly rows by year for fast lookup
    const yearlyByYear = new Map<number, (typeof yearlyRows)[0]>();
    for (const row of yearlyRows) {
      yearlyByYear.set(row.year, row);
    }

    // Group monthly rows by year
    const byYear = new Map<number, (typeof monthlyRows)>();
    for (const row of monthlyRows) {
      if (!byYear.has(row.year)) byYear.set(row.year, []);
      byYear.get(row.year)!.push(row);
    }

    const result: MonthlyPnl = {};

    for (const [year, rows] of byYear) {
      const months: MonthlyPnl[string]["months"] = {};
      for (const row of rows) {
        const monthName = MONTH_NAMES[row.month - 1];
        if (!monthName) continue;
        months[monthName] = {
          percent: decimalToString(row.percent),
          cash: decimalToString(row.cash),
          capitalInOut: decimalToString(row.capital_in_out),
        };
      }

      const ySummary = yearlyByYear.get(year);
      result[String(year)] = {
        months,
        totalPercent: ySummary?.total_percent ? Number(ySummary.total_percent) : 0,
        totalCash: ySummary?.total_cash ? Number(ySummary.total_cash) : 0,
        totalCapitalInOut: ySummary?.total_capital_in_out ? Number(ySummary.total_capital_in_out) : 0,
      };
    }

    return result;
  } catch (err: any) {
    console.warn("[precomputed-pnl] Failed to query monthly PnL:", err.message);
    return null;
  }
}

export async function getPrecomputedQuarterlyPnl(
  icode: string,
  scheme: string
): Promise<QuarterlyPnl | null> {
  try {
    const rows = await prisma.quarterly_pnl.findMany({
      where: { identifier: icode, scheme_or_strategy: scheme },
      orderBy: [{ year: "asc" }, { quarter: "asc" }],
    });

    if (rows.length === 0) return null;

    // Group by year
    const byYear = new Map<number, (typeof rows)>();
    for (const row of rows) {
      if (!byYear.has(row.year)) byYear.set(row.year, []);
      byYear.get(row.year)!.push(row);
    }

    const result: QuarterlyPnl = {};

    for (const [year, yearRows] of byYear) {
      const percent: Record<string, string> = { q1: "-", q2: "-", q3: "-", q4: "-", total: "-" };
      const cash: Record<string, string> = { q1: "0.00", q2: "0.00", q3: "0.00", q4: "0.00", total: "0.00" };

      let compoundedReturn = 1;
      let hasAnyPercent = false;
      let cashTotal = 0;

      for (const row of yearRows) {
        const qKey = `q${row.quarter}`;
        percent[qKey] = decimalToString(row.percent);
        cash[qKey] = decimalToString(row.cash);

        if (row.percent !== null) {
          const pVal = Number(row.percent);
          if (!isNaN(pVal) && pVal !== 0) {
            compoundedReturn *= 1 + pVal / 100;
            hasAnyPercent = true;
          }
        }

        if (row.cash !== null) {
          const cVal = Number(row.cash);
          if (!isNaN(cVal)) cashTotal += cVal;
        }
      }

      percent.total = hasAnyPercent
        ? ((compoundedReturn - 1) * 100).toFixed(2)
        : "-";
      cash.total = cashTotal.toFixed(2);

      result[String(year)] = {
        percent: percent as QuarterlyPnl[string]["percent"],
        cash: cash as QuarterlyPnl[string]["cash"],
        yearCash: cashTotal.toFixed(2),
      };
    }

    return result;
  } catch (err: any) {
    console.warn("[precomputed-pnl] Failed to query quarterly PnL:", err.message);
    return null;
  }
}
