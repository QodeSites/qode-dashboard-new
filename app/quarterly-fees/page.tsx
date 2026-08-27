"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../dashboard/layout";
import { FeesTable } from "@/components/FeesTable";
import type { FeesData } from "@/components/FeesTable";
import * as XLSX from "xlsx-js-style";
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
      <DashboardLayout page="quarterly-fees">
        <div className="flex items-center justify-center h-screen">
          <div className="text-card-text-secondary">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error || !session?.user) {
    return (
      <DashboardLayout page="quarterly-fees">
        <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
          {error || "Failed to load user data"}
        </div>
      </DashboardLayout>
    );
  }

  // Hardcoded fee data
  const totalFees: FeesData = {
    "2022": { q1: "-", q2: "-", q3: "35297.87", q4: "191023.76", total: "226321.63" },
    "2023": { q1: "186871.07", q2: "188947.41", q3: "432749.52", q4: "1499186.69", total: "2307754.70" },
    "2024": { q1: "1771936.35", q2: "3419092.44", q3: "4658621.93", q4: "5687534.29", total: "15537185.00" },
    "2025": { q1: "7802830.42", q2: "7732665.25", q3: "5297606.19", q4: "5582892.53", total: "26415994.38" },
    "2026": { q1: "51647013.05", q2: "-", q3: "-", q4: "-", total: "51647013.05" },
  };

  const zerodhaFees: FeesData = {
    "2022": { q1: "-", q2: "-", q3: "35297.87", q4: "191023.76", total: "226321.63" },
    "2023": { q1: "186871.07", q2: "188947.41", q3: "432749.52", q4: "1499186.69", total: "2307754.70" },
    "2024": { q1: "1771936.35", q2: "3419092.44", q3: "4658621.93", q4: "5687534.29", total: "15537185.00" },
    "2025": { q1: "7802830.42", q2: "7039398.56", q3: "4229977.78", q4: "4376154.01", total: "23448360.76" },
    "2026": { q1: "41978798.13", q2: "-", q3: "-", q4: "-", total: "41978798.13" },
  };

  const pmsFees: FeesData = {
    "2025": { q1: "-", q2: "693266.69", q3: "1067628.41", q4: "1206738.52", total: "2967633.62" },
    "2026": { q1: "9668214.92", q2: "-", q3: "-", q4: "-", total: "9668214.92" },
  };

  // Excel Download Function with styled headers
  const handleDownloadExcel = () => {
    try {
      const wsData: any[][] = [];
      const headerRowIndices: number[] = [];
      const subHeaderRowIndices: number[] = [];

      // Add Qode symbol/logo as title and empty row
      wsData.push(["", "Qode"]);
      wsData.push([]);

      // Fee Schedule Summary Section
      headerRowIndices.push(wsData.length);
      wsData.push(["", "Costs Schedule Summary"]);
      wsData.push(["", "Generated on:", new Date().toLocaleString("en-IN")]);
      wsData.push(["", "Account:", session?.user?.name || "N/A"]);
      wsData.push([]);

      // Helper to add a fee section
      const addFeeSection = (title: string, fees: FeesData) => {
        headerRowIndices.push(wsData.length);
        wsData.push(["", title]);
        subHeaderRowIndices.push(wsData.length);
        wsData.push(["", "Year", "Q1 (₹)", "Q2 (₹)", "Q3 (₹)", "Q4 (₹)", "Total (₹)"]);
        Object.keys(fees)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .forEach((year) => {
            const data = fees[year];
            wsData.push([
              "",
              year,
              data.q1 === "-" ? "-" : parseFloat(data.q1) || 0,
              data.q2 === "-" ? "-" : parseFloat(data.q2) || 0,
              data.q3 === "-" ? "-" : parseFloat(data.q3) || 0,
              data.q4 === "-" ? "-" : parseFloat(data.q4) || 0,
              data.total === "-" ? "-" : parseFloat(data.total) || 0,
            ]);
          });
      };

      // Total Fees Section
      addFeeSection("Total Costs", totalFees);
      wsData.push([]);

      // Zerodha Fees Section
      addFeeSection("Zerodha Costs", zerodhaFees);
      wsData.push([
        "",
        "Note: Zerodha costs figures are as of 31 March 2026 and include both collections and accruals.",
      ]);
      wsData.push([]);

      // PMS Fees Section
      addFeeSection("PMS Costs", pmsFees);
      wsData.push([
        "",
        "Note: PMS costs figures are as of 31 March 2026 and include both collections and accruals.",
      ]);
      wsData.push([
        "",
        "Disclaimer: The costs listed for PMS represent the agreed-upon quarterly Management Fee and Performance Fees. Performance Fee is calculated separately and charged at the end of the respective financial year.",
      ]);
      wsData.push([]);


      // Create worksheet from data
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Get worksheet range
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

      // Calculate auto-fit column widths based on content
      const maxCols = Math.max(...wsData.map((row) => row.length));
      const colWidths: { wch: number }[] = [];

      for (let C = 0; C < maxCols; C++) {
        if (C === 0) {
          colWidths.push({ wch: 2 });
          continue;
        }

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
      ws["!cols"] = colWidths;

      // Define border style for tables
      const tableBorder = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
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
        numFmt: "#,##,##0.00",
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
          if (rowData[i] !== undefined && rowData[i] !== null && rowData[i] !== "") {
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
          if (cellValue === null || cellValue === undefined || cellValue === "") continue;

          if (R === 0) {
            ws[cellAddress].s = titleStyle;
            continue;
          }

          if (R >= 1 && R <= 1) continue;

          // Ensure numbers are typed correctly, but skip year column (C === 1)
          if (C === 1) {
            ws[cellAddress].t = "s";
          } else if (typeof ws[cellAddress].v === "number") {
            ws[cellAddress].t = "n";
            ws[cellAddress].z = "#,##,##0.00";
          } else if (typeof ws[cellAddress].v === "string") {
            if (ws[cellAddress].v === "-") {
              ws[cellAddress].t = "s";
            } else {
              const trimmed = ws[cellAddress].v.trim();
              const num = parseFloat(trimmed);
              if (!isNaN(num) && trimmed === String(num)) {
                ws[cellAddress].v = num;
                ws[cellAddress].t = "n";
                ws[cellAddress].z = "#,##,##0.00";
              } else {
                ws[cellAddress].t = "s";
              }
            }
          }

          if (isTableRow(R)) {
            if (C === 0) {
              continue;
            } else if (headerRowIndices.includes(R)) {
              ws[cellAddress].s = headerStyle;
            } else if (subHeaderRowIndices.includes(R)) {
              ws[cellAddress].s = subHeaderStyle;
            } else {
              if (C === 1) {
                ws[cellAddress].s = textStyle;
              } else if (ws[cellAddress].t === "n") {
                ws[cellAddress].s = numberStyle;
              } else {
                ws[cellAddress].s = {
                  ...textStyle,
                  alignment: { horizontal: "right", vertical: "center" },
                };
              }
            }
          } else {
            ws[cellAddress].s = textStyle;
          }
        }
      }

      // Merge cells for headers
      const merges: any[] = [];

      const getTableWidth = (startRow: number) => {
        let maxCol = 1;
        for (let r = startRow; r < Math.min(startRow + 15, wsData.length); r++) {
          if (wsData[r]) {
            for (let c = 1; c < wsData[r].length; c++) {
              if (wsData[r][c] !== undefined && wsData[r][c] !== null && wsData[r][c] !== "") {
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

      headerRowIndices.forEach((rowIdx) => {
        const tableWidth = getTableWidth(rowIdx);
        if (tableWidth > 1) {
          merges.push({
            s: { r: rowIdx, c: 1 },
            e: { r: rowIdx, c: tableWidth },
          });
        }
      });

      if (merges.length > 0) {
        ws["!merges"] = merges;
      }

      // Hide gridlines
      (ws as any)["!views"] = [{ showGridLines: false }];

      // Create workbook and download
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cost Schedule");

      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `Cost_Schedule_${session?.user?.name || "User"}_${timestamp}.xlsx`;

      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Error generating Excel:", err);
      setError("Failed to generate Excel file");
    }
  };

  return (
    <DashboardLayout page="quarterly-fees">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-card-text-secondary font-heading">
              Costs Summary
            </h1>
            <p className="text-sm text-card-text-secondary/70">
              View your quarterly costs breakdown
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
        <FeesTable fees={totalFees} title="Total Costs (₹)" />

        {/* Zerodha Fees Table */}
        <FeesTable fees={zerodhaFees} title="Zerodha Costs (₹)" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Note: Zerodha costs figures are as of 31 March 2026 and include both
          collections and accruals.
        </p>

        {/* PMS Fees Table */}
        <FeesTable fees={pmsFees} title="PMS Costs (₹)" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Note: PMS costs figures are as of 31 March 2026 and include both
          collections and accruals.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Disclaimer: The costs listed for PMS represent the agreed-upon
          quarterly Management Fee and Performance Fees. Performance Fee is
          calculated separately and charged at the end of the respective
          financial year.
        </p>
      </div>
    </DashboardLayout>
  );
}
