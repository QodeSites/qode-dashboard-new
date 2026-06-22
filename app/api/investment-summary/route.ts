import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import { promises as fs } from "fs";
import path from "path";
import { parseInvestmentXlsx } from "@/app/lib/parse-investment-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORTS_DIR = path.join(process.cwd(), "data", "reports");
const ICODE_PATTERN = /^QUS[0-9]+$/i;

async function findReportByIcode(icode: string): Promise<string | null> {
  const suffix = `_${icode}.xlsx`.toLowerCase();
  let entries: string[];
  try {
    entries = await fs.readdir(REPORTS_DIR);
  } catch {
    return null;
  }
  return entries.find((n) => n.toLowerCase().endsWith(suffix)) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user)
      return new NextResponse("Unauthorized", { status: 401 });

    const accessType = (session.user as { accessType?: string }).accessType;
    const isAdmin = accessType === "admin";

    const { searchParams } = new URL(req.url);
    const requestedIcode = searchParams.get("icode")?.trim();
    const ownIcode = getEffectiveIcode(session);
    const icode = isAdmin && requestedIcode ? requestedIcode : ownIcode;

    if (!icode || !ICODE_PATTERN.test(icode)) {
      return new NextResponse("Invalid or missing icode", { status: 400 });
    }

    const fileName = await findReportByIcode(icode);
    if (!fileName) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const resolved = path.resolve(REPORTS_DIR, fileName);
    if (!resolved.startsWith(path.resolve(REPORTS_DIR) + path.sep)) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(resolved);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }
      throw err;
    }

    const data = parseInvestmentXlsx(fileBuffer);

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    console.error("investment-summary error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
