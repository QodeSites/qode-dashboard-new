/**
 * app/lib/portfolio-review/ratio-resolver.ts
 * Resolves split-ratio targets (equity_pct, cash_pct, gold, ...) out of
 * strategy_config_defaults / client_config_values, replacing the old flat
 * *_pct columns on client_strategy_configs / strategy_defaults that
 * mandate-snapshot.ts's resolveSplitConfigs() used to read directly.
 *
 * Portfolio-Review-owned copy of the same idea as lib/cash-margin's
 * ratio-resolver.ts + internal-utils.ts's resolveStrategyConfig() — not a
 * shared import (see ratio-catalog.ts's header for why). Deliberately
 * smaller than Cash-Margin's version: Portfolio Review only ever reads a
 * key's OWN row (never sums children), and has no "model" ratio_type or
 * holdings-actual side.
 *
 * Resolution rule, applied once here so no caller re-implements it:
 *   - as_of_date <= referenceDate, then the LATEST such row per
 *     (config_key, ratio_type). A ratio change staged with a future
 *     as_of_date must not apply early.
 *   - client_config_values wins over strategy_config_defaults.
 *   - Nothing here returns 0 for "missing" — absent config resolves to
 *     null (+ a diagnostic naming the key/strategy), never a silent zero.
 */
import { prisma } from "@/lib/prisma";
import type { RatioCatalog } from "@/app/lib/portfolio-review/ratio-catalog";

export type RatioType = "value" | "ideal";

export type DiagnosticCode = "MISSING_VALUE" | "UNKNOWN_KEY";

export interface Diagnostic {
  code: DiagnosticCode;
  configKey: string;
  strategy: string;
  qcode: string;
  message: string;
}

/** Collects problems encountered while resolving, for the caller to log —
 *  not (yet) surfaced in any API response. */
export class Diagnostics {
  readonly items: Diagnostic[] = [];

  add(d: Diagnostic): void {
    this.items.push(d);
  }
}

export interface ResolvedRatios {
  strategy: string;
  qcode: string;
  /** Resolved OWN row for a key (before any parent-chain multiply), or null
   *  when nothing is configured. */
  get(configKey: string, ratioType: RatioType): number | null;
}

interface DatedValue {
  value: number | null;
  asOfDate: Date;
}

function keepLatest(map: Map<string, DatedValue>, key: string, next: DatedValue): void {
  const prev = map.get(key);
  if (!prev || next.asOfDate > prev.asOfDate) map.set(key, next);
}

/**
 * Batch-load every config row this (qcode, strategy) could need — one query
 * per table, resolution then happens in memory.
 */
export async function loadResolvedRatios(
  strategy: string,
  qcode: string,
  referenceDate: Date,
): Promise<ResolvedRatios> {
  const [defaultRows, clientRows] = await Promise.all([
    prisma.strategy_config_defaults.findMany({
      where: { strategy_name: strategy, as_of_date: { lte: referenceDate } },
      select: { config_key: true, ratio_type: true, value: true, as_of_date: true },
    }),
    prisma.client_config_values.findMany({
      where: { qcode, strategy, as_of_date: { lte: referenceDate } },
      select: { config_key: true, ratio_type: true, value: true, as_of_date: true },
    }),
  ]);

  const cacheKey = (configKey: string, ratioType: string) => `${configKey}|${ratioType}`;

  const defaults = new Map<string, DatedValue>();
  for (const r of defaultRows) {
    keepLatest(defaults, cacheKey(r.config_key, r.ratio_type), {
      value: r.value === null ? null : Number(r.value),
      asOfDate: r.as_of_date,
    });
  }

  const overrides = new Map<string, DatedValue>();
  for (const r of clientRows) {
    keepLatest(overrides, cacheKey(r.config_key, r.ratio_type), {
      value: r.value === null ? null : Number(r.value),
      asOfDate: r.as_of_date,
    });
  }

  const get = (configKey: string, ratioType: RatioType): number | null => {
    const k = cacheKey(configKey, ratioType);
    const hit = overrides.has(k) ? overrides.get(k) : defaults.get(k);
    return hit ? hit.value : null;
  };

  return { strategy, qcode, get };
}

/**
 * Absolute-within-Account-Value fraction for a key (or, with `stopAtKey`,
 * absolute-within-that-ancestor).
 *
 * Every stored value is a fraction OF ITS PARENT (see
 * docs/cash-margin-architecture.md §3 for the convention this table shares
 * with Cash-Margin) — a root key (equity_pct, debt_pct) is already at
 * Account-Value scale, but a child like cash_pct is a fraction of debt_pct,
 * not of the whole account. This walks configKey's own row, then multiplies
 * by each ancestor's own "value" row up to a root, skipping any ancestor
 * with no row of its own (a pure grouping node, e.g. equity_book).
 *
 * `stopAtKey`, when given, ends the walk as soon as the parent chain reaches
 * that key — the ancestor named by `stopAtKey` is NOT multiplied in. This
 * matters for gold/lowvol/momentum: their "ideal" value is a fraction of
 * `equity_book` only (matching the old flat gold_pct/lowvol_pct/momentum_pct
 * columns, which summed to 1.0 of the equity book, not of the account) —
 * without stopping at equity_book, the walk would continue up to
 * equity_book's OWN parent, equity_pct, which DOES have a real "value" row
 * (e.g. 0.7), silently rescaling every sleeve target down to
 * fraction-of-Account-Value and breaking account-value-breakup.ts's
 * gold/lowvol/momentum vs. equity-book-relative-actual comparison.
 *
 * Mirrors internal-utils.ts's resolveChainValue() (Deploy/Withdrawal's
 * proven answer to the exact same problem, `stopAtKey` included) rather than
 * Cash-Margin's fuller resolveTarget()/resolveAbsoluteTarget(), which also
 * handle summing children and currency conversion — neither applies here:
 * Portfolio Review never re-derives a key from its children, and stays at
 * fraction scale.
 */
export function resolveChainValue(
  catalog: RatioCatalog,
  configKey: string,
  ratioType: RatioType,
  ratios: ResolvedRatios,
  diagnostics: Diagnostics,
  stopAtKey: string | null = null,
): number | null {
  const node = catalog.byKey.get(configKey);
  if (!node) {
    diagnostics.add({
      code: "UNKNOWN_KEY",
      configKey,
      strategy: ratios.strategy,
      qcode: ratios.qcode,
      message: `'${configKey}' is not in config_catalog`,
    });
    return null;
  }

  const own = ratios.get(configKey, ratioType);
  if (own === null) {
    diagnostics.add({
      code: "MISSING_VALUE",
      configKey,
      strategy: ratios.strategy,
      qcode: ratios.qcode,
      message: `No '${ratioType}' value for '${configKey}' (strategy ${ratios.strategy}, qcode ${ratios.qcode})`,
    });
    return null;
  }

  let weight = own;
  let current = node.parentKey;
  while (current && current !== stopAtKey) {
    const parentValue = ratios.get(current, "value");
    if (parentValue !== null) weight *= parentValue;
    current = catalog.byKey.get(current)?.parentKey ?? null;
  }
  return weight;
}
