import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";
import { clearClosedStatusCache } from "@/app/lib/account-status";

export const dynamic = "force-dynamic";

interface PairRow {
  qcode: string;
  strategy: string;
}

async function loadKnownPairs(): Promise<PairRow[]> {
  return prisma.$queryRaw<PairRow[]>`
    SELECT DISTINCT qcode, strategy FROM (
      SELECT qcode, strategy FROM accounts
      UNION
      SELECT qcode, strategy FROM bifurcated_equity_holding_test
      UNION
      SELECT qcode, strategy FROM bifurcated_mutual_fund_holding_sheet_test
    ) s
    WHERE qcode IS NOT NULL AND strategy IS NOT NULL AND strategy <> ''
  `;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [accounts, pairs, statuses] = await Promise.all([
    prisma.$queryRaw<{ qcode: string; account_name: string | null; broker: string | null }[]>`
      SELECT qcode, account_name, broker FROM accounts WHERE qcode IS NOT NULL
    `,
    loadKnownPairs(),
    prisma.$queryRaw<
      { qcode: string; strategy: string; closed_date: Date | null; notes: string | null }[]
    >`SELECT qcode, strategy, closed_date, notes FROM account_strategy_status`,
  ]);

  const statusByKey = new Map(statuses.map((s) => [`${s.qcode}|${s.strategy}`, s]));
  const strategiesByQcode = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!strategiesByQcode.has(p.qcode)) strategiesByQcode.set(p.qcode, new Set());
    strategiesByQcode.get(p.qcode)!.add(p.strategy);
  }
  // A closed row whose scheme no longer shows in the sources must stay visible so it can be reopened.
  for (const s of statuses) {
    if (!strategiesByQcode.has(s.qcode)) strategiesByQcode.set(s.qcode, new Set());
    strategiesByQcode.get(s.qcode)!.add(s.strategy);
  }

  const nameByQcode = new Map(accounts.map((a) => [a.qcode, a]));
  const rows = Array.from(strategiesByQcode.entries())
    .map(([qcode, strategies]) => ({
      qcode,
      accountName: nameByQcode.get(qcode)?.account_name ?? null,
      broker: nameByQcode.get(qcode)?.broker ?? null,
      strategies: Array.from(strategies)
        .sort()
        .map((strategy) => {
          const st = statusByKey.get(`${qcode}|${strategy}`);
          return {
            strategy,
            closed: !!st,
            closedDate: st?.closed_date ? new Date(st.closed_date).toISOString().slice(0, 10) : null,
            notes: st?.notes ?? null,
          };
        }),
    }))
    .sort((a, b) => a.qcode.localeCompare(b.qcode));

  return NextResponse.json({ accounts: rows });
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const qcode = typeof body?.qcode === "string" ? body.qcode : "";
  const strategy = typeof body?.strategy === "string" ? body.strategy : "";
  const closed = body?.closed;
  const closedDate: string | null =
    typeof body?.closedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.closedDate)
      ? body.closedDate
      : null;
  const notes: string | null =
    typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;

  if (!qcode || !strategy || typeof closed !== "boolean") {
    return NextResponse.json({ error: "qcode, strategy and closed are required" }, { status: 400 });
  }

  // Only allow pairs that already exist as an account scheme or a stored row, so typos can't add junk.
  const known = await loadKnownPairs();
  const existing = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM account_strategy_status WHERE qcode = ${qcode} AND strategy = ${strategy}
  `;
  const isKnown = known.some((k) => k.qcode === qcode && k.strategy === strategy) || (existing[0]?.n ?? 0) > 0;
  if (!isKnown) {
    return NextResponse.json({ error: "Unknown account/strategy pair" }, { status: 400 });
  }

  const actor = session?.user?.email ?? session?.user?.name ?? "admin";
  const noteText = [notes, `set by ${actor}`].filter(Boolean).join(" | ");

  if (closed) {
    await prisma.$executeRaw`
      INSERT INTO account_strategy_status (qcode, strategy, closed_date, notes)
      VALUES (${qcode}, ${strategy}, ${closedDate}::date, ${noteText})
      ON CONFLICT (qcode, strategy)
      DO UPDATE SET closed_date = EXCLUDED.closed_date, notes = EXCLUDED.notes
    `;
  } else {
    await prisma.$executeRaw`
      DELETE FROM account_strategy_status WHERE qcode = ${qcode} AND strategy = ${strategy}
    `;
  }

  clearClosedStatusCache();
  return NextResponse.json({ ok: true });
}
