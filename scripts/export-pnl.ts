/**
 * Pre-compute Monthly & Quarterly PnL for all accounts and export to CSV.
 *
 * Imports and calls the same calculation functions used by the live dashboard,
 * so the output is identical to what clients see.
 *
 * Run with:
 *   NODE_ENV=production npx tsx -r tsconfig-paths/register scripts/export-pnl.ts
 *
 * Or with the npm script:
 *   npm run export-pnl
 *
 * Optional: pass --icode QUS0001 to compute for a single client only.
 *
 * SAFETY: This script is READ-ONLY — no writes to the database.
 */

import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import {
  getUserQcodes,
  calculatePortfolioMetrics,
} from "../app/lib/portfolio-utils";
import { PortfolioApi as SarlaPortfolioApi } from "../app/lib/sarla-utils";
import { PortfolioApi as DineshPortfolioApi } from "../app/lib/dinesh-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonthlyRow {
  identifier: string;
  scheme_or_strategy: string;
  year: string;
  month: number;
  percent: string;
  cash: string;
  capital_in_out: string;
}

interface QuarterlyRow {
  identifier: string;
  scheme_or_strategy: string;
  year: string;
  quarter: number;
  percent: string;
  cash: string;
}

interface YearlyRow {
  identifier: string;
  scheme_or_strategy: string;
  year: string;
  total_percent: string;
  total_cash: string;
  total_capital_in_out: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAME_TO_NUM: Record<string, number> = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};

const SPECIAL_ICODES = new Set(["QUS0007", "QUS0010", "QUS00072"]);

function clean(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s === "-" || s === "NaN" || s === "undefined" || s === "null") return "";
  return s;
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function writeCSV(
  filePath: string,
  headers: string[],
  rows: string[][]
): void {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  console.log(`  Wrote ${rows.length} rows to ${path.basename(filePath)}`);
}

// ---------------------------------------------------------------------------
// Extractors — pull monthly/quarterly/yearly rows from Stats-shaped objects
// ---------------------------------------------------------------------------

function extractMonthlyRows(
  identifier: string,
  strategy: string,
  monthlyPnl: any
): MonthlyRow[] {
  const rows: MonthlyRow[] = [];
  if (!monthlyPnl) return rows;

  for (const year of Object.keys(monthlyPnl).sort()) {
    const yearData = monthlyPnl[year];
    if (!yearData?.months) continue;

    for (const [monthName, data] of Object.entries<any>(yearData.months)) {
      const monthNum = MONTH_NAME_TO_NUM[monthName];
      if (!monthNum) continue;
      rows.push({
        identifier,
        scheme_or_strategy: strategy,
        year,
        month: monthNum,
        percent: clean(data.percent),
        cash: clean(data.cash),
        capital_in_out: clean(data.capitalInOut),
      });
    }
  }

  // Sort by year then month
  rows.sort((a, b) => {
    const yd = Number(a.year) - Number(b.year);
    return yd !== 0 ? yd : a.month - b.month;
  });

  return rows;
}

function extractQuarterlyRows(
  identifier: string,
  strategy: string,
  quarterlyPnl: any
): QuarterlyRow[] {
  const rows: QuarterlyRow[] = [];
  if (!quarterlyPnl) return rows;

  for (const year of Object.keys(quarterlyPnl).sort()) {
    const yearData = quarterlyPnl[year];
    if (!yearData?.percent) continue;

    for (let q = 1; q <= 4; q++) {
      const key = `q${q}`;
      rows.push({
        identifier,
        scheme_or_strategy: strategy,
        year,
        quarter: q,
        percent: clean(yearData.percent?.[key]),
        cash: clean(yearData.cash?.[key]),
      });
    }
  }

  return rows;
}

function extractYearlyRows(
  identifier: string,
  strategy: string,
  monthlyPnl: any,
  quarterlyPnl: any
): YearlyRow[] {
  const rows: YearlyRow[] = [];
  if (!monthlyPnl) return rows;

  for (const year of Object.keys(monthlyPnl).sort()) {
    const yearData = monthlyPnl[year];
    // Prefer compounded percent from quarterly total if available
    const qTotal = quarterlyPnl?.[year]?.percent?.total;
    rows.push({
      identifier,
      scheme_or_strategy: strategy,
      year,
      total_percent: clean(qTotal ?? yearData?.totalPercent),
      total_cash: clean(yearData?.totalCash),
      total_capital_in_out: clean(yearData?.totalCapitalInOut),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  const prisma = new PrismaClient();

  // Parse CLI args
  const icodeArg = process.argv.indexOf("--icode");
  const filterIcode =
    icodeArg !== -1 ? process.argv[icodeArg + 1] : undefined;

  const allMonthly: MonthlyRow[] = [];
  const allQuarterly: QuarterlyRow[] = [];
  const allYearly: YearlyRow[] = [];

  let processed = 0;
  let failed = 0;
  const failedList: string[] = [];

  try {
    // ------------------------------------------------------------------
    // 1. Enumerate all icodes
    // ------------------------------------------------------------------
    const allClients = await prisma.pooled_account_users.findMany({
      select: { icode: true },
      distinct: ["icode"],
    });
    let icodes = allClients.map((c) => c.icode).filter(Boolean) as string[];

    if (filterIcode) {
      icodes = icodes.filter((ic) => ic === filterIcode);
      if (icodes.length === 0 && SPECIAL_ICODES.has(filterIcode)) {
        icodes = [filterIcode]; // allow filtering to a special user
      }
      if (icodes.length === 0) {
        console.error(`No account found for icode: ${filterIcode}`);
        return;
      }
    }

    const regularIcodes = icodes.filter((ic) => !SPECIAL_ICODES.has(ic));
    console.log(
      `Found ${icodes.length} total icodes (${regularIcodes.length} regular, ${icodes.filter((ic) => SPECIAL_ICODES.has(ic)).length} special)`
    );

    // ------------------------------------------------------------------
    // 2. Regular accounts
    // ------------------------------------------------------------------
    for (const icode of regularIcodes) {
      try {
        console.log(
          `[${processed + 1}/${regularIcodes.length}] Processing ${icode}...`
        );
        const qcodes = await getUserQcodes(icode);
        if (!qcodes.length) {
          console.log(`  No qcodes found, skipping`);
          processed++;
          continue;
        }

        const stats = await calculatePortfolioMetrics(qcodes);
        if (!stats) {
          console.log(`  No stats returned, skipping`);
          processed++;
          continue;
        }

        const strategy = stats.strategyName || "Unknown";
        allMonthly.push(
          ...extractMonthlyRows(icode, strategy, stats.monthlyPnl)
        );
        allQuarterly.push(
          ...extractQuarterlyRows(icode, strategy, stats.quarterlyPnl)
        );
        allYearly.push(
          ...extractYearlyRows(
            icode,
            strategy,
            stats.monthlyPnl,
            stats.quarterlyPnl
          )
        );
        processed++;
      } catch (err: any) {
        console.error(`  ERROR processing ${icode}: ${err.message}`);
        failed++;
        failedList.push(icode);
      }
    }

    // ------------------------------------------------------------------
    // 3. Special users — Sarla & Satidham
    // ------------------------------------------------------------------
    const sarlaConfigs = [
      { icode: "QUS0007", qcode: "QAC00041", label: "Sarla" },
      { icode: "QUS0010", qcode: "QAC00046", label: "Satidham" },
    ];

    for (const cfg of sarlaConfigs) {
      if (filterIcode && filterIcode !== cfg.icode) continue;
      try {
        console.log(`Processing ${cfg.label} (${cfg.icode})...`);
        const req = new Request(
          `http://localhost/api/sarla-api?qcode=${cfg.qcode}`
        );
        const res = await SarlaPortfolioApi.GET(req);
        const data = await res.json();

        for (const [scheme, entry] of Object.entries<any>(data)) {
          const portfolioData = entry?.data;
          if (!portfolioData) continue;

          allMonthly.push(
            ...extractMonthlyRows(cfg.icode, scheme, portfolioData.monthlyPnl)
          );
          allQuarterly.push(
            ...extractQuarterlyRows(
              cfg.icode,
              scheme,
              portfolioData.quarterlyPnl
            )
          );
          allYearly.push(
            ...extractYearlyRows(
              cfg.icode,
              scheme,
              portfolioData.monthlyPnl,
              portfolioData.quarterlyPnl
            )
          );
        }
        processed++;
        console.log(
          `  ${cfg.label}: ${Object.keys(data).length} schemes extracted`
        );
      } catch (err: any) {
        console.error(
          `  ERROR processing ${cfg.label} (${cfg.icode}): ${err.message}`
        );
        failed++;
        failedList.push(cfg.icode);
      }
    }

    // ------------------------------------------------------------------
    // 4. Special user — Dinesh
    // ------------------------------------------------------------------
    if (!filterIcode || filterIcode === "QUS00072") {
      try {
        console.log(`Processing Dinesh (QUS00072)...`);
        const req = new Request(
          `http://localhost/api/dinesh-api?qcode=QAC00053`
        );
        const res = await DineshPortfolioApi.GET(req);
        const data = await res.json();

        for (const [scheme, entry] of Object.entries<any>(data)) {
          const portfolioData = entry?.data;
          if (!portfolioData) continue;

          allMonthly.push(
            ...extractMonthlyRows("QUS00072", scheme, portfolioData.monthlyPnl)
          );
          allQuarterly.push(
            ...extractQuarterlyRows(
              "QUS00072",
              scheme,
              portfolioData.quarterlyPnl
            )
          );
          allYearly.push(
            ...extractYearlyRows(
              "QUS00072",
              scheme,
              portfolioData.monthlyPnl,
              portfolioData.quarterlyPnl
            )
          );
        }
        processed++;
        console.log(
          `  Dinesh: ${Object.keys(data).length} schemes extracted`
        );
      } catch (err: any) {
        console.error(`  ERROR processing Dinesh (QUS00072): ${err.message}`);
        failed++;
        failedList.push("QUS00072");
      }
    }

    // ------------------------------------------------------------------
    // 5. Write CSVs
    // ------------------------------------------------------------------
    if (allMonthly.length === 0 && allQuarterly.length === 0) {
      console.error("No data extracted. Aborting CSV write.");
      process.exit(1);
    }

    const outDir = path.join(__dirname, "..", "data", "pnl-export");
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`\nWriting CSVs to ${outDir}/`);

    writeCSV(
      path.join(outDir, "monthly_pnl.csv"),
      [
        "identifier",
        "scheme_or_strategy",
        "year",
        "month",
        "percent",
        "cash",
        "capital_in_out",
      ],
      allMonthly.map((r) => [
        r.identifier,
        r.scheme_or_strategy,
        r.year,
        String(r.month),
        r.percent,
        r.cash,
        r.capital_in_out,
      ])
    );

    writeCSV(
      path.join(outDir, "quarterly_pnl.csv"),
      [
        "identifier",
        "scheme_or_strategy",
        "year",
        "quarter",
        "percent",
        "cash",
      ],
      allQuarterly.map((r) => [
        r.identifier,
        r.scheme_or_strategy,
        r.year,
        String(r.quarter),
        r.percent,
        r.cash,
      ])
    );

    writeCSV(
      path.join(outDir, "yearly_summary.csv"),
      [
        "identifier",
        "scheme_or_strategy",
        "year",
        "total_percent",
        "total_cash",
        "total_capital_in_out",
      ],
      allYearly.map((r) => [
        r.identifier,
        r.scheme_or_strategy,
        r.year,
        r.total_percent,
        r.total_cash,
        r.total_capital_in_out,
      ])
    );

    // ------------------------------------------------------------------
    // 6. Summary
    // ------------------------------------------------------------------
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n--- Summary ---`);
    console.log(`Processed: ${processed} accounts/users`);
    console.log(`Failed: ${failed}${failedList.length ? ` (${failedList.join(", ")})` : ""}`);
    console.log(
      `Rows: ${allMonthly.length} monthly, ${allQuarterly.length} quarterly, ${allYearly.length} yearly`
    );
    console.log(`Time: ${elapsed}s`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
