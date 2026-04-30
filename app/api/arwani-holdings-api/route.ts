import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEffectiveIcode } from "@/app/lib/admin-utils";
import fs from "fs";
import path from "path";

const ARWANI_ICODE = "QUS00085";
const STOCK_CSV = "arwani_unrealized_stock.csv";
const MF_CSV = "arwani_unrealized_mf.csv";

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

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
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
    if (icode !== ARWANI_ICODE) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const dataDir = path.join(process.cwd(), "data");
    const stockPath = path.join(dataDir, STOCK_CSV);
    const mfPath = path.join(dataDir, MF_CSV);

    const stockRows = parseCsv(fs.readFileSync(stockPath, "utf-8"));
    const mfRows = parseCsv(fs.readFileSync(mfPath, "utf-8"));

    const stockMtime = fs.statSync(stockPath).mtime;
    const mfMtime = fs.statSync(mfPath).mtime;
    const asOf = new Date(Math.max(stockMtime.getTime(), mfMtime.getTime()));

    const stockHoldings: Holding[] = stockRows.map((r) => ({
      symbol: r["Symbol"] || "",
      exchange: r["Exchange"] || "",
      quantity: num(r["Quantity"]),
      avgPrice: num(r["Avg Price"]),
      ltp: num(r["LTP"]),
      buyValue: num(r["Buy Value"]),
      valueAsOfToday: num(r["Value as of Today"]),
      pnlAmount: num(r["PNL Amount"]),
      percentPnl: num(r["% PNL"]),
      broker: r["Broker"] || "",
      debtEquity: r["Debt/Equity"] || "",
      subCategory: r["Sub Category"] || "",
      date: asOf,
      type: "equity" as const,
      strategy: r["Strategy"] || undefined,
    }));

    const mfHoldings: Holding[] = mfRows.map((r) => ({
      symbol: r["Symbol"] || "",
      exchange: "MUTUAL_FUND",
      quantity: num(r["Quantity"]),
      avgPrice: num(r["Avg Price"]),
      ltp: num(r["NAV"]),
      buyValue: num(r["Buy Value"]),
      valueAsOfToday: num(r["Value as of Today"]),
      pnlAmount: num(r["PNL Amount"]),
      percentPnl: num(r["% PNL"]),
      broker: r["Broker"] || "",
      debtEquity: r["Debt/Equity"] || "",
      subCategory: r["Sub Category"] || "",
      date: asOf,
      type: "mutual_fund" as const,
      isin: r["ISIN"] || undefined,
      strategy: r["Strategy"] || undefined,
    }));

    const allHoldings: Holding[] = [...stockHoldings, ...mfHoldings];
    const holdingsSummary = processHoldingsSummary(allHoldings);

    const availableStrategies = Array.from(
      new Set(allHoldings.map((h) => h.strategy).filter((s): s is string => !!s))
    ).sort();

    return NextResponse.json(
      {
        holdingsSummary,
        availableStrategies,
        dataAsOfDate: asOf.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Arwani holdings API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
