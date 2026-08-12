import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";
import {
  computeInvestmentSummary,
  UnsupportedClientError,
  ClientNotFoundError,
} from "@/app/lib/investment-summary";
import { buildInvestmentSummaryWorkbook } from "@/app/lib/investment-summary/xlsx-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ICODE_PATTERN = /^QUS[0-9]+$/i;

// Admin-only: generates an .xlsx matching the real Python pipeline's report
// layout (see xlsx-export.ts), computed live from the Postgres-native
// calculator — not a copy of a file on disk. Only covers icodes
// computeInvestmentSummary() supports (everyone except QUS0010 — see
// app/lib/investment-summary/index.ts's EXCLUDED_ICODES).
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const icode = new URL(req.url).searchParams.get("icode")?.trim();
  if (!icode || !ICODE_PATTERN.test(icode)) {
    return new NextResponse("Invalid or missing icode", { status: 400 });
  }

  let data;
  try {
    data = await computeInvestmentSummary(icode);
  } catch (err) {
    if (err instanceof UnsupportedClientError || err instanceof ClientNotFoundError) {
      return NextResponse.json({ error: "No report available for this client" }, { status: 404 });
    }
    throw err;
  }

  const wb = buildInvestmentSummaryWorkbook(data);
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `${data.clientName.replace(/[^a-zA-Z0-9]+/g, "_")}_Invst_Summary_${icode}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
