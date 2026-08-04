/**
 * lib/cash-margin/client-registry.ts
 * "Clients / Portfolio Overview" (P1) -- a multi-client registry: one row
 * per active client-strategy mandate, across every client at once, plus a
 * Summary Banner and an Action Queue. Different shape from every other
 * table in lib/cash-margin, which are all single-qcode detail views.
 *
 * See docs/page1-client-portfolio-overview-plan.md for the source Excel
 * columns and the open-questions this implements answers to:
 *  - Excess Cash Status labels: "Excess Cash Levels" / "Low Cash Levels"
 *    (matching the pasted target table, not the formula-explanation text's
 *    "Action Required"/"Check Cash Levels").
 *  - Alert Status / Alerts Triggered granularity: per CLIENT (worst-of
 *    across every one of that client's active strategies' alert rows), not
 *    per single mandate.
 *  - Manual date selection: reuses the existing `asOfDate` plumbing already
 *    threaded through loadMastersheet()/buildAlertRows() -- no new date
 *    mechanism needed.
 *  - The ₹50L "Deploy Excess Cash" trigger stays a hardcoded flat constant,
 *    matching every other table's current state.
 *
 * Each row reuses existing per-mandate building blocks:
 *  - Account Value / Cash / Holdings: mastersheet.ts's computeAccountSummary
 *    (prefixed tags), same shape as consolidated.ts's ConsolidatedSummary.
 *  - Excess Cash: consolidated.ts's computeConsolidatedExcessCash(), fed
 *    that mandate's own AccountSummary + its resolved equityPct (same ratio
 *    System Breakup's Equity Book uses) -- NOT the no-prefix "whole client"
 *    rollup computeAccountSummaryCombined uses; this is a per-mandate row.
 *  - Current Drawdown %: mastersheet.ts's getDrawdown(), read off the same
 *    account-value tag row (confirmed via read-only DB spot-check that
 *    `drawdown` varies per system_tag, not one value per qcode/date).
 *  - Alert Status: alerts.ts's buildAlertRows(), grouped by qcode, worst-of.
 *  - Debt-Equity-Hybrid Ratio: debt-equity.ts's computeDebtEquityForStrategy().
 *
 * Margin Status / Excess Cash Status / Action are all genuinely new: plain
 * sign-of-Excess-Cash checks, distinct from thresholds.ts's tiered
 * classifyMarginMetric (a different "health" concept entirely -- see the
 * plan doc).
 */
import { prisma } from "@/lib/prisma";
import { loadMastersheet, getDrawdown } from "./mastersheet";
import { computeAccountSummary } from "./mastersheet";
import { computeConsolidatedExcessCash, type ConsolidatedSummary } from "./consolidated";
import { computeDebtEquityForStrategy } from "./debt-equity";
import { buildAlertRows, type AlertRow } from "./alerts";
import { resolveRatioConfig, type StrategyOverrides } from "./config";
import { resolveAccountValueTag, detectTier, isXtsMandate, type Tier } from "./tags";
import type { Severity } from "./thresholds";

/** ₹50L flat trigger for the "Deploy Excess Cash" action -- hardcoded, matching
 *  every other table's current state (see docs/page1-client-portfolio-overview-plan.md
 *  open question #4). */
const DEPLOY_EXCESS_CASH_THRESHOLD = 50_00_000;

export type ExcessCashStatus = "Excess Cash Levels" | "Low Cash Levels";
export type MarginStatus = "Shortfall" | "Healthy";
/** Verbatim labels from SMA_Dashboard_v12.xlsx's "P1 Clients" sheet, column P
 *  (checked 2026-07-30 -- see docs/assumptions-and-changes-from-krish-logic.md §18). */
export type RegistryAction = "Review Margin & Collateral" | "Deploy - Excess Cash" | "No action required";

/** Worst-of ranking for Severity -- higher is worse. UPSIDE/UNAVAILABLE rank
 *  below the two the plan doc explicitly calls out (Action Required > Warning
 *  > Healthy), since neither is a "this needs attention" signal in the same
 *  sense. */
const SEVERITY_RANK: Record<Severity, number> = {
  ACTION_REQUIRED: 4,
  WARNING: 3,
  UNAVAILABLE: 2,
  UPSIDE: 1,
  HEALTHY: 0,
};

function worstSeverity(rows: AlertRow[]): Severity {
  if (rows.length === 0) return "UNAVAILABLE";
  return rows.reduce<Severity>(
    (worst, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[worst] ? r.severity : worst),
    "HEALTHY",
  );
}

export interface ClientRegistryRow {
  qcode: string;
  client: string;
  strategy: string;
  tier: Tier;
  /** This qcode's latest mastersheet date (loadMastersheet(), qcode-wide,
   *  no tag filter -- same convention as every other cash-margin table).
   *  Cached per-qcode below, so every row for the same client shares one
   *  value; differs client-to-client since each client's data can be as
   *  of a different date. */
  mastersheetDate: string | null;
  /** True for an XTS mandate (isXtsMandate() on exposure_tag_suffix) -- runs
   *  fully on cash with no Zerodha margin account behind it, so every field
   *  below except accountValue/mastersheetDate is structurally meaningless
   *  and is null. Still gets a row (accountValue included) so Page 1's table
   *  total matches the Summary Banner's Total AUM, which always included
   *  XTS -- see SummaryBanner's field docs. */
  isXts: boolean;
  accountValue: number;
  cash: number | null;
  /** (Cash + Liquidcase) / AV * 100 -- NOT `cash / AV` (see Cash column vs Cash % in the plan doc).
   *  This is the Excel "Cash Component (% of Account Value)" column. Null for XTS. */
  cashPct: number | null;
  /** Cash + Liquidcase, in rupees -- the Excel "Cash Component (₹)" column
   *  (this is `cash` and `cashPct`'s numerator; `computeConsolidatedExcessCash`'s
   *  `currentCash`, surfaced here since the row previously discarded it). Null for XTS. */
  cashComponentValue: number | null;
  /** `cash / AV * 100` -- cash ALONE, excluding Liquidcase. The Excel
   *  "Cash (% of Account Value)" column, distinct from `cashPct` above. Null for XTS. */
  cashOnlyPct: number | null;
  /** `cashOnlyPct - resolveRatioConfig(...).cashPct * 100` -- actual cash-only
   *  % vs. the DB-resolved Cash sub-target (Derivative Book's `cash_pct`
   *  column, same field app/lib/internal-utils.ts's Withdrawal feature reads
   *  as `split.cash_pct`). The Excel "Cash Drift (%)" column. Null for XTS. */
  cashDriftPct: number | null;
  /** `cashPct - idealCashPct` (both percent-scale), where `idealCashPct` is
   *  `computeConsolidatedExcessCash`'s derived `1 - idealHoldingsPct` -- same
   *  formula as internal-utils.ts's `cash_component_drift`. The Excel
   *  "Cash Component Drift from Ideal (%)" column. Null for XTS. */
  cashComponentDriftPct: number | null;
  excessCash: number | null;
  excessCashPct: number | null;
  excessCashStatus: ExcessCashStatus | null;
  holdings: number | null;
  holdingsPct: number | null;
  /** `holdingsPct - idealHoldingsPct` (both percent-scale) -- same formula as
   *  internal-utils.ts's `holdings_drift`. The Excel "Holdings Drift from
   *  Ideal (%)" column. Null for XTS. */
  holdingsDriftPct: number | null;
  marginStatus: MarginStatus | null;
  /** Percent-scale (e.g. -4.99), null if the tag has no drawdown row (also null for XTS). */
  currentDrawdownPct: number | null;
  /** Worst-of across just THIS mandate's own 3 metric alert rows (Cash %,
   *  Cash Collateral %, Non-Cash Collateral %) -- strategy-level granularity,
   *  so a 3-strategy client can show 2 strategies alerting and 1 healthy
   *  instead of one blended value repeated on every row. Null for XTS (no
   *  alert rows are built for XTS mandates at all). */
  alertStatus: Severity | null;
  /** Worst-of across EVERY one of this client's active strategies' alert
   *  rows (all mandates, all metrics) -- the client-level rollup, for a
   *  "does this client need attention anywhere" glance. Same value repeats
   *  across every row for a given qcode. Null for XTS. */
  clientAlertStatus: Severity | null;
  action: RegistryAction | null;
  /** "{debtPct}-{equityPct}-{hybridPct}", each rounded to the nearest whole percent. Null for XTS. */
  debtEquityHybridRatio: string | null;
}

export interface SummaryBanner {
  /** Distinct qcodes across EVERY active client_strategy_configs mandate --
   *  XTS included. See file header + buildClientRegistry() for why AUM/Client
   *  count intentionally does NOT use the same XTS-excluded set as `rows`. */
  totalClients: number;
  /** Sum of Account Value across EVERY active mandate, XTS included -- matches
   *  app/lib/internal-utils.ts's computePortfolioSummary(), which never
   *  special-cases XTS either (only `rows`/margin-shortfall/alert concepts do,
   *  since Cash%/Collateral/Margin Status are structurally meaningless for a
   *  fully-cash XTS mandate). */
  totalAum: number;
  totalExcessCash: number;
  /** Scoped to non-XTS `rows` only -- Margin Status doesn't apply to XTS mandates. */
  marginShortfalls: number;
  /** Scoped to non-XTS `rows` only -- Alert Status doesn't apply to XTS mandates. */
  alertsTriggered: number;
}

export interface ClientRegistryResult {
  rows: ClientRegistryRow[];
  summary: SummaryBanner;
  /** "{client} {strategy} — {action}" for every row whose action isn't "No action required". */
  actionQueue: string[];
}

interface MandateRow {
  qcode: string;
  account_name: string;
  strategy: string;
  exposure_tag_suffix: string;
  equity_pct: unknown;
}

interface StrategyDefaultRow {
  strategy_name: string;
  equity_pct: unknown;
}

function round(n: number): number {
  return Math.round(n);
}

function resolveAction(excessCash: number): RegistryAction {
  if (excessCash < 0) return "Review Margin & Collateral";
  if (excessCash > DEPLOY_EXCESS_CASH_THRESHOLD) return "Deploy - Excess Cash";
  return "No action required";
}

/**
 * Full Client Registry build across every active, non-XTS mandate.
 *
 * @param overrides - optional, request-scoped only, never persisted (POST
 *   body override of equity_pct and the alert threshold bands -- see
 *   lib/cash-margin/config.ts).
 * @param asOfDate - TEMPORARY, for verification against frozen
 *   managed_accounts_analysis Excels -- see loadMastersheet(). Remove once done.
 */
export async function buildClientRegistry(
  overrides?: StrategyOverrides,
  asOfDate?: Date,
): Promise<ClientRegistryResult> {
  // Fetched once, XTS included -- `rows`/margin-shortfall/alert-status stay
  // scoped to the non-XTS subset below, but Total Clients/Total AUM in the
  // Summary Banner intentionally cover EVERY active mandate (see SummaryBanner's
  // field docs) -- matches app/lib/internal-utils.ts's computePortfolioSummary(),
  // which never excludes XTS either.
  const allActiveMandates = (await prisma.client_strategy_configs.findMany({
    where: { OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }] },
    select: {
      qcode: true,
      account_name: true,
      strategy: true,
      exposure_tag_suffix: true,
      equity_pct: true,
    },
    orderBy: [{ account_name: "asc" }, { strategy: "asc" }],
  })) as unknown as MandateRow[];

  const strategyNames = Array.from(new Set(allActiveMandates.map((m) => m.strategy)));
  const defaults = await prisma.strategy_defaults.findMany({
    where: { strategy_name: { in: strategyNames } },
  });
  const defaultsByStrategy = new Map(defaults.map((d) => [d.strategy_name, d as unknown as StrategyDefaultRow]));

  // Alert Status is rolled up per CLIENT (worst-of across all of that
  // client's active strategies), so build the full alert table once and
  // group by qcode -- see the file header + plan doc open question #2.
  const alertRows = await buildAlertRows(overrides, asOfDate);
  const alertsByQcode = new Map<string, AlertRow[]>();
  for (const r of alertRows) {
    const list = alertsByQcode.get(r.qcode);
    if (list) list.push(r);
    else alertsByQcode.set(r.qcode, [r]);
  }

  const msCache = new Map<string, Awaited<ReturnType<typeof loadMastersheet>>>();

  const rows: ClientRegistryRow[] = [];
  for (const m of allActiveMandates) {
    let ms = msCache.get(m.qcode);
    if (!ms) {
      ms = await loadMastersheet(m.qcode, asOfDate);
      msCache.set(m.qcode, ms);
    }

    const tier = detectTier(m.strategy);
    const summary = computeAccountSummary(ms, m.strategy, m.exposure_tag_suffix);
    const accountValue = summary.accountValue;
    const mastersheetDate = ms.date ? ms.date.toISOString().slice(0, 10) : null;

    if (isXtsMandate(m.exposure_tag_suffix)) {
      // XTS mandate: fully cash, no Zerodha margin account behind it -- every
      // metric below is structurally meaningless (see isXtsMandate's doc and
      // the ClientRegistryRow field docs). Still gets a row so Page 1's table
      // total lines up with the Summary Banner's Total AUM (which always
      // included XTS).
      rows.push({
        qcode: m.qcode,
        client: m.account_name,
        strategy: m.strategy,
        tier,
        mastersheetDate,
        isXts: true,
        accountValue,
        cash: null,
        cashPct: null,
        cashComponentValue: null,
        cashOnlyPct: null,
        cashDriftPct: null,
        cashComponentDriftPct: null,
        excessCash: null,
        excessCashPct: null,
        excessCashStatus: null,
        holdings: null,
        holdingsPct: null,
        holdingsDriftPct: null,
        marginStatus: null,
        currentDrawdownPct: null,
        alertStatus: null,
        clientAlertStatus: null,
        action: null,
        debtEquityHybridRatio: null,
      });
      continue;
    }

    const ratioConfig = resolveRatioConfig(m.strategy, m, defaultsByStrategy.get(m.strategy), overrides);
    const consolidatedSummary: ConsolidatedSummary = summary;
    const excessCashResult = computeConsolidatedExcessCash(consolidatedSummary, ratioConfig.equityPct);

    const cashPct = accountValue ? (excessCashResult.currentCash / accountValue) * 100 : 0;
    const holdingsPct = accountValue ? (excessCashResult.holdingsValue / accountValue) * 100 : 0;
    const excessCashPct = accountValue ? (excessCashResult.excessCash / accountValue) * 100 : 0;

    const cashOnlyPct = accountValue ? (summary.cash / accountValue) * 100 : 0;
    const cashDriftPct = cashOnlyPct - ratioConfig.cashPct * 100;
    const holdingsDriftPct = holdingsPct - excessCashResult.idealHoldingsPct;
    const cashComponentDriftPct = cashPct - excessCashResult.idealCashPct;

    const drawdownTag = resolveAccountValueTag(m.strategy, m.exposure_tag_suffix);
    const currentDrawdownPct = getDrawdown(ms, drawdownTag);

    const debtEquityRow = computeDebtEquityForStrategy(ms, m.strategy, m.exposure_tag_suffix);
    const debtEquityHybridRatio = `${round(debtEquityRow.debtPct)}-${round(debtEquityRow.equityPct)}-${round(debtEquityRow.hybridPct)}`;

    const clientAlerts = alertsByQcode.get(m.qcode) ?? [];
    const ownStrategyAlerts = clientAlerts.filter((r) => r.strategy === m.strategy);
    const alertStatus = worstSeverity(ownStrategyAlerts);
    const clientAlertStatus = worstSeverity(clientAlerts);

    rows.push({
      qcode: m.qcode,
      client: m.account_name,
      strategy: m.strategy,
      tier,
      mastersheetDate,
      isXts: false,
      accountValue,
      cash: summary.cash,
      cashPct,
      cashComponentValue: excessCashResult.currentCash,
      cashOnlyPct,
      cashDriftPct,
      cashComponentDriftPct,
      excessCash: excessCashResult.excessCash,
      excessCashPct,
      excessCashStatus: excessCashResult.excessCash > 0 ? "Excess Cash Levels" : "Low Cash Levels",
      holdings: excessCashResult.holdingsValue,
      holdingsPct,
      holdingsDriftPct,
      marginStatus: excessCashResult.excessCash < 0 ? "Shortfall" : "Healthy",
      currentDrawdownPct,
      alertStatus,
      clientAlertStatus,
      action: resolveAction(excessCashResult.excessCash),
      debtEquityHybridRatio,
    });
  }

  // `rows` now includes XTS mandates (accountValue + mastersheetDate only,
  // every other field null -- see the loop above), so Total AUM is a
  // straight sum with no separate XTS term needed. Excess Cash / Margin
  // Shortfalls / Action Queue stay implicitly XTS-free since those fields
  // are null on XTS rows.
  const totalClients = new Set(allActiveMandates.map((m) => m.qcode)).size;
  const totalAum = rows.reduce((s, r) => s + r.accountValue, 0);
  const totalExcessCash = rows.reduce((s, r) => s + (r.excessCash ?? 0), 0);
  const marginShortfalls = rows.filter((r) => r.marginStatus === "Shortfall").length;

  const alertedClients = new Set<string>();
  for (const [qcode, rowsForClient] of alertsByQcode) {
    const worst = worstSeverity(rowsForClient);
    if (worst === "ACTION_REQUIRED" || worst === "WARNING") alertedClients.add(qcode);
  }
  const alertsTriggered = alertedClients.size;

  const actionQueue = rows
    .filter((r) => r.action !== null && r.action !== "No action required")
    .map((r) => `${r.client} ${r.strategy} — ${r.action}`);

  return {
    rows,
    summary: { totalClients, totalAum, totalExcessCash, marginShortfalls, alertsTriggered },
    actionQueue,
  };
}
