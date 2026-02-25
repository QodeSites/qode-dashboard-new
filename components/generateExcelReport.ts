import * as XLSX from "xlsx-js-style";

// ============================================================================
// Type Definitions
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

interface ExcelReportInput {
  strategyName: string;
  isTotalPortfolio: boolean;
  isActive: boolean;
  sessionUserName: string;
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
  combinedTrailing: {
    fiveDays?: CombinedTrailingPeriod;
    tenDays?: CombinedTrailingPeriod;
    fifteenDays?: CombinedTrailingPeriod;
    oneMonth?: CombinedTrailingPeriod;
    threeMonths?: CombinedTrailingPeriod;
    sixMonths?: CombinedTrailingPeriod;
    oneYear?: CombinedTrailingPeriod;
    twoYears?: CombinedTrailingPeriod;
    fiveYears?: CombinedTrailingPeriod;
    sinceInception?: CombinedTrailingPeriod;
    MDD?: CombinedTrailingPeriod;
    currentDD?: CombinedTrailingPeriod;
  };
  cashFlows: { date: string; amount: number }[];
  monthlyPnl: { [year: string]: MonthlyPnlYear } | null;
  quarterlyPnl: { [year: string]: QuarterlyPnlYear } | null;
}

// ============================================================================
// Main Export Function
// ============================================================================

export function generateExcelReport(input: ExcelReportInput): void {
  const {
    strategyName,
    isTotalPortfolio,
    isActive,
    sessionUserName,
    accountInfo,
    metrics,
    combinedTrailing,
    cashFlows,
    monthlyPnl,
    quarterlyPnl,
  } = input;

  try {
    const nameForFile = accountInfo?.accountName || strategyName;
    const filename = `${nameForFile.replace(/\s+/g, "_")}_data.xlsx`;
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    const headerRows: number[] = [];
    const subHeaderRows: number[] = [];

    // ========================================================================
    // Title Row
    // ========================================================================
    wsData.push(["", "Qode"]);
    wsData.push([]);

    // ========================================================================
    // 1. Portfolio Statistics Section
    // ========================================================================
    headerRows.push(wsData.length);
    wsData.push(["", "Portfolio Statistics"]);
    wsData.push(["", "Account Name", accountInfo?.accountName || sessionUserName || strategyName]);
    wsData.push(["", "Account Type", accountInfo?.accountType?.toUpperCase() || "MANAGED_ACCOUNT"]);
    wsData.push(["", "Broker", accountInfo?.broker?.toUpperCase() || "N/A"]);
    wsData.push(["", "Strategy", strategyName]);
    wsData.push(["", "Status", isActive ? "Active" : "Inactive"]);
    wsData.push(["", "Amount Deposited (₹)", metrics.amountDeposited || 0]);
    wsData.push(["", "Current Exposure (₹)", metrics.currentExposure || 0]);
    wsData.push(["", "Total Profit (₹)", metrics.totalProfit || 0]);
    wsData.push([]);

    // ========================================================================
    // 2. Trailing Returns Section (skip for Total Portfolio)
    // ========================================================================
    if (!isTotalPortfolio && combinedTrailing) {
      headerRows.push(wsData.length);
      wsData.push(["", "Trailing Returns (Portfolio vs Benchmark)"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Period", "Portfolio Return (%)", "Benchmark Return (%)"]);

      const horizons = [
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

      for (const horizon of horizons) {
        const cell = combinedTrailing[horizon.key as keyof typeof combinedTrailing];
        if (cell?.portfolio !== null && cell?.portfolio !== undefined) {
          let portfolioNum = parseFloat(String(cell.portfolio));
          let benchmarkNum = cell?.benchmark && cell.benchmark !== "-"
            ? parseFloat(String(cell.benchmark))
            : 0;

          // Ensure negative values for drawdowns
          if (horizon.key === "MDD" || horizon.key === "currentDD") {
            portfolioNum = portfolioNum > 0 ? -portfolioNum : portfolioNum;
            benchmarkNum = benchmarkNum > 0 ? -benchmarkNum : benchmarkNum;
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

    // ========================================================================
    // 3. Cash Flow Section
    // ========================================================================
    if (cashFlows?.length > 0) {
      // Calculate totals
      const cashFlowTotals = cashFlows.reduce(
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
      wsData.push(["", "Total Cash In (₹)", cashFlowTotals.totalIn || 0]);
      wsData.push(["", "Total Cash Out (₹)", cashFlowTotals.totalOut || 0]);
      wsData.push(["", "Net Cash Flow (₹)", cashFlowTotals.netFlow || 0]);
      wsData.push([]);

      headerRows.push(wsData.length);
      wsData.push(["", "Cash Flows Detail"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Date", "Amount (₹)"]);

      cashFlows.forEach((flow) => {
        // Convert date to DD-MM-YYYY format
        const dateObj = new Date(flow.date);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;
        wsData.push(["", formattedDate, Number(flow.amount)]);
      });
      wsData.push([]);
    }

    // ========================================================================
    // 4. Monthly PnL Section (skip for Total Portfolio)
    // ========================================================================
    if (!isTotalPortfolio && monthlyPnl && Object.keys(monthlyPnl).length > 0) {
      headerRows.push(wsData.length);
      wsData.push(["", "Monthly P&L"]);
      subHeaderRows.push(wsData.length);
      wsData.push(["", "Year", "Month", "Percent Return (%)", "Cash Return (₹)"]);

      const years = Object.keys(monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];

      years.forEach((year) => {
        const yearData = monthlyPnl[year];
        monthNames.forEach((month) => {
          if (yearData.months[month]) {
            const monthData = yearData.months[month];
            wsData.push([
              "",
              year,
              month,
              parseFloat(monthData.percent) || 0,
              parseFloat(monthData.cash) || 0
            ]);
          }
        });
      });
      wsData.push([]);
    }

    // ========================================================================
    // 5. Quarterly PnL Section
    // ========================================================================
    if (quarterlyPnl && Object.keys(quarterlyPnl).length > 0) {
      headerRows.push(wsData.length);
      if (isTotalPortfolio) {
        wsData.push(["", "Quarterly P&L"]);
      } else {
        wsData.push(["", "Quarterly P&L"]);
      }
      subHeaderRows.push(wsData.length);

      if (isTotalPortfolio) {
        wsData.push(["", "Year", "Quarter", "Cash Return (₹)"]);
      } else {
        wsData.push(["", "Year", "Quarter", "Percent Return (%)", "Cash Return (₹)"]);
      }

      const years = Object.keys(quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));

      years.forEach((year) => {
        const yearData = quarterlyPnl[year];
        if (isTotalPortfolio) {
          wsData.push(["", year, "Q1", parseFloat(yearData.cash.q1) || 0]);
          wsData.push(["", year, "Q2", parseFloat(yearData.cash.q2) || 0]);
          wsData.push(["", year, "Q3", parseFloat(yearData.cash.q3) || 0]);
          wsData.push(["", year, "Q4", parseFloat(yearData.cash.q4) || 0]);
        } else {
          wsData.push(["", year, "Q1", parseFloat(yearData.percent.q1) || 0, parseFloat(yearData.cash.q1) || 0]);
          wsData.push(["", year, "Q2", parseFloat(yearData.percent.q2) || 0, parseFloat(yearData.cash.q2) || 0]);
          wsData.push(["", year, "Q3", parseFloat(yearData.percent.q3) || 0, parseFloat(yearData.cash.q3) || 0]);
          wsData.push(["", year, "Q4", parseFloat(yearData.percent.q4) || 0, parseFloat(yearData.cash.q4) || 0]);
        }
      });
      wsData.push([]);
    }

    // ========================================================================
    // Create Worksheet
    // ========================================================================
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    // ========================================================================
    // Calculate Auto-fit Column Widths
    // ========================================================================
    const maxCols = Math.max(...wsData.map(row => row.length));
    const colWidths: { wch: number }[] = [];

    for (let C = 0; C < maxCols; C++) {
      // Column A (index 0) should be narrow as it's empty
      if (C === 0) {
        colWidths.push({ wch: 2 });
        continue;
      }

      let maxWidth = 10; // Minimum width
      for (let R = 0; R < wsData.length; R++) {
        const cellValue = wsData[R][C];
        if (cellValue != null) {
          const cellLength = String(cellValue).length;
          maxWidth = Math.max(maxWidth, cellLength);
        }
      }
      // Add some padding and cap at reasonable max
      colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
    }
    ws['!cols'] = colWidths;

    // ========================================================================
    // Define Styles
    // ========================================================================
    const tableBorder = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    };

    const headerStyle = {
      fill: {
        patternType: "solid",
        fgColor: { rgb: "02422B" }
      },
      font: {
        name: "Aptos Narrow",
        color: { rgb: "FFFFFF" },
        bold: true,
        sz: 11
      },
      alignment: {
        horizontal: "center",
        vertical: "center"
      },
      border: tableBorder
    };

    const subHeaderStyle = {
      fill: {
        patternType: "solid",
        fgColor: { rgb: "DABD38" }
      },
      font: {
        name: "Aptos Narrow",
        color: { rgb: "02422B" },
        bold: true,
        sz: 11
      },
      alignment: {
        horizontal: "center",
        vertical: "center"
      },
      border: tableBorder
    };

    const textStyle = {
      font: {
        name: "Aptos Narrow",
        sz: 11
      },
      alignment: {
        horizontal: "left",
        vertical: "center"
      },
      border: tableBorder
    };

    const numberStyle = {
      font: {
        name: "Aptos Narrow",
        sz: 11
      },
      alignment: {
        horizontal: "right",
        vertical: "center"
      },
      numFmt: "0.00",
      border: tableBorder
    };

    const titleStyle = {
      font: {
        name: "Playfair Display",
        bold: true,
        sz: 32,
        color: { rgb: "02422B" }
      },
      alignment: {
        horizontal: "left",
        vertical: "center"
      }
    };

    // ========================================================================
    // Helper: Check if row is part of a table
    // ========================================================================
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

    // ========================================================================
    // Apply Styles to All Cells
    // ========================================================================
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) continue;

        const cellValue = ws[cellAddress].v;

        // Skip styling for truly empty cells
        if (cellValue === null || cellValue === undefined || cellValue === '') {
          continue;
        }

        // Apply title style to first row (Q)
        if (R === 0) {
          ws[cellAddress].s = titleStyle;
          continue;
        }

        // Skip styling for empty rows (row 1)
        if (R >= 1 && R <= 1) {
          continue;
        }

        // Ensure numbers are typed correctly and format appropriately
        if (typeof ws[cellAddress].v === 'number') {
          ws[cellAddress].t = 'n';
          // Check if it's a year (4-digit integer between 1900-2100)
          if (Number.isInteger(ws[cellAddress].v) && ws[cellAddress].v >= 1900 && ws[cellAddress].v <= 2100) {
            ws[cellAddress].z = '0'; // Format years as integers
          } else {
            ws[cellAddress].z = '0.00'; // Format other numbers with 2 decimal places
          }
        } else if (typeof ws[cellAddress].v === 'string') {
          const trimmed = ws[cellAddress].v.trim();
          const num = parseFloat(trimmed);
          if (!isNaN(num) && trimmed === String(num)) {
            ws[cellAddress].v = num;
            ws[cellAddress].t = 'n';
            if (Number.isInteger(num) && num >= 1900 && num <= 2100) {
              ws[cellAddress].z = '0';
            } else {
              ws[cellAddress].z = '0.00';
            }
          } else {
            ws[cellAddress].t = 's';
          }
        }

        // Apply styles based on row type
        if (isTableRow(R)) {
          if (C === 0) {
            continue; // Skip column A
          } else if (headerRows.includes(R)) {
            ws[cellAddress].s = headerStyle;
          } else if (subHeaderRows.includes(R)) {
            ws[cellAddress].s = subHeaderStyle;
          } else {
            if (C === 1) {
              ws[cellAddress].s = textStyle;
            } else if (ws[cellAddress].t === 'n') {
              ws[cellAddress].s = numberStyle;
            } else {
              ws[cellAddress].s = {
                ...textStyle,
                alignment: { horizontal: "right", vertical: "center" }
              };
            }
          }
        } else {
          ws[cellAddress].s = textStyle;
        }
      }
    }

    // ========================================================================
    // Merge Header Cells
    // ========================================================================
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
        if (wsData[r] && wsData[r].every((cell: any, idx: number) => idx === 0 || !cell)) {
          break;
        }
      }
      return maxCol;
    };

    headerRows.forEach(rowIdx => {
      const tableWidth = getTableWidth(rowIdx);
      if (tableWidth > 1) {
        merges.push({
          s: { r: rowIdx, c: 1 },
          e: { r: rowIdx, c: tableWidth }
        });
      }
    });

    if (merges.length > 0) {
      ws['!merges'] = merges;
    }

    // ========================================================================
    // Hide Gridlines
    // ========================================================================
    (ws as any)['!views'] = [{
      showGridLines: false
    }];

    // ========================================================================
    // Add Worksheet and Write File
    // ========================================================================
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio Data");
    XLSX.writeFile(wb, filename);

  } catch (error) {
    console.error("Error generating Excel:", error);
    alert("Failed to generate Excel file");
  }
}
