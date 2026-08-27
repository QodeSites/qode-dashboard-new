/**
 * lib/cash-margin/alerts.ts
 * Assembles the Live Alert Table rows.
 *
 * Combines the pieces ported from managed_accounts_analysis:
 *   - reports/margin_report.py  (health % computation, exposure split)
 *   - alerts.py                 (classify_margin_metric, tiered thresholds)
 *
 * v1 scope for buildAlertRows(): the three Margin Health metrics only (Cash %,
 * Cash Collateral %, Non-Cash Collateral %). Unchanged in this file --
 * buildSleeveDriftRows() below is a DELIBERATELY SEPARATE function/array, not
 * folded into buildAlertRows()'s output: client-registry.ts groups
 * buildAlertRows()'s rows by qcode and takes a worst-of severity across ALL
 * of them, with no per-metric filter, to drive the per-client "Alert Status"
 * badge on the P1 client list. Mixing Sleeve Drift rows into that array would
 * silently change that badge (and the alerted-clients Action Queue) for every
 * QAW client with any sleeve drift -- a real behavior change to an
 * already-shipped page, not just additive table rows. Keeping the two arrays
 * separate means buildAlertRows()'s existing callers (this file's route,
 * app/previewma/Alerts.tsx, client-registry.ts) are completely unaffected by
 * Sleeve Drift's addition; a caller that wants both concatenates them itself.
 *
 * ideal-% overrides beyond StrategyOverrides, status lifecycle, and deep
 * links are still deferred (see docs/cash-margin-alerts-api-plan.md).
 *
 * Unlike alerts.py's alert path (which emits only breaches), this returns a
 * row for EVERY metric including HEALTHY -- the live table shows all of them.
 */
import { prisma } from "@/lib/prisma";
import { detectTier, isXtsMandate, PROP_STRATEGY, type Tier } from "./tags";
import { loadMastersheet, computeAccountSummary } from "./mastersheet";
import { computeExposureShare } from "./exposure";
import { loadMarginCollaterals, type MarginAvailable } from "./margin-api";
import { loadCatalog } from "./catalog";
import { loadHoldings } from "./holdings";
import { loadResolvedRatios, withOverrides, hasConfiguredLeaves, Diagnostics } from "./ratio-resolver";
import { computeSystemBreakupForStrategy } from "./system-breakup";
import {
  METRIC_ORDER,
  METRIC_LABEL,
  classifyMarginMetric,
  classifySleeveDrift,
  type MetricKey,
  type Severity,
} from "./thresholds";
import { resolveThresholdConfig, type StrategyOverrides, type Band } from "./config";

export interface AlertRow {
  client: string;
  qcode: string;
  strategy: string;
  tier: Tier;
  metricKey: MetricKey;
  metric: string;
  /** Metric value as % of Account Value; null if unavailable (margin fetch failed). */
  currentValue: number | null;
  healthyThreshold: number;
  warningThreshold: number;
  upsideThreshold: number | null;
  /** currentValue - healthyThreshold; null when currentValue is null. */
  delta: number | null;
  severity: Severity;
  marginFetchOk: boolean;
  mastersheetDate: string | null;
}

/**
 * "QAW Sleeve Drift" / model-portfolio-shift -- one row per active mandate's
 * equity-book leaf (Gold/Momentum/Low Vol), for mandates that actually have
 * the sleeve split configured (hasConfiguredLeaves -- QYE has none). A
 * DELIBERATELY SEPARATE type/array from AlertRow -- see this file's header
 * comment for why it isn't folded into buildAlertRows()'s output.
 *
 * Reuses system-breakup.ts's own drift math (SystemBreakupRow.diffPct)
 * rather than recomputing it, so this can never disagree with the System
 * Breakup page about what a sleeve's current/target split is.
 */
export interface SleeveDriftRow {
  client: string;
  qcode: string;
  strategy: string;
  tier: Tier;
  /** config_catalog configKey for the leaf, e.g. "gold"/"momentum"/"lowvol". */
  configKey: string;
  label: string;
  /** This leaf's actual % of the equity book's own total (currentPct). */
  currentValue: number | null;
  /** This leaf's target % of the equity book's own total (subPct). */
  targetValue: number;
  healthyThreshold: number;
  warningThreshold: number;
  /** Signed drift (currentValue - targetValue) -- can be negative (under
   *  target) or positive (over target); severity is classified on |delta|. */
  delta: number | null;
  severity: Severity;
  mastersheetDate: string | null;
}

/**
 * Sleeve Drift's severity band. No DB column exists for this yet (unlike
 * Margin Health's cash_pct_healthy/warning etc., which come from
 * client_strategy_configs/strategy_defaults) -- hardcoded here the same way
 * CASH_ALERT_EXCLUDED_QCODES below is, as a placeholder default rather than
 * a per-strategy/per-client resolved value. Revisit once (if) a
 * sleeve_drift_pct_healthy/warning pair gets added to config_catalog or
 * strategy_defaults.
 */
const SLEEVE_DRIFT_BAND: Band = { healthy: 3, warning: 7 };

interface ActiveMandate {
  qcode: string;
  account_name: string;
  strategy: string;
  exposure_tag_suffix: string;
  cash_pct_healthy: unknown;
  cash_pct_warning: unknown;
  cash_pct_upside: unknown;
  cash_collateral_pct_healthy: unknown;
  cash_collateral_pct_warning: unknown;
  non_cash_collateral_pct_healthy: unknown;
  non_cash_collateral_pct_warning: unknown;
}

/**
 * Clients excluded from cash alerts by explicit request, not derivable from
 * exposure_tag_suffix like XTS mandates are. Hardcoded rather than a DB
 * column since this is a one-off exclusion list, not a general config field.
 */
const CASH_ALERT_EXCLUDED_QCODES = new Set<string>([
  "QAC00127", // Priyanka Mittle
]);

/**
 * Currently-active, non-XTS mandates from client_strategy_configs, as of
 * `referenceDate` (defaults to now). Checks both effective_from and
 * effective_to so a mandate that starts in the future -- or an asOfDate that
 * falls before a mandate's start -- doesn't get pulled in.
 */
async function loadActiveMandates(referenceDate: Date = new Date()): Promise<ActiveMandate[]> {
  const rows = await prisma.client_strategy_configs.findMany({
    where: {
      strategy: { not: PROP_STRATEGY },
      effective_from: { lte: referenceDate },
      OR: [{ effective_to: null }, { effective_to: { gte: referenceDate } }],
    },
    select: {
      qcode: true,
      account_name: true,
      strategy: true,
      exposure_tag_suffix: true,
      cash_pct_healthy: true,
      cash_pct_warning: true,
      cash_pct_upside: true,
      cash_collateral_pct_healthy: true,
      cash_collateral_pct_warning: true,
      non_cash_collateral_pct_healthy: true,
      non_cash_collateral_pct_warning: true,
    },
    orderBy: [{ account_name: "asc" }, { strategy: "asc" }],
  });
  return rows.filter((r) => !isXtsMandate(r.exposure_tag_suffix) && !CASH_ALERT_EXCLUDED_QCODES.has(r.qcode));
}

function pct(part: number, whole: number): number | null {
  return whole ? (part / whole) * 100 : null;
}

/**
 * Build all alert-table rows. One row per (active non-XTS mandate) x (metric).
 *
 * @param overrides - optional, request-scoped only, never persisted (POST
 *   body override of the resolved threshold bands -- see
 *   lib/cash-margin/config.ts and docs/thresholds-to-table-and-post-override-plan.md).
 * @param asOfDate - pins every mandate/mastersheet read in this response to
 *   a historical date instead of always-latest -- see loadMastersheet().
 *   Omit for "latest."
 */
export async function buildAlertRows(overrides?: StrategyOverrides, asOfDate?: Date): Promise<AlertRow[]> {
  const mandates = await loadActiveMandates(asOfDate ?? new Date());

  const strategyNames = Array.from(new Set(mandates.map((m) => m.strategy)));
  const defaults = await prisma.strategy_defaults.findMany({
    where: { strategy_name: { in: strategyNames } },
  });
  const defaultsByStrategy = new Map(defaults.map((d) => [d.strategy_name, d]));

  // Count active strategies per qcode, for the multi-strategy exposure split.
  const strategyCount = new Map<string, number>();
  for (const m of mandates) {
    strategyCount.set(m.qcode, (strategyCount.get(m.qcode) ?? 0) + 1);
  }

  // Latest cm_margin_collateral snapshot per distinct qcode.
  const marginMap = await loadMarginCollaterals(mandates.map((m) => m.qcode));

  const rows: AlertRow[] = [];

  // Cache mastersheet snapshots per qcode (multi-strategy clients reuse one).
  const msCache = new Map<string, Awaited<ReturnType<typeof loadMastersheet>>>();

  for (const m of mandates) {
    let ms = msCache.get(m.qcode);
    if (!ms) {
      ms = await loadMastersheet(m.qcode, asOfDate);
      msCache.set(m.qcode, ms);
    }

    const tier = detectTier(m.strategy);
    const summary = computeAccountSummary(ms, m.strategy, m.exposure_tag_suffix);
    const accountValue = summary.accountValue;

    const margin: MarginAvailable | null = marginMap.get(m.qcode) ?? null;
    const marginFetchOk = margin !== null;

    const share = computeExposureShare(
      ms,
      m.strategy,
      m.exposure_tag_suffix,
      strategyCount.get(m.qcode) ?? 1,
    );

    const availCc = margin ? margin.liquidCollateral * share : null;
    const availNcc = margin ? margin.stockCollateral * share : null;

    const metricPct: Record<MetricKey, number | null> = {
      cash_pct: pct(summary.cash, accountValue),
      cash_collateral_pct: availCc === null ? null : pct(availCc, accountValue),
      non_cash_collateral_pct: availNcc === null ? null : pct(availNcc, accountValue),
    };

    const bands = resolveThresholdConfig(m.strategy, m, defaultsByStrategy.get(m.strategy), overrides);

    for (const metricKey of METRIC_ORDER) {
      const value = metricPct[metricKey];
      const band = bands[metricKey];
      const severity = classifyMarginMetric(value, band);
      rows.push({
        client: m.account_name,
        qcode: m.qcode,
        strategy: m.strategy,
        tier,
        metricKey,
        metric: METRIC_LABEL[metricKey],
        currentValue: value,
        healthyThreshold: band.healthy,
        warningThreshold: band.warning,
        upsideThreshold: band.upside ?? null,
        delta: value === null ? null : value - band.healthy,
        severity,
        marginFetchOk,
        mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      });
    }
  }

  return rows;
}

/**
 * Build Sleeve Drift rows -- see SleeveDriftRow's doc comment for why this
 * is a separate function/array from buildAlertRows(), not merged into it.
 *
 * One row per (active mandate with hasEquitySplit) x (equity-book leaf,
 * depth 0 only -- Gold/Momentum/Low Vol, not the deeper momentum50/momidmtm
 * split). Reuses loadActiveMandates() (same PROP/XTS-mandate/hardcoded-
 * exclusion filter as Margin Health) and computeSystemBreakupForStrategy()
 * (same drift math the System Breakup page shows) rather than duplicating
 * either.
 *
 * @param overrides - optional, request-scoped only, never persisted -- same
 *   StrategyOverrides shape as buildAlertRows(), threaded into the
 *   equity_pct/gold/momentum/lowvol ratio resolution.
 * @param asOfDate - pins every mandate/mastersheet/holdings read to a
 *   historical date instead of always-latest. Omit for "latest."
 */
export async function buildSleeveDriftRows(overrides?: StrategyOverrides, asOfDate?: Date): Promise<SleeveDriftRow[]> {
  const referenceDate = asOfDate ?? new Date();
  const mandates = await loadActiveMandates(referenceDate);
  const catalog = await loadCatalog();
  const diagnostics = new Diagnostics();

  const rows: SleeveDriftRow[] = [];
  const msCache = new Map<string, Awaited<ReturnType<typeof loadMastersheet>>>();
  const holdingsCache = new Map<string, Awaited<ReturnType<typeof loadHoldings>>>();

  for (const m of mandates) {
    let ms = msCache.get(m.qcode);
    if (!ms) {
      ms = await loadMastersheet(m.qcode, asOfDate);
      msCache.set(m.qcode, ms);
    }
    let holdings = holdingsCache.get(m.qcode);
    if (!holdings) {
      holdings = await loadHoldings(m.qcode, asOfDate);
      holdingsCache.set(m.qcode, holdings);
    }

    const tier = detectTier(m.strategy);
    const rawRatios = await loadResolvedRatios(m.strategy, m.qcode, referenceDate);
    const ratios = withOverrides(rawRatios, overrides);
    const hasEquitySplit = hasConfiguredLeaves(catalog, "equity_book", "ideal", ratios);
    if (!hasEquitySplit) continue; // e.g. every QYE mandate -- no sleeve config to drift from

    const breakup = computeSystemBreakupForStrategy(
      ms, m.strategy, m.exposure_tag_suffix, tier, catalog, ratios, holdings, diagnostics,
    );

    for (const leaf of breakup.equityBook.rows) {
      const delta = leaf.diffPct; // currentPct - subPct, already computed by system-breakup.ts
      rows.push({
        client: m.account_name,
        qcode: m.qcode,
        strategy: m.strategy,
        tier,
        configKey: leaf.configKey,
        label: leaf.label,
        currentValue: leaf.currentPct,
        targetValue: leaf.subPct ?? 0,
        healthyThreshold: SLEEVE_DRIFT_BAND.healthy,
        warningThreshold: SLEEVE_DRIFT_BAND.warning,
        delta,
        severity: classifySleeveDrift(delta, SLEEVE_DRIFT_BAND),
        mastersheetDate: ms.date ? ms.date.toISOString().slice(0, 10) : null,
      });
    }
  }

  return rows;
}
