import { prisma } from "@/lib/prisma";
import { PortfolioApi } from "@/app/lib/sarla-utils";
import { Prisma } from "@prisma/client";

/** 🔹 Special handling */
export const SPECIAL_QCODES = ["QAC00041", "QAC00046"];
export const EXCLUDED_QCODES = ["QAC00066"]; // prevent double counting

/** 🔹 Your managed accounts list (DO NOT include QAC00066) */
export const MANAGED_ACCOUNTS_LIST: string[] = [
  "QAC00042",
  "QAC00046",
  "QAC00041",
  "QAC00065",
  // "QAC00055",
  "QAC00056",
  "QAC00064",
  "QAC00043",
  "QAC00022",
  "QAC00069",
  "QAC00053",
  "QAC00071",
  "QAC00072",
  "QAC00040",
  "QAC00074",
  "QAC00083",
  "QAC00092",
  "QAC00094",
  "QAC00095",
  "QAC00096",
  "QAC00097",
  "QAC00098",
  "QAC00099",
  "QAC00101",
  "QAC00102",
];

const different_cases: Record<string, string> = {
   "QAC00056": "Zerodha Total Portfolio" ,
   "QAC00022": "Zerodha Total Portfolio" ,
   "QAC00043": "Zerodha Total Portfolio" ,
   "QAC00040": "Zerodha Total Portfolio" ,
   "QAC00064": "Zerodha Total Portfolio" ,
   "QAC00069": "Zerodha Total Portfolio" ,
   "QAC00071": "Zerodha Total Portfolio" ,
   "QAC00072": "Zerodha Total Portfolio" ,
   "QAC00074": "Zerodha Total Portfolio" ,
   "QAC00083": "Zerodha Total Portfolio" ,
   "QAC00095": "Zerodha Total Portfolio" ,
   "QAC00096": "Zerodha Total Portfolio" ,
   "QAC00097": "Total Portfolio Exposure" ,
   "QAC00098": "Total Portfolio Exposure" ,
   "QAC00099": "Total Portfolio Exposure",
   "QAC00101": "Zerodha Total Portfolio",
   "QAC00102": "Zerodha Total Portfolio"
  };
/** 🔹 Resolve correct system_tag for NORMAL accounts only */
export function getSystemTagForManagedAccountAUM(account: {
  qcode: string;
  broker: string;
  strategy: string | null;
}): string {
  const broker = account.broker.toLowerCase();
  const strategy = account.strategy ?? "";

  const tag = different_cases[account.qcode];
  if (tag) {
    return tag;
  }

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

  // 🔥 0. TRUNCATE TABLE FIRST
  await prisma.$executeRaw(
    Prisma.sql`TRUNCATE TABLE account_aum`
  );

  console.log("Truncated account_aum table");

  // 1. Fetch ONLY regular accounts
  const accounts = await prisma.accounts.findMany({
    where: {
      account_type: "managed_account",
      qcode: {
        in: MANAGED_ACCOUNTS_LIST,
        notIn: [...SPECIAL_QCODES, ...EXCLUDED_QCODES],
      },
      broker: { in: ["jainam", "zerodha", "radiance"] },
    },
    select: { qcode: true, broker: true, strategy: true },
  });

  // 2. Build tag map
  const tagMap = accounts.map((acc) => ({
    qcode: acc.qcode,
    system_tag: getSystemTagForManagedAccountAUM(acc),
  }));

  

  let valueMap = new Map<string, number>();

if (tagMap.length > 0) {
  const conditions = tagMap.map(
    (t) =>
      Prisma.sql`(m.qcode = ${t.qcode} AND m.system_tag = ${t.system_tag})`
  );

  const latestValues: {
    qcode: string;
    system_tag: string;
    portfolio_value: number;
  }[] = await prisma.$queryRaw(
    Prisma.sql`
      SELECT DISTINCT ON (m.qcode, m.system_tag)
        m.qcode,
        m.system_tag,
        m.portfolio_value
      FROM master_sheet m
      WHERE ${Prisma.join(conditions, " OR ")}
      ORDER BY m.qcode, m.system_tag, m.date DESC
    `
  );

    // 4. Convert to map
    latestValues.forEach((row) => {
      valueMap.set(row.qcode, Number(row.portfolio_value) || 0);
    });
  }

  const now = new Date();

  // 5. Upsert regular accounts
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

  console.log(`Updated ${updates.length} regular accounts`);

  // 🔥 6. Handle SPECIAL CLIENTS (Sarla + Satidham)
  try {
    const specialUpdates = [];

    // ✅ Sarla
    const sarla = await PortfolioApi.getLatestExposure(
      "QAC00041",
      "Scheme B"
    );
    if (sarla) {
      specialUpdates.push(
        prisma.account_aum.upsert({
          where: { qcode: "QAC00041" },
          update: {
            aum: sarla.portfolioValue,
            aum_updated_at: now,
          },
          create: {
            qcode: "QAC00041",
            aum: sarla.portfolioValue,
            aum_updated_at: now,
          },
        })
      );
    }

    // ✅ Satidham
    const satidham = await PortfolioApi.getLatestExposure(
      "QAC00046",
      "Scheme QAW++"
    );
    if (satidham) {
      specialUpdates.push(
        prisma.account_aum.upsert({
          where: { qcode: "QAC00046" },
          update: {
            aum: satidham.portfolioValue,
            aum_updated_at: now,
          },
          create: {
            qcode: "QAC00046",
            aum: satidham.portfolioValue,
            aum_updated_at: now,
          },
        })
      );
    }

    await Promise.all(specialUpdates);

    console.log("Updated special clients (Sarla + Satidham)");
  } catch (err) {
    console.error("Error updating special clients AUM:", err);
  }
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