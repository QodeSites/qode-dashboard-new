/**
 * Shared, isomorphic builder for the "Current Allocation" / "Current Account
 * Allocation" tables that overlay a live PMS number on top of the
 * Postgres-native calculator's Zerodha-side holdingsBifurcation — used by
 * both the investment-summary page (client-side, live PMS fetch) and the
 * admin Excel export (server-side, live-allocation-server.ts), so the two
 * surfaces can never drift from each other. Zerodha bifurcation is whatever
 * the calculator already says; PMS is appended as a full-cash row on top,
 * matching the tech-team prototype this was ported from (originally inline
 * in app/investment-summary/page.tsx).
 *
 * Deliberately has NO server-only imports (no PortfolioApi/Prisma) — page.tsx
 * is a "use client" component that imports buildLiveAllocation() directly,
 * so anything Prisma-backed belongs in live-allocation-server.ts instead,
 * never here.
 */
import type { MultiStrategyInvestmentData } from "@/app/lib/parse-investment-pdf";

export interface LiveAllocationRow {
  label: string;
  hybrid: number;
  debt: number;
  equity: number;
  cash: number;
  total: number;
}

export interface LiveAllocation {
  currentAllocation: LiveAllocationRow[];
  currentAccountAllocation: {
    label: string;
    amount: number;
    percent: number;
    isTotal?: boolean;
  }[];
}

export function buildLiveAllocation(
  data: Pick<MultiStrategyInvestmentData, "holdingsBifurcation">,
  pmsAum: number,
): LiveAllocation {
  const bucket = (frag: string) =>
    data.holdingsBifurcation.find((r) => r.type.toLowerCase().includes(frag))?.amount ?? 0;

  const zerodhaRow: LiveAllocationRow = {
    label: "Zerodha",
    hybrid: bucket("hybrid"),
    debt: bucket("debt"),
    equity: bucket("equity"),
    cash: bucket("cash"),
    total: 0,
  };
  zerodhaRow.total = zerodhaRow.hybrid + zerodhaRow.debt + zerodhaRow.equity + zerodhaRow.cash;

  const pmsRow: LiveAllocationRow = {
    label: "PMS",
    hybrid: 0,
    debt: 0,
    equity: 0,
    cash: pmsAum,
    total: pmsAum,
  };
  const grandTotalRow: LiveAllocationRow = {
    label: "Grand total",
    hybrid: zerodhaRow.hybrid + pmsRow.hybrid,
    debt: zerodhaRow.debt + pmsRow.debt,
    equity: zerodhaRow.equity + pmsRow.equity,
    cash: zerodhaRow.cash + pmsRow.cash,
    total: zerodhaRow.total + pmsRow.total,
  };

  const combined = zerodhaRow.total + pmsAum;
  return {
    currentAllocation: [zerodhaRow, pmsRow, grandTotalRow],
    currentAccountAllocation: [
      { label: "Zerodha", amount: zerodhaRow.total, percent: combined > 0 ? (zerodhaRow.total / combined) * 100 : 0 },
      { label: "PMS", amount: pmsAum, percent: combined > 0 ? (pmsAum / combined) * 100 : 0 },
      { label: "Account Value", amount: combined, percent: 100, isTotal: true },
    ],
  };
}
