import { prisma } from "@/lib/prisma";

/** 🔹 Special overrides for system tags */
const MANAGED_AUM_SYSTEM_TAG_BY_QCODE: Record<string, string> = {
  QAC00041: "Sarla Performance fibers Scheme Total Portfolio",
  QAC00046: "Total Portfolio Value A",
};

/** 🔹 Your managed accounts list */
export const MANAGED_ACCOUNTS_LIST: string[] = ["QAC00042" ,"QAC00046" ,"QAC00041" ,"QAC00065" ,"QAC00055" ,"QAC00056" ,"QAC00064" ,"QAC00043" ,"QAC00022" ,"QAC00069" ,"QAC00053" ,"QAC00071" ,"QAC00072" ,"QAC00040" ,"QAC00074" ,"QAC00083" ,"QAC00092" ,"QAC00094"]


/** 🔹 Resolve correct system_tag */
export function getSystemTagForManagedAccountAUM(account: {
  qcode: string;
  broker: string;
  strategy: string | null;
}): string {
  const byQcode = MANAGED_AUM_SYSTEM_TAG_BY_QCODE[account.qcode];
  if (byQcode) return byQcode;

  const broker = account.broker.toLowerCase();
  const strategy = account.strategy ?? "";

  if (broker === "jainam") return "Jainam Total Portfolio Exposure";
  if (broker === "radiance") return "Total Portfolio Exposure";
  if (broker === "zerodha" && (strategy === "QYE+" || strategy === "QYE++")) {
    return "Total Portfolio Value";
  }

  return "Zerodha Total Portfolio";
}

/**
 * 🔥 MAIN FUNCTION
 * Updates account_aum table with latest portfolio_value per qcode
 */
export async function updateAccountAUMs(): Promise<void> {
  console.log("Updating Account AUMs...");

  // Get accounts
  const accounts = await prisma.accounts.findMany({
    where: {
      account_type: "managed_account",
      qcode: { in: MANAGED_ACCOUNTS_LIST },
      broker: { in: ["jainam", "zerodha", "radiance"] },
    },
    select: { qcode: true, broker: true, strategy: true },
  });

  if (!accounts.length) {
    console.log("No managed accounts found");
    return;
  }

  // Build tag map
  const tagMap = accounts.map((acc) => ({
    qcode: acc.qcode,
    system_tag: getSystemTagForManagedAccountAUM(acc),
  }));

  // Fetch latest values in ONE RAW QUERY (fast)
  const latestValues: {
    qcode: string;
    system_tag: string;
    portfolio_value: number;
  }[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON (m.qcode, m.system_tag)
      m.qcode,
      m.system_tag,
      m.portfolio_value
    FROM master_sheet m
    WHERE (m.qcode, m.system_tag) IN (
      ${tagMap
        .map(
          (t) => `('${t.qcode}', '${t.system_tag.replace(/'/g, "''")}')`
        )
        .join(",")}
    )
    ORDER BY m.qcode, m.system_tag, m.date DESC
  `);

  // Convert to map for quick lookup
  const valueMap = new Map<string, number>();

  latestValues.forEach((row) => {
    valueMap.set(row.qcode, Number(row.portfolio_value) || 0);
  });

  // Upsert into account_aum
  const now = new Date();

  const updates = accounts.map((acc) => {
    const aum = valueMap.get(acc.qcode) || 0;

    return prisma.account_aum.upsert({
      where: { qcode: acc.qcode },
      update: {
        aum,
        aum_updated_at: now,
      },
      create: {
        qcode: acc.qcode,
        aum,
        aum_updated_at: now,
      },
    });
  });

  await Promise.all(updates);

  console.log(`Updated ${updates.length} accounts`);
}

/**
 * 🔹 Get total AUM (FAST from precomputed table)
 */
export async function getTotalAUM(): Promise<number> {
  const result = await prisma.account_aum.aggregate({
    _sum: { aum: true },
  });

  return Number(result._sum.aum) || 0;
}

/**
 * 🔹 Get per-account AUM (for UI cards)
 */
export async function getAUMAccounts() {
  const rows = await prisma.account_aum.findMany({
    include: {
      accounts: {
        select: { account_name: true },
      },
    },
    orderBy: { aum: "desc" },
  });

  return rows.map((row) => ({
    qcode: row.qcode,
    name: row.accounts?.account_name || row.qcode,
    aum: Number(row.aum) || 0,
  }));
}