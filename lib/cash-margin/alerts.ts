/**
 * lib/cash-margin/alerts.ts
 * Assembles the Live Alert Table rows.
 *
 * Combines the pieces ported from managed_accounts_analysis:
 *   - reports/margin_report.py  (health % computation, exposure split)
 *   - alerts.py                 (classify_margin_metric, tiered thresholds)
 *
 * v1 scope: the three Margin Health metrics only (Cash %, Cash Collateral %,
 * Non-Cash Collateral %). QAW Sleeve Drift, ideal-% overrides, status
 * lifecycle and deep links are deferred (see docs/cash-margin-alerts-api-plan.md).
 *
 * Unlike alerts.py's alert path (which emits only breaches), this returns a
 * row for EVERY metric including HEALTHY -- the live table shows all of them.
 */
import { prisma } from "@/lib/prisma";
import { detectTier, isXtsMandate, type Tier } from "./tags";
import { loadMastersheet, computeAccountSummary } from "./mastersheet";
import { computeExposureShare } from "./exposure";
import { loadMarginCollaterals, type MarginAvailable } from "./margin-api";
import { METRIC_ORDER, METRIC_LABEL, classifyMarginMetric, type MetricKey, type Severity } from "./thresholds";
import { resolveThresholdConfig, type StrategyOverrides } from "./config";

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

/** Currently-active, non-XTS mandates from client_strategy_configs. */
async function loadActiveMandates(): Promise<ActiveMandate[]> {
  const rows = await prisma.client_strategy_configs.findMany({
    where: { OR: [{ effective_to: null }, { effective_to: { gte: new Date() } }] },
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
  return rows.filter((r) => !isXtsMandate(r.exposure_tag_suffix));
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
 * @param asOfDate - TEMPORARY, for verification against frozen
 *   managed_accounts_analysis Excels -- see loadMastersheet(). Remove once done.
 */
export async function buildAlertRows(overrides?: StrategyOverrides, asOfDate?: Date): Promise<AlertRow[]> {
  const mandates = await loadActiveMandates();

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
