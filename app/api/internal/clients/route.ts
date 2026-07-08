import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const configs = await prisma.client_strategy_configs.findMany({
    orderBy: [{ qcode: "asc" }, { effective_from: "asc" }],
  });

  const today = new Date();

  // Group by qcode
  const grouped = new Map<string, typeof configs>();
  for (const c of configs) {
    if (!grouped.has(c.qcode)) grouped.set(c.qcode, []);
    grouped.get(c.qcode)!.push(c);
  }

  const result = [];
  for (const [qcode, rows] of grouped) {
    // client-level gate: needs at least one active strategy to appear at all
    const hasActive = rows.some(
      (r) => !r.effective_to || r.effective_to >= today,
    );
    if (!hasActive) continue;

    // combined.effective_from = oldest date across ALL configs
    const minFrom = rows.reduce<Date>(
      (min, r) => (r.effective_from < min ? r.effective_from : min),
      rows[0].effective_from,
    );

    // combined.exposure_tag: ZTP if any config uses Zerodha, else TPE
    const hasZerodha = rows.some((r) =>
      r.exposure_tag_suffix.toLowerCase().includes("zerodha"),
    );

    result.push({
      qcode,
      account_name: rows[0].account_name,
      strategies: [
        // once a client is active, list every strategy, active or lapsed —
        // effective_to already tells the consumer which is which
        ...rows.map((r) => ({
          id: r.id,
          strategy: r.strategy,
          effective_from: r.effective_from.toISOString().split("T")[0],
          effective_to: r.effective_to
            ? r.effective_to.toISOString().split("T")[0]
            : null,
          profit_tag: `${r.strategy} ${r.profit_tag_suffix}`,
          exposure_tag: `${r.strategy} ${r.exposure_tag_suffix}`,
        })),
        {
          id: null,
          strategy: "combined",
          effective_from: minFrom.toISOString().split("T")[0],
          effective_to: null,
          profit_tag: "Qode Total Portfolio",
          exposure_tag: hasZerodha
            ? "Zerodha Total Portfolio"
            : "Total Portfolio Exposure",
        },
      ],
    });
  }

  return NextResponse.json(result);
}
