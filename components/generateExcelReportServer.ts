/**
 * Server-side Excel buffer generator.
 * Mirrors the structure of generateExcelReport.ts but returns a Buffer
 * instead of triggering a browser download. No DOM/browser APIs used.
 *
 * Keep this file in sync with generateExcelReport.ts if the layout changes.
 */

import * as XLSX from "xlsx-js-style";
import JSZip from "jszip";

// ============================================================================
// Types (duplicated from generateExcelReport.ts — do not import from there
// to avoid pulling in browser-only code paths in server bundles)
// ============================================================================

interface MonthData {
  percent: string;
  cash: string;
  capitalInOut?: string;
}

interface MonthlyPnlYear {
  months: { [month: string]: MonthData };
  totalPercent: number | string;
  totalCash: number;
  totalCapitalInOut?: number;
}

interface QuarterData {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  total?: string;
}

interface QuarterlyPnlYear {
  percent: QuarterData;
  cash: QuarterData;
  yearCash?: string;
}

interface CombinedTrailingPeriod {
  portfolio: string | number | null;
  benchmark: string | number | null;
}

export interface ServerExcelInput {
  strategyName: string;
  isTotalPortfolio: boolean;
  hasNavBasedTotalPortfolio?: boolean;
  isActive: boolean;
  clientName: string;
  dataAsOfDate?: string | null;
  accountInfo?: {
    accountName: string;
    accountType: string;
    broker: string;
  };
  metrics: {
    amountDeposited: number;
    currentExposure: number;
    totalProfit: number;
    totalReturn: number;
  };
  trailingReturns: Record<string, unknown>;
  cashFlows: { date: string; amount: number }[];
  monthlyPnl: { [year: string]: MonthlyPnlYear } | null;
  quarterlyPnl: { [year: string]: QuarterlyPnlYear } | null;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(d: Date | string | null): string {
  if (!d) return "N/A";
  const dateObj = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return "N/A";
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

function getTrailing(tr: Record<string, unknown>, longKey: string, shortKey: string): string | number | null {
  const v = tr[longKey] ?? tr[shortKey];
  return v !== undefined && v !== null ? (v as string | number) : null;
}

function buildCombinedTrailing(tr: Record<string, unknown>) {
  return {
    fiveDays:      { portfolio: getTrailing(tr, "fiveDays",      "5d"),            benchmark: null },
    tenDays:       { portfolio: getTrailing(tr, "tenDays",       "10d"),           benchmark: null },
    fifteenDays:   { portfolio: getTrailing(tr, "fifteenDays",   "15d"),           benchmark: null },
    oneMonth:      { portfolio: getTrailing(tr, "oneMonth",      "1m"),            benchmark: null },
    threeMonths:   { portfolio: getTrailing(tr, "threeMonths",   "3m"),            benchmark: null },
    sixMonths:     { portfolio: getTrailing(tr, "sixMonths",     "6m"),            benchmark: null },
    oneYear:       { portfolio: getTrailing(tr, "oneYear",       "1y"),            benchmark: null },
    twoYears:      { portfolio: getTrailing(tr, "twoYears",      "2y"),            benchmark: null },
    fiveYears:     { portfolio: getTrailing(tr, "fiveYears",     "5y"),            benchmark: null },
    sinceInception:{ portfolio: getTrailing(tr, "sinceInception","sinceInception"),benchmark: null },
    MDD:           { portfolio: getTrailing(tr, "MDD",           "MDD"),           benchmark: null },
    currentDD:     { portfolio: getTrailing(tr, "currentDD",     "currentDD"),     benchmark: null },
  };
}

// ============================================================================
// Workbook builder (pure — no browser APIs)
// ============================================================================

function buildWorkbook(input: ServerExcelInput): XLSX.WorkBook {
  const {
    strategyName,
    isTotalPortfolio,
    hasNavBasedTotalPortfolio = false,
    isActive,
    clientName,
    dataAsOfDate,
    accountInfo,
    metrics,
    trailingReturns,
    cashFlows,
    monthlyPnl,
    quarterlyPnl,
  } = input;

  const includeFullSections = !isTotalPortfolio || hasNavBasedTotalPortfolio;
  const combinedTrailing = buildCombinedTrailing(trailingReturns);

  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [];
  const headerRows: number[] = [];
  const subHeaderRows: number[] = [];

  // Title
  wsData.push(["", "Qode"]);
  wsData.push([]);

  // 1. Portfolio Statistics
  headerRows.push(wsData.length);
  wsData.push(["", "Portfolio Statistics"]);
  wsData.push(["", "Generated on:", formatDate(new Date())]);
  wsData.push(["", "Data as of:", formatDate(dataAsOfDate ?? null)]);
  wsData.push(["", "Account Name", accountInfo?.accountName || clientName || strategyName]);
  wsData.push(["", "Broker", accountInfo?.broker?.toUpperCase() || "N/A"]);
  wsData.push(["", "Strategy", strategyName]);
  wsData.push(["", "Status", isActive ? "Active" : "Inactive"]);
  wsData.push(["", "Amount Deposited (₹)", metrics.amountDeposited || 0]);
  wsData.push(["", "Current Exposure (₹)", metrics.currentExposure || 0]);
  wsData.push(["", "Total Profit (₹)", metrics.totalProfit || 0]);
  wsData.push([]);

  // 2. Trailing Returns
  if (includeFullSections && combinedTrailing) {
    headerRows.push(wsData.length);
    wsData.push(["", "Trailing Returns (Portfolio vs Benchmark)"]);
    subHeaderRows.push(wsData.length);
    wsData.push(["", "Period", "Portfolio Return (%)", "Benchmark Return (%)"]);

    const horizons = [
      { key: "fiveDays",      label: "5 Days" },
      { key: "tenDays",       label: "10 Days" },
      { key: "fifteenDays",   label: "15 Days" },
      { key: "oneMonth",      label: "1 Month" },
      { key: "threeMonths",   label: "3 Months" },
      { key: "sixMonths",     label: "6 Months" },
      { key: "oneYear",       label: "1 Year" },
      { key: "twoYears",      label: "2 Years" },
      { key: "fiveYears",     label: "5 Years" },
      { key: "sinceInception",label: "Since Inception" },
      { key: "MDD",           label: "Max Drawdown (%)" },
      { key: "currentDD",     label: "Current Drawdown (%)" },
    ];

    for (const horizon of horizons) {
      const cell = combinedTrailing[horizon.key as keyof typeof combinedTrailing];
      if (cell?.portfolio !== null && cell?.portfolio !== undefined) {
        let portfolioNum = parseFloat(String(cell.portfolio));
        const benchmarkNum = 0; // no benchmark in server context

        if (horizon.key === "MDD" || horizon.key === "currentDD") {
          portfolioNum = portfolioNum > 0 ? -portfolioNum : portfolioNum;
        }

        wsData.push([
          "",
          horizon.label,
          isNaN(portfolioNum) ? 0 : portfolioNum,
          benchmarkNum,
        ]);
      }
    }
    wsData.push([]);
  }

  // 3. Cash Flows
  if (cashFlows?.length > 0) {
    const totals = cashFlows.reduce(
      (acc, tx) => {
        const amount = Number(tx.amount);
        if (amount > 0) acc.totalIn += amount;
        else if (amount < 0) acc.totalOut += amount;
        acc.netFlow += amount;
        return acc;
      },
      { totalIn: 0, totalOut: 0, netFlow: 0 }
    );

    headerRows.push(wsData.length);
    wsData.push(["", "Cash Flow Summary"]);
    wsData.push(["", "Total Cash In (₹)", totals.totalIn || 0]);
    wsData.push(["", "Total Cash Out (₹)", totals.totalOut || 0]);
    wsData.push(["", "Net Cash Flow (₹)", totals.netFlow || 0]);
    wsData.push([]);

    headerRows.push(wsData.length);
    wsData.push(["", "Cash Flows Detail"]);
    subHeaderRows.push(wsData.length);
    wsData.push(["", "Date", "Amount (₹)"]);

    cashFlows.forEach((flow) => {
      const d = new Date(flow.date);
      const formattedDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      wsData.push(["", formattedDate, Number(flow.amount)]);
    });
    wsData.push([]);
  }

  // 4. Monthly P&L
  if (includeFullSections && monthlyPnl && Object.keys(monthlyPnl).length > 0) {
    headerRows.push(wsData.length);
    wsData.push(["", "Monthly P&L"]);
    subHeaderRows.push(wsData.length);
    wsData.push(["", "Year", "Month", "Percent Return (%)", "Cash Return (₹)"]);

    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];

    Object.keys(monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b)).forEach((year) => {
      const yearData = monthlyPnl[year];
      monthNames.forEach((month) => {
        if (yearData.months[month]) {
          const md = yearData.months[month];
          wsData.push(["", year, month, parseFloat(md.percent) || 0, parseFloat(md.cash) || 0]);
        }
      });
    });
    wsData.push([]);
  }

  // 5. Quarterly P&L
  if (quarterlyPnl && Object.keys(quarterlyPnl).length > 0) {
    headerRows.push(wsData.length);
    wsData.push(["", "Quarterly P&L"]);
    subHeaderRows.push(wsData.length);

    if (!includeFullSections) {
      wsData.push(["", "Year", "Quarter", "Cash Return (₹)"]);
    } else {
      wsData.push(["", "Year", "Quarter", "Percent Return (%)", "Cash Return (₹)"]);
    }

    Object.keys(quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b)).forEach((year) => {
      const yd = quarterlyPnl[year];
      if (!includeFullSections) {
        wsData.push(["", year, "Q1", parseFloat(yd.cash.q1) || 0]);
        wsData.push(["", year, "Q2", parseFloat(yd.cash.q2) || 0]);
        wsData.push(["", year, "Q3", parseFloat(yd.cash.q3) || 0]);
        wsData.push(["", year, "Q4", parseFloat(yd.cash.q4) || 0]);
      } else {
        wsData.push(["", year, "Q1", parseFloat(yd.percent.q1) || 0, parseFloat(yd.cash.q1) || 0]);
        wsData.push(["", year, "Q2", parseFloat(yd.percent.q2) || 0, parseFloat(yd.cash.q2) || 0]);
        wsData.push(["", year, "Q3", parseFloat(yd.percent.q3) || 0, parseFloat(yd.cash.q3) || 0]);
        wsData.push(["", year, "Q4", parseFloat(yd.percent.q4) || 0, parseFloat(yd.cash.q4) || 0]);
      }
    });
    wsData.push([]);
  }

  // Worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Column widths
  const maxCols = Math.max(...wsData.map((row) => row.length));
  const colWidths: { wch: number }[] = [];
  for (let C = 0; C < maxCols; C++) {
    if (C === 0) { colWidths.push({ wch: 2 }); continue; }
    let maxWidth = 10;
    for (let R = 0; R < wsData.length; R++) {
      const v = wsData[R][C];
      if (v != null) maxWidth = Math.max(maxWidth, String(v).length);
    }
    colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
  }
  ws["!cols"] = colWidths;

  // Styles
  const tableBorder = {
    top:    { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left:   { style: "thin", color: { rgb: "000000" } },
    right:  { style: "thin", color: { rgb: "000000" } },
  };
  const headerStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "02422B" } },
    font: { name: "Aptos Narrow", color: { rgb: "FFFFFF" }, bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border: tableBorder,
  };
  const subHeaderStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "DABD38" } },
    font: { name: "Aptos Narrow", color: { rgb: "02422B" }, bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border: tableBorder,
  };
  const textStyle = {
    font: { name: "Aptos Narrow", sz: 11 },
    alignment: { horizontal: "left", vertical: "center" },
    border: tableBorder,
  };
  const numberStyle = {
    font: { name: "Aptos Narrow", sz: 11 },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "#,##0.00",
    border: tableBorder,
  };
  const titleStyle = {
    font: { name: "Playfair Display", bold: true, sz: 32, color: { rgb: "02422B" } },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const isTableRow = (rowIdx: number) => {
    if (rowIdx <= 1) return false;
    const rowData = wsData[rowIdx];
    if (!rowData) return false;
    for (let i = 1; i < rowData.length; i++) {
      if (rowData[i] !== undefined && rowData[i] !== null && rowData[i] !== "") return true;
    }
    return false;
  };

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const v = ws[addr].v;
      if (v === null || v === undefined || v === "") continue;

      if (R === 0) { ws[addr].s = titleStyle; continue; }
      if (R === 1) continue;

      if (typeof ws[addr].v === "number") {
        ws[addr].t = "n";
        ws[addr].z = Number.isInteger(ws[addr].v) && ws[addr].v >= 1900 && ws[addr].v <= 2100 ? "0" : "#,##0.00";
      } else if (typeof ws[addr].v === "string") {
        const trimmed = ws[addr].v.trim();
        const num = parseFloat(trimmed);
        if (!isNaN(num) && trimmed === String(num)) {
          ws[addr].v = num;
          ws[addr].t = "n";
          ws[addr].z = Number.isInteger(num) && num >= 1900 && num <= 2100 ? "0" : "#,##0.00";
        } else {
          ws[addr].t = "s";
        }
      }

      if (isTableRow(R)) {
        if (C === 0) continue;
        else if (headerRows.includes(R)) ws[addr].s = headerStyle;
        else if (subHeaderRows.includes(R)) ws[addr].s = subHeaderStyle;
        else if (C === 1) ws[addr].s = textStyle;
        else if (ws[addr].t === "n") ws[addr].s = numberStyle;
        else ws[addr].s = { ...textStyle, alignment: { horizontal: "right", vertical: "center" } };
      } else {
        ws[addr].s = textStyle;
      }
    }
  }

  // Merges
  const getTableWidth = (startRow: number) => {
    let maxCol = 1;
    for (let r = startRow; r < Math.min(startRow + 15, wsData.length); r++) {
      if (wsData[r]) {
        for (let c = 1; c < wsData[r].length; c++) {
          if (wsData[r][c] !== undefined && wsData[r][c] !== null && wsData[r][c] !== "") maxCol = Math.max(maxCol, c);
        }
      }
      if (wsData[r] && wsData[r].every((cell: any, idx: number) => idx === 0 || !cell)) break;
    }
    return maxCol;
  };
  const merges: XLSX.Range[] = [];
  headerRows.forEach((rowIdx) => {
    const tw = getTableWidth(rowIdx);
    if (tw > 1) merges.push({ s: { r: rowIdx, c: 1 }, e: { r: rowIdx, c: tw } });
  });
  if (merges.length > 0) ws["!merges"] = merges;

  XLSX.utils.book_append_sheet(wb, ws, "Portfolio Data");
  return wb;
}

// ============================================================================
// Public API — builds and returns a Buffer (safe to call in Next.js API routes)
// ============================================================================

export async function generateExcelBufferServer(input: ServerExcelInput): Promise<Buffer> {
  const wb = buildWorkbook(input);
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

  // Patch gridlines in the xlsx XML (same trick as the client-side version)
  const zip = await JSZip.loadAsync(wbout);
  const sheetPath = "xl/worksheets/sheet1.xml";
  let sheetXml = await zip.file(sheetPath)!.async("string");

  if (sheetXml.includes("<sheetView ")) {
    if (/showGridLines\s*=/.test(sheetXml)) {
      sheetXml = sheetXml.replace(/showGridLines\s*=\s*"[^"]*"/, 'showGridLines="0"');
    } else {
      sheetXml = sheetXml.replace(/<sheetView\s/, '<sheetView showGridLines="0" ');
    }
  } else {
    sheetXml = sheetXml.replace(
      /(<worksheet[^>]*>)/,
      '$1<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>'
    );
  }
  zip.file(sheetPath, sheetXml);

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}
