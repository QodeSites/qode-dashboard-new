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

// ASSUMPTION (Akash, 2026-08-12): QUS0010 (Satidham-old) does not show an
// Investment Summary at all for now. The real generated file on disk is
// `Satidham_Industries_Invst_Summary_QUS00081.xlsx` — there is no QUS0010-
// suffixed file (confirmed against data/reports/ and data/reports_backup/)
// — and it's unresolved whether that report's underlying qcode (QAC00046,
// same as QUS0010 per CLAUDE.md) is meant to represent QUS0010, QUS00081
// (its own qcode is QAC00066 per CLAUDE.md), or both. Rather than guess
// which identity that file belongs to, QUS0010 is deliberately excluded
// here so it falls through to the Postgres-native branch below, which
// already throws UnsupportedClientError for it (EXCLUDED_ICODES in
// app/lib/investment-summary/index.ts) — same "Report not found"/
// `exists: false` outcome as before, just for a documented reason instead
// of a broken alias. QUS00081 now looks up its own file directly (no
// alias needed, since the real file already matches its own icode).
// Revisit once the QUS0010/QUS00081/Satidham report-identity question is
// actually resolved — see doc 05.

// Sarla stays on the legacy Excel pipeline — explicitly out of scope for
// the Postgres-native calculator (CLAUDE.md, docs/investment-summary-migration/04).
// QUS00081 also stays here (it has a real file of its own); QUS0010 does not.
const LEGACY_XLSX_ICODES = new Set(["QUS0007", "QUS00081"]);

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
