import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";
import { updateAccountAUMs } from "@/app/lib/aum-utils";

// simple in-memory lock
let isUpdatingAUM = false;

function isSameDayIST(date: Date) {
  const now = new Date();

  const istNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );

  const istDate = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );

  return (
    istNow.getDate() === istDate.getDate() &&
    istNow.getMonth() === istDate.getMonth() &&
    istNow.getFullYear() === istDate.getFullYear()
  );
}

function isAfter6PM(): boolean {
  const now = new Date();
  const istTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  return istTime.getHours() >= 18;
}
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  // 1. Check if AUM is stale
  const latest = await prisma.account_aum.findFirst({
    orderBy: { aum_updated_at: "desc" },
  });

  const lastUpdated =
    latest?.aum_updated_at != null
      ? new Date(latest.aum_updated_at)
      : null;

  const needsUpdate = isAfter6PM() && (!lastUpdated || !isSameDayIST(lastUpdated));

  // 2. Run update ONLY once
  if (needsUpdate && !isUpdatingAUM) {
    try {
      isUpdatingAUM = true;
      console.log("Updating AUM (lazy trigger)...");
      await updateAccountAUMs();
    } catch (err) {
      console.error("AUM update failed:", err);
    } finally {
      isUpdatingAUM = false;
    }
  }

  //  3. Clients count
  const clientsWithAccounts = await prisma.pooled_account_users.findMany({
    distinct: ["icode"],
    select: { icode: true },
  });

  //  4. Accounts count
  const totalAccounts = await prisma.accounts.count();

  //  5. Fetch precomputed AUM
  const aumData = await prisma.account_aum.findMany({
    include: {
      accounts: { 
        select: {
          account_name: true,
        },
      },
    },
    orderBy: {
      aum: "desc",
    },
  });

  const aumAccounts = aumData.map((row) => ({
    qcode: row.qcode,
    name: row.accounts?.account_name || row.qcode,
    aum: Number(row.aum) || 0,
  }));

  // 6. Total AUM
  const totalAumManaged = aumAccounts.reduce(
    (sum, acc) => sum + acc.aum,
    0
  );

  return NextResponse.json({
    totalClients: clientsWithAccounts.length,
    totalAccounts,
    totalAumManaged,
    aumAccounts,
  });
}