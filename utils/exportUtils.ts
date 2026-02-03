/**
 * Export Utilities for Portfolio Data
 *
 * This file contains utility functions for exporting portfolio data to:
 * - CSV format
 * - Excel format (with styling)
 *
 * Dependencies required in package.json:
 * - "xlsx": "^0.18.5"
 * - "xlsx-js-style": "^1.2.0"
 */

import * as XLSX from "xlsx-js-style";

// ============================================================================
// Types
// ============================================================================

export interface ExportTransaction {
  date: string;
  amount: number | string;
}

export interface ExportCashFlowTotals {
  totalIn: number | string;
  totalOut: number | string;
  netFlow: number | string;
}

export interface ExportMonthlyPnl {
  [year: string]: {
    months: {
      [month: string]: {
        percent?: string | number;
        cash?: string | number;
        capitalInOut?: string | number;
      };
    };
    totalPercent?: number | string;
    totalCash?: number | string;
    totalCapitalInOut?: number | string;
  };
}

export interface ExportQuarterlyPnl {
  [year: string]: {
    percent: {
      q1: string | number;
      q2: string | number;
      q3: string | number;
      q4: string | number;
      total: string | number;
    };
    cash: {
      q1: string | number;
      q2: string | number;
      q3: string | number;
      q4: string | number;
      total: string | number;
    };
    yearCash: string | number;
  };
}

export interface ExportFees {
  [year: string]: {
    q1: string | number;
    q2: string | number;
    q3: string | number;
    q4: string | number;
    total: string | number;
  };
}

export interface CombinedTrailingCell {
  portfolio?: string | number | null;
  benchmark?: string | number | null;
}

export interface CombinedTrailing {
  fiveDays?: CombinedTrailingCell;
  tenDays?: CombinedTrailingCell;
  fifteenDays?: CombinedTrailingCell;
  oneMonth?: CombinedTrailingCell;
  threeMonths?: CombinedTrailingCell;
  sixMonths?: CombinedTrailingCell;
  oneYear?: CombinedTrailingCell;
  twoYears?: CombinedTrailingCell;
  fiveYears?: CombinedTrailingCell;
  sinceInception: CombinedTrailingCell;
  MDD?: CombinedTrailingCell;
  currentDD?: CombinedTrailingCell;
}

export interface ExportData {
  strategyName: string;
  userName?: string;
  isActive?: boolean;
  isTotalPortfolio?: boolean;
  amountDeposited: number | string;
  currentExposure: number | string;
  totalReturn: number | string;
  totalProfit: number | string;
  drawdown: number | string;
  transactions: ExportTransaction[];
  cashFlowTotals: ExportCashFlowTotals;
  monthlyPnl?: ExportMonthlyPnl | null;
  quarterlyPnl?: ExportQuarterlyPnl | null;
  combinedTrailing?: CombinedTrailing | null;
  fees?: ExportFees | null;
  broker?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const TRAILING_HORIZONS = [
  { key: "fiveDays", label: "5 Days" },
  { key: "tenDays", label: "10 Days" },
  { key: "fifteenDays", label: "15 Days" },
  { key: "oneMonth", label: "1 Month" },
  { key: "threeMonths", label: "3 Months" },
  { key: "sixMonths", label: "6 Months" },
  { key: "oneYear", label: "1 Year" },
  { key: "twoYears", label: "2 Years" },
  { key: "fiveYears", label: "5 Years" },
  { key: "sinceInception", label: "Since Inception" },
  { key: "MDD", label: "Max Drawdown (%)" },
  { key: "currentDD", label: "Current Drawdown (%)" },
];

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Export portfolio data to CSV format
 */
export function downloadAsCSV(data: ExportData): void {
  try {
    const filename = `${data.strategyName?.replace(/\s+/g, "_")}_data.csv`;
    const wsData: any[][] = [];

    // 1. Portfolio Statistics Section
    wsData.push(["Portfolio Statistics"]);
    wsData.push(["Strategy Name", data.strategyName]);
    wsData.push(["Amount Deposited", parseFloat(String(data.amountDeposited)) || 0]);
    wsData.push(["Current Exposure", parseFloat(String(data.currentExposure)) || 0]);
    wsData.push(["Total Return (%)", parseFloat(String(data.totalReturn)) || 0]);
    wsData.push(["Total Profit", parseFloat(String(data.totalProfit)) || 0]);
    const drawdownValue = parseFloat(String(data.drawdown)) || 0;
    wsData.push(["Max Drawdown (%)", drawdownValue > 0 ? -drawdownValue : drawdownValue]);
    wsData.push([]);

    // 2. Trailing Returns Section (skip for Total Portfolio)
    if (data.combinedTrailing && !data.isTotalPortfolio) {
      wsData.push(["Trailing Returns (Portfolio vs Benchmark)"]);
      wsData.push(["Period", "Portfolio Return", "Benchmark Return"]);

      for (const horizon of TRAILING_HORIZONS) {
        const cell = data.combinedTrailing[horizon.key as keyof CombinedTrailing];
        if (cell?.portfolio !== null && cell?.portfolio !== undefined) {
          let portfolioNum = parseFloat(String(cell.portfolio));
          let benchmarkNum = cell?.benchmark && cell.benchmark !== "-" ? parseFloat(String(cell.benchmark)) : null;

          if (horizon.key === "MDD" || horizon.key === "currentDD") {
            portfolioNum = portfolioNum > 0 ? -portfolioNum : portfolioNum;
            if (benchmarkNum !== null) {
              benchmarkNum = benchmarkNum > 0 ? -benchmarkNum : benchmarkNum;
            }
          }

          wsData.push([
            horizon.label,
            isNaN(portfolioNum) ? 0 : portfolioNum,
            benchmarkNum !== null && !isNaN(benchmarkNum) ? benchmarkNum : 0
          ]);
        }
      }
      wsData.push([]);
    }

    // 3. Cash Flow Section
    if (data.transactions?.length > 0) {
      wsData.push(["Cash Flow Summary"]);
      wsData.push(["Total Cash In", parseFloat(String(data.cashFlowTotals.totalIn)) || 0]);
      wsData.push(["Total Cash Out", parseFloat(String(data.cashFlowTotals.totalOut)) || 0]);
      wsData.push(["Net Cash Flow", parseFloat(String(data.cashFlowTotals.netFlow)) || 0]);
      wsData.push([]);

      wsData.push(["Cash Flows Detail"]);
      wsData.push(["Date", "Amount"]);
      data.transactions.forEach((flow) => {
        wsData.push([flow.date, Number(flow.amount)]);
      });
      wsData.push([]);
    }

    // 4. Monthly PnL Section
    if (data.monthlyPnl && Object.keys(data.monthlyPnl).length > 0) {
      wsData.push(["Monthly P&L"]);
      wsData.push(["Year", "Month", "Percent Return", "Cash Return", "Capital In/Out"]);

      const years = Object.keys(data.monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearData = data.monthlyPnl![year];

        MONTH_NAMES.forEach((month) => {
          if (yearData.months[month]) {
            const monthData = yearData.months[month];
            wsData.push([
              year,
              month,
              parseFloat(String(monthData.percent)) || 0,
              parseFloat(String(monthData.cash)) || 0,
              parseFloat(String(monthData.capitalInOut)) || 0
            ]);
          }
        });
      });
      wsData.push([]);
    }

    // 5. Quarterly PnL Section
    if (data.quarterlyPnl && Object.keys(data.quarterlyPnl).length > 0) {
      wsData.push(["Quarterly P&L"]);
      wsData.push(["Year", "Quarter", "Percent Return", "Cash Return"]);

      const years = Object.keys(data.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearData = data.quarterlyPnl![year];
        wsData.push([year, "Q1", parseFloat(String(yearData.percent.q1)) || 0, parseFloat(String(yearData.cash.q1)) || 0]);
        wsData.push([year, "Q2", parseFloat(String(yearData.percent.q2)) || 0, parseFloat(String(yearData.cash.q2)) || 0]);
        wsData.push([year, "Q3", parseFloat(String(yearData.percent.q3)) || 0, parseFloat(String(yearData.cash.q3)) || 0]);
        wsData.push([year, "Q4", parseFloat(String(yearData.percent.q4)) || 0, parseFloat(String(yearData.cash.q4)) || 0]);
      });
      wsData.push([]);
    }

    // 6. Fees Section (only for Total Portfolio)
    if (data.isTotalPortfolio && data.fees && Object.keys(data.fees).length > 0) {
      wsData.push(["Fee Schedule (INR)"]);
      wsData.push(["Year", "Q1", "Q2", "Q3", "Q4", "Total"]);

      const years = Object.keys(data.fees).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearFees = data.fees![year];
        wsData.push([
          year,
          parseFloat(String(yearFees.q1)) || 0,
          parseFloat(String(yearFees.q2)) || 0,
          parseFloat(String(yearFees.q3)) || 0,
          parseFloat(String(yearFees.q4)) || 0,
          parseFloat(String(yearFees.total)) || 0
        ]);
      });
      wsData.push([]);
    }

    // Create worksheet and convert to CSV
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const csv = XLSX.utils.sheet_to_csv(ws);

    // Download CSV
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');

  } catch (error) {
    console.error("Error generating CSV:", error);
    alert("Failed to generate CSV file");
  }
}

// ============================================================================
// Excel Export
// ============================================================================

/**
 * Export portfolio data to Excel format with professional styling
 */
export function downloadAsExcel(data: ExportData): void {
  try {
    const filename = `${data.strategyName?.replace(/\s+/g, "_")}_data.xlsx`;
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    const headerRows: number[] = [];
    const subHeaderRows: number[] = [];

    // Title row
    wsData.push(["", "Q"]);
    wsData.push([]);

    // 1. Portfolio Statistics Section
    headerRows.push(wsData.length);
    wsData.push(["", "Portfolio Statistics"]);
    wsData.push(["", "Account Name", data.userName || data.strategyName]);
    wsData.push(["", "Account Type", "MANAGED_ACCOUNT"]);
    wsData.push(["", "Broker", data.broker || "ZERODHA"]);
    wsData.push(["", "Strategy", data.strategyName]);
    wsData.push(["", "Status", data.isActive ? "Active" : "Inactive"]);
    wsData.push(["", "Amount Deposited", parseFloat(String(data.amountDeposited)) || 0]);
    wsData.push(["", "Current Exposure", parseFloat(String(data.currentExposure)) || 0]);
    wsData.push(["", "Total Profit", parseFloat(String(data.totalProfit)) || 0]);
    if (!data.isTotalPortfolio) {
      wsData.push(["", "Total Return (%)", parseFloat(String(data.totalReturn)) || 0]);
    }
    wsData.push([]);

    // 2. Trailing Returns Section (skip for Total Portfolio)
    if (data.combinedTrailing && !data.isTotalPortfolio) {
      headerRows.push(wsData.length);
      wsData.push(["", "Trailing Returns (Portfolio vs Benchmark)"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Period", "Portfolio Return (%)", "Benchmark Return (%)"]);

      for (const horizon of TRAILING_HORIZONS) {
        const cell = data.combinedTrailing[horizon.key as keyof CombinedTrailing];
        if (cell?.portfolio !== null && cell?.portfolio !== undefined) {
          let portfolioNum = parseFloat(String(cell.portfolio));
          let benchmarkNum = cell?.benchmark && cell.benchmark !== "-" ? parseFloat(String(cell.benchmark)) : 0;

          if (horizon.key === "MDD" || horizon.key === "currentDD") {
            portfolioNum = -Math.abs(portfolioNum);
            benchmarkNum = benchmarkNum !== 0 ? -Math.abs(benchmarkNum) : 0;
          }

          wsData.push([
            "",
            horizon.label,
            isNaN(portfolioNum) ? 0 : portfolioNum,
            benchmarkNum !== null && !isNaN(benchmarkNum) ? benchmarkNum : 0
          ]);
        }
      }
      wsData.push([]);
    }

    // 3. Cash Flow Section
    if (data.transactions?.length > 0) {
      headerRows.push(wsData.length);
      wsData.push(["", "Cash Flow Summary"]);
      wsData.push(["", "Total Cash In", parseFloat(String(data.cashFlowTotals.totalIn)) || 0]);
      wsData.push(["", "Total Cash Out", parseFloat(String(data.cashFlowTotals.totalOut)) || 0]);
      wsData.push(["", "Net Cash Flow", parseFloat(String(data.cashFlowTotals.netFlow)) || 0]);
      wsData.push([]);

      headerRows.push(wsData.length);
      wsData.push(["", "Cash Flows Detail"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Date", "Amount"]);
      data.transactions.forEach((flow) => {
        const dateObj = new Date(flow.date);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;
        wsData.push(["", formattedDate, Number(flow.amount)]);
      });
      wsData.push([]);
    }

    // 4. Monthly PnL Section
    if (data.monthlyPnl && Object.keys(data.monthlyPnl).length > 0) {
      headerRows.push(wsData.length);
      wsData.push(["", "Monthly P&L"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Year", "Month", "Percent Return (%)", "Cash Return"]);

      const years = Object.keys(data.monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearData = data.monthlyPnl![year];
        MONTH_NAMES.forEach((month) => {
          if (yearData.months[month]) {
            const monthData = yearData.months[month];
            wsData.push([
              "",
              year,
              month,
              parseFloat(String(monthData.percent)) || 0,
              parseFloat(String(monthData.cash)) || 0,
            ]);
          }
        });
      });
      wsData.push([]);
    }

    // 5. Quarterly PnL Section
    if (data.quarterlyPnl && Object.keys(data.quarterlyPnl).length > 0) {
      headerRows.push(wsData.length);
      wsData.push(["", data.isTotalPortfolio ? "Quarterly P&L (Before Fees)" : "Quarterly P&L"]);
      subHeaderRows.push(wsData.length);
      wsData.push(data.isTotalPortfolio
        ? ["", "Year", "Quarter", "Cash Return"]
        : ["", "Year", "Quarter", "Percent Return (%)", "Cash Return"]
      );

      const years = Object.keys(data.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearData = data.quarterlyPnl![year];
        if (data.isTotalPortfolio) {
          wsData.push(["", year, "Q1", parseFloat(String(yearData.cash.q1)) || 0]);
          wsData.push(["", year, "Q2", parseFloat(String(yearData.cash.q2)) || 0]);
          wsData.push(["", year, "Q3", parseFloat(String(yearData.cash.q3)) || 0]);
          wsData.push(["", year, "Q4", parseFloat(String(yearData.cash.q4)) || 0]);
        } else {
          wsData.push(["", year, "Q1", parseFloat(String(yearData.percent.q1)) || 0, parseFloat(String(yearData.cash.q1)) || 0]);
          wsData.push(["", year, "Q2", parseFloat(String(yearData.percent.q2)) || 0, parseFloat(String(yearData.cash.q2)) || 0]);
          wsData.push(["", year, "Q3", parseFloat(String(yearData.percent.q3)) || 0, parseFloat(String(yearData.cash.q3)) || 0]);
          wsData.push(["", year, "Q4", parseFloat(String(yearData.percent.q4)) || 0, parseFloat(String(yearData.cash.q4)) || 0]);
        }
      });
      wsData.push([]);
    }

    // 6. Quarterly PnL (After Fees) - Only for Total Portfolio
    if (data.isTotalPortfolio && data.quarterlyPnl && data.fees) {
      headerRows.push(wsData.length);
      wsData.push(["", "Quarterly P&L (After Fees)"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Year", "Quarter", "Cash Return"]);

      const years = Object.keys(data.quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearData = data.quarterlyPnl![year];
        const yearFees = data.fees?.[year];

        const q1AfterFees = (parseFloat(String(yearData.cash.q1)) || 0) - (yearFees ? parseFloat(String(yearFees.q1)) || 0 : 0);
        const q2AfterFees = (parseFloat(String(yearData.cash.q2)) || 0) - (yearFees ? parseFloat(String(yearFees.q2)) || 0 : 0);
        const q3AfterFees = (parseFloat(String(yearData.cash.q3)) || 0) - (yearFees ? parseFloat(String(yearFees.q3)) || 0 : 0);
        const q4AfterFees = (parseFloat(String(yearData.cash.q4)) || 0) - (yearFees ? parseFloat(String(yearFees.q4)) || 0 : 0);

        wsData.push(["", year, "Q1", q1AfterFees]);
        wsData.push(["", year, "Q2", q2AfterFees]);
        wsData.push(["", year, "Q3", q3AfterFees]);
        wsData.push(["", year, "Q4", q4AfterFees]);
      });
      wsData.push([]);
    }

    // 7. Fees Section (only for Total Portfolio)
    if (data.isTotalPortfolio && data.fees && Object.keys(data.fees).length > 0) {
      headerRows.push(wsData.length);
      wsData.push(["", "Quarterly Fees"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Year", "Q1", "Q2", "Q3", "Q4", "Total"]);

      const years = Object.keys(data.fees).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearFees = data.fees![year];
        wsData.push([
          "",
          year,
          parseFloat(String(yearFees.q1)) || 0,
          parseFloat(String(yearFees.q2)) || 0,
          parseFloat(String(yearFees.q3)) || 0,
          parseFloat(String(yearFees.q4)) || 0,
          parseFloat(String(yearFees.total)) || 0
        ]);
      });
      wsData.push([]);
    }

    // Create worksheet and apply styling
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyExcelStyles(ws, wsData, headerRows, subHeaderRows);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Strategy Data");

    // Write file
    XLSX.writeFile(wb, filename);

  } catch (error) {
    console.error("Error generating Excel:", error);
    alert("Failed to generate Excel file");
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Download a file with the given content
 */
function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Apply professional styling to Excel worksheet
 */
function applyExcelStyles(
  ws: XLSX.WorkSheet,
  wsData: any[][],
  headerRows: number[],
  subHeaderRows: number[]
): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Calculate column widths
  const maxCols = Math.max(...wsData.map(row => row.length));
  const colWidths: { wch: number }[] = [];

  for (let C = 0; C < maxCols; C++) {
    let maxWidth = 10;
    for (let R = 0; R < wsData.length; R++) {
      const cellValue = wsData[R][C];
      if (cellValue != null) {
        const cellLength = String(cellValue).length;
        maxWidth = Math.max(maxWidth, cellLength);
      }
    }
    colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
  }
  ws['!cols'] = colWidths;

  // Define styles
  const tableBorder = {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } }
  };

  const headerStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "02422B" } },
    font: { name: "Aptos Narrow", color: { rgb: "FFFFFF" }, bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border: tableBorder
  };

  const subHeaderStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "DABD38" } },
    font: { name: "Aptos Narrow", color: { rgb: "02422B" }, bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border: tableBorder
  };

  const textStyle = {
    font: { name: "Aptos Narrow", sz: 11 },
    alignment: { horizontal: "left", vertical: "center" },
    border: tableBorder
  };

  const numberStyle = {
    font: { name: "Aptos Narrow", sz: 11 },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "0.00",
    border: tableBorder
  };

  const titleStyle = {
    font: { name: "Playfair Display", bold: true, sz: 32, color: { rgb: "02422B" } },
    alignment: { horizontal: "left", vertical: "center" }
  };

  // Helper to check if row is part of a table
  const isTableRow = (rowIdx: number) => {
    if (rowIdx <= 1) return false;
    const rowData = wsData[rowIdx];
    if (!rowData) return false;
    for (let i = 1; i < rowData.length; i++) {
      if (rowData[i] !== undefined && rowData[i] !== null && rowData[i] !== '') {
        return true;
      }
    }
    return false;
  };

  // Apply styles to cells
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) continue;

      const cellValue = ws[cellAddress].v;
      if (cellValue === null || cellValue === undefined || cellValue === '') continue;

      // Title row
      if (R === 0) {
        ws[cellAddress].s = titleStyle;
        continue;
      }

      if (R === 1) continue;

      // Format numbers
      if (typeof ws[cellAddress].v === 'number') {
        ws[cellAddress].t = 'n';
        if (Number.isInteger(ws[cellAddress].v) && ws[cellAddress].v >= 1900 && ws[cellAddress].v <= 2100) {
          ws[cellAddress].z = '0';
        } else {
          ws[cellAddress].z = '0.00';
        }
      } else if (typeof ws[cellAddress].v === 'string') {
        const trimmed = ws[cellAddress].v.trim();
        const num = parseFloat(trimmed);
        if (!isNaN(num) && trimmed === String(num)) {
          ws[cellAddress].v = num;
          ws[cellAddress].t = 'n';
          ws[cellAddress].z = Number.isInteger(num) && num >= 1900 && num <= 2100 ? '0' : '0.00';
        } else {
          ws[cellAddress].t = 's';
        }
      }

      // Apply styles based on row type
      if (isTableRow(R)) {
        if (C === 0) continue;

        if (headerRows.includes(R)) {
          ws[cellAddress].s = headerStyle;
        } else if (subHeaderRows.includes(R)) {
          ws[cellAddress].s = subHeaderStyle;
        } else if (C === 1) {
          ws[cellAddress].s = textStyle;
        } else if (ws[cellAddress].t === 'n') {
          ws[cellAddress].s = numberStyle;
        } else {
          ws[cellAddress].s = { ...textStyle, alignment: { horizontal: "right", vertical: "center" } };
        }
      } else {
        ws[cellAddress].s = textStyle;
      }
    }
  }

  // Merge header cells
  const merges: XLSX.Range[] = [];

  const getTableWidth = (startRow: number) => {
    let maxCol = 1;
    for (let r = startRow; r < Math.min(startRow + 15, wsData.length); r++) {
      if (wsData[r]) {
        for (let c = 1; c < wsData[r].length; c++) {
          if (wsData[r][c] !== undefined && wsData[r][c] !== null && wsData[r][c] !== '') {
            maxCol = Math.max(maxCol, c);
          }
        }
      }
      if (wsData[r]?.every((cell: any, idx: number) => idx === 0 || !cell)) break;
    }
    return maxCol;
  };

  headerRows.forEach(rowIdx => {
    const tableWidth = getTableWidth(rowIdx);
    if (tableWidth > 1) {
      merges.push({ s: { r: rowIdx, c: 1 }, e: { r: rowIdx, c: tableWidth } });
    }
  });

  if (merges.length > 0) {
    ws['!merges'] = merges;
  }

  // Hide gridlines
  (ws as any)['!views'] = [{ showGridLines: false }];
}
