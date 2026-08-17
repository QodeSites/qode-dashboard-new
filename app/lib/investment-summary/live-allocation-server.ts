/**
 * Server-only companion to live-allocation.ts — pulls in PortfolioApi
 * (Prisma-backed), so this file must only ever be imported from server code
 * (API routes). Kept separate from live-allocation.ts specifically so that
 * module, which app/investment-summary/page.tsx ("use client") imports
 * directly, never drags Prisma into the browser bundle.
 */
import type { MultiStrategyInvestmentData } from "@/app/lib/parse-investment-pdf";
import { PortfolioApi } from "@/app/lib/sarla-utils";
import { buildLiveAllocation, type LiveAllocation } from "./live-allocation";

// Clients whose Excel gets this live PMS overlay — currently just Sarla.
const SARLA_ICODE = "QUS0007";

/**
 * Icode-gated PMS fetch both Excel routes (download-all/route.ts,
 * download/route.ts) need — returns null for every icode except Sarla, so
 * callers can unconditionally splice the result into
 * buildInvestmentSummaryWorkbook() without their own if-check. Failures are
 * swallowed (logged, not thrown): a PMS lookup hiccup shouldn't block the
 * Zerodha-side report the calculator already successfully built.
 */
export async function getLiveAllocationForIcode(
  icode: string,
  data: Pick<MultiStrategyInvestmentData, "holdingsBifurcation">,
): Promise<LiveAllocation | null> {
  if (icode !== SARLA_ICODE) return null;
  try {
    const { currentExposure } = await PortfolioApi.getPmsSummary("QAC00041");
    return buildLiveAllocation(data, currentExposure);
  } catch (err) {
    console.error(`live-allocation-server: PMS overlay failed for ${icode}:`, err);
    return null;
  }
}
