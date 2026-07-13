import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner, getPartnerBookIcodes } from "@/app/lib/admin-utils";
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

// Same book-scoped shape as /api/admin/stats, restricted to the
// authenticated partner's clients (via partner_clients).
export async function GET() {
  const { error, session } = await requirePartner();
  if (error) return error;

  const partnerId = parseInt(session!.user.partnerId ?? "", 10);
  if (!partnerId || Number.isNaN(partnerId)) {
    return NextResponse.json({
      totalClients: 0,
      totalAccounts: 0,
      totalAumManaged: 0,
      aumAccounts: [],
    });
  }

  const bookIcodes = await getPartnerBookIcodes(partnerId);
  if (bookIcodes.length === 0) {
    return NextResponse.json({
      totalClients: 0,
      totalAccounts: 0,
      totalAumManaged: 0,
      aumAccounts: [],
    });
  }

  // 1. Check last update (same lazy-refresh trigger used by admin stats).
  const latest = await prisma.account_aum.findFirst({
    orderBy: { aum_updated_at: "desc" },
  });

  const lastUpdated = latest?.aum_updated_at
    ? new Date(latest.aum_updated_at)
    : null;

  const isEmpty = !latest;
  const needsUpdate = isEmpty || !lastUpdated || !isSameDayIST(lastUpdated);

  if (needsUpdate) {
    try {
      await updateAccountAUMs();
    } catch (err) {
      console.error("AUM update failed:", err);
    }
  }

  // 2. Book clients/accounts.
  const pau = await prisma.pooled_account_users.findMany({
    where: { icode: { in: bookIcodes } },
    select: { accounts: { select: { qcode: true } } },
  });

  const bookQcodes = new Set(pau.map((p) => p.accounts.qcode));
  const totalClients = bookIcodes.length;
  const totalAccounts = bookQcodes.size;

  // 3. AUM data, filtered to the partner's book accounts.
  const aumData = await prisma.account_aum.findMany({
    include: {
      accounts: {
        select: { account_name: true },
      },
    },
    orderBy: { aum: "desc" },
  });

  const aumAccounts = aumData
    .filter(
      (row) => !EXCLUDED_QCODES.includes(row.qcode) && bookQcodes.has(row.qcode)
    )
    .map((row) => ({
      qcode: row.qcode,
      name: row.accounts?.account_name || row.qcode,
      aum: Number(row.aum) || 0,
    }));

  const totalAumManaged = aumAccounts.reduce((sum, acc) => sum + acc.aum, 0);

  return NextResponse.json({
    totalClients,
    totalAccounts,
    totalAumManaged,
    aumAccounts,
  });
}
