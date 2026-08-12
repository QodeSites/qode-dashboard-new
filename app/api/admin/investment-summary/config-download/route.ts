import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAdmin } from "@/app/lib/admin-utils";
import { INVESTMENT_SUMMARY_CONFIG_DIR } from "@/app/lib/investment-summary/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same whitelist as config-upload/route.ts's CALC_CONFIG_FILE_RULES keys —
// kept as a plain array here since download doesn't need the validation
// rules, only the filename whitelist (path traversal protection: the
// filename never touches the filesystem unless it's a known entry).
const ACCEPTED_FILES = [
  "Master_Config.csv",
  "cash_transactions.csv",
  "miscellaneous.csv",
  "historical_mf_transactions.csv",
];

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const filename = new URL(req.url).searchParams.get("file")?.trim() ?? "";
    if (!ACCEPTED_FILES.includes(filename)) {
      return NextResponse.json(
        { error: `Unknown file: '${filename}'`, accepted: ACCEPTED_FILES },
        { status: 400 },
      );
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(path.join(INVESTMENT_SUMMARY_CONFIG_DIR, filename));
    } catch {
      return NextResponse.json(
        { error: `${filename} does not exist on the server yet` },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("investment-summary/config-download error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
