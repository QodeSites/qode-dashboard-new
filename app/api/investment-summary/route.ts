import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import { promises as fs } from "fs";
import path from "path";
import { parseInvestmentXlsx } from "@/app/lib/parse-investment-pdf";
import { reportsDirsForAccess } from "@/app/lib/sync-utils";
import {
  computeInvestmentSummary,
  UnsupportedClientError,
  ClientNotFoundError,
} from "@/app/lib/investment-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ICODE_PATTERN = /^QUS[0-9]+$/i;

// Doc 05 Q13/Q14 (RESOLVED 2026-08-12): QUS0010 (Satidham-old, QAC00046) has
// zero rows in every Postgres table the new calculator reads (tradebook,
// holdings, bifurcated mastersheet) — only a legacy plain `master_sheet`
// NAV time series exists, which is why sarla-utils.ts can show some numbers
// for it but the new calculator can't compute holdings/transactions at all.
// QUS00081 (Satidham-new, QAC00066) is the opposite: fully populated in
// every table the calculator needs (297 equity tradebook rows, 33,911
// bifurcated mastersheet rows, etc.) — confirmed the real trading account.
// Akash's call (2026-08-12): migrate QUS00081 to the Postgres-native
// calculator (config/Master_Config.csv now has real rows for it, mirroring
// QUS0010's strategy timeline but retargeted to QAC00066). QUS0010 stays
// excluded — shows no Investment Summary — until/unless that qcode ever
// gets real tradebook/holdings data synced.
//
// Sarla (QUS0007, QAC00041) cut over 2026-08-12 (doc 05 Q14): its single
// Master_Config.csv row (QYE+) already matched the real WSL
// Strategy_Config.csv exactly, and both required system tags have full,
// current data (591 rows each through 2026-08-10). Cut over on that
// evidence rather than waiting on a fresh ground-truth report — Akash's
// explicit call to treat the diff as a post-hoc confirmation pass, not a
// gate. Nothing left in this set for now.
const LEGACY_XLSX_ICODES = new Set<string>([]);

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

    const dirs = reportsDirsForAccess(isAdmin);

    if (LEGACY_XLSX_ICODES.has(icode)) {
      const found = await findReportByIcode(icode, dirs);

      // Data presence check — file must exist AND have a non-zero investment total
      if (searchParams.get("exists") === "true") {
        if (!found) return NextResponse.json({ exists: false });
        try {
          const buf = await fs.readFile(path.resolve(found.dir, found.fileName));
          const data = parseInvestmentXlsx(buf);
          return NextResponse.json({ exists: data.amountInvested.total !== 0 });
        } catch {
          return NextResponse.json({ exists: false });
        }
      }

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
      const strategyPdfAvailability = await findStrategyPdfs(icode, dirs);

      return NextResponse.json(
        { ...data, strategyPdfAvailability },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Postgres-native calculator (Phase 3 cutover — doc 04). Always live —
    // admins and clients read the same computed-from-Postgres numbers, no
    // separate "as of" snapshot (see doc 04's Phase 3 section: with no
    // versioning on the hand-maintained config CSVs, a review/publish gate
    // wouldn't prevent a bad upload from reaching clients, only delay it —
    // dropped 2026-08-12).
    if (searchParams.get("exists") === "true") {
      try {
        const data = await computeInvestmentSummary(icode);
        return NextResponse.json({ exists: data.amountInvested.total !== 0 });
      } catch (err) {
        if (err instanceof UnsupportedClientError || err instanceof ClientNotFoundError) {
          return NextResponse.json({ exists: false });
        }
        throw err;
      }
    }

    let data;
    try {
      data = await computeInvestmentSummary(icode);
    } catch (err) {
      if (err instanceof UnsupportedClientError || err instanceof ClientNotFoundError) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }
      throw err;
    }

    const strategyPdfAvailability = await findStrategyPdfs(icode, dirs);

    return NextResponse.json(
      { ...data, strategyPdfAvailability },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("investment-summary error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
