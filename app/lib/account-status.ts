import { prisma } from "@/lib/prisma";
import { normalizeStrategy } from "@/app/lib/strategy-match";

export interface ClosedStrategy {
  strategy: string;
  closedDate: string | null;
}

const CACHE_TTL_MS = 60 * 1000;

let cache: { byQcode: Map<string, ClosedStrategy[]>; expiresAt: number } | null = null;

export { normalizeStrategy };

async function loadAll(): Promise<Map<string, ClosedStrategy[]>> {
  if (cache && cache.expiresAt > Date.now()) return cache.byQcode;

  const byQcode = new Map<string, ClosedStrategy[]>();
  try {
    const rows = await prisma.$queryRaw<
      { qcode: string; strategy: string; closed_date: Date | null }[]
    >`SELECT qcode, strategy, closed_date FROM account_strategy_status`;

    for (const r of rows) {
      const list = byQcode.get(r.qcode) ?? [];
      list.push({
        strategy: r.strategy,
        closedDate: r.closed_date ? new Date(r.closed_date).toISOString().slice(0, 10) : null,
      });
      byQcode.set(r.qcode, list);
    }
  } catch (error) {
    // Fail open: a missing table or DB hiccup behaves as "nothing is closed".
    console.error("account-status lookup failed, treating all accounts as active:", error);
  }

  cache = { byQcode, expiresAt: Date.now() + CACHE_TTL_MS };
  return byQcode;
}

export async function getClosedStrategies(qcode: string): Promise<ClosedStrategy[]> {
  const all = await loadAll();
  return all.get(qcode) ?? [];
}

export async function getClosedStatus(qcode: string, strategy?: string | null): Promise<string | null | undefined> {
  const closed = await getClosedStrategies(qcode);
  const target = normalizeStrategy(strategy);
  const hit = closed.find((c) => normalizeStrategy(c.strategy) === target);
  return hit ? hit.closedDate : undefined;
}

export function isStrategyClosed(closed: ClosedStrategy[], strategy: string | null | undefined): boolean {
  const target = normalizeStrategy(strategy);
  return closed.some((c) => normalizeStrategy(c.strategy) === target);
}

export function clearClosedStatusCache(): void {
  cache = null;
}
