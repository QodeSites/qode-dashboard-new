import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import { promises as fs } from "fs";
import path from "path";
import { parseInvestmentXlsx } from "@/app/lib/parse-investment-pdf";
import { reportsDirsForAccess } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ICODE_PATTERN = /^QUS[0-9]+$/i;

// Satidham (New, QUS00081) has no investment-summary report of its own —
// it's linked to the old Satidham account (QUS0010) via "Scheme QAW++
// QUS00081", so its report lookup uses QUS0010's file instead.
const REPORT_ICODE_ALIAS: Record<string, string> = {
  QUS00081: "QUS0010",
};

// Admins review from reports_staging (falling back to live); clients see live.
async function findReportByIcode(
  icode: string,
  dirs: string[],
): Promise<{ dir: string; fileName: string } | null> {
  const suffix = `_${icode}.xlsx`.toLowerCase();
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    const fileName = entries.find((n) => n.toLowerCase().endsWith(suffix));
    if (fileName) return { dir, fileName };
  }
  return null;
}

async function findStrategyPdfs(
  icode: string,
  dirs: string[],
): Promise<Record<string, boolean>> {
  const pattern = new RegExp(`_${icode}_(.+)\\.pdf$`, "i");
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    const result: Record<string, boolean> = {};
    for (const name of entries) {
      const match = name.match(pattern);
      if (match) result[match[1]] = true;
    }
    if (Object.keys(result).length > 0) return result;
  }
  return {};
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

    const reportIcode = REPORT_ICODE_ALIAS[icode] ?? icode;

    const dirs = reportsDirsForAccess(isAdmin);
    const found = await findReportByIcode(reportIcode, dirs);
    if (!found) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const resolved = path.resolve(found.dir, found.fileName);
    if (!resolved.startsWith(path.resolve(found.dir) + path.sep)) {
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
    const strategyPdfAvailability = await findStrategyPdfs(reportIcode, dirs);

    return NextResponse.json(
      { ...data, strategyPdfAvailability },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("investment-summary error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
