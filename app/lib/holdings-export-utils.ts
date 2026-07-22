import * as XLSX from "xlsx-js-style";
import { prisma } from "@/lib/prisma";
import { PortfolioApi } from "@/app/lib/sarla-utils";
import { findByIcode } from "@/app/lib/bifurcated-clients-registry";
import { ExcelExportAccount } from "@/app/lib/excel-export-utils";

// ============================================================================
// Types (mirror holding-summary/page.tsx)
// ============================================================================

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
  type?: "equity" | "mutual_fund";
  isin?: string;
  strategy?: string;
}

export interface HoldingsSummary {
  totalBuyValue: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdingsCount: number;
  equityHoldings: Holding[];
  debtHoldings: Holding[];
  mutualFundHoldings?: Holding[];
  categoryBreakdown: Record<string, { buyValue: number; currentValue: number; pnl: number; count: number }>;
  brokerBreakdown: Record<string, { buyValue: number; currentValue: number; pnl: number; count: number }>;
}

export interface HoldingsEntry {
  label: string;       // file name suffix (e.g. account name)
  holdingsSummary: HoldingsSummary;
  dataAsOfDate: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildSummary(allHoldings: Holding[]): HoldingsSummary {
  const equityHoldings = allHoldings.filter((h) => h.type === "equity");
  const debtHoldings = allHoldings.filter((h) => h.debtEquity?.toLowerCase() === "debt");
  const mutualFundHoldings = allHoldings.filter((h) => h.type === "mutual_fund");

  const totalBuyValue = allHoldings.reduce((s, h) => s + h.buyValue, 0);
  const totalCurrentValue = allHoldings.reduce((s, h) => s + h.valueAsOfToday, 0);
  const totalPnl = allHoldings.reduce((s, h) => s + h.pnlAmount, 0);
  const totalPnlPercent = totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;

  const categoryBreakdown: HoldingsSummary["categoryBreakdown"] = {};
  const brokerBreakdown: HoldingsSummary["brokerBreakdown"] = {};

  allHoldings.forEach((h) => {
    const cat = h.subCategory || h.debtEquity || "Unknown";
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
    holdingsCount: allHoldings.length,
    equityHoldings,
    debtHoldings,
    mutualFundHoldings,
    categoryBreakdown,
    brokerBreakdown,
  };
}

/** Query bifurcated equity+MF tables for a qcode (managed / bifurcated clients). */
async function fetchBifurcatedHoldings(qcode: string): Promise<{ holdingsSummary: HoldingsSummary; dataAsOfDate: string | null }> {
  const latestEquity = await prisma.bifurcated_equity_holding_test.findFirst({
    where: { qcode },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const latestMf = await prisma.bifurcated_mutual_fund_holding_sheet_test.findFirst({
    where: { qcode },
    orderBy: { as_of_date: "desc" },
    select: { as_of_date: true },
  });

  const equityRows = latestEquity
    ? await prisma.bifurcated_equity_holding_test.findMany({ where: { qcode, date: latestEquity.date } })
    : [];
  const mfRows = latestMf
    ? await prisma.bifurcated_mutual_fund_holding_sheet_test.findMany({ where: { qcode, as_of_date: latestMf.as_of_date } })
    : [];

  const allHoldings: Holding[] = [
    ...equityRows.map((r) => ({
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
      debtEquity: r.debt_equity || "Equity",
      subCategory: r.sub_category || "",
      date: r.date,
      type: "equity" as const,
      strategy: r.strategy || undefined,
    })),
    ...mfRows.map((r) => ({
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
      debtEquity: r.debt_equity || "Hybrid",
      subCategory: r.sub_category || "",
      date: r.as_of_date,
      type: "mutual_fund" as const,
      isin: r.isin || undefined,
      strategy: r.strategy || undefined,
    })),
  ];

  const equityTime = latestEquity?.date.getTime() ?? 0;
  const mfTime = latestMf?.as_of_date.getTime() ?? 0;
  const asOf = equityTime || mfTime ? new Date(Math.max(equityTime, mfTime)) : null;

  return { holdingsSummary: buildSummary(allHoldings), dataAsOfDate: asOf ? asOf.toISOString() : null };
}

/** Query equity_holding (PMS accounts). No MF holdings available for PMS. */
async function fetchPmsHoldings(qcode: string): Promise<{ holdingsSummary: HoldingsSummary; dataAsOfDate: string | null }> {
  const latestEquity = await (prisma.equity_holding as any).findFirst({
    where: { qcode },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const equityRows = latestEquity
    ? await (prisma.equity_holding as any).findMany({ where: { qcode, date: latestEquity.date } })
    : [];

  const allHoldings: Holding[] = equityRows.map((r: any) => ({
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
    debtEquity: r.debt_equity || "Equity",
    subCategory: r.sub_category || "",
    date: r.date,
    type: "equity" as const,
  }));

  const asOf = latestEquity ? latestEquity.date : null;
  return { holdingsSummary: buildSummary(allHoldings), dataAsOfDate: asOf ? asOf.toISOString() : null };
}

function makeMockRequest(url: string): Request {
  return new Request(url);
}

/**
 * Fetches holdings data for a client — same logic as holding-summary/page.tsx
 * but server-side. Returns one HoldingsEntry per qcode (or one for Sarla/Satidham).
 */
export async function fetchHoldingsForClient(
  icode: string,
  accounts: ExcelExportAccount[]
): Promise<HoldingsEntry[]> {
  const isSarla = icode === "QUS0007";
  const isSatidham = icode === "QUS0010";
  const bifurcated = findByIcode(icode);

  // Sarla / Satidham — same PortfolioApi.GET call the portfolio bot uses.
  // Extract holdingsSummary from the first strategy that has it.
  if (isSarla || isSatidham) {
    const qcode = isSarla ? "QAC00041" : "QAC00046";
    try {
      const res = await PortfolioApi.GET(makeMockRequest(`http://localhost/api/sarla-api?qcode=${qcode}`));
      const data = await res.json();

      const targetKey = isSarla
        ? (data["Scheme B"]?.data?.holdingsSummary ? "Scheme B" : Object.keys(data)[0])
        : Object.keys(data)[0];

      const holdingsSummary = data[targetKey]?.data?.holdingsSummary;
      if (!holdingsSummary) return [];

      const allHoldings = [
        ...(holdingsSummary.equityHoldings || []),
        ...(holdingsSummary.debtHoldings || []),
        ...(holdingsSummary.mutualFundHoldings || []),
      ];
      const dataAsOfDate = allHoldings[0]?.date ? new Date(allHoldings[0].date).toISOString() : null;

      return [{ label: isSarla ? "Sarla" : "Satidham", holdingsSummary, dataAsOfDate }];
    } catch {
      return [];
    }
  }

  // Bifurcated clients (registry) — query bifurcated tables using their qcode
  if (bifurcated) {
    try {
      const result = await fetchBifurcatedHoldings(bifurcated.qcode);
      if (result.holdingsSummary.holdingsCount === 0) return [];
      return [{ label: bifurcated.qcode, holdingsSummary: result.holdingsSummary, dataAsOfDate: result.dataAsOfDate }];
    } catch {
      return [];
    }
  }

  // Regular clients — one entry per account
  const entries: HoldingsEntry[] = [];
  for (const acc of accounts) {
    try {
      const isPms = acc.account_type === "pms";
      const result = isPms
        ? await fetchPmsHoldings(acc.qcode)
        : await fetchBifurcatedHoldings(acc.qcode);

      if (result.holdingsSummary.holdingsCount === 0) continue;
      entries.push({
        label: acc.account_name || acc.qcode,
        holdingsSummary: result.holdingsSummary,
        dataAsOfDate: result.dataAsOfDate,
      });
    } catch {
      // skip failing accounts
    }
  }
  return entries;
}

// ============================================================================
// Excel buffer generator — port of handleDownloadExcel() from holding-summary/page.tsx
// Only change: XLSX.writeFile → XLSX.write returning Buffer
// ============================================================================

function formatDateStr(d: Date | string | null): string {
  if (!d) return "N/A";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "N/A";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

export function generateHoldingsExcelBuffer(
  holdingsSummary: HoldingsSummary,
  clientName: string,
  dataAsOfDate: string | null
): Buffer {
  // --- derive stock / MF split (mirror separateHoldings with selectedStrategy="ALL") ---
  const seen = new Set<string>();
  const uniqueHoldings: Holding[] = [];
  const all = [
    ...(holdingsSummary.equityHoldings || []),
    ...(holdingsSummary.debtHoldings || []),
    ...(holdingsSummary.mutualFundHoldings || []),
  ];
  all.forEach((h) => {
    const isMutualFund = h.type === "mutual_fund";
    const strategyPart = h.strategy ? `-${h.strategy}` : "";
    const key = isMutualFund
      ? `${h.symbol}-${h.isin || "no-isin"}-${h.broker}-${Number(h.avgPrice).toFixed(4)}${strategyPart}`
      : `${h.symbol}-${h.exchange}-${h.broker}${strategyPart}`;
    if (!seen.has(key)) { seen.add(key); uniqueHoldings.push(h); }
  });
  const sortAlpha = (a: Holding, b: Holding) => a.symbol.localeCompare(b.symbol);
  const stocks = uniqueHoldings.filter((h) => h.type !== "mutual_fund").sort(sortAlpha);
  const mutualFunds = uniqueHoldings.filter((h) => h.type === "mutual_fund").sort(sortAlpha);

  // --- asset allocation ---
  let equity = 0, debt = 0, hybrid = 0;
  uniqueHoldings.forEach((h) => {
    const cat = h.debtEquity?.toLowerCase() || (h.type === "mutual_fund" ? "hybrid" : "equity");
    const val = h.valueAsOfToday || 0;
    if (cat === "equity") equity += val;
    else if (cat === "debt") debt += val;
    else hybrid += val;
  });
  const total = equity + debt + hybrid;

  const hasStrategy = uniqueHoldings.some((h) => h.strategy);
  const summary = {
    totalBuyValue: holdingsSummary.totalBuyValue,
    totalCurrentValue: holdingsSummary.totalCurrentValue,
    totalPnl: holdingsSummary.totalPnl,
    totalPnlPercent: holdingsSummary.totalPnlPercent,
    holdingsCount: holdingsSummary.holdingsCount,
  };

  // --- build wsData (exact same structure as handleDownloadExcel) ---
  const wsData: (string | number)[][] = [];
  const headerRowIndices: number[] = [];
  const subHeaderRowIndices: number[] = [];

  wsData.push(["", "Qode"]);
  wsData.push([]);

  headerRowIndices.push(wsData.length);
  wsData.push(["", "Portfolio Holdings Summary"]);
  wsData.push(["", "Generated on:", formatDateStr(new Date())]);
  if (dataAsOfDate) wsData.push(["", "Data as of:", formatDateStr(dataAsOfDate)]);
  wsData.push(["", "Account:", clientName]);
  wsData.push([]);

  headerRowIndices.push(wsData.length);
  wsData.push(["", "Portfolio Statistics"]);
  wsData.push(["", "Total Buy Value (₹)", parseFloat(String(summary.totalBuyValue)) || 0]);
  wsData.push(["", "Total Current Value (₹)", parseFloat(String(summary.totalCurrentValue)) || 0]);
  wsData.push(["", "Total P&L (₹)", parseFloat(String(summary.totalPnl)) || 0]);
  wsData.push(["", "Total P&L (%)", parseFloat(String(summary.totalPnlPercent)) || 0]);
  wsData.push(["", "Total Holdings Count", parseFloat(String(summary.holdingsCount)) || 0]);
  wsData.push([]);

  headerRowIndices.push(wsData.length);
  wsData.push(["", "Asset Allocation"]);
  subHeaderRowIndices.push(wsData.length);
  wsData.push(["", "Type", "Value (₹)", "Percentage (%)"]);
  wsData.push(["", "Equity", parseFloat(String(equity)) || 0, total > 0 ? (equity / total) * 100 : 0]);
  wsData.push(["", "Debt", parseFloat(String(debt)) || 0, total > 0 ? (debt / total) * 100 : 0]);
  wsData.push(["", "Hybrid", parseFloat(String(hybrid)) || 0, total > 0 ? (hybrid / total) * 100 : 0]);
  wsData.push(["", "Total", total, 100]);
  wsData.push([]);

  headerRowIndices.push(wsData.length);
  wsData.push(["", "Broker Breakdown"]);
  subHeaderRowIndices.push(wsData.length);
  wsData.push(["", "Broker", "Buy Value (₹)", "Current Value (₹)", "P&L (₹)", "Holdings Count"]);
  Object.entries(holdingsSummary.brokerBreakdown || {}).forEach(([broker, data]) => {
    wsData.push([
      "", broker,
      parseFloat(String(data.buyValue)) || 0,
      parseFloat(String(data.currentValue)) || 0,
      parseFloat(String(data.pnl)) || 0,
      parseFloat(String(data.count)) || 0,
    ]);
  });
  wsData.push([]);

  headerRowIndices.push(wsData.length);
  wsData.push(["", "Stock Holdings Detail"]);
  subHeaderRowIndices.push(wsData.length);
  wsData.push([
    "", "Symbol", "Exchange", "Quantity", "Avg Price (₹)", "LTP (₹)",
    "Buy Value (₹)", "Current Value (₹)", "P&L Amount (₹)", "P&L (%)", "Broker", "Category",
    ...(hasStrategy ? ["Strategy"] : []),
  ]);
  stocks.forEach((h) => {
    wsData.push([
      "", h.symbol, h.exchange,
      parseFloat(String(h.quantity)) || 0,
      parseFloat(String(h.avgPrice)) || 0,
      parseFloat(String(h.ltp)) || 0,
      parseFloat(String(h.buyValue)) || 0,
      parseFloat(String(h.valueAsOfToday)) || 0,
      parseFloat(String(h.pnlAmount)) || 0,
      parseFloat(String(h.percentPnl)) || 0,
      h.broker, h.debtEquity,
      ...(hasStrategy ? [h.strategy || "N/A"] : []),
    ]);
  });
  wsData.push([]);

  headerRowIndices.push(wsData.length);
  wsData.push(["", "Mutual Fund Holdings Detail"]);
  subHeaderRowIndices.push(wsData.length);
  wsData.push([
    "", "Symbol", "ISIN", "Quantity", "Avg Price (₹)", "LTP (₹)",
    "Buy Value (₹)", "Current Value (₹)", "P&L Amount (₹)", "P&L (%)", "Broker", "Category",
    ...(hasStrategy ? ["Strategy"] : []),
  ]);
  mutualFunds.forEach((h) => {
    wsData.push([
      "", h.symbol, h.isin || "N/A",
      parseFloat(String(h.quantity)) || 0,
      parseFloat(String(h.avgPrice)) || 0,
      parseFloat(String(h.ltp)) || 0,
      parseFloat(String(h.buyValue)) || 0,
      parseFloat(String(h.valueAsOfToday)) || 0,
      parseFloat(String(h.pnlAmount)) || 0,
      parseFloat(String(h.percentPnl)) || 0,
      h.broker, h.debtEquity,
      ...(hasStrategy ? [h.strategy || "N/A"] : []),
    ]);
  });

  // --- worksheet + styling (exact same as handleDownloadExcel) ---
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  const maxCols = Math.max(...wsData.map((row) => row.length));
  const colWidths: { wch: number }[] = [];
  for (let C = 0; C < maxCols; C++) {
    if (C === 0) { colWidths.push({ wch: 2 }); continue; }
    let maxWidth = 10;
    for (let R = 0; R < wsData.length; R++) {
      const v = wsData[R][C];
      if (v != null) maxWidth = Math.max(maxWidth, String(v).length);
    }
    colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
  }
  ws["!cols"] = colWidths;

  const tableBorder = {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } },
  };
  const headerStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "02422B" } },
    font: { name: "Aptos Narrow", color: { rgb: "FFFFFF" }, bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border: tableBorder,
  };
  const subHeaderStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "DABD38" } },
    font: { name: "Aptos Narrow", color: { rgb: "02422B" }, bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border: tableBorder,
  };
  const textStyle = {
    font: { name: "Aptos Narrow", sz: 11 },
    alignment: { horizontal: "left", vertical: "center" },
    border: tableBorder,
  };
  const numberStyle = {
    font: { name: "Aptos Narrow", sz: 11 },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "#,##,##0.00",
    border: tableBorder,
  };
  const titleStyle = {
    font: { name: "Playfair Display", bold: true, sz: 32, color: { rgb: "02422B" } },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const isTableRow = (rowIdx: number) => {
    if (rowIdx <= 1) return false;
    const rowData = wsData[rowIdx];
    if (!rowData) return false;
    for (let i = 1; i < rowData.length; i++) {
      if (rowData[i] !== undefined && rowData[i] !== null && rowData[i] !== "") return true;
    }
    return false;
  };

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const cellValue = ws[addr].v;
      if (cellValue === null || cellValue === undefined || cellValue === "") continue;

      if (R === 0) { ws[addr].s = titleStyle; continue; }
      if (R === 1) continue;

      if (typeof ws[addr].v === "number") {
        ws[addr].t = "n";
        ws[addr].z = "#,##,##0.00";
      } else if (typeof ws[addr].v === "string") {
        const trimmed = ws[addr].v.trim();
        const n = parseFloat(trimmed);
        if (!isNaN(n) && trimmed === String(n)) {
          ws[addr].v = n; ws[addr].t = "n"; ws[addr].z = "#,##,##0.00";
        } else {
          ws[addr].t = "s";
        }
      }

      if (isTableRow(R)) {
        if (C === 0) continue;
        else if (headerRowIndices.includes(R)) ws[addr].s = headerStyle;
        else if (subHeaderRowIndices.includes(R)) ws[addr].s = subHeaderStyle;
        else if (C === 1) ws[addr].s = textStyle;
        else if (ws[addr].t === "n") ws[addr].s = numberStyle;
        else ws[addr].s = { ...textStyle, alignment: { horizontal: "right", vertical: "center" } };
      } else {
        ws[addr].s = textStyle;
      }
    }
  }

  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const getTableWidth = (startRow: number) => {
    let maxCol = 1;
    for (let r = startRow; r < Math.min(startRow + 15, wsData.length); r++) {
      if (wsData[r]) {
        for (let c = 1; c < wsData[r].length; c++) {
          if (wsData[r][c] !== undefined && wsData[r][c] !== null && wsData[r][c] !== "") maxCol = Math.max(maxCol, c);
        }
      }
      if (wsData[r] && wsData[r].every((cell, idx) => idx === 0 || !cell)) break;
    }
    return maxCol;
  };
  headerRowIndices.forEach((rowIdx) => {
    const tableWidth = getTableWidth(rowIdx);
    if (tableWidth > 1) merges.push({ s: { r: rowIdx, c: 1 }, e: { r: rowIdx, c: tableWidth } });
  });
  if (merges.length > 0) ws["!merges"] = merges;
  (ws as Record<string, unknown>)["!views"] = [{ showGridLines: false }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Holdings Summary");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
