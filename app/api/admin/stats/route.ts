import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";
import { EXCLUDED_QCODES, updateAccountAUMs } from "@/app/lib/aum-utils";

/** 🔹 Check same day in IST */
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

/** 🔹 After 6PM IST */
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

  // 1. Check last update
  const latest = await prisma.account_aum.findFirst({
    orderBy: { aum_updated_at: "desc" },
  });

  const lastUpdated = latest?.aum_updated_at
    ? new Date(latest.aum_updated_at)
    : null;

  const isEmpty = !latest;

  const needsUpdate =
    isEmpty || !lastUpdated || !isSameDayIST(lastUpdated);

  const shouldRun = true;
  // const shouldRun = isAfter6PM() || needsUpdate;

  // 2. Safe update (race-condition protected)
  if (shouldRun) {
    try {
      console.log("updating table...")
      // 🔁 recheck inside to prevent double execution
      const recheck = await prisma.account_aum.findFirst({
        orderBy: { aum_updated_at: "desc" },
      });

      const recheckDate = recheck?.aum_updated_at
        ? new Date(recheck.aum_updated_at)
        : null;

      const stillNeedsUpdate =
        !recheckDate || !isSameDayIST(recheckDate);

      if (stillNeedsUpdate) {
        console.log("Updating AUM (lazy trigger)...");
        await updateAccountAUMs();
      }
    } catch (err) {
      console.error("AUM update failed:", err);
    }
  }

  // 3. Clients count
  const clientsWithAccounts = await prisma.pooled_account_users.findMany({
    distinct: ["icode"],
    select: { icode: true },
  });

  // 4. Accounts count
  const totalAccounts = await prisma.accounts.count();

  // 5. Fetch AUM data
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


  const aumAccounts = aumData
    .filter((row) => !EXCLUDED_QCODES.includes(row.qcode))
    .map((row) => ({
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