import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { requireAdmin } from "@/app/lib/admin-utils";
import { getAllClientConfigs } from "@/app/lib/investment-summary/config";
import {
  computeInvestmentSummary,
  UnsupportedClientError,
  ClientNotFoundError,
} from "@/app/lib/investment-summary";
import { buildInvestmentSummaryWorkbook } from "@/app/lib/investment-summary/xlsx-export";
import { getLiveAllocationForIcode } from "@/app/lib/investment-summary/live-allocation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/investment-summary/download-all
 * GET /api/admin/investment-summary/download-all?limit=5   ← test run
 *
 * Admin-only. Reads the client list directly from Master_Config.csv
 * (via getAllClientConfigs), so the set of icodes exactly matches what
 * computeInvestmentSummary supports. Clients that throw
 * UnsupportedClientError/ClientNotFoundError (e.g. QUS0010) or produce
 * a zero-total report are silently skipped. Per-client errors are logged
 * to _errors.txt inside the zip so the rest of the batch continues.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  // ?icodes=QUS001,QUS002,... — specific selection from the UI
  // No param → all clients from Master_Config.csv
  const icodesParam = searchParams.get("icodes");
  const selectedIcodes = icodesParam
    ? new Set(icodesParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  try {
    const allRows = await getAllClientConfigs();

    // Deduplicate by icode — Master_Config has one row per strategy.
    const seen = new Set<string>();
    const clients: { icode: string; clientName: string }[] = [];
    for (const row of allRows.sort((a, b) => a.clientName.localeCompare(b.clientName))) {
      if (!seen.has(row.icode)) {
        seen.add(row.icode);
        clients.push({ icode: row.icode, clientName: row.clientName });
      }
    }

    const batch = selectedIcodes ? clients.filter((c) => selectedIcodes.has(c.icode)) : clients;

    const zip = new JSZip();
    let totalFiles = 0;
    const errors: string[] = [];

    for (const { icode, clientName } of batch) {
      let data;
      try {
        data = await computeInvestmentSummary(icode);
      } catch (err) {
        if (err instanceof UnsupportedClientError || err instanceof ClientNotFoundError) {
          continue;
        }
        errors.push(`${icode} (${clientName}) — ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (data.amountInvested.total === 0) continue;

      try {
        const liveAllocation = await getLiveAllocationForIcode(icode, data);
        const wb = buildInvestmentSummaryWorkbook(data, liveAllocation);
        const buffer = await wb.xlsx.writeBuffer();
        const safeName = clientName.replace(/[/\\?%*:|"<>]/g, "_");
        zip.file(`${safeName}_Invst_Summary_${icode}.xlsx`, buffer);
        totalFiles++;
      } catch (err) {
        errors.push(`${icode} (${clientName}) — workbook error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (totalFiles === 0) {
      return NextResponse.json(
        { error: "No Investment Summary files could be generated", errors },
        { status: 500 },
      );
    }

    if (errors.length > 0) {
      zip.file("_errors.txt", errors.join("\n"));
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const label = selectedIcodes ? `${totalFiles}_clients` : "all_clients";
    const date = new Date().toISOString().slice(0, 10);

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="investment_summary_${label}_${date}.zip"`,
        "X-Files-Generated": String(totalFiles),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("investment-summary/download-all error:", err);
    return NextResponse.json({ error: "Failed to generate Investment Summary zip" }, { status: 500 });
  }
}
