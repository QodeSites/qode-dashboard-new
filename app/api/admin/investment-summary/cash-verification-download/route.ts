import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/app/lib/admin-utils";
import { getAllClientConfigs, getBaseTags } from "@/app/lib/investment-summary/config";
import { getMastersheetRows } from "@/app/lib/investment-summary/mastersheet";
import { loadCashTransactions } from "@/app/lib/investment-summary/cash-inputs";
import {
  verifyClient,
  buildSummaryTable,
  type VerificationRow,
} from "@/app/lib/investment-summary/cash-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLOR_TITLE = "FF004C2F";
const COLOR_HEADER = "FFD9C12E";
const COLOR_WHITE = "FFFFFFFF";
const COLOR_BLACK = "FF000000";
const NUMBER_FORMAT_INR = "#,##0.00;(#,##0.00)";

const borderAll: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLOR_BLACK } },
  left: { style: "thin", color: { argb: COLOR_BLACK } },
  bottom: { style: "thin", color: { argb: COLOR_BLACK } },
  right: { style: "thin", color: { argb: COLOR_BLACK } },
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function titleRow(ws: ExcelJS.Worksheet, title: string, ncols: number): void {
  ws.mergeCells(1, 1, 1, ncols);
  for (let c = 1; c <= ncols; c++) {
    const cell = ws.getRow(1).getCell(c);
    cell.border = borderAll;
    cell.fill = fill(COLOR_TITLE);
  }
  const first = ws.getRow(1).getCell(1);
  first.value = title;
  first.font = { name: "Arial", size: 10, bold: true, color: { argb: COLOR_WHITE } };
  first.alignment = { horizontal: "left", vertical: "middle" };
}

function headerRowAt(ws: ExcelJS.Worksheet, row: number, headers: string[]): void {
  headers.forEach((h, i) => {
    const cell = ws.getRow(row).getCell(i + 1);
    cell.value = h;
    cell.fill = fill(COLOR_HEADER);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: COLOR_BLACK } };
    cell.border = borderAll;
    cell.alignment = { horizontal: "left", vertical: "middle" };
  });
}

function bodyCell(cell: ExcelJS.Cell, value: string | number | null, align: "left" | "right" = "left"): void {
  cell.value = value === null ? "" : value;
  if (typeof value === "number") cell.numFmt = NUMBER_FORMAT_INR;
  cell.fill = fill(COLOR_WHITE);
  cell.font = { name: "Arial", size: 10, color: { argb: COLOR_BLACK } };
  cell.border = borderAll;
  cell.alignment = { horizontal: align, vertical: "middle" };
}

function autoColWidths(ws: ExcelJS.Worksheet, minWidth = 12, maxWidth = 60): void {
  ws.columns.forEach((col) => {
    let maxLen = 0;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 2, minWidth), maxWidth);
  });
}

function round2(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Math.round(v * 100) / 100;
}

const DETAIL_HEADERS = ["Client", "Strategy", "Date", "Category", "Status", "Expected", "Recorded", "Note"];
const ISSUE_STATUSES = new Set(["MISMATCH", "MISSING", "EXTRA", "NO_DATA", "NEEDS_MANUAL_CHECK", "UNEXPECTED_ENTRY"]);

function writeDetailSheet(ws: ExcelJS.Worksheet, title: string, rows: VerificationRow[]): void {
  titleRow(ws, title, DETAIL_HEADERS.length);
  headerRowAt(ws, 2, DETAIL_HEADERS);
  let r = 3;
  for (const row of rows) {
    let expectedVal = row.expected ?? null;
    if (expectedVal === null && row.category === "TRANSITION_CLOSE") expectedVal = row.closingValue ?? null;

    bodyCell(ws.getRow(r).getCell(1), row.client);
    bodyCell(ws.getRow(r).getCell(2), row.strategy);
    bodyCell(ws.getRow(r).getCell(3), row.date ?? "");
    bodyCell(ws.getRow(r).getCell(4), row.category);
    bodyCell(ws.getRow(r).getCell(5), row.status ?? "");
    bodyCell(ws.getRow(r).getCell(6), round2(expectedVal), "right");
    bodyCell(ws.getRow(r).getCell(7), round2(row.recorded), "right");
    bodyCell(ws.getRow(r).getCell(8), row.note ?? "");
    r++;
  }
  autoColWidths(ws);
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const icodesParam = searchParams.get("icodes");
  const selectedIcodes = icodesParam
    ? new Set(icodesParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  try {
    const allRows = await getAllClientConfigs();
    const baseTags = await getBaseTags();
    const cashTransactions = await loadCashTransactions();

    // Group Master_Config.csv rows by icode (every strategy this client has ever held).
    const byIcode = new Map<string, typeof allRows>();
    for (const row of allRows) {
      const list = byIcode.get(row.icode) ?? [];
      list.push(row);
      byIcode.set(row.icode, list);
    }

    const icodes = selectedIcodes ? [...selectedIcodes] : [...byIcode.keys()];
    icodes.sort((a, b) => {
      const nameA = byIcode.get(a)?.[0]?.clientName ?? a;
      const nameB = byIcode.get(b)?.[0]?.clientName ?? b;
      return nameA.localeCompare(nameB);
    });

    const allResults: VerificationRow[] = [];
    const errors: string[] = [];

    for (const icode of icodes) {
      const timelineRows = byIcode.get(icode);
      if (!timelineRows || timelineRows.length === 0) continue;

      const clientName = timelineRows[0].clientName;
      const qcode = timelineRows[0].qcode;

      try {
        const mastersheetRows = await getMastersheetRows(qcode);
        if (mastersheetRows.length === 0) {
          allResults.push({
            client: clientName,
            strategy: "(all)",
            date: null,
            category: "NO_MASTERSHEET_TAG",
            status: "NO_DATA",
            note: "Mastersheet could not be fetched/loaded for this client.",
          });
          continue;
        }
        const clientResults = verifyClient(clientName, timelineRows, mastersheetRows, cashTransactions, baseTags);
        allResults.push(...clientResults);
      } catch (err) {
        errors.push(`${icode} (${clientName}) — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (allResults.length === 0) {
      return NextResponse.json({ error: "No verification rows could be generated", errors }, { status: 500 });
    }

    const summaryRows = buildSummaryTable(allResults);

    const wb = new ExcelJS.Workbook();

    // --- Summary sheet ---
    const summaryHeaders = [
      "Client",
      "Strategy",
      "# Dates Checked",
      "# Match",
      "# Mismatch",
      "# Missing",
      "# Extra",
      "# Internal (unverified)",
      "No Data Flag",
    ];
    const ws1 = wb.addWorksheet("Summary");
    titleRow(ws1, "Cash Transactions Verification — Summary", summaryHeaders.length);
    headerRowAt(ws1, 2, summaryHeaders);
    let r = 3;
    for (const s of summaryRows) {
      bodyCell(ws1.getRow(r).getCell(1), s.client);
      bodyCell(ws1.getRow(r).getCell(2), s.strategy);
      bodyCell(ws1.getRow(r).getCell(3), s.datesChecked, "right");
      bodyCell(ws1.getRow(r).getCell(4), s.match, "right");
      bodyCell(ws1.getRow(r).getCell(5), s.mismatch, "right");
      bodyCell(ws1.getRow(r).getCell(6), s.missing, "right");
      bodyCell(ws1.getRow(r).getCell(7), s.extra, "right");
      bodyCell(ws1.getRow(r).getCell(8), s.internalUnverified, "right");
      bodyCell(ws1.getRow(r).getCell(9), s.noDataFlag);
      // integer columns shouldn't carry the money format
      for (const col of [3, 4, 5, 6, 7, 8]) ws1.getRow(r).getCell(col).numFmt = "0";
      r++;
    }
    autoColWidths(ws1);

    // --- Issues sheet: everything that needs a human look ---
    const issueRows = allResults.filter((row) => row.status && ISSUE_STATUSES.has(row.status));
    const ws2 = wb.addWorksheet("Issues");
    writeDetailSheet(ws2, "Rows Needing Attention (Mismatch / Missing / Extra / No Data / Needs Check)", issueRows);

    // --- All Details sheet: full log ---
    const ws3 = wb.addWorksheet("All Details");
    writeDetailSheet(ws3, "Full Verification Log", allResults);

    if (errors.length > 0) {
      const errWs = wb.addWorksheet("Errors");
      errWs.columns = [{ header: "Error", key: "error", width: 100 }];
      for (const e of errors) errWs.addRow({ error: e });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const date = new Date().toISOString().slice(0, 10);
    const label = selectedIcodes ? `${icodes.length}_clients` : "all_clients";

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cash_verification_${label}_${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("investment-summary/cash-verification-download error:", err);
    return NextResponse.json({ error: "Failed to generate cash verification Excel" }, { status: 500 });
  }
}
