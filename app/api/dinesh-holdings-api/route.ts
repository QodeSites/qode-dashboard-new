import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";

const DINESH_ICODE = "QUS00072";
const DINESH_QCODE = "QAC00053";

interface Holding {
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  buyValue: number;
  valueAsOfToday: number;
  pnlAmount: number;
  percentPnl: number;
  broker: string;
  debtEquity: string;
  subCategory: string;
  date: Date;
  type: "equity" | "mutual_fund";
  isin?: string;
  strategy?: string;
}

interface HoldingsSummary {
  totalBuyValue: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdingsCount: number;
  equityHoldings: Holding[];
  debtHoldings: Holding[];
  mutualFundHoldings: Holding[];
  categoryBreakdown: Record<string, { buyValue: number; currentValue: number; pnl: number; count: number }>;
  brokerBreakdown: Record<string, { buyValue: number; currentValue: number; pnl: number; count: number }>;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function processHoldingsSummary(holdings: Holding[]): HoldingsSummary {
  const equityHoldings = holdings.filter((h) => h.type === "equity");
  const debtHoldings = holdings.filter((h) => h.debtEquity?.toLowerCase() === "debt");
  const mutualFundHoldings = holdings.filter((h) => h.type === "mutual_fund");

  const totalBuyValue = holdings.reduce((s, h) => s + h.buyValue, 0);
  const totalCurrentValue = holdings.reduce((s, h) => s + h.valueAsOfToday, 0);
  const totalPnl = holdings.reduce((s, h) => s + h.pnlAmount, 0);
  const totalPnlPercent = totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;

  const categoryBreakdown: HoldingsSummary["categoryBreakdown"] = {};
  const brokerBreakdown: HoldingsSummary["brokerBreakdown"] = {};

  holdings.forEach((h) => {
    const cat = h.subCategory || "Other";
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { buyValue: 0, currentValue: 0, pnl: 0, count: 0 };
    categoryBreakdown[cat].buyValue += h.buyValue;
    categoryBreakdown[cat].currentValue += h.valueAsOfToday;
    categoryBreakdown[cat].pnl += h.pnlAmount;
    categoryBreakdown[cat].count += 1;

    const br = h.broker || "Unknown";
    if (!brokerBreakdown[br]) brokerBreakdown[br] = { buyValue: 0, currentValue: 0, pnl: 0, count: 0 };
    brokerBreakdown[br].buyValue += h.buyValue;
    brokerBreakdown[br].currentValue += h.valueAsOfToday;
    brokerBreakdown[br].pnl += h.pnlAmount;
    brokerBreakdown[br].count += 1;
  });

  return {
    totalBuyValue,
    totalCurrentValue,
    totalPnl,
    totalPnlPercent,
    holdingsCount: holdings.length,
    equityHoldings,
    debtHoldings,
    mutualFundHoldings,
    categoryBreakdown,
    brokerBreakdown,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const icode = getEffectiveIcode(session);
    if (!icode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (icode !== DINESH_ICODE) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const latestEquity = await prisma.bifurcated_equity_holding_test.findFirst({
      where: { qcode: DINESH_QCODE },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    const latestMf = await prisma.bifurcated_mutual_fund_holding_sheet_test.findFirst({
      where: { qcode: DINESH_QCODE },
      orderBy: { as_of_date: "desc" },
      select: { as_of_date: true },
    });

    const equityRows = latestEquity
      ? await prisma.bifurcated_equity_holding_test.findMany({
          where: { qcode: DINESH_QCODE, date: latestEquity.date },
        })
      : [];
    const mfRows = latestMf
      ? await prisma.bifurcated_mutual_fund_holding_sheet_test.findMany({
          where: { qcode: DINESH_QCODE, as_of_date: latestMf.as_of_date },
        })
      : [];

    const stockHoldings: Holding[] = equityRows.map((r) => ({
      symbol: r.symbol || "",
      exchange: r.exchange || "",
      quantity: num(r.quantity),
      avgPrice: num(r.avg_price),
      ltp: num(r.ltp),
      buyValue: num(r.buy_value),
      valueAsOfToday: num(r.value_as_of_today),
      pnlAmount: num(r.pnl_amount),
      percentPnl: num(r.percent_pnl),
      broker: r.broker || "",
      debtEquity: r.debt_equity || "",
      subCategory: r.sub_category || "",
      date: r.date,
      type: "equity" as const,
      strategy: r.strategy || undefined,
    }));

    const mfHoldings: Holding[] = mfRows.map((r) => ({
      symbol: r.symbol || "",
      exchange: "MUTUAL_FUND",
      quantity: num(r.quantity),
      avgPrice: num(r.avg_price),
      ltp: num(r.nav),
      buyValue: num(r.buy_value),
      valueAsOfToday: num(r.value_as_of_today),
      pnlAmount: num(r.pnl_amount),
      percentPnl: num(r.percent_pnl),
      broker: r.broker || "",
      debtEquity: r.debt_equity || "",
      subCategory: r.sub_category || "",
      date: r.as_of_date,
      type: "mutual_fund" as const,
      isin: r.isin || undefined,
      strategy: r.strategy || undefined,
    }));

    const allHoldings: Holding[] = [...stockHoldings, ...mfHoldings];
    const holdingsSummary = processHoldingsSummary(allHoldings);

    const availableStrategies = Array.from(
      new Set(allHoldings.map((h) => h.strategy).filter((s): s is string => !!s))
    ).sort();

    const equityDate = latestEquity?.date.getTime() ?? 0;
    const mfDate = latestMf?.as_of_date.getTime() ?? 0;
    const asOf = equityDate || mfDate ? new Date(Math.max(equityDate, mfDate)) : null;

    return NextResponse.json(
      {
        holdingsSummary,
        availableStrategies,
        dataAsOfDate: asOf ? asOf.toISOString() : null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Dinesh holdings API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
