import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import { promises as fs } from "fs";
import { reportsDirsForAccess } from "@/app/lib/sync-utils";
import {
  computeInvestmentSummary,
  UnsupportedClientError,
  ClientNotFoundError,
} from "@/app/lib/investment-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ICODE_PATTERN = /^QUS[0-9]+$/i;

// Doc 05 Q13/Q14 (RESOLVED 2026-08-12): every client now reads live from
// computeInvestmentSummary() (Postgres-native). The last two clients on
// the legacy .xlsx numeric path — Sarla (QUS0007) and Satidham-new
// (QUS00081) — were cut over the same day, so the xlsx-parsing branch and
// parseInvestmentXlsx() were removed entirely (they'd never run).
// QUS0010 (Satidham-old, QAC00046) has its own permanent exclusion inside
// computeInvestmentSummary — zero rows in every Postgres table the
// calculator reads, not a "still on legacy" case; it shows no Investment
// Summary at all.
//
// Note: the Python pipeline itself is NOT decommissioned. It still
// generates the per-strategy PDF reports served by findStrategyPdfs()
// below and by app/api/download-report/route.ts — those have no
// Postgres-native replacement. Only the numeric .xlsx reading was removed.

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
