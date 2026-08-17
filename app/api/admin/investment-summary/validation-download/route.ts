import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/app/lib/admin-utils";
import { getAllClientConfigs } from "@/app/lib/investment-summary/config";
import {
  computeInvestmentSummary,
  UnsupportedClientError,
  ClientNotFoundError,
} from "@/app/lib/investment-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/investment-summary/validation-download
 * GET /api/admin/investment-summary/validation-download?icodes=QUS001,QUS002
 *
 * Admin-only. Live equivalent of the Python pipeline's consolidated
 * validation_report.xlsx (main.py's build_consolidated_validation): for
 * every client, run the same computeInvestmentSummary() the individual
 * report/zip download uses, then pull cash check / investment total /
 * Zerodha account value / status straight out of that freshly-computed
 * data — no sync_jobs / historical run involved, matches the client set
 * download-all.ts uses.
 */
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
    const seen = new Set<string>();
    const clients: { icode: string; clientName: string }[] = [];
    for (const row of allRows.sort((a, b) => a.clientName.localeCompare(b.clientName))) {
      if (!seen.has(row.icode)) {
        seen.add(row.icode);
        clients.push({ icode: row.icode, clientName: row.clientName });
      }
    }
    const batch = selectedIcodes ? clients.filter((c) => selectedIcodes.has(c.icode)) : clients;

    type ValidationRow = {
      client: string;
      date: string;
      cashCheck: number;
      investmentTotal: number;
      zerodhaAccountValue: number;
      status: string;
    };
    const rows: ValidationRow[] = [];
    const errors: string[] = [];

    for (const { icode, clientName } of batch) {
      try {
        const data = await computeInvestmentSummary(icode);
        if (data.amountInvested.total === 0) continue;

        const cashCheck =
          data.overviewCashSummary?.rows.find((r) => r.label === "Check")?.amount ?? 0;
        const zerodhaAccountValue = data.currentAccountSummary.reduce((s, r) => s + r.amount, 0);
        const allPass = (data.validationChecks ?? []).every((c) => c.status === "PASS");

        rows.push({
          client: clientName,
          date: data.dataAsOfDate,
          cashCheck,
          investmentTotal: data.amountInvested.total,
          zerodhaAccountValue,
          status: allPass ? "SUCCESS" : "WARNINGS",
        });
      } catch (err) {
        if (err instanceof UnsupportedClientError || err instanceof ClientNotFoundError) continue;
        errors.push(`${icode} (${clientName}) — ${err instanceof Error ? err.message : String(err)}`);
        rows.push({
          client: clientName,
          date: "",
          cashCheck: 0,
          investmentTotal: 0,
          zerodhaAccountValue: 0,
          status: "ERROR",
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No validation rows could be generated", errors },
        { status: 500 },
      );
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Validation Report");

    const headers = ["Client Name", "Data Date", "Cash Check", "Investment Total", "Zerodha Account Value", "Status"];
    ws.addRow(headers).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9C12E" } };
    });

    for (const row of rows) {
      const wsRow = ws.addRow([
        row.client,
        row.date,
        Number(row.cashCheck.toFixed(4)),
        row.investmentTotal,
        row.zerodhaAccountValue,
        row.status,
      ]);
      if (row.status !== "SUCCESS") {
        wsRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4E4" } };
        });
      }
    }

    ws.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        maxLen = Math.max(maxLen, String(cell.value ?? "").length);
      });
      col.width = Math.min(maxLen + 2, 60);
    });

    if (errors.length > 0) {
      const errWs = wb.addWorksheet("Errors");
      errWs.columns = [{ header: "Error", key: "error", width: 100 }];
      for (const e of errors) errWs.addRow({ error: e });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const date = new Date().toISOString().slice(0, 10);
    const label = selectedIcodes ? `${rows.length}_clients` : "all_clients";

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="validation_report_${label}_${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("investment-summary/validation-download error:", err);
    return NextResponse.json({ error: "Failed to generate validation report" }, { status: 500 });
  }
}
