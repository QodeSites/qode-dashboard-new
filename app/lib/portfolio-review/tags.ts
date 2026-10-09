import { prisma } from "@/lib/prisma";
import { toSqlDate } from "@/lib/utils";
import type { NavPoint } from "@/app/lib/internal-utils";

export interface StrategyPair {
  qcode: string;
  account_name: string;
  strategy: string;
  tag: string;
  // Cash-flow-bearing tag: exposure_tag_suffix tracks real client
  // deposits/withdrawals cleanly; profit_tag_suffix's capital_in_out
  // is contaminated with near-daily internal transfer noise on most
  // strategies, so XIRR must source flows from this tag, not `tag`.
  exposure_tag: string;
  equity_pct: number | null;
  debt_pct: number | null;
  lc_pct: number | null;
  cash_pct: number | null;
  gold_pct: number | null;
  lowvol_pct: number | null;
  momentum_pct: number | null;
  psar_leverage: number | null;
  psar_multiplier: number | null;
  long_opt_pct: number | null;
  gold_model_pct: number | null;
  momentum_model_pct: number | null;
  lowvol_model_pct: number | null;
  cash_pct_healthy: number | null;
  liquidcase_pct_gate: number | null;
  effective_to: string | null;
}

export function toNum(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

export async function fetchStrategyPairs(
  suffixField: "exposure_tag_suffix" | "profit_tag_suffix",
): Promise<StrategyPair[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    orderBy: [{ qcode: "asc" }, { strategy: "asc" }, { effective_from: "asc" }],
  });
  const map = new Map<string, StrategyPair>();
  for (const c of configs) {
    map.set(`${c.qcode}|${c.strategy}`, {
      qcode: c.qcode,
      account_name: c.account_name,
      strategy: c.strategy,
      tag: `${c.strategy} ${c[suffixField]}`,
      exposure_tag: `${c.strategy} ${c.exposure_tag_suffix}`,
      equity_pct: toNum(c.equity_pct),
      debt_pct: toNum(c.debt_pct),
      lc_pct: toNum(c.lc_pct),
      cash_pct: toNum(c.cash_pct),
      gold_pct: toNum(c.gold_pct),
      lowvol_pct: toNum(c.lowvol_pct),
      momentum_pct: toNum(c.momentum_pct),
      psar_leverage: toNum(c.psar_leverage),
      psar_multiplier: toNum(c.psar_multiplier),
      long_opt_pct: toNum(c.long_opt_pct),
      gold_model_pct: toNum(c.gold_model_pct),
      momentum_model_pct: toNum(c.momentum_model_pct),
      lowvol_model_pct: toNum(c.lowvol_model_pct),
      cash_pct_healthy: toNum(c.cash_pct_healthy),
      liquidcase_pct_gate: toNum(c.liquidcase_pct_gate),
      effective_to: c.effective_to
        ? c.effective_to.toISOString().split("T")[0]
        : null,
    });
  }
  return [...map.values()];
}

function groupRows(rows: any[]): Record<string, NavPoint[]> {
  const grouped: Record<string, NavPoint[]> = {};
  for (const row of rows) {
    const tag = row.system_tag as string;
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push({
      date: row.date instanceof Date ? row.date : new Date(row.date),
      nav: Number(row.nav) || 0,
      prev_nav: row.prev_nav != null ? Number(row.prev_nav) : null,
      drawdown: Number(row.drawdown) || 0,
      pnl: Number(row.pnl) || 0,
      portfolio_value: Number(row.portfolio_value) || 0,
    });
  }
  return grouped;
}

/**
 * The single latest row strictly before `start`, per matching system_tag —
 * the t-1 reference point the Client Dashboard rebase (rebase.ts) needs to
 * rebase a windowed NAV series back to 100. Mirrors fetchTagData's own
 * qcode/strategy/prefix filtering exactly, just with the date direction
 * flipped (< start, latest first) and DISTINCT ON to cap it at one row per
 * tag. Returns raw rows, same shape as fetchTagData's query — merged into
 * its result by the caller, not grouped here.
 */
async function fetchAnchorRows(
  qcode: string,
  strategy: string,
  allPrefixes: string[],
  start: Date,
  table: "bifurcated_master_sheet_test" | "master_sheet_test",
): Promise<any[]> {
  const startStr = toSqlDate(start);
  if (strategy === "combined") {
    if (allPrefixes.length === 0) {
      return prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT ON (system_tag) system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM ${table}
         WHERE qcode = $1 AND nav IS NOT NULL AND date < $2::date
         ORDER BY system_tag, date DESC`,
        qcode,
        startStr,
      );
    }
    const params: any[] = [qcode, startStr, ...allPrefixes.map((p) => `${p} %`)];
    const excludes = allPrefixes
      .map((_, i) => `system_tag NOT LIKE $${i + 3}`)
      .join(" AND ");
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT ON (system_tag) system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
       FROM ${table}
       WHERE qcode = $1 AND nav IS NOT NULL AND date < $2::date AND ${excludes}
       ORDER BY system_tag, date DESC`,
      ...params,
    );
  }
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT ON (system_tag) system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
     FROM ${table}
     WHERE qcode = $1 AND nav IS NOT NULL AND system_tag LIKE $2 AND date < $3::date
     ORDER BY system_tag, date DESC`,
    qcode,
    `${strategy} %`,
    startStr,
  );
}

export async function fetchTagData(
  qcode: string,
  strategy: string,
  allPrefixes: string[],
  asOf?: Date,
  // See fetchBulkNavSeries's `table` param — same reasoning, Prop-only.
  table: "bifurcated_master_sheet_test" | "master_sheet_test" = "bifurcated_master_sheet_test",
  // Lower bound, inclusive — see fetchBulkNavSeries's identical `start`
  // param. Previously this function had no lower bound at all: the Client
  // Dashboard route accepted a start_date but only ever applied it to
  // fetchBulkXirrInputs, silently leaving the NAV series (and everything
  // buildTagMetrics derives from it — since_inception, drawdowns, monthly/
  // yearly returns) on full history regardless of what was requested. This
  // param closes that gap; each row still carries its own DB-computed
  // prev_nav, so windowing here doesn't corrupt the first included month's
  // return the way naively dropping rows would.
  start?: Date,
): Promise<Record<string, NavPoint[]>> {
  let rows: any[];

  if (strategy === "combined") {
    if (allPrefixes.length === 0) {
      const params: any[] = [qcode];
      let dateClause = "";
      if (start) {
        params.push(toSqlDate(start));
        dateClause += ` AND date >= $${params.length}::date`;
      }
      if (asOf) {
        params.push(toSqlDate(asOf));
        dateClause += ` AND date <= $${params.length}::date`;
      }
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM ${table}
         WHERE qcode = $1 AND nav IS NOT NULL${dateClause}
         ORDER BY system_tag, date ASC`,
        ...params,
      );
    } else {
      const params: any[] = [qcode, ...allPrefixes.map((p) => `${p} %`)];
      const excludes = allPrefixes
        .map((_, i) => `system_tag NOT LIKE $${i + 2}`)
        .join(" AND ");
      let dateClause = "";
      if (start) {
        params.push(toSqlDate(start));
        dateClause += ` AND date >= $${params.length}::date`;
      }
      if (asOf) {
        params.push(toSqlDate(asOf));
        dateClause += ` AND date <= $${params.length}::date`;
      }
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
         FROM ${table}
         WHERE qcode = $1 AND nav IS NOT NULL AND ${excludes}${dateClause}
         ORDER BY system_tag, date ASC`,
        ...params,
      );
    }
  } else {
    const params: any[] = [qcode, `${strategy} %`];
    let dateClause = "";
    if (start) {
      params.push(toSqlDate(start));
      dateClause += ` AND date >= $${params.length}::date`;
    }
    if (asOf) {
      params.push(toSqlDate(asOf));
      dateClause += ` AND date <= $${params.length}::date`;
    }
    rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT system_tag, date, nav, prev_nav, drawdown, pnl, portfolio_value
       FROM ${table}
       WHERE qcode = $1 AND nav IS NOT NULL
         AND system_tag LIKE $2${dateClause}
       ORDER BY system_tag, date ASC`,
      ...params,
    );
  }

  // Prepend each tag's t-1 anchor row (date < start) so callers that rebase
  // the window to 100 (see rebase.ts, used by the Client Dashboard route)
  // have a reference point — without this, a window that doesn't start at
  // the account's true inception has no pre-window value to rebase from.
  // Safe to prepend unconditionally: every anchor row's date is < start,
  // and every main row's date is >= start, so this can't reorder a tag's
  // own series out of ascending-date order.
  if (start) {
    const anchorRows = await fetchAnchorRows(qcode, strategy, allPrefixes, start, table);
    rows = [...anchorRows, ...rows];
  }

  return groupRows(rows);
}

export interface EffectiveToConfig {
  strategy: string;
  effective_to: Date | null;
}

/**
 * The closure date that should cap a tag's NAV series, or null when the
 * tag's strategy is still active (or no matching config was found — this
 * never trims a tag it can't positively identify as closed).
 *
 * Needed because a closed strategy's mastersheet pipeline can keep writing
 * rows after its real last trading day — NAV frozen at the last value,
 * portfolio_value at 0 — once another strategy becomes the account's active
 * one. Those rows have a non-null `nav`, so fetchTagData's own filtering
 * doesn't drop them; capping by `effective_to` here does, using the same
 * source of truth (`client_strategy_configs`) already used elsewhere to
 * decide whether a strategy is active (e.g. portfolio-summary.ts).
 *
 * A bare/unprefixed combined tag (e.g. "Qode Total Portfolio") matches no
 * single strategy and is deliberately left uncapped — it already spans the
 * account's full history across every strategy it has ever run.
 *
 * When more than one config row shares the same strategy name (reconfigured
 * over time), the tag is only capped once EVERY matching row is closed, at
 * the latest of their effective_to dates — same "hasActive" convention used
 * in portfolio-summary.ts.
 */
export function effectiveToForTag(
  tag: string,
  configs: EffectiveToConfig[],
  isSoloProp: boolean,
): Date | null {
  const matches = isSoloProp
    ? configs
    : configs.filter(
        (c) => tag === c.strategy || tag.startsWith(`${c.strategy} `),
      );
  if (matches.length === 0) return null;
  if (matches.some((c) => c.effective_to === null)) return null;
  return matches.reduce<Date | null>(
    (max, c) => (!max || (c.effective_to as Date) > max ? c.effective_to : max),
    null,
  );
}

/** Drops NAV rows dated after `effectiveTo` (inclusive bound) — see
 * effectiveToForTag above for why this is needed. Accepts `undefined` so a
 * raw `Map.get(...)` result can be passed straight through. */
export function trimToEffectiveTo(
  nav: NavPoint[] | undefined,
  effectiveTo: Date | null,
): NavPoint[] | undefined {
  if (!nav || !effectiveTo) return nav;
  const cutoff = toSqlDate(effectiveTo);
  return nav.filter((p) => toSqlDate(p.date) <= cutoff);
}

export interface PnlSnapshotEntry {
  pnl_inr: number;
  pnl_pct: number;
}

// single-day PnL (₹ and %) for one tag — null when that tag has no row on this date
export async function fetchPnlSnapshot(
  qcode: string,
  tag: string,
  dateStr: string, // "YYYY-MM-DD" — plain string, not Date, avoids driver timezone rounding on the exact match
  table: "bifurcated_master_sheet_test" | "master_sheet_test" = "bifurcated_master_sheet_test",
): Promise<PnlSnapshotEntry | null> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pnl, daily_p_l FROM ${table}
     WHERE qcode = $1 AND date = $2::date AND system_tag = $3
     LIMIT 1`,
    qcode,
    dateStr,
    tag,
  );
  if (rows.length === 0) return null;
  return {
    pnl_inr: Number(rows[0].pnl) || 0,
    pnl_pct: (Number(rows[0].daily_p_l) || 0) / 100, // stored as %, response uses fraction like everything else
  };
}

async function fetchClientStrategies(qcode: string): Promise<string[]> {
  const configs = await prisma.client_strategy_configs.findMany({
    where: { qcode },
    select: { strategy: true },
  });
  return [...new Set(configs.map((c) => c.strategy))];
}

export async function fetchSystemTags(
  qcode: string,
  strategy: string,
  table: "bifurcated_master_sheet_test" | "master_sheet_test" = "bifurcated_master_sheet_test",
): Promise<string[]> {
  let rows: { system_tag: string }[];

  // Prop tags are always bare, never strategy-prefixed (see
  // sub-strategy-performance-prop.ts) — the "{strategy} %" LIKE filter below
  // would match nothing for them, so list every tag for the qcode instead.
  if (table === "master_sheet_test") {
    rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
      `SELECT DISTINCT system_tag
       FROM ${table}
       WHERE qcode = $1
       ORDER BY system_tag`,
      qcode,
    );
  } else if (strategy === "combined") {
    const allPrefixes = await fetchClientStrategies(qcode);
    if (allPrefixes.length === 0) {
      rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
        `SELECT DISTINCT system_tag
         FROM ${table}
         WHERE qcode = $1
         ORDER BY system_tag`,
        qcode,
      );
    } else {
      const excludes = allPrefixes
        .map((_, i) => `system_tag NOT LIKE $${i + 2}`)
        .join(" AND ");
      rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
        `SELECT DISTINCT system_tag
         FROM ${table}
         WHERE qcode = $1 AND ${excludes}
         ORDER BY system_tag`,
        qcode,
        ...allPrefixes.map((p) => `${p} %`),
      );
    }
  } else {
    rows = await prisma.$queryRawUnsafe<{ system_tag: string }[]>(
      `SELECT DISTINCT system_tag
       FROM ${table}
       WHERE qcode = $1 AND system_tag LIKE $2
       ORDER BY system_tag`,
      qcode,
      `${strategy} %`,
    );
  }

  return rows.map((r) => r.system_tag);
}
