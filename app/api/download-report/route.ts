import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import { promises as fs } from "fs";
import path from "path";

const REPORTS_DIR = path.join(process.cwd(), "data", "reports");

// Reports are stored as "<ClientName>_Invst_Summary_<icode>.pdf".
// Client names vary, so we resolve the file by matching the icode suffix.
const ICODE_PATTERN = /^QUS[0-9]+$/i;

async function findReportByIcode(icode: string): Promise<string | null> {
  const suffix = `_${icode}.pdf`.toLowerCase();
  let entries: string[];
  try {
    entries = await fs.readdir(REPORTS_DIR);
  } catch {
    return null;
  }
  const match = entries.find((name) => name.toLowerCase().endsWith(suffix));
  return match ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const accessType = (session.user as { accessType?: string }).accessType;
    const isAdmin = accessType === "admin";

    // Admins may request any client's report via ?icode=; everyone else is
    // locked to their own (impersonation-aware) icode.
    const { searchParams } = new URL(req.url);
    const requestedIcode = searchParams.get("icode")?.trim();
    const ownIcode = getEffectiveIcode(session);

    const icode = isAdmin && requestedIcode ? requestedIcode : ownIcode;

    if (!icode || !ICODE_PATTERN.test(icode)) {
      return new NextResponse("Invalid or missing icode", { status: 400 });
    }

    const fileName = await findReportByIcode(icode);
    if (!fileName) {
      return new NextResponse("Report not found", { status: 404 });
    }

    // Guard against path traversal — the resolved file must stay in REPORTS_DIR.
    const resolved = path.resolve(REPORTS_DIR, fileName);
    if (!resolved.startsWith(path.resolve(REPORTS_DIR) + path.sep)) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    let file: Buffer;
    try {
      file = await fs.readFile(resolved);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return new NextResponse("Report not found", { status: 404 });
      }
      throw err;
    }

    // Download as "<fname>_<lname>.pdf" — strip the "_Invst_Summary_<icode>" part.
    const downloadName =
      fileName.replace(/_Invst_Summary_QUS[0-9]+\.pdf$/i, "") + ".pdf";

    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Content-Length": String(file.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("download-report error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
