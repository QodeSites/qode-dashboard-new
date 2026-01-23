/**
 * Dinesh Portfolio Data Fetching - CSV-based Implementation
 *
 * This module reads portfolio data from CSV files instead of the database.
 * It maintains the same interface as dinesh-utils.ts for seamless switching.
 *
 * SAFETY COMPLIANCE (per CLAUDE.md):
 * - ✅ READ-ONLY: Only reads from CSV files, no writes
 * - ✅ No database mutations: No create/update/delete/upsert operations
 * - ✅ No Prisma write operations
 *
 * Data Source: data/dinesh_bifurcated_total_mastersheet.csv
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

// ==================== Type Definitions ====================

interface CashFlow {
  date: string;
  amount: number;
  dividend: number;
}

interface QuarterlyPnL {
  [year: string]: {
    percent: { q1: string; q2: string; q3: string; q4: string; total: string };
    cash: { q1: string; q2: string; q3: string; q4: string; total: string };
    yearCash: string;
  };
}

interface MonthlyPnL {
  [year: string]: {
    months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
    totalPercent: number;
    totalCash: number;
    totalCapitalInOut: number;
  };
}

interface PortfolioData {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: Record<string, number | null | string>;
  drawdown: string;
  maxDrawdown: string;
  equityCurve: { date: string; nav: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
  quarterlyPnl: QuarterlyPnL;
  monthlyPnl: MonthlyPnL;
  cashFlows: CashFlow[];
  strategyName: string;
}

interface Metadata {
  icode: string;
  accountCount: number;
  lastUpdated: string;
  filtersApplied: {
    accountType: string | null;
    broker: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  inceptionDate: string;
  dataAsOfDate: string;
  strategyName: string;
  isActive: boolean;
}

interface PortfolioResponse {
  data: PortfolioData;
  metadata: Metadata;
}

interface PortfolioConfig {
  current: string;
  metrics: string;
  nav: string;
  isActive: boolean;
}

interface CsvRow {
  systemTag: string;
  date: Date;
  portfolioValue: number;
  capitalInOut: number;
  nav: number;
  prevNav: number;
  pnl: number;
  dailyPnlPercent: number;
  exposureValue: number;
  prevPortfolioValue: number;
  prevExposureValue: number;
  prevPnl: number;
  drawdown: number;
}

// ==================== Configuration ====================

// Dropdown order: Total Portfolio → Scheme QAW++ → Scheme QTF
const PORTFOLIO_MAPPING: Record<string, Record<string, PortfolioConfig>> = {
  AC9: {
    "Total Portfolio": {
      current: "Total Portfolio",
      metrics: "Total Portfolio",
      nav: "Total Portfolio",
      isActive: true,
    },
    "Scheme QAW++": {
      current: "Zerodha Total Portfolio",
      metrics: "Zerodha Total Portfolio",
      nav: "Zerodha Total Portfolio",
      isActive: true,
    },
    "Scheme QTF": {
      current: "QTF Zerodha Total Portfolio",
      metrics: "QTF Zerodha Total Portfolio",
      nav: "QTF Zerodha Total Portfolio",
      isActive: false,
    },
  },
};

// ==================== CSV Data Source ====================

export class DineshCsvDataSource {
  private static csvData: CsvRow[] | null = null;
  private static readonly CSV_PATH = path.join(
    process.cwd(),
    "data",
    "dinesh_bifurcated_total_mastersheet.csv"
  );

  /**
   * Parse CSV file and cache the results
   * READ-ONLY: Only reads from file system
   */
  private static loadCsvData(): CsvRow[] {
    if (this.csvData !== null) {
      return this.csvData;
    }

    const fileContent = fs.readFileSync(this.CSV_PATH, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    // Skip header row
    const dataLines = lines.slice(1);

    this.csvData = dataLines.map((line) => {
      const columns = this.parseCsvLine(line);
      return {
        systemTag: columns[0]?.trim() || "",
        date: new Date(columns[1]?.trim() || ""),
        portfolioValue: parseFloat(columns[2]) || 0,
        capitalInOut: parseFloat(columns[3]) || 0,
        nav: parseFloat(columns[4]) || 0,
        prevNav: parseFloat(columns[5]) || 0,
        pnl: parseFloat(columns[6]) || 0,
        dailyPnlPercent: parseFloat(columns[7]) || 0,
        exposureValue: parseFloat(columns[8]) || 0,
        prevPortfolioValue: parseFloat(columns[9]) || 0,
        prevExposureValue: parseFloat(columns[10]) || 0,
        prevPnl: parseFloat(columns[11]) || 0,
        drawdown: parseFloat(columns[12]) || 0,
      };
    });

    return this.csvData;
  }

  /**
   * Parse a CSV line handling potential commas in values
   */
  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  /**
   * Filter data by system tag
   * READ-ONLY: Only filters in-memory data
   */
  static getBySystemTag(systemTag: string): CsvRow[] {
    const data = this.loadCsvData();
    return data.filter((row) => row.systemTag === systemTag);
  }

  /**
   * Filter data by system tag and date range
   * READ-ONLY: Only filters in-memory data
   */
  static getBySystemTagAndDateRange(
    systemTag: string,
    startDate?: Date,
    endDate?: Date
  ): CsvRow[] {
    let data = this.getBySystemTag(systemTag);

    if (startDate) {
      data = data.filter((row) => row.date >= startDate);
    }
    if (endDate) {
      data = data.filter((row) => row.date <= endDate);
    }

    return data.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Get the latest record for a system tag
   * READ-ONLY: Only reads from in-memory data
   */
  static getLatestBySystemTag(systemTag: string, startDate?: Date): CsvRow | null {
    const data = this.getBySystemTagAndDateRange(systemTag, startDate);
    return data.length > 0 ? data[data.length - 1] : null;
  }

  /**
   * Sum capital_in_out for a system tag
   * READ-ONLY: Only aggregates in-memory data
   */
  static sumCapitalInOut(systemTag: string, startDate?: Date): number {
    const data = this.getBySystemTagAndDateRange(systemTag, startDate);
    return data.reduce((sum, row) => sum + row.capitalInOut, 0);
  }

  /**
   * Sum PnL for a system tag
   * READ-ONLY: Only aggregates in-memory data
   */
  static sumPnl(systemTag: string, startDate?: Date): number {
    const data = this.getBySystemTagAndDateRange(systemTag, startDate);
    return data.reduce((sum, row) => sum + row.pnl, 0);
  }

  /**
   * Clear cached data (useful for testing or reloading)
   */
  static clearCache(): void {
    this.csvData = null;
  }
}

// ==================== Portfolio API (CSV-based) ====================

export class PortfolioApiCsv {
  private static readonly DINESH_SYSTEM_TAGS: Record<string, string> = {
    "Scheme QTF": "QTF Zerodha Total Portfolio",
    "Scheme QAW++": "Zerodha Total Portfolio",
  };

  // QTF final NAV for rebasing QAW++ in Total Portfolio calculations
  private static readonly QTF_FINAL_NAV = 113.57;
  // QAW++ starts on Jan 12, 2026 (after QTF ended on Jan 9, 2026)
  private static readonly QAW_START_DATE = new Date("2026-01-12");

  // Hardcoded QTF data (scheme is closed)
  private static DINESH_HARDCODED_DATA: Record<string, PortfolioData & { metadata: Metadata }> = {
    "Scheme QTF": {
      data: {
        amountDeposited: "0.00",
        currentExposure: "0.00",
        return: "13.57",
        totalProfit: "6805437.30",
        trailingReturns: {
          "5d": 0.36,
          "10d": 0.76,
          "15d": -0.04,
          "1m": 1.44,
          "3m": 4.98,
          "6m": null,
          "1y": null,
          "2y": null,
          "5y": null,
          sinceInception: 13.57,
          MDD: -2.53,
          currentDD: -0.07,
        },
        drawdown: "-0.07",
        maxDrawdown: "-2.53",
        equityCurve: [
          { date: "2025-08-25", nav: 100 },
          { date: "2025-08-26", nav: 99.66 },
          { date: "2025-08-28", nav: 100.93 },
          { date: "2025-08-29", nav: 101.24 },
          { date: "2025-09-01", nav: 101.32 },
          { date: "2025-09-02", nav: 101.60 },
          { date: "2025-09-03", nav: 102.44 },
          { date: "2025-09-04", nav: 103.38 },
          { date: "2025-09-05", nav: 102.72 },
          { date: "2025-09-08", nav: 102.98 },
          { date: "2025-09-09", nav: 103.55 },
          { date: "2025-09-10", nav: 103.99 },
          { date: "2025-09-11", nav: 103.99 },
          { date: "2025-09-12", nav: 104.51 },
          { date: "2025-09-15", nav: 104.41 },
          { date: "2025-09-16", nav: 105.17 },
          { date: "2025-09-17", nav: 105.54 },
          { date: "2025-09-18", nav: 105.56 },
          { date: "2025-09-19", nav: 105.28 },
          { date: "2025-09-22", nav: 105.64 },
          { date: "2025-09-23", nav: 105.59 },
          { date: "2025-09-24", nav: 105.26 },
          { date: "2025-09-25", nav: 105.59 },
          { date: "2025-09-26", nav: 106.69 },
          { date: "2025-09-29", nav: 106.05 },
          { date: "2025-09-30", nav: 105.81 },
          { date: "2025-10-01", nav: 106.92 },
          { date: "2025-10-03", nav: 106.74 },
          { date: "2025-10-06", nav: 107.74 },
          { date: "2025-10-07", nav: 107.66 },
          { date: "2025-10-08", nav: 107.49 },
          { date: "2025-10-09", nav: 107.85 },
          { date: "2025-10-10", nav: 108.18 },
          { date: "2025-10-13", nav: 108.31 },
          { date: "2025-10-14", nav: 108.64 },
          { date: "2025-10-15", nav: 108.89 },
          { date: "2025-10-16", nav: 110.42 },
          { date: "2025-10-17", nav: 111.03 },
          { date: "2025-10-20", nav: 111.25 },
          { date: "2025-10-23", nav: 110.70 },
          { date: "2025-10-24", nav: 110.20 },
          { date: "2025-10-27", nav: 109.68 },
          { date: "2025-10-28", nav: 108.44 },
          { date: "2025-10-29", nav: 109.60 },
          { date: "2025-10-30", nav: 109.02 },
          { date: "2025-10-31", nav: 108.89 },
          { date: "2025-11-03", nav: 109.49 },
          { date: "2025-11-04", nav: 109.39 },
          { date: "2025-11-06", nav: 108.93 },
          { date: "2025-11-07", nav: 109.01 },
          { date: "2025-11-10", nav: 109.76 },
          { date: "2025-11-11", nav: 110.34 },
          { date: "2025-11-12", nav: 110.86 },
          { date: "2025-11-13", nav: 111.45 },
          { date: "2025-11-14", nav: 111.09 },
          { date: "2025-11-17", nav: 111.20 },
          { date: "2025-11-18", nav: 110.63 },
          { date: "2025-11-19", nav: 111.36 },
          { date: "2025-11-20", nav: 111.51 },
          { date: "2025-11-21", nav: 110.80 },
          { date: "2025-11-24", nav: 110.38 },
          { date: "2025-11-25", nav: 111.06 },
          { date: "2025-11-26", nav: 111.63 },
          { date: "2025-11-27", nav: 111.76 },
          { date: "2025-11-28", nav: 112.08 },
          { date: "2025-12-01", nav: 112.07 },
          { date: "2025-12-02", nav: 111.72 },
          { date: "2025-12-03", nav: 111.52 },
          { date: "2025-12-04", nav: 111.10 },
          { date: "2025-12-05", nav: 111.71 },
          { date: "2025-12-08", nav: 110.94 },
          { date: "2025-12-09", nav: 112.68 },
          { date: "2025-12-10", nav: 111.96 },
          { date: "2025-12-11", nav: 111.94 },
          { date: "2025-12-12", nav: 113.13 },
          { date: "2025-12-15", nav: 113.22 },
          { date: "2025-12-16", nav: 112.54 },
          { date: "2025-12-17", nav: 112.26 },
          { date: "2025-12-18", nav: 112.14 },
          { date: "2025-12-19", nav: 112.22 },
          { date: "2025-12-22", nav: 113.10 },
          { date: "2025-12-23", nav: 113.53 },
          { date: "2025-12-24", nav: 113.61 },
          { date: "2025-12-26", nav: 113.65 },
          { date: "2025-12-29", nav: 113.10 },
          { date: "2025-12-30", nav: 112.72 },
          { date: "2025-12-31", nav: 111.93 },
          { date: "2026-01-01", nav: 112.22 },
          { date: "2026-01-02", nav: 113.16 },
          { date: "2026-01-05", nav: 113.33 },
          { date: "2026-01-06", nav: 113.62 },
          { date: "2026-01-07", nav: 113.57 },
          { date: "2026-01-08", nav: 113.30 },
          { date: "2026-01-09", nav: 113.57 },
        ],
        drawdownCurve: [
          { date: "2025-08-25", drawdown: 0 },
          { date: "2025-08-26", drawdown: -0.34 },
          { date: "2025-08-28", drawdown: 0.00 },
          { date: "2025-08-29", drawdown: 0.00 },
          { date: "2025-09-01", drawdown: 0.00 },
          { date: "2025-09-02", drawdown: 0.00 },
          { date: "2025-09-03", drawdown: 0.00 },
          { date: "2025-09-04", drawdown: 0.00 },
          { date: "2025-09-05", drawdown: -0.64 },
          { date: "2025-09-08", drawdown: -0.38 },
          { date: "2025-09-09", drawdown: 0.00 },
          { date: "2025-09-10", drawdown: 0.00 },
          { date: "2025-09-11", drawdown: 0.00 },
          { date: "2025-09-12", drawdown: 0.00 },
          { date: "2025-09-15", drawdown: -0.09 },
          { date: "2025-09-16", drawdown: 0.00 },
          { date: "2025-09-17", drawdown: 0.00 },
          { date: "2025-09-18", drawdown: 0.00 },
          { date: "2025-09-19", drawdown: -0.27 },
          { date: "2025-09-22", drawdown: 0.00 },
          { date: "2025-09-23", drawdown: -0.04 },
          { date: "2025-09-24", drawdown: -0.36 },
          { date: "2025-09-25", drawdown: -0.04 },
          { date: "2025-09-26", drawdown: 0.00 },
          { date: "2025-09-29", drawdown: -0.60 },
          { date: "2025-09-30", drawdown: -0.83 },
          { date: "2025-10-01", drawdown: 0.00 },
          { date: "2025-10-03", drawdown: -0.17 },
          { date: "2025-10-06", drawdown: 0.00 },
          { date: "2025-10-07", drawdown: -0.07 },
          { date: "2025-10-08", drawdown: -0.23 },
          { date: "2025-10-09", drawdown: 0.00 },
          { date: "2025-10-10", drawdown: 0.00 },
          { date: "2025-10-13", drawdown: 0.00 },
          { date: "2025-10-14", drawdown: 0.00 },
          { date: "2025-10-15", drawdown: 0.00 },
          { date: "2025-10-16", drawdown: 0.00 },
          { date: "2025-10-17", drawdown: 0.00 },
          { date: "2025-10-20", drawdown: 0.00 },
          { date: "2025-10-23", drawdown: -0.49 },
          { date: "2025-10-24", drawdown: -0.95 },
          { date: "2025-10-27", drawdown: -1.41 },
          { date: "2025-10-28", drawdown: -2.53 },
          { date: "2025-10-29", drawdown: -1.48 },
          { date: "2025-10-30", drawdown: -2.01 },
          { date: "2025-10-31", drawdown: -2.12 },
          { date: "2025-11-03", drawdown: -1.59 },
          { date: "2025-11-04", drawdown: -1.67 },
          { date: "2025-11-06", drawdown: -2.09 },
          { date: "2025-11-07", drawdown: -2.01 },
          { date: "2025-11-10", drawdown: -1.34 },
          { date: "2025-11-11", drawdown: -0.82 },
          { date: "2025-11-12", drawdown: -0.35 },
          { date: "2025-11-13", drawdown: 0.00 },
          { date: "2025-11-14", drawdown: -0.33 },
          { date: "2025-11-17", drawdown: -0.23 },
          { date: "2025-11-18", drawdown: -0.74 },
          { date: "2025-11-19", drawdown: -0.08 },
          { date: "2025-11-20", drawdown: 0.00 },
          { date: "2025-11-21", drawdown: -0.63 },
          { date: "2025-11-24", drawdown: -1.01 },
          { date: "2025-11-25", drawdown: -0.40 },
          { date: "2025-11-26", drawdown: 0.00 },
          { date: "2025-11-27", drawdown: 0.00 },
          { date: "2025-11-28", drawdown: 0.00 },
          { date: "2025-12-01", drawdown: -0.01 },
          { date: "2025-12-02", drawdown: -0.32 },
          { date: "2025-12-03", drawdown: -0.50 },
          { date: "2025-12-04", drawdown: -0.88 },
          { date: "2025-12-05", drawdown: -0.33 },
          { date: "2025-12-08", drawdown: -1.02 },
          { date: "2025-12-09", drawdown: 0.00 },
          { date: "2025-12-10", drawdown: -0.64 },
          { date: "2025-12-11", drawdown: -0.66 },
          { date: "2025-12-12", drawdown: 0.00 },
          { date: "2025-12-15", drawdown: 0.00 },
          { date: "2025-12-16", drawdown: -0.60 },
          { date: "2025-12-17", drawdown: -0.85 },
          { date: "2025-12-18", drawdown: -0.96 },
          { date: "2025-12-19", drawdown: -0.89 },
          { date: "2025-12-22", drawdown: -0.11 },
          { date: "2025-12-23", drawdown: 0.00 },
          { date: "2025-12-24", drawdown: 0.00 },
          { date: "2025-12-26", drawdown: 0.00 },
          { date: "2025-12-29", drawdown: -0.48 },
          { date: "2025-12-30", drawdown: -0.82 },
          { date: "2025-12-31", drawdown: -1.51 },
          { date: "2026-01-01", drawdown: -1.26 },
          { date: "2026-01-02", drawdown: -0.43 },
          { date: "2026-01-05", drawdown: -0.28 },
          { date: "2026-01-06", drawdown: -0.03 },
          { date: "2026-01-07", drawdown: -0.07 },
          { date: "2026-01-08", drawdown: -0.31 },
          { date: "2026-01-09", drawdown: -0.07 },
        ],
        quarterlyPnl: {
          "2025": {
            percent: { q1: "0", q2: "0", q3: "5.81", q4: "5.78", total: "11.93" },
            cash: { q1: "0", q2: "0", q3: "3073926.70", q4: "2887170.83", total: "5961097.53" },
            yearCash: "5961097.53",
          },
          "2026": {
            percent: { q1: "1.47", q2: "0", q3: "0", q4: "0", total: "1.47" },
            cash: { q1: "844339.77", q2: "0", q3: "0", q4: "0", total: "844339.77" },
            yearCash: "844339.77",
          },
        },
        monthlyPnl: {
          "2025": {
            months: {
              January: { percent: "-", cash: "-", capitalInOut: "-" },
              February: { percent: "-", cash: "-", capitalInOut: "-" },
              March: { percent: "-", cash: "-", capitalInOut: "-" },
              April: { percent: "-", cash: "-", capitalInOut: "-" },
              May: { percent: "-", cash: "-", capitalInOut: "-" },
              June: { percent: "-", cash: "-", capitalInOut: "-" },
              July: { percent: "-", cash: "-", capitalInOut: "-" },
              August: { percent: "1.24", cash: "790790.73", capitalInOut: "49999904.70" },
              September: { percent: "4.51", cash: "2283135.97", capitalInOut: "0" },
              October: { percent: "2.91", cash: "1535912.83", capitalInOut: "0" },
              November: { percent: "2.93", cash: "1595655.95", capitalInOut: "0" },
              December: { percent: "-0.13", cash: "-61942.29", capitalInOut: "0" },
            },
            totalPercent: 11.46,
            totalCash: 6143553.19,
            totalCapitalInOut: 49999904.70,
          },
          "2026": {
            months: {
              January: { percent: "1.47", cash: "844339.77", capitalInOut: "-56805342.00" },
              February: { percent: "-", cash: "-", capitalInOut: "-" },
              March: { percent: "-", cash: "-", capitalInOut: "-" },
              April: { percent: "-", cash: "-", capitalInOut: "-" },
              May: { percent: "-", cash: "-", capitalInOut: "-" },
              June: { percent: "-", cash: "-", capitalInOut: "-" },
              July: { percent: "-", cash: "-", capitalInOut: "-" },
              August: { percent: "-", cash: "-", capitalInOut: "-" },
              September: { percent: "-", cash: "-", capitalInOut: "-" },
              October: { percent: "-", cash: "-", capitalInOut: "-" },
              November: { percent: "-", cash: "-", capitalInOut: "-" },
              December: { percent: "-", cash: "-", capitalInOut: "-" },
            },
            totalPercent: 1.47,
            totalCash: 844339.77,
            totalCapitalInOut: -56805342.00,
          },
        },
        cashFlows: [
          { date: "2025-08-26", amount: 49999904.70, dividend: 0 },
          { date: "2026-01-09", amount: -56805342.00, dividend: 0 },
        ],
        strategyName: "Scheme QTF",
      },
      metadata: {
        icode: "Scheme QTF",
        accountCount: 1,
        lastUpdated: "2026-01-09T00:00:00.000Z",
        filtersApplied: { accountType: null, broker: null, startDate: null, endDate: null },
        inceptionDate: "2025-08-25",
        dataAsOfDate: "2026-01-09",
        strategyName: "Scheme QTF",
        isActive: false,
      },
    },
  };

  private static getPortfolioNames(accountCode: string, scheme: string): PortfolioConfig {
    return PORTFOLIO_MAPPING[accountCode]?.[scheme] || {
      current: "",
      metrics: "",
      nav: "",
      isActive: false,
    };
  }

  private static getSystemTag(scheme: string): string {
    return this.DINESH_SYSTEM_TAGS[scheme] || "Zerodha Total Portfolio";
  }

  private static normalizeDate(date: Date | string): string {
    if (typeof date === "string") return date.split("T")[0];
    return date.toISOString().split("T")[0];
  }

  // ==================== CSV-based Data Fetching Methods (READ-ONLY) ====================

  /**
   * Get total amount deposited for a scheme
   * READ-ONLY: Reads from CSV via DineshCsvDataSource
   */
  private static getAmountDeposited(scheme: string): number {
    // QTF is hardcoded and closed (net 0 for display)
    if (scheme === "Scheme QTF") {
      return 0;
    }

    // Total Portfolio: Combine QAW++ deposits (QTF is closed)
    if (scheme === "Total Portfolio") {
      return this.getAmountDeposited("Scheme QAW++");
    }

    // QAW++: Fetch from CSV (only from QAW start date onwards)
    const systemTag = this.getSystemTag(scheme);
    return DineshCsvDataSource.sumCapitalInOut(systemTag, this.QAW_START_DATE);
  }

  /**
   * Get latest exposure data for a scheme
   * READ-ONLY: Reads from CSV via DineshCsvDataSource
   */
  private static getLatestExposure(
    scheme: string
  ): { portfolioValue: number; drawdown: number; nav: number; date: Date } | null {
    // QTF is closed
    if (scheme === "Scheme QTF") {
      const hc = this.DINESH_HARDCODED_DATA["Scheme QTF"];
      return {
        portfolioValue: 0,
        drawdown: parseFloat(hc.data.drawdown),
        nav: hc.data.equityCurve.at(-1)?.nav || 0,
        date: new Date(hc.metadata.dataAsOfDate),
      };
    }

    // Total Portfolio: Use QAW++ current exposure
    if (scheme === "Total Portfolio") {
      return this.getLatestExposure("Scheme QAW++");
    }

    // QAW++: Fetch from CSV (only from QAW start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const record = DineshCsvDataSource.getLatestBySystemTag(systemTag, this.QAW_START_DATE);

    if (!record) return null;
    return {
      portfolioValue: record.portfolioValue,
      drawdown: Math.abs(record.drawdown),
      nav: record.nav,
      date: record.date,
    };
  }

  /**
   * Get historical data for a scheme
   * READ-ONLY: Reads from CSV via DineshCsvDataSource
   */
  private static getHistoricalData(
    scheme: string
  ): { date: Date; nav: number; drawdown: number; pnl: number; capitalInOut: number }[] {
    // QTF: Return hardcoded data
    if (scheme === "Scheme QTF") {
      const hc = this.DINESH_HARDCODED_DATA["Scheme QTF"];
      return hc.data.equityCurve.map((entry) => {
        const drawdownEntry = hc.data.drawdownCurve.find((d) => d.date === entry.date);
        return {
          date: new Date(entry.date),
          nav: entry.nav,
          drawdown: drawdownEntry?.drawdown || 0,
          pnl: 0,
          capitalInOut: 0,
        };
      });
    }

    // Total Portfolio: Combine QTF + QAW++ with NAV rebasing
    if (scheme === "Total Portfolio") {
      const qtfData = this.getHistoricalData("Scheme QTF");
      const qawData = this.getHistoricalData("Scheme QAW++");

      // Rebase QAW++ NAV to continue from QTF's final NAV
      const rebaseMultiplier = this.QTF_FINAL_NAV / 100;
      const rebasedQawData = qawData.map((entry) => ({
        ...entry,
        nav: entry.nav * rebaseMultiplier,
      }));

      // Combine: QTF data first, then QAW++ data
      return [...qtfData, ...rebasedQawData];
    }

    // QAW++: Fetch from CSV (only from QAW start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const data = DineshCsvDataSource.getBySystemTagAndDateRange(systemTag, this.QAW_START_DATE);

    const result = data.map((entry) => ({
      date: entry.date,
      nav: entry.nav,
      drawdown: Math.abs(entry.drawdown),
      pnl: entry.pnl,
      capitalInOut: entry.capitalInOut,
    }));

    // Add baseline point for QAW++ (day before first entry with NAV = 100)
    if (result.length > 0) {
      const firstDate = new Date(result[0].date);
      firstDate.setDate(firstDate.getDate() - 1);
      result.unshift({
        date: firstDate,
        nav: 100,
        drawdown: 0,
        pnl: 0,
        capitalInOut: 0,
      });
    }

    return result;
  }

  /**
   * Get cash flows for a scheme
   * READ-ONLY: Reads from CSV via DineshCsvDataSource
   */
  private static getCashFlows(scheme: string): CashFlow[] {
    // QTF: Return hardcoded cash flows
    if (scheme === "Scheme QTF") {
      return this.DINESH_HARDCODED_DATA["Scheme QTF"].data.cashFlows;
    }

    // Total Portfolio: Combine QTF + QAW++ cash flows
    if (scheme === "Total Portfolio") {
      const qtfCashFlows = this.getCashFlows("Scheme QTF");
      const qawCashFlows = this.getCashFlows("Scheme QAW++");
      return [...qtfCashFlows, ...qawCashFlows].sort((a, b) => a.date.localeCompare(b.date));
    }

    // QAW++: Fetch from CSV (only from QAW start date onwards)
    const systemTag = this.getSystemTag(scheme);
    const data = DineshCsvDataSource.getBySystemTagAndDateRange(systemTag, this.QAW_START_DATE);

    return data
      .filter((entry) => entry.capitalInOut !== 0)
      .map((entry) => ({
        date: this.normalizeDate(entry.date),
        amount: entry.capitalInOut,
        dividend: 0,
      }));
  }

  /**
   * Get total profit for a scheme
   * READ-ONLY: Reads from CSV via DineshCsvDataSource
   */
  private static getTotalProfit(scheme: string): number {
    // QTF: Return hardcoded profit
    if (scheme === "Scheme QTF") {
      return parseFloat(this.DINESH_HARDCODED_DATA["Scheme QTF"].data.totalProfit);
    }

    // Total Portfolio: Combine QTF + QAW++ profits
    if (scheme === "Total Portfolio") {
      const qtfProfit = this.getTotalProfit("Scheme QTF");
      const qawProfit = this.getTotalProfit("Scheme QAW++");
      return qtfProfit + qawProfit;
    }

    // QAW++: Calculate from CSV (only from QAW start date onwards)
    const systemTag = this.getSystemTag(scheme);
    return DineshCsvDataSource.sumPnl(systemTag, this.QAW_START_DATE);
  }

  private static calculateDrawdownMetrics(
    equityCurve: { date: string; nav: number }[]
  ): { mdd: number; currentDD: number; ddCurve: { date: string; value: number }[] } {
    if (equityCurve.length === 0) {
      return { mdd: 0, currentDD: 0, ddCurve: [] };
    }

    let peak = equityCurve[0].nav;
    let mdd = 0;
    const ddCurve: { date: string; value: number }[] = [];

    for (const point of equityCurve) {
      if (point.nav > peak) {
        peak = point.nav;
      }
      const drawdown = ((point.nav - peak) / peak) * 100;
      ddCurve.push({ date: point.date, value: drawdown });
      if (drawdown < mdd) {
        mdd = drawdown;
      }
    }

    const currentDD = ddCurve.length > 0 ? ddCurve[ddCurve.length - 1].value : 0;
    return { mdd, currentDD, ddCurve };
  }

  private static calculatePortfolioReturns(scheme: string): number {
    // QTF: Return hardcoded returns
    if (scheme === "Scheme QTF") {
      return parseFloat(this.DINESH_HARDCODED_DATA["Scheme QTF"].data.return);
    }

    const historicalData = this.getHistoricalData(scheme);
    if (historicalData.length < 2) return 0;

    const firstNav = historicalData[0].nav;
    const lastNav = historicalData[historicalData.length - 1].nav;
    const days =
      (historicalData[historicalData.length - 1].date.getTime() - historicalData[0].date.getTime()) /
      (1000 * 60 * 60 * 24);

    // Use absolute return for < 365 days, CAGR for >= 365 days
    if (days < 365) {
      return ((lastNav / firstNav) - 1) * 100;
    } else {
      return (Math.pow(lastNav / firstNav, 365 / days) - 1) * 100;
    }
  }

  private static calculateTrailingReturns(
    scheme: string,
    drawdownMetrics: { mdd: number; currentDD: number }
  ): Record<string, number | null | string> {
    // QTF: Return hardcoded trailing returns
    if (scheme === "Scheme QTF") {
      return this.DINESH_HARDCODED_DATA["Scheme QTF"].data.trailingReturns;
    }

    const historicalData = this.getHistoricalData(scheme);
    if (historicalData.length === 0) {
      return {
        "5d": null,
        "10d": null,
        "15d": null,
        "1m": null,
        "3m": null,
        "6m": null,
        "1y": null,
        "2y": null,
        "5y": null,
        sinceInception: null,
        MDD: drawdownMetrics.mdd,
        currentDD: drawdownMetrics.currentDD,
      };
    }

    const lastNav = historicalData[historicalData.length - 1].nav;
    const firstNav = historicalData[0].nav;

    const getTrailingReturn = (days: number): number | null => {
      if (historicalData.length <= days) return null;
      const pastNav = historicalData[historicalData.length - 1 - days]?.nav;
      if (!pastNav) return null;
      return ((lastNav / pastNav) - 1) * 100;
    };

    const sinceInception = ((lastNav / firstNav) - 1) * 100;

    return {
      "5d": getTrailingReturn(5),
      "10d": getTrailingReturn(10),
      "15d": getTrailingReturn(15),
      "1m": getTrailingReturn(21), // ~1 month of trading days
      "3m": getTrailingReturn(63), // ~3 months
      "6m": getTrailingReturn(126), // ~6 months
      "1y": getTrailingReturn(252), // ~1 year
      "2y": getTrailingReturn(504),
      "5y": getTrailingReturn(1260),
      sinceInception,
      MDD: drawdownMetrics.mdd,
      currentDD: drawdownMetrics.currentDD,
    };
  }

  private static calculateMonthlyPnL(scheme: string): MonthlyPnL {
    // QTF: Return hardcoded monthly PnL
    if (scheme === "Scheme QTF") {
      return this.DINESH_HARDCODED_DATA["Scheme QTF"].data.monthlyPnl;
    }

    // Total Portfolio: Combine QTF hardcoded + QAW++ calculated
    if (scheme === "Total Portfolio") {
      const qtfMonthlyPnl = this.DINESH_HARDCODED_DATA["Scheme QTF"].data.monthlyPnl;
      const qawMonthlyPnl = this.calculateMonthlyPnL("Scheme QAW++");

      // Merge: QTF has 2025 data, QAW++ has 2026+ data
      const combined: MonthlyPnL = { ...qtfMonthlyPnl };
      for (const year of Object.keys(qawMonthlyPnl)) {
        if (!combined[year]) {
          combined[year] = qawMonthlyPnl[year];
        } else {
          // Merge months if same year exists in both
          for (const month of Object.keys(qawMonthlyPnl[year].months)) {
            if (qawMonthlyPnl[year].months[month].percent !== "-") {
              combined[year].months[month] = qawMonthlyPnl[year].months[month];
            }
          }
          combined[year].totalPercent += qawMonthlyPnl[year].totalPercent;
          combined[year].totalCash += qawMonthlyPnl[year].totalCash;
          combined[year].totalCapitalInOut += qawMonthlyPnl[year].totalCapitalInOut;
        }
      }
      return combined;
    }

    // QAW++: Calculate from historical data
    const historicalData = this.getHistoricalData(scheme);
    const monthlyPnl: MonthlyPnL = {};
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    // Group data by year and month
    const grouped: Record<string, Record<string, { startNav: number; endNav: number; pnl: number; capitalInOut: number }>> = {};

    for (let i = 1; i < historicalData.length; i++) {
      const entry = historicalData[i];
      const date = new Date(entry.date);
      const year = date.getFullYear().toString();
      const month = monthNames[date.getMonth()];

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) {
        grouped[year][month] = {
          startNav: historicalData[i - 1]?.nav || entry.nav,
          endNav: entry.nav,
          pnl: entry.pnl,
          capitalInOut: entry.capitalInOut,
        };
      } else {
        grouped[year][month].endNav = entry.nav;
        grouped[year][month].pnl += entry.pnl;
        grouped[year][month].capitalInOut += entry.capitalInOut;
      }
    }

    // Format monthly PnL
    for (const year of Object.keys(grouped).sort()) {
      monthlyPnl[year] = {
        months: {},
        totalPercent: 0,
        totalCash: 0,
        totalCapitalInOut: 0,
      };

      for (const month of monthNames) {
        if (grouped[year]?.[month]) {
          const data = grouped[year][month];
          const percent = ((data.endNav / data.startNav) - 1) * 100;
          monthlyPnl[year].months[month] = {
            percent: percent.toFixed(2),
            cash: data.pnl.toFixed(2),
            capitalInOut: data.capitalInOut.toFixed(2),
          };
          monthlyPnl[year].totalPercent += percent;
          monthlyPnl[year].totalCash += data.pnl;
          monthlyPnl[year].totalCapitalInOut += data.capitalInOut;
        } else {
          monthlyPnl[year].months[month] = { percent: "-", cash: "-", capitalInOut: "-" };
        }
      }
    }

    return monthlyPnl;
  }

  private static calculateQuarterlyPnL(scheme: string): QuarterlyPnL {
    // QTF: Return hardcoded quarterly PnL
    if (scheme === "Scheme QTF") {
      return this.DINESH_HARDCODED_DATA["Scheme QTF"].data.quarterlyPnl;
    }

    // Total Portfolio: Combine QTF hardcoded + QAW++ calculated
    if (scheme === "Total Portfolio") {
      const qtfQuarterlyPnl = this.DINESH_HARDCODED_DATA["Scheme QTF"].data.quarterlyPnl;
      const qawQuarterlyPnl = this.calculateQuarterlyPnL("Scheme QAW++");

      // Merge: QTF has 2025 data, QAW++ has 2026+ data
      const combined: QuarterlyPnL = {};

      // Copy QTF data
      for (const year of Object.keys(qtfQuarterlyPnl)) {
        combined[year] = {
          percent: { ...qtfQuarterlyPnl[year].percent },
          cash: { ...qtfQuarterlyPnl[year].cash },
          yearCash: qtfQuarterlyPnl[year].yearCash,
        };
      }

      // Merge QAW++ data
      for (const year of Object.keys(qawQuarterlyPnl)) {
        if (!combined[year]) {
          combined[year] = qawQuarterlyPnl[year];
        } else {
          // Merge quarters if same year exists in both
          for (const q of ["q1", "q2", "q3", "q4"] as const) {
            const qawPercent = parseFloat(qawQuarterlyPnl[year].percent[q]) || 0;
            const qawCash = parseFloat(qawQuarterlyPnl[year].cash[q]) || 0;
            if (qawPercent !== 0 || qawCash !== 0) {
              const existingPercent = parseFloat(combined[year].percent[q]) || 0;
              const existingCash = parseFloat(combined[year].cash[q]) || 0;
              combined[year].percent[q] = (existingPercent + qawPercent).toFixed(2);
              combined[year].cash[q] = (existingCash + qawCash).toFixed(2);
            }
          }
          // Recalculate totals
          const totalPercent = ["q1", "q2", "q3", "q4"].reduce(
            (sum, q) => sum + (parseFloat(combined[year].percent[q as keyof typeof combined[string]["percent"]]) || 0),
            0
          );
          const totalCash = ["q1", "q2", "q3", "q4"].reduce(
            (sum, q) => sum + (parseFloat(combined[year].cash[q as keyof typeof combined[string]["cash"]]) || 0),
            0
          );
          combined[year].percent.total = totalPercent.toFixed(2);
          combined[year].cash.total = totalCash.toFixed(2);
          combined[year].yearCash = totalCash.toFixed(2);
        }
      }
      return combined;
    }

    // QAW++: Calculate from historical data
    const historicalData = this.getHistoricalData(scheme);
    const quarterlyPnl: QuarterlyPnL = {};

    // Group data by year and quarter
    const grouped: Record<string, Record<string, { startNav: number; endNav: number; pnl: number }>> = {};

    for (let i = 1; i < historicalData.length; i++) {
      const entry = historicalData[i];
      const date = new Date(entry.date);
      const year = date.getFullYear().toString();
      const quarter = `q${Math.floor(date.getMonth() / 3) + 1}`;

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][quarter]) {
        grouped[year][quarter] = {
          startNav: historicalData[i - 1]?.nav || entry.nav,
          endNav: entry.nav,
          pnl: entry.pnl,
        };
      } else {
        grouped[year][quarter].endNav = entry.nav;
        grouped[year][quarter].pnl += entry.pnl;
      }
    }

    // Format quarterly PnL
    for (const year of Object.keys(grouped).sort()) {
      quarterlyPnl[year] = {
        percent: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
        cash: { q1: "0", q2: "0", q3: "0", q4: "0", total: "0" },
        yearCash: "0",
      };

      let yearTotalPercent = 0;
      let yearTotalCash = 0;

      for (const q of ["q1", "q2", "q3", "q4"]) {
        if (grouped[year]?.[q]) {
          const data = grouped[year][q];
          const percent = ((data.endNav / data.startNav) - 1) * 100;
          quarterlyPnl[year].percent[q as keyof typeof quarterlyPnl[string]["percent"]] = percent.toFixed(2);
          quarterlyPnl[year].cash[q as keyof typeof quarterlyPnl[string]["cash"]] = data.pnl.toFixed(2);
          yearTotalPercent += percent;
          yearTotalCash += data.pnl;
        }
      }

      quarterlyPnl[year].percent.total = yearTotalPercent.toFixed(2);
      quarterlyPnl[year].cash.total = yearTotalCash.toFixed(2);
      quarterlyPnl[year].yearCash = yearTotalCash.toFixed(2);
    }

    return quarterlyPnl;
  }

  // ==================== Main GET Handler ====================

  public static async GET(request: Request): Promise<NextResponse> {
    const accountCode = "AC9";

    try {
      const results: Record<string, PortfolioResponse> = {};

      // Order: Total Portfolio → Scheme QAW++ → Scheme QTF
      const schemes = ["Total Portfolio", "Scheme QAW++", "Scheme QTF"];

      for (const scheme of schemes) {
        const portfolioNames = PortfolioApiCsv.getPortfolioNames(accountCode, scheme);

        // For hardcoded schemes (QTF), use cached data
        if (scheme === "Scheme QTF") {
          const hardcodedData = PortfolioApiCsv.DINESH_HARDCODED_DATA[scheme];
          results[scheme] = {
            data: hardcodedData.data,
            metadata: {
              ...hardcodedData.metadata,
              isActive: portfolioNames.isActive,
            },
          };
          continue;
        }

        // For dynamic schemes (QAW++, Total Portfolio), fetch/calculate data from CSV
        const investedAmount = PortfolioApiCsv.getAmountDeposited(scheme);
        const latestExposure = PortfolioApiCsv.getLatestExposure(scheme);
        const totalProfit = PortfolioApiCsv.getTotalProfit(scheme);
        const returns = PortfolioApiCsv.calculatePortfolioReturns(scheme);
        const historicalData = PortfolioApiCsv.getHistoricalData(scheme);
        const cashFlows = PortfolioApiCsv.getCashFlows(scheme);

        const equityCurve = historicalData.map((d) => ({
          date: PortfolioApiCsv.normalizeDate(d.date),
          nav: d.nav,
        }));

        const drawdownMetrics = PortfolioApiCsv.calculateDrawdownMetrics(equityCurve);
        const trailingReturns = PortfolioApiCsv.calculateTrailingReturns(scheme, drawdownMetrics);
        const monthlyPnl = PortfolioApiCsv.calculateMonthlyPnL(scheme);
        const quarterlyPnl = PortfolioApiCsv.calculateQuarterlyPnL(scheme);

        const portfolioData: PortfolioData = {
          amountDeposited: investedAmount.toFixed(2),
          currentExposure: latestExposure?.portfolioValue.toFixed(2) || "0",
          return: returns.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          trailingReturns,
          drawdown: drawdownMetrics.currentDD.toFixed(2),
          maxDrawdown: drawdownMetrics.mdd.toFixed(2),
          equityCurve,
          drawdownCurve: drawdownMetrics.ddCurve.map((d) => ({ date: d.date, drawdown: d.value })),
          quarterlyPnl,
          monthlyPnl,
          cashFlows,
          strategyName: scheme,
        };

        const metadata: Metadata = {
          icode: scheme,
          accountCount: 1,
          lastUpdated: new Date().toISOString(),
          filtersApplied: {
            accountType: null,
            broker: null,
            startDate: null,
            endDate: null,
          },
          inceptionDate: historicalData.length > 0 ? PortfolioApiCsv.normalizeDate(historicalData[0].date) : "2025-08-25",
          dataAsOfDate: latestExposure?.date.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
          strategyName: scheme,
          isActive: portfolioNames.isActive,
        };

        results[scheme] = { data: portfolioData, metadata };
      }

      return NextResponse.json(results, { status: 200 });
    } catch (error) {
      console.error("Dinesh Portfolio CSV API Error:", error);
      return NextResponse.json(
        {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }
}
