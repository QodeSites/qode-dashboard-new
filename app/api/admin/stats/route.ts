import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  // Count distinct clients that have at least one account
  const clientsWithAccounts = await prisma.pooled_account_users.findMany({
    distinct: ["icode"],
    select: { icode: true },
  });

  // Count total accounts
  const totalAccounts = await prisma.accounts.count();

  return NextResponse.json({
    totalClients: clientsWithAccounts.length,
    totalAccounts,
  });
}
