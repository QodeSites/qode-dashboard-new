import { prisma } from "@/lib/prisma";
import { calculatePortfolioMetrics, formatPortfolioStats } from "@/app/lib/portfolio-utils";

/**
 * Distributor view data utilities.
 *
 * The distributor view is a masked, single-strategy showcase that reuses
 * existing dashboard components. Two strategies are supported:
 *
 *   - QYE++ : Deepti Parikh's account (QAC00022), shown as-is with the
 *             client identity scrubbed.
 *
 *   - QAW++ : A spliced curve combining Krishnan Iyer's account (QAC00055)
 *             as the long-history baseline with Dinesh Goel's QAW++ scheme
 *             (QAC00053, scheme inception 2026-01-12) taking over from his
 *             start date. Implemented in a later phase.
 *
 * Both branches return the standard Stats payload that StatsCards,
 * RevenueChart, and PnlTable already consume — plus a `displayConfig` field
 * the view page reads to decide which surfaces to show or hide for that
 * particular strategy.
 */

// Hardcoded account identifiers for the distributor strategies.
// Querying the accounts table at request time would also work, but the
// distributor surface is intentionally fixed to these specific accounts and
// hardcoding makes the dependency explicit.
const QYE_QCODE = "QAC00022"; // Deepti Parikh
const QAW_KRISHNAN_QCODE = "QAC00055"; // Krishnan Iyer
const QAW_DINESH_QCODE = "QAC00053"; // Dinesh Goel (bifurcated; QAW++ scheme only)

export type DistributorStrategy = "qye" | "qaw";

export interface DistributorDisplayConfig {
  // Whether to show the rupee-denominated Stats cards (Amount Invested,
  // Current Portfolio Value). Disabled for any view derived from a
  // synthetic/spliced curve where rupee values have no single real meaning.
  showRupeeCards: boolean;
  // PnlTable display mode. "both" shows percent and cash columns, "percent"
  // hides the cash columns entirely.
  pnlMode: "percent" | "both";
}

export interface DistributorPortfolioResponse {
  data: ReturnType<typeof formatPortfolioStats>;
  metadata: {
    strategyName: string;
    displayName: string; // Header text for the page
    inceptionDate: string | null;
    dataAsOfDate: string | null;
    lastUpdated: string;
  };
  displayConfig: DistributorDisplayConfig;
}

/**
 * Look up an account's account_type / broker / strategy from the accounts
 * table. We do this rather than hardcoding because the broker/strategy
 * columns are the source of truth and the team can change them without
 * updating distributor code.
 */
async function loadAccountMeta(qcode: string): Promise<{
  qcode: string;
  account_type: string;
  broker: string;
  strategy?: string;
}> {
  const account = await prisma.accounts.findFirst({
    where: { qcode },
    select: { qcode: true, account_type: true, broker: true, strategy: true },
  });
  if (!account) {
    throw new Error(`Distributor view: account ${qcode} not found`);
  }
  if (!account.account_type || !account.broker) {
    throw new Error(
      `Distributor view: account ${qcode} is missing account_type or broker`
    );
  }
  return {
    qcode: account.qcode,
    account_type: account.account_type,
    broker: account.broker,
    strategy: account.strategy ?? undefined,
  };
}

/**
 * Extract inception date and data-as-of date from an equity curve, mirroring
 * the helper used in /api/portfolio/route.ts so distributor responses carry
 * the same metadata shape.
 */
function getCurveDateRange(
  equityCurve: { date: string; value: number }[]
): { inceptionDate: string | null; dataAsOfDate: string | null } {
  if (!equityCurve || equityCurve.length === 0) {
    return { inceptionDate: null, dataAsOfDate: null };
  }
  const sorted = [...equityCurve].sort((a, b) => a.date.localeCompare(b.date));
  return {
    inceptionDate: sorted[0].date,
    dataAsOfDate: sorted[sorted.length - 1].date,
  };
}

/**
 * QYE++ branch — Deepti Parikh (QAC00022).
 *
 * Reuses the standard portfolio-utils pipeline against a single qcode and
 * scrubs all identifying metadata before returning. Because this is a single
 * real account, both rupee Stats cards and the cash PnL columns are
 * meaningful and stay enabled in displayConfig.
 */
export async function getQyeStats(): Promise<DistributorPortfolioResponse> {
  const accountMeta = await loadAccountMeta(QYE_QCODE);

  const metrics = await calculatePortfolioMetrics([accountMeta]);
  if (!metrics) {
    throw new Error("Distributor view: failed to calculate QYE++ metrics");
  }

  const stats = formatPortfolioStats(metrics);
  const { inceptionDate, dataAsOfDate } = getCurveDateRange(stats.equityCurve);

  // Scrub the strategy name on the formatted stats so nothing client-specific
  // leaks through to the UI.
  stats.strategyName = "QYE++ Strategy";

  return {
    data: stats,
    metadata: {
      strategyName: "QYE++ Strategy",
      displayName: "QYE++ Strategy",
      inceptionDate,
      dataAsOfDate,
      lastUpdated: new Date().toISOString(),
    },
    displayConfig: {
      showRupeeCards: true,
      pnlMode: "both",
    },
  };
}

/**
 * QAW++ branch — Krishnan Iyer baseline + Dinesh Goel splice.
 *
 * NOT YET IMPLEMENTED. This will splice Krishnan's full history with
 * Dinesh's QAW++ scheme (taking over on 2026-01-12), following the same
 * rebase pattern used in bifurcated-portfolio-utils.ts:352-368, so that the
 * final result is a single continuous NAV curve. See task #6.
 */
export async function getQawStats(): Promise<DistributorPortfolioResponse> {
  // Reference the constants so they're not flagged as unused while task #6
  // is still pending.
  void QAW_KRISHNAN_QCODE;
  void QAW_DINESH_QCODE;
  throw new Error("QAW++ distributor view is not yet implemented");
}
