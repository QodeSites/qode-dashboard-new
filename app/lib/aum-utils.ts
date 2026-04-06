import { prisma } from "@/lib/prisma";
import { PortfolioApi } from "@/app/lib/sarla-utils";

/** 🔹 Special handling */
export const SPECIAL_QCODES = ["QAC00041", "QAC00046"];
export const EXCLUDED_QCODES = ["QAC00066"]; // prevent double counting

/** 🔹 Your managed accounts list (DO NOT include QAC00066) */
export const MANAGED_ACCOUNTS_LIST: string[] = [
  "QAC00042",
  "QAC00046",
  "QAC00041",
  "QAC00065",
  "QAC00055",
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
];

/** 🔹 Resolve correct system_tag for NORMAL accounts only */
export function getSystemTagForManagedAccountAUM(account: {
  qcode: string;
  broker: string;
  strategy: string | null;
}): string {
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
    // 3. Fetch latest values in ONE RAW QUERY
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
      "Total Portfolio"
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
      "Total Portfolio"
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