"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../dashboard/layout";
import { FeesTable } from "@/components/FeesTable";
import type { Stats } from "@/app/lib/dashboard-types";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QuarterlyFeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // User type detection - only Sarla users
  const isSarla = session?.user?.icode === "QUS0007";
  // Authentication check
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && !isSarla) {
      setError("Quarterly fees are only available for Sarla users");
    }
  }, [status, router, isSarla]);
  // Loading state
  if (status === "loading") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-card-text-secondary">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }
  // Error state
  if (error || !session?.user) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
          {error || "Failed to load user data"}
        </div>
      </DashboardLayout>
    );
  }
  // Hardcoded fee data
  const totalFees: Stats["fees"] = {
    "2022": { q1: "-", q2: "-", q3: "41651.49", q4: "225408.07", total: "267059.56" },
    "2023": { q1: "220507.89", q2: "222957.98", q3: "510644.45", q4: "1769040.29", total: "2723150.61" },
    "2024": { q1: "2090884.88", q2: "4034529.06", q3: "5497173.86", q4: "6711290.47", total: "18333878.27" },
    "2025": { q1: "9207339.89", q2: "9124544.94", q3: "6251175.31", q4: "6587813.20", total: "31170873.33" },
  };
  const zerodhaFees: Stats["fees"] = {
    "2022": { q1: "-", q2: "-", q3: "41651.49", q4: "225408.07", total: "267059.56" },
    "2023": { q1: "220507.89", q2: "222957.98", q3: "510644.45", q4: "1769040.29", total: "2723150.61" },
    "2024": { q1: "2090884.88", q2: "4034529.06", q3: "5497173.86", q4: "6711290.47", total: "18333878.27" },
    "2025": { q1: "9207339.89", q2: "8306490.30", q3: "4991373.79", q4: "5163861.74", total: "27669065.72" },
  };
  const pmsFees: Stats["fees"] = {
    "2025": { q1: "818054.64", q2: "1259801.52", q3: "1423951.46", q4: "-", total: "3501807.62" },
  };

  // Excel Download Function with styled headers
  const handleDownloadExcel = () => {
    try {
      // Build comprehensive data array
      const wsData: any[][] = [];
      const headerRowIndices: number[] = [];
      const subHeaderRowIndices: number[] = [];

      // Add Qode symbol/logo as title and empty row (Q in column B)
      wsData.push(["", "Q"]);
      wsData.push([]);

      // Fee Schedule Summary Section
      headerRowIndices.push(wsData.length);
      wsData.push(["", 'Fee Schedule Summary']);
      wsData.push(["", 'Generated on:', new Date().toLocaleString('en-IN')]);
      wsData.push(["", 'Account:', session?.user?.name || 'N/A']);
      wsData.push([]);

      // Total Fees Section
      headerRowIndices.push(wsData.length);
      wsData.push(["", 'Total Fees']);
      subHeaderRowIndices.push(wsData.length);
      wsData.push(["", 'Year', 'Q1', 'Q2', 'Q3', 'Q4', 'Total']);
      Object.keys(totalFees).sort((a, b) => parseInt(a) - parseInt(b)).forEach(year => {
        const data = totalFees[year];
        wsData.push([
          "",
          year,
          data.q1 === "-" ? "-" : parseFloat(data.q1) || 0,
          data.q2 === "-" ? "-" : parseFloat(data.q2) || 0,
          data.q3 === "-" ? "-" : parseFloat(data.q3) || 0,
          data.q4 === "-" ? "-" : parseFloat(data.q4) || 0,
          data.total === "-" ? "-" : parseFloat(data.total) || 0
        ]);
      });
      wsData.push([]);

      // Zerodha Fees Section
      headerRowIndices.push(wsData.length);
      wsData.push(["", 'Zerodha Fees']);
      subHeaderRowIndices.push(wsData.length);
      wsData.push(["", 'Year', 'Q1', 'Q2', 'Q3', 'Q4', 'Total']);
      Object.keys(zerodhaFees).sort((a, b) => parseInt(a) - parseInt(b)).forEach(year => {
        const data = zerodhaFees[year];
        wsData.push([
          "",
          year,
          data.q1 === "-" ? "-" : parseFloat(data.q1) || 0,
          data.q2 === "-" ? "-" : parseFloat(data.q2) || 0,
          data.q3 === "-" ? "-" : parseFloat(data.q3) || 0,
          data.q4 === "-" ? "-" : parseFloat(data.q4) || 0,
          data.total === "-" ? "-" : parseFloat(data.total) || 0
        ]);
      });
      wsData.push(["", 'Note: Zerodha fee figures are as of 31 December 2025 and include both collections and accruals.']);
      wsData.push([]);

      // PMS Fees Section
      headerRowIndices.push(wsData.length);
      wsData.push(["", 'PMS Fees']);
      subHeaderRowIndices.push(wsData.length);
      wsData.push(["", 'Year', 'Q1', 'Q2', 'Q3', 'Q4', 'Total']);
      Object.keys(pmsFees).sort((a, b) => parseInt(a) - parseInt(b)).forEach(year => {
        const data = pmsFees[year];
        wsData.push([
          "",
          year,
          data.q1 === "-" ? "-" : parseFloat(data.q1) || 0,
          data.q2 === "-" ? "-" : parseFloat(data.q2) || 0,
          data.q3 === "-" ? "-" : parseFloat(data.q3) || 0,
          data.q4 === "-" ? "-" : parseFloat(data.q4) || 0,
          data.total === "-" ? "-" : parseFloat(data.total) || 0
        ]);
      });
      wsData.push(["", 'Note: PMS fee figures are as of 31 December 2025 and include both collections and accruals.']);
      wsData.push(["", 'Disclaimer: The fees listed for PMS represent the agreed-upon quarterly Management Fee only. This amount excludes the Performance Fee, which is calculated separately and charged at the end of the respective financial year.']);
      wsData.push([]);

      // Common Note
      wsData.push(["", '*Fee figures are inclusive of GST@18%']);

      // Create worksheet from data
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Get worksheet range
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

      // Calculate auto-fit column widths based on content
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

      // Define border style for tables
      const tableBorder = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
      };

      // Define header style with dark green background (#02422B) and white text
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

      // Define sub-header style with #DABD38 background and #02422B text (dark green)
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

      // Define regular cell styles with borders
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

      // Helper function to check if a row is part of a table (has data in column B or later)
      const isTableRow = (rowIdx: number) => {
        // Skip title and empty rows
        if (rowIdx <= 1) return false;

        // Check if this row has any data in columns B onwards
        const rowData = wsData[rowIdx];
        if (!rowData) return false;

        for (let i = 1; i < rowData.length; i++) {
          if (rowData[i] !== undefined && rowData[i] !== null && rowData[i] !== '') {
            return true;
          }
        }
        return false;
      };

      // Apply styles to all cells
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;

          const cellValue = ws[cellAddress].v;

          // Skip styling for truly empty cells
          if (cellValue === null || cellValue === undefined || cellValue === '') {
            continue;
          }

          // Apply title style to first row (QODE)
          if (R === 0) {
            ws[cellAddress].s = titleStyle;
            continue;
          }

          // Skip styling for empty rows (row 1)
          if (R >= 1 && R <= 1) {
            continue;
          }

          // Ensure numbers are typed correctly and format to 2 decimal places
          if (typeof ws[cellAddress].v === 'number') {
            ws[cellAddress].t = 'n';
            ws[cellAddress].z = '0.00';
          } else if (typeof ws[cellAddress].v === 'string') {
            if (ws[cellAddress].v === '-') {
              ws[cellAddress].t = 's';
            } else {
              const trimmed = ws[cellAddress].v.trim();
              const num = parseFloat(trimmed);
              if (!isNaN(num) && trimmed === String(num)) {
                ws[cellAddress].v = num;
                ws[cellAddress].t = 'n';
                ws[cellAddress].z = '0.00';
              } else {
                ws[cellAddress].t = 's';
              }
            }
          }

          // Only apply styles with borders if this is a table row and cell has content
          if (isTableRow(R)) {
            // Skip column A (index 0) - it should remain empty with no styling
            if (C === 0) {
              continue;
            } else if (headerRowIndices.includes(R)) {
              // Apply header style to header rows (only columns B onwards)
              ws[cellAddress].s = headerStyle;
            } else if (subHeaderRowIndices.includes(R)) {
              // Apply sub-header style with #DABD38 background (only columns B onwards)
              ws[cellAddress].s = subHeaderStyle;
            } else {
              // Regular cell styling based on type and column
              if (C === 1) {
                ws[cellAddress].s = textStyle;
              } else if (ws[cellAddress].t === 'n') {
                ws[cellAddress].s = numberStyle;
              } else {
                const rightAlignedTextStyle = {
                  ...textStyle,
                  alignment: {
                    horizontal: "right",
                    vertical: "center"
                  }
                };
                ws[cellAddress].s = rightAlignedTextStyle;
              }
            }
          } else {
            ws[cellAddress].s = textStyle;
          }
        }
      }

      // Merge cells for headers (merge across full table width)
      const merges: any[] = [];

      // Helper function to find the max column width for a section
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

      // Merge header rows across full table width
      headerRowIndices.forEach(rowIdx => {
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

      // Set worksheet view to hide gridlines
      (ws as any)['!views'] = [{
        showGridLines: false
      }];

      // Create workbook and add worksheet
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Fee Schedule");

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `Fee_Schedule_${session?.user?.name || 'User'}_${timestamp}.xlsx`;

      // Write and download
      XLSX.writeFile(wb, filename);

    } catch (error) {
      console.error('Error generating Excel:', error);
      setError('Failed to generate Excel file');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-card-text-secondary font-heading">
              Fee Summary
            </h1>
            <p className="text-sm text-card-text-secondary/70">
              View your quarterly fee breakdown
            </p>
          </div>
          <Button
            onClick={handleDownloadExcel}
            className="h-11 px-4 text-sm font-medium"
            variant="default"
          >
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>
        {/* Total Fees Table */}
        <FeesTable fees={totalFees} title="Total Fees (₹)" />
        {/* Zerodha Fees Table */}
        <FeesTable fees={zerodhaFees} title="Zerodha Fees (₹)" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Note: Zerodha fee figures are as of 31 December 2025 and include both collections and accruals.
        </p>
        {/* PMS Fees Table */}
        <FeesTable fees={pmsFees} title="PMS Fees (₹)" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Note: PMS fee figures are as of 31 December 2025 and include both collections and accruals.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Disclaimer: The fees listed for PMS represent the agreed-upon quarterly Management Fee only. This amount excludes the Performance Fee, which is calculated separately and charged at the end of the respective financial year.
        </p>
        {/* Common GST Note */}
        <p className="text-sm text-gray-500 dark:text-gray-500">
          *Fee figures are inclusive of GST@18%
        </p>
      </div>
    </DashboardLayout>
  );
}