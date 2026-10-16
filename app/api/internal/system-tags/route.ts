import { NextResponse } from "next/server";
import { fetchSystemTags } from "@/app/lib/internal-utils";
import { requireInternal } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { qcode?: string; strategy?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.qcode) {
    return NextResponse.json({ error: "qcode is required" }, { status: 400 });
  }
  if (!body.strategy) {
    return NextResponse.json(
      { error: "strategy is required" },
      { status: 400 },
    );
  }

  // Same "solo Prop client" discriminator as client-dashboard/route.ts —
  // Prop accounts read from master_sheet_test, not bifurcated_master_sheet_test.
  const configs = await prisma.client_strategy_configs.findMany({
    where: { qcode: body.qcode },
    select: { strategy: true },
  });
  const isSoloProp = configs.length === 1 && configs[0].strategy === "Prop";
  const table = isSoloProp ? "master_sheet_test" : "bifurcated_master_sheet_test";

  const tags = await fetchSystemTags(body.qcode, body.strategy, table);
  return NextResponse.json(tags);
}
