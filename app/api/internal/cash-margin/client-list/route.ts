import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/app/lib/admin-utils";
import { PROP_STRATEGY } from "@/lib/cash-margin/tags";

// Client + strategy list for the Cash & Margin alerts table, sourced
// directly from client_strategy_configs -- currently-active mandates only
// (effective_to null or in the future). Excludes Prop -- see
// lib/cash-margin/tags.ts's PROP_STRATEGY.
export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const configs = await prisma.client_strategy_configs.findMany({
    where: {
      strategy: { not: PROP_STRATEGY },
      OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }],
    },
    select: {
      qcode: true,
      account_name: true,
      strategy: true,
    },
    orderBy: [{ account_name: "asc" }, { strategy: "asc" }],
  });

  return NextResponse.json(configs);
}
