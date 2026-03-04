/**
 * AUM Extraction Script
 *
 * Calculates AUM (Assets Under Management) on a daily, monthly, and quarterly
 * basis since inception for all managed_account accounts.
 *
 * Uses master_sheet table with two system tags:
 *   1. 'Zerodha Total Portfolio' → portfolio_value as AUM (primary)
 *   2. 'Total Portfolio Exposure' → portfolio_value as AUM (fallback 1)
 *   3. 'Total Portfolio Value' → exposure_value as AUM (fallback 2)
 *
 * THIS SCRIPT IS READ-ONLY - NO DATABASE MODIFICATIONS
 * All queries are SELECT operations only (findMany).
 *
 * Run with: npx ts-node scripts/aum-extraction.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const PRIMARY_TAG = "Zerodha Total Portfolio";
const FALLBACK_TAG_1 = "Total Portfolio Exposure";
const FALLBACK_TAG_2 = "Total Portfolio Value";

type AccountClassification = "managed_account" | "prop" | "pms";

// Actual classification of accounts (all have account_type 'managed_account' in DB)
const ACCOUNT_CLASSIFICATION: Record<string, AccountClassification> = {
  // Managed accounts
  QAC00022: "managed_account", // Deepti Parikh
  QAC00026: "managed_account", // Harsh Munshaw
  QAC00040: "managed_account", // Shilpa Poddar
  QAC00041: "managed_account", // Sarla Performance Fibers
  QAC00043: "managed_account", // Vikram Trading Company
  QAC00046: "managed_account", // Satidham Industries
  QAC00053: "managed_account", // Dinesh Goel
  QAC00055: "managed_account", // Krishnan Iyer HUF
  QAC00056: "managed_account", // Bharat Shah
  QAC00064: "managed_account", // Mangesh Hirve
  QAC00065: "managed_account", // Radiance FPI
  QAC00066: "managed_account", // Satidham Industries Private Limited
  QAC00069: "managed_account", // Sakshi Maheshwari
  QAC00070: "managed_account", // sati
  QAC00071: "managed_account", // Arwani Research Services Pvt Ltd
  QAC00072: "managed_account", // Suresh Somani
  QAC00073: "managed_account", // Ashika Prop
  QAC00074: "managed_account", // Ashit Jhaveri
  QAC00083: "managed_account", // Ashwin Agarwal

  // Prop accounts
  QAC00063: "prop", // Affluence Prop
  QAC00067: "prop", // Affluence High Risk
  QAC00068: "prop", // Affluence High Risk 2
  QAC00075: "prop", // Affluence High Risk 3
  QAC00076: "prop", // Swan Prop Live XTS 4
  QAC00077: "prop", // Swan Team
  QAC00079: "prop", // Salecha Capital
  QAC00080: "prop", // Marwadi FPI
  QAC00081: "prop", // Kavan Marwadi Prop
  QAC00082: "prop", // Qode Advisors PMS Zerodha

  // PMS (classified as managed_account in DB)
  QAC00058: "pms", // QodePMS
};

interface AccountInfo {
  qcode: string;
  account_name: string;
  broker: string;
  strategy: string | null;
  aumTag?: string; // which system_tag was used for this account
  classification?: AccountClassification;
}

interface DailyAccountAUM {
  qcode: string;
  accountName: string;
  value: number;
}

interface DailyAUM {
  date: string;
  total: number;
  accounts: DailyAccountAUM[];
}

function formatCurrency(value: number): string {
  if (value >= 1_00_00_000) {
    return `${(value / 1_00_00_000).toFixed(2)} Cr`;
  } else if (value >= 1_00_000) {
    return `${(value / 1_00_000).toFixed(2)} L`;
  }
  return value.toFixed(2);
}

function getQuarter(month: number): string {
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

async function getManagedAccounts(): Promise<AccountInfo[]> {
  const accounts = await prisma.accounts.findMany({
    where: { account_type: "managed_account" },
    select: {
      qcode: true,
      account_name: true,
      broker: true,
      strategy: true,
    },
    orderBy: { qcode: "asc" },
  });

  return accounts;
}

interface AUMDataResult {
  dateMap: Map<string, number>;
  tag: string | null; // which tag was used, null if no data
}

async function getAccountAUMData(qcode: string): Promise<AUMDataResult> {
  // Try primary tag first: Zerodha Total Portfolio → portfolio_value
  const primaryRows = await prisma.master_sheet.findMany({
    where: {
      qcode,
      system_tag: PRIMARY_TAG,
      portfolio_value: { not: null },
    },
    select: {
      date: true,
      portfolio_value: true,
    },
    orderBy: { date: "asc" },
  });

  if (primaryRows.length > 0) {
    const dateMap = new Map<string, number>();
    for (const row of primaryRows) {
      const dateStr = row.date.toISOString().slice(0, 10);
      dateMap.set(dateStr, Number(row.portfolio_value));
    }
    return { dateMap, tag: PRIMARY_TAG };
  }

  // Fallback 1: Total Portfolio Exposure → portfolio_value
  const fallback1Rows = await prisma.master_sheet.findMany({
    where: {
      qcode,
      system_tag: FALLBACK_TAG_1,
      portfolio_value: { not: null },
    },
    select: {
      date: true,
      portfolio_value: true,
    },
    orderBy: { date: "asc" },
  });

  if (fallback1Rows.length > 0) {
    const dateMap = new Map<string, number>();
    for (const row of fallback1Rows) {
      const dateStr = row.date.toISOString().slice(0, 10);
      dateMap.set(dateStr, Number(row.portfolio_value));
    }
    return { dateMap, tag: FALLBACK_TAG_1 };
  }

  // Fallback 2: Total Portfolio Value → exposure_value
  const fallback2Rows = await prisma.master_sheet.findMany({
    where: {
      qcode,
      system_tag: FALLBACK_TAG_2,
      exposure_value: { not: null },
    },
    select: {
      date: true,
      exposure_value: true,
    },
    orderBy: { date: "asc" },
  });

  if (fallback2Rows.length > 0) {
    const dateMap = new Map<string, number>();
    for (const row of fallback2Rows) {
      const dateStr = row.date.toISOString().slice(0, 10);
      dateMap.set(dateStr, Number(row.exposure_value));
    }
    return { dateMap, tag: FALLBACK_TAG_2 };
  }

  return { dateMap: new Map(), tag: null };
}

function buildDailyAUM(
  accounts: AccountInfo[],
  accountDataMap: Map<string, Map<string, number>>
): DailyAUM[] {
  // Collect all unique dates
  const allDates = new Set<string>();
  for (const [, dateMap] of accountDataMap) {
    for (const date of dateMap.keys()) {
      allDates.add(date);
    }
  }

  const sortedDates = Array.from(allDates).sort();

  const dailyAUM: DailyAUM[] = [];

  for (const date of sortedDates) {
    let total = 0;
    const accountBreakdown: DailyAccountAUM[] = [];

    for (const account of accounts) {
      const dateMap = accountDataMap.get(account.qcode);
      const value = dateMap?.get(date);
      if (value !== undefined) {
        total += value;
        accountBreakdown.push({
          qcode: account.qcode,
          accountName: account.account_name,
          value,
        });
      }
    }

    if (accountBreakdown.length > 0) {
      dailyAUM.push({ date, total, accounts: accountBreakdown });
    }
  }

  return dailyAUM;
}

function deriveMonthlyAUM(dailyAUM: DailyAUM[]): DailyAUM[] {
  // Group by YYYY-MM, take last available day of each month
  const monthMap = new Map<string, DailyAUM>();

  for (const day of dailyAUM) {
    const monthKey = day.date.slice(0, 7); // YYYY-MM
    monthMap.set(monthKey, day); // Overwrites with later date since dailyAUM is sorted
  }

  return Array.from(monthMap.values());
}

function deriveQuarterlyAUM(dailyAUM: DailyAUM[]): DailyAUM[] {
  // Group by YYYY-Q#, take last available day of each quarter
  const quarterMap = new Map<string, DailyAUM>();

  for (const day of dailyAUM) {
    const d = new Date(day.date);
    const month = d.getMonth() + 1;
    const quarterKey = `${d.getFullYear()}-${getQuarter(month)}`;
    quarterMap.set(quarterKey, day); // Overwrites with later date since dailyAUM is sorted
  }

  return Array.from(quarterMap.values());
}

function printHeader(title: string) {
  console.log("\n" + "=".repeat(100));
  console.log(title);
  console.log("=".repeat(100));
}

function printSummaryTable(
  data: DailyAUM[],
  accounts: AccountInfo[],
  label: string
) {
  if (data.length === 0) {
    console.log(`  No ${label} data available.`);
    return;
  }

  // Header row
  const accountHeaders = accounts
    .filter((a) => {
      // Only include accounts that appear in at least one row
      return data.some((d) => d.accounts.some((da) => da.qcode === a.qcode));
    })
    .map((a) => a.qcode);

  const headerLine = [
    "Date".padEnd(12),
    "Total AUM".padStart(15),
    ...accountHeaders.map((q) => q.padStart(15)),
  ].join(" | ");

  console.log(headerLine);
  console.log("-".repeat(headerLine.length));

  for (const row of data) {
    const accountValues = accountHeaders.map((qcode) => {
      const acc = row.accounts.find((a) => a.qcode === qcode);
      return acc ? formatCurrency(acc.value).padStart(15) : "-".padStart(15);
    });

    const line = [
      row.date.padEnd(12),
      formatCurrency(row.total).padStart(15),
      ...accountValues,
    ].join(" | ");

    console.log(line);
  }
}

function buildSheetData(
  data: DailyAUM[],
  accounts: AccountInfo[]
): (string | number)[][] {
  const relevantAccounts = accounts.filter((a) =>
    data.some((d) => d.accounts.some((da) => da.qcode === a.qcode))
  );

  const header = [
    "Date",
    "Total AUM",
    ...relevantAccounts.map((a) => `${a.qcode} (${a.account_name})`),
  ];

  const rows = data.map((row) => {
    const accountValues = relevantAccounts.map((a) => {
      const acc = row.accounts.find((da) => da.qcode === a.qcode);
      return acc ? acc.value : "";
    });
    return [row.date, row.total, ...accountValues] as (string | number)[];
  });

  return [header, ...rows];
}

async function main() {
  printHeader("AUM EXTRACTION - Managed Accounts");
  console.log(`Primary Tag: "${PRIMARY_TAG}" (uses portfolio_value)`);
  console.log(`Fallback 1:  "${FALLBACK_TAG_1}" (uses portfolio_value)`);
  console.log(`Fallback 2:  "${FALLBACK_TAG_2}" (uses exposure_value)`);
  console.log("All queries are READ-ONLY (SELECT only)\n");

  // Step 1: Get all managed accounts
  console.log("Fetching managed accounts...");
  const accounts = await getManagedAccounts();
  console.log(`Found ${accounts.length} managed accounts:\n`);

  // Attach classification
  for (const acc of accounts) {
    acc.classification = ACCOUNT_CLASSIFICATION[acc.qcode] || "managed_account";
  }

  for (const acc of accounts) {
    console.log(
      `  ${acc.qcode} | ${acc.account_name} | ${acc.classification} | ${acc.broker} | ${acc.strategy || "-"}`
    );
  }

  // Step 2: Fetch daily AUM data per account
  console.log("\nFetching AUM data per account...");
  const accountDataMap = new Map<string, Map<string, number>>();
  const accountsWithData: AccountInfo[] = [];
  const accountsWithNoData: AccountInfo[] = [];

  for (const account of accounts) {
    const { dateMap, tag } = await getAccountAUMData(account.qcode);
    if (dateMap.size > 0) {
      accountDataMap.set(account.qcode, dateMap);
      accountsWithData.push({ ...account, aumTag: tag! });
      const dates = Array.from(dateMap.keys()).sort();
      console.log(
        `  ${account.qcode} (${account.classification}): ${dateMap.size} days (${dates[0]} to ${dates[dates.length - 1]}) [${tag}]`
      );
    } else {
      accountsWithNoData.push(account);
      console.log(
        `  ${account.qcode} (${account.classification}): No data with any AUM tag`
      );
    }
  }

  // Report accounts with no AUM data
  if (accountsWithNoData.length > 0) {
    console.log(
      `\nACCOUNTS WITH NO AUM DATA (${accountsWithNoData.length}):`
    );
    for (const acc of accountsWithNoData) {
      console.log(
        `  ${acc.qcode} | ${acc.account_name} | ${acc.classification} | ${acc.broker} | ${acc.strategy || "-"}`
      );
    }
  }

  if (accountsWithData.length === 0) {
    console.log("\nNo AUM data found for any managed account. Exiting.");
    return;
  }

  // Step 3: Build daily aggregation
  const dailyAUM = buildDailyAUM(accountsWithData, accountDataMap);
  const inceptionDate = dailyAUM[0]?.date || "N/A";
  const latestDate = dailyAUM[dailyAUM.length - 1]?.date || "N/A";

  console.log(`\nInception date: ${inceptionDate}`);
  console.log(`Latest date:   ${latestDate}`);
  console.log(`Total trading days: ${dailyAUM.length}`);

  // Step 4: Monthly view
  const monthlyAUM = deriveMonthlyAUM(dailyAUM);
  printHeader(`MONTHLY AUM (${monthlyAUM.length} months)`);
  printSummaryTable(monthlyAUM, accountsWithData, "monthly");

  // Step 5: Quarterly view
  const quarterlyAUM = deriveQuarterlyAUM(dailyAUM);
  printHeader(`QUARTERLY AUM (${quarterlyAUM.length} quarters)`);
  printSummaryTable(quarterlyAUM, accountsWithData, "quarterly");

  // Step 6: Daily view (last 30 days only to keep console readable)
  const recentDaily = dailyAUM.slice(-30);
  printHeader(`DAILY AUM (last 30 trading days of ${dailyAUM.length} total)`);
  printSummaryTable(recentDaily, accountsWithData, "daily");

  // Step 7: Export CSV for managed_account classified accounts only
  const managedOnly = accountsWithData.filter(
    (a) => a.classification === "managed_account"
  );
  const managedDataMap = new Map<string, Map<string, number>>();
  for (const acc of managedOnly) {
    const data = accountDataMap.get(acc.qcode);
    if (data) managedDataMap.set(acc.qcode, data);
  }

  const managedDailyAUM = buildDailyAUM(managedOnly, managedDataMap);
  const managedMonthlyAUM = deriveMonthlyAUM(managedDailyAUM);
  const managedQuarterlyAUM = deriveQuarterlyAUM(managedDailyAUM);

  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  printHeader("EXCEL EXPORT (managed_account only)");
  console.log(`  Accounts included: ${managedOnly.length}`);

  const wb = XLSX.utils.book_new();

  const dailySheet = XLSX.utils.aoa_to_sheet(
    buildSheetData(managedDailyAUM, managedOnly)
  );
  const monthlySheet = XLSX.utils.aoa_to_sheet(
    buildSheetData(managedMonthlyAUM, managedOnly)
  );
  const quarterlySheet = XLSX.utils.aoa_to_sheet(
    buildSheetData(managedQuarterlyAUM, managedOnly)
  );

  XLSX.utils.book_append_sheet(wb, dailySheet, "Daily");
  XLSX.utils.book_append_sheet(wb, monthlySheet, "Monthly");
  XLSX.utils.book_append_sheet(wb, quarterlySheet, "Quarterly");

  const excelPath = path.join(outputDir, "managed_aum.xlsx");
  XLSX.writeFile(wb, excelPath);
  console.log(`  Saved: ${excelPath}`);

  console.log(
    "\n" +
      "=".repeat(100) +
      "\nDone. All data above is read-only — no database modifications were made.\n"
  );
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
