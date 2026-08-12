import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/app/lib/admin-utils";
import { getAllClientConfigs } from "@/app/lib/investment-summary/config";
import { calcValidationSummary } from "@/app/lib/investment-summary/validation";
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
 * Admin-only, internal use (per validation.ts's doc comment — these checks
 * aren't surfaced to clients). Unlike download-all (one .xlsx per client,
 * zipped), this is ONE consolidated .xlsx with one row per client, pulling
 * the "Check" (cash reconciliation) and "Current Zerodha Cash" rows straight
 * off each client's combined overviewCashSummary — same numbers the old
 * legacy pipeline's validation table (Client / Cash Check / Investment
 * Total / Zerodha Value / Status) used to show, now computed live from
 * Postgres instead of the Python job's result_json.
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

    interface ResultRow {
      icode: string;
      clientName: string;
      dataAsOfDate: string;
      cashCheck: number;
      investmentTotal: number;
      zerodhaValue: number;
      status: "SUCCESS" | "WARNINGS";
    }

    const results: ResultRow[] = [];
    const errors: string[] = [];

    for (const { icode, clientName } of batch) {
      try {
        const data = await computeInvestmentSummary(icode);
        if (data.amountInvested.total === 0) continue;

        const cashCheck =
          data.overviewCashSummary?.rows.find((r) => r.label === "Check")?.amount ?? 0;
        // "Current Zerodha Cash" on the COMBINED summary is set to the raw
        // account_value (see strategy-summaries.ts calcCombinedSummary,
        // `currentZerodhaCash = acctSummary.accountValue`) — same source
        // main.py's build_consolidated_validation uses for its "Zerodha
        // Account Value" column (validation_acct["account_value"]).
        const zerodhaValue =
          data.overviewCashSummary?.rows.find((r) => r.label === "Current Zerodha Cash")?.amount ?? 0;

        // Mirrors main.py's row["status"]: "SUCCESS" only if every one of
        // the 5 validation checks passes, "WARNINGS" otherwise — not just
        // the cash check in isolation.
        const checks = calcValidationSummary(data);
        const status: "SUCCESS" | "WARNINGS" = checks.every((c) => c.status === "PASS")
          ? "SUCCESS"
          : "WARNINGS";

        results.push({
          icode,
          clientName: data.clientName,
          dataAsOfDate: data.dataAsOfDate,
          cashCheck,
          investmentTotal: data.amountInvested.total,
          zerodhaValue,
          status,
        });
      } catch (err) {
        if (err instanceof UnsupportedClientError || err instanceof ClientNotFoundError) continue;
        errors.push(`${icode} (${clientName}) — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No validation rows could be generated", errors },
        { status: 500 },
      );
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Cash Validation");

    ws.columns = [
      { header: "Client", key: "clientName", width: 30 },
      { header: "icode", key: "icode", width: 12 },
      { header: "Data As Of", key: "dataAsOfDate", width: 14 },
      { header: "Cash Check", key: "cashCheck", width: 16, style: { numFmt: "#,##0.00;(#,##0.00)" } },
      { header: "Investment Total", key: "investmentTotal", width: 18, style: { numFmt: "#,##0.00;(#,##0.00)" } },
      { header: "Zerodha Value", key: "zerodhaValue", width: 18, style: { numFmt: "#,##0.00;(#,##0.00)" } },
      { header: "Status", key: "status", width: 10 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF000000" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9C12E" } };
    headerRow.alignment = { horizontal: "left", vertical: "middle" };

    for (const r of results) {
      const row = ws.addRow(r);
      const statusCell = row.getCell("status");
      statusCell.font = {
        name: "Arial",
        size: 10,
        bold: true,
        color: { argb: r.status === "SUCCESS" ? "FF006400" : "FFCC0000" },
      };
    }

    if (errors.length > 0) {
      const errWs = wb.addWorksheet("Errors");
      errWs.columns = [{ header: "Error", key: "error", width: 100 }];
      for (const e of errors) errWs.addRow({ error: e });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const date = new Date().toISOString().slice(0, 10);
    const label = selectedIcodes ? `${results.length}_clients` : "all_clients";

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cash_validation_${label}_${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("investment-summary/validation-download error:", err);
    return NextResponse.json({ error: "Failed to generate validation Excel" }, { status: 500 });
  }
}
