/**
 * lib/cash-margin/ratio-resolver.ts
 * Resolves config values out of strategy_config_defaults / client_config_values
 * and walks the config_catalog tree.
 *
 * Replaces the fixed *_pct columns on client_strategy_configs /
 * strategy_defaults (see lib/cash-margin/config.ts's resolveRatioConfig) with
 * a key-driven lookup, so splitting a ratio needs only new rows.
 *
 * Resolution rules, applied once here so no caller re-implements them:
 *   - as_of_date <= referenceDate, then the LATEST such row per
 *     (config_key, ratio_type). Never a global MAX -- a ratio change staged
 *     with a future as_of_date must not apply early.
 *   - "value" and "ideal": client_config_values wins, else
 *     strategy_config_defaults.
 *   - "model": strategy level ONLY. There is no client override for model
 *     ratios; client rows of this type are ignored by design.
 *
 * Nothing here returns 0 for "missing". Absent config resolves to null and a
 * diagnostic, so an unconfigured key can never be mistaken for a genuine
 * zero downstream.
 */
import { prisma } from "@/lib/prisma";
import type { Catalog, CatalogNode } from "./catalog";
import type { HoldingsSnapshot } from "./holdings";
import { normalizeSymbol } from "./holdings";
import type { MastersheetSnapshot } from "./mastersheet";

export type RatioType = "value" | "ideal" | "model";

/** Ratio types that accept a per-client override. "model" is strategy-only. */
const CLIENT_OVERRIDABLE: ReadonlySet<RatioType> = new Set<RatioType>(["value", "ideal"]);

export type DiagnosticCode =
  | "MISSING_VALUE"
  | "PARTIAL_CHILDREN"
  | "SIBLING_SUM_MISMATCH"
  | "UNMATCHED_SYMBOL"
  | "NO_HOLDINGS_DATA"
  | "NO_VALUE_SOURCE"
  | "UNKNOWN_KEY";

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  configKey?: string;
  strategy?: string;
}

/** Collects problems encountered while resolving, for the response's
 *  `diagnostics` block. Callers surface these instead of leaving the reader
 *  to infer a problem from a suspicious number. */
export class Diagnostics {
  readonly items: Diagnostic[] = [];
  private readonly seen = new Set<string>();

  /** De-duplicated: resolving overlapping subtrees (momentum, then
   *  equity_book which contains it) would otherwise report the same problem
   *  once per walk. */
  add(d: Diagnostic): void {
    const key = `${d.code}|${d.configKey ?? ""}|${d.strategy ?? ""}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.items.push(d);
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }
}

export interface ResolvedRatios {
  strategy: string;
  qcode: string;
  referenceDate: Date;
  /** Resolved value for a key, or null when nothing is configured. */
  get(configKey: string, ratioType: RatioType): number | null;
  /** Keys with a resolved value of this ratio type -- the basis for
   *  per-strategy pruning (a strategy with no sleeve keys must not render
   *  sleeve rows). */
  configuredKeys(ratioType: RatioType): Set<string>;
}

interface DatedValue {
  value: number | null;
  asOfDate: Date;
}

/** Keep the row with the latest as_of_date for each key. */
function keepLatest(map: Map<string, DatedValue>, key: string, next: DatedValue): void {
  const prev = map.get(key);
  if (!prev || next.asOfDate > prev.asOfDate) map.set(key, next);
}

/**
 * Batch-load every config row this request could need -- one query per table,
 * never one per key. Resolution then happens in memory.
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
    // "model" has no client-level override; ignore such rows rather than
    // letting them shadow the strategy value.
    if (!CLIENT_OVERRIDABLE.has(r.ratio_type as RatioType)) continue;
    keepLatest(overrides, cacheKey(r.config_key, r.ratio_type), {
      value: r.value === null ? null : Number(r.value),
      asOfDate: r.as_of_date,
    });
  }

  const get = (configKey: string, ratioType: RatioType): number | null => {
    const k = cacheKey(configKey, ratioType);
    // A row that exists with a NULL value means "explicitly unset", which is
    // still an answer -- it must not fall through to the strategy default.
    const hit = overrides.has(k) ? overrides.get(k) : defaults.get(k);
    return hit ? hit.value : null;
  };

  const configuredKeys = (ratioType: RatioType): Set<string> => {
    const out = new Set<string>();
    const suffix = `|${ratioType}`;
    for (const source of [defaults, overrides]) {
      for (const [k, v] of source) {
        if (k.endsWith(suffix) && v.value !== null) out.add(k.slice(0, -suffix.length));
      }
    }
    return out;
  };

  return { strategy, qcode, referenceDate, get, configuredKeys };
}

/**
 * `overrides[strategy]?.field` -> [config_key, ratio_type] for the flat
 * fields the request-scoped POST-body `overrides` feature covers
 * (lib/cash-margin/config.ts's StrategyOverride). Deliberately the same
 * fields that feature always supported -- deeper legs added since
 * (momentum50/momidmtm, liquidadd/liquidcase) are not overridable this way,
 * matching the old flat-column feature's own reach, which never went past
 * one level either.
 */
const OVERRIDE_KEYS: ReadonlyArray<[keyof import("./config").StrategyOverride, string, RatioType]> = [
  ["equityPct", "equity_pct", "value"],
  ["cashPct", "cash_pct", "value"],
  ["lcPct", "lc_pct", "value"],
  ["debtPct", "debt_pct", "value"],
  ["goldPct", "gold", "ideal"],
  ["momentumPct", "momentum", "ideal"],
  ["lowvolPct", "lowvol", "ideal"],
];

/**
 * Wraps `ratios` so `overrides[ratios.strategy]`'s flat fields win over
 * whatever the DB resolved, without touching the DB or `ratios` itself --
 * same request-scoped-only contract as every other override in this
 * codebase (see config.ts's file header). Pass `undefined` for a no-op
 * (returns `ratios` itself, not a wrapper).
 */
export function withOverrides(
  ratios: ResolvedRatios,
  overrides: import("./config").StrategyOverrides | undefined,
): ResolvedRatios {
  const ov = overrides?.[ratios.strategy];
  if (!ov) return ratios;

  const overridden = new Map<string, number>();
  for (const [field, configKey, ratioType] of OVERRIDE_KEYS) {
    const v = ov[field];
    if (v !== undefined) overridden.set(`${configKey}|${ratioType}`, v);
  }
  if (overridden.size === 0) return ratios;

  return {
    ...ratios,
    get(configKey, ratioType) {
      const hit = overridden.get(`${configKey}|${ratioType}`);
      return hit !== undefined ? hit : ratios.get(configKey, ratioType);
    },
  };
}

/**
 * Target fraction for a key, expressed at the scale of its own parent.
 *
 * Every stored value is a fraction OF ITS PARENT, and every sibling group
 * sums to 1.0 -- see docs/cash-margin-architecture.md §3 for the convention
 * and §7.1 for why re-deriving a valued node from its children is wrong.
 * Under it:
 *
 *   - A leaf reads its own row.
 *   - A non-leaf WITH its own row returns that row. Its children are
 *     fractions of it and must sum to 1.0, so re-deriving the parent by
 *     summing them would just return 1.0 and discard the real value.
 *   - A non-leaf WITHOUT its own row is a pure grouping node (`equity_book`,
 *     `liquid_component`) and resolves to the sum of its children, which the
 *     sum-to-1.0 invariant makes 1.0 -- i.e. "all of whatever scale I sit
 *     at", which is exactly right for a node that only groups.
 *
 * Returns null when nothing under the key is configured. Two things are
 * reported rather than absorbed: SOME children resolving while others do not
 * (PARTIAL_CHILDREN -- the sum silently understates), and a valued non-leaf
 * whose children do not sum to 1.0 (SIBLING_SUM_MISMATCH -- the invariant is
 * broken, so some descendant's absolute value is wrong by that ratio).
 */
/**
 * True when ANY leaf under `bookRootKey` has a resolved value of `ratioType`
 * for this strategy -- the "gate on resolved values, not catalog shape"
 * check used by system-breakup.ts's hasEquitySplit and, for the identical
 * reason, consolidated.ts's Account Summary sleeve rows. config_catalog is
 * global (every strategy's equity_book has the same 4 leaves), but sleeve
 * config is per-strategy (QYE has none) -- this is what actually
 * distinguishes them, not the tree shape, which never changes.
 *
 * Exported here (rather than left inline in system-breakup.ts) because
 * consolidated.ts needs the SAME answer before it has built anything to
 * derive it from -- unlike System Breakup, which can infer it post-hoc from
 * whether buildBook() produced more than the fallback row.
 */
export function hasConfiguredLeaves(
  catalog: Catalog,
  bookRootKey: string,
  ratioType: RatioType,
  ratios: ResolvedRatios,
): boolean {
  const configured = ratios.configuredKeys(ratioType);
  return catalog.leavesUnder(bookRootKey).some((leaf) => configured.has(leaf.configKey));
}

/**
 * Wraps `ratios` so a "model" read falls back to "ideal" when a key has no
 * model row -- lets System Breakup's Equity Book compare actuals against
 * the live daily model weight where it exists, without collapsing a
 * strategy whose ideal split IS configured but whose model sync hasn't
 * landed yet (e.g. QTF+/QTF++ today: ideal rows exist, model rows don't).
 * Every other ratioType passes through unchanged. See
 * docs/cash-margin-architecture.md §7.8.
 */
export function withModelFallback(ratios: ResolvedRatios): ResolvedRatios {
  return {
    ...ratios,
    get(configKey, ratioType) {
      if (ratioType !== "model") return ratios.get(configKey, ratioType);
      return ratios.get(configKey, "model") ?? ratios.get(configKey, "ideal");
    },
    configuredKeys(ratioType) {
      if (ratioType !== "model") return ratios.configuredKeys(ratioType);
      return new Set([...ratios.configuredKeys("model"), ...ratios.configuredKeys("ideal")]);
    },
  };
}

export function resolveTarget(
  catalog: Catalog,
  configKey: string,
  ratioType: RatioType,
  ratios: ResolvedRatios,
  diagnostics: Diagnostics,
): number | null {
  const node = catalog.byKey.get(configKey);
  if (!node) {
    diagnostics.add({
      code: "UNKNOWN_KEY",
      configKey,
      strategy: ratios.strategy,
      message: `'${configKey}' is not in config_catalog`,
    });
    return null;
  }

  const own = ratios.get(configKey, ratioType);

  if (node.children.length === 0) return own;

  // Valued non-leaf: own row wins. Children only get checked, never summed
  // into the answer.
  if (own !== null) {
    let childSum = 0;
    let childrenResolved = 0;
    for (const child of node.children) {
      const v = resolveTarget(catalog, child.configKey, ratioType, ratios, diagnostics);
      if (v === null) continue;
      childSum += v;
      childrenResolved++;
    }
    if (childrenResolved > 0 && Math.abs(childSum - 1) > 1e-4) {
      diagnostics.add({
        code: "SIBLING_SUM_MISMATCH",
        configKey,
        strategy: ratios.strategy,
        message:
          `'${configKey}' (${ratioType}) has its own value ${own}, but its ${childrenResolved} ` +
          `resolved children sum to ${childSum.toFixed(6)}, not 1.0. Children are stored as ` +
          `fractions of their parent, so every absolute value under '${configKey}' is off by ` +
          `this factor.`,
      });
    }
    return own;
  }

  let sum = 0;
  let resolved = 0;
  const missing: string[] = [];
  for (const child of node.children) {
    const v = resolveTarget(catalog, child.configKey, ratioType, ratios, diagnostics);
    if (v === null) {
      missing.push(child.configKey);
      continue;
    }
    sum += v;
    resolved++;
  }

  if (resolved === 0) return null;
  if (missing.length > 0) {
    diagnostics.add({
      code: "PARTIAL_CHILDREN",
      configKey,
      strategy: ratios.strategy,
      message:
        `'${configKey}' (${ratioType}) summed ${resolved} of ${node.children.length} children; ` +
        `no value for: ${missing.join(", ")}. Parent total is understated.`,
    });
  }
  return sum;
}

/**
 * Absolute Rupee target for a key, at any depth.
 *
 * Walks configKey's OWN fraction, then every ancestor's fraction-of-ITS-
 * parent, multiplying them together up to a root -- e.g. liquidadd(0.5) x
 * liquid_component(1.0, grouping) x lc_pct(0.6667) x debt_pct(0.3) = 0.1 of
 * Account Value; gold(0.4) x equity_book(1.0, grouping) x equity_pct(0.7) =
 * 0.28. Handles the whole catalog with no per-node code, per-split code, or
 * manual scale-bridge table -- every allocation node from a sleeve leaf up
 * to equity_pct/debt_pct is a real parent_key ancestor, so the walk finds
 * every link unaided.
 *
 * Each ancestor's contribution is its OWN row ONLY -- ratios.get(parent,
 * ratioType), falling back to ratios.get(parent, "value"), falling back to
 * an explicit identity 1.0 ONLY if the node has children and no row in
 * EITHER (a pure grouping node, e.g. equity_book, liquid_component).
 * Deliberately NEVER resolveTarget's sum-of-children path for an ancestor's
 * contribution: if an ancestor's own row were skipped in favor of summing
 * its children, an ancestor that also happens to have children under a
 * *different* ratioType (e.g. equity_pct's child equity_book carries its
 * own "ideal" sleeve values) would silently substitute that unrelated sum
 * for the ancestor's real value -- a plausible-looking, category-mismatched
 * number with zero diagnostic. Own-row-only can't make that mistake: a
 * macro node's own "value" row wins the instant it's checked, never
 * re-derived through unrelated descendants. See
 * docs/cash-margin-architecture.md §7.2 for the incident this rule exists
 * to prevent.
 *
 * Deliberately a straight multiply chain -- NOT divided by any node's own
 * children-sum. A subtree's children sum to 1.0 for "ideal" targets, but
 * NOT for "model" (a daily-computed actual weight, which can legitimately
 * sum to something other than 1.0 when a leg is running below or above its
 * ideal weight). Dividing by the children-sum would silently rescale every
 * leg to fill 100% of its parent regardless of ratioType -- multiplying
 * straight through preserves whatever each stored fraction actually is,
 * whatever it sums to. See resolveTarget's SIBLING_SUM_MISMATCH, which
 * separately flags a valued parent whose children don't sum to 1.0, apart
 * from this function's job of turning fractions into rupees.
 */
export function resolveAbsoluteTarget(
  catalog: Catalog,
  configKey: string,
  ratioType: RatioType,
  ratios: ResolvedRatios,
  accountValue: number,
  diagnostics: Diagnostics,
): number | null {
  const localFraction = resolveTarget(catalog, configKey, ratioType, ratios, diagnostics);
  if (localFraction === null) return null;

  let chain = localFraction;
  let node: CatalogNode | undefined = catalog.byKey.get(configKey);

  while (node?.parentKey) {
    const parent = catalog.byKey.get(node.parentKey)!;
    // Deliberately the ancestor's OWN row only -- never resolveTarget's
    // sum-of-children path. Once equity_book was reparented under
    // equity_pct, equity_pct gained its first child, so
    // resolveTarget(equity_pct, "ideal") stopped returning null (its
    // pre-reparent signal to fall back to "value") and instead SUMMED
    // equity_book's unrelated "ideal" sleeves back up to 1.0 -- a
    // plausible-looking but category-mismatched number that silently
    // dropped equity_pct's real 0.7. own-row-only can't make that mistake:
    // a macro node's own "value" row wins the moment it's checked, and a
    // pure grouping node (no row in EITHER ratioType, e.g. equity_book
    // itself, liquid_component) contributes an explicit identity 1.0
    // instead of being asked to "sum" anything.
    const ownRatioType = ratios.get(parent.configKey, ratioType);
    const ownValueType = ratioType !== "value" ? ratios.get(parent.configKey, "value") : null;
    const parentFraction =
      ownRatioType ?? ownValueType ?? (parent.children.length > 0 ? 1 : null);

    if (parentFraction === null) {
      diagnostics.add({
        code: "MISSING_VALUE",
        configKey,
        strategy: ratios.strategy,
        message:
          `'${configKey}' needs '${parent.configKey}' resolved (ratio_type '${ratioType}' or ` +
          `'value') to compute an absolute target, but it has no value in either`,
      });
      return null;
    }

    chain *= parentFraction;
    node = parent;
  }

  // node is now a root (no parent_key) -- config_catalog connects every
  // allocation key to one, so the chain is already Account-Value scale.
  return chain * accountValue;
}

/**
 * Current actual value for a key, in rupees.
 *
 * Non-leaf -> sum of children. Leaf with a `symbol` -> console_equity_holdings.
 * Leaf with only a `tagSuffix` -> the mastersheet tag `${strategy} ${suffix}`.
 * A leaf with neither is not backed by holdings at all (thresholds, scalars
 * like psar_leverage) and resolves to null.
 *
 * A symbol present in the catalog but absent from the client's holdings
 * resolves to 0 -- the client genuinely holds none of it -- but is reported,
 * since a catalog/broker symbol mismatch looks identical to a zero position.
 *
 * A client with NO console_equity_holdings rows at all is a different case and
 * resolves to null, not 0: console_equity_holdings is Zerodha-sourced, so a
 * non-Zerodha client can hold real sleeve positions (visible in the mastersheet)
 * while having zero rows here. QAC00123 is exactly that today. There is
 * deliberately NO mastersheet fallback -- the gap is a data-sync issue to fix at
 * source, and a fallback would hide the next occurrence.
 *
 * `cash_pct` is DELIBERATELY UNRESOLVABLE by this function, permanently, and
 * that's correct, not a gap to close. It's a leaf with neither `symbol` nor
 * `tagSuffix` (verified live), so it falls through to the NO_VALUE_SOURCE
 * branch below and resolves null -- but not because its data source is
 * missing. It has no data source AT ALL, by nature: there is no "Cash" tag
 * or symbol anywhere upstream. Cash's actual value has only ever been a plug
 * figure -- `accountValue - mutualFunds - equityStock - bondStock -
 * liquidcase` (see mastersheet.ts's computeAccountSummary / consolidated.ts's
 * computeConsolidated) -- "whatever the account isn't otherwise accounted
 * for." That formula has no place in this leaf/symbol/tag model, and can't
 * be made to fit it: it needs the *sibling* totals, not just this node's own
 * subtree. Any caller building Cash's actual side must compute it by hand
 * with that formula, exactly like today's code does -- never by adding a
 * tag/symbol to `cash_pct`'s catalog row and expecting this function to
 * pick it up.
 */
export function resolveActual(
  catalog: Catalog,
  configKey: string,
  holdings: HoldingsSnapshot,
  ms: MastersheetSnapshot,
  strategy: string,
  diagnostics: Diagnostics,
): number | null {
  const node = catalog.byKey.get(configKey);
  if (!node) {
    diagnostics.add({
      code: "UNKNOWN_KEY",
      configKey,
      strategy,
      message: `'${configKey}' is not in config_catalog`,
    });
    return null;
  }

  if (node.children.length > 0) {
    let sum = 0;
    let resolved = 0;
    for (const child of node.children) {
      const v = resolveActual(catalog, child.configKey, holdings, ms, strategy, diagnostics);
      if (v === null) continue;
      sum += v;
      resolved++;
    }
    return resolved === 0 ? null : sum;
  }

  if (node.consoleSymbol) {
    // No console_equity_holdings rows AT ALL for this client -- distinct from
    // "holds none of this symbol". Returning 0 here would render every sleeve
    // at zero for a client with real holdings, so resolve null and say why.
    if (holdings.date === null) {
      diagnostics.add({
        code: "NO_HOLDINGS_DATA",
        configKey,
        strategy,
        message:
          `${holdings.qcode} has no console_equity_holdings rows; sleeve actuals ` +
          `backed by symbols cannot be valued. Not treated as 0.`,
      });
      return null;
    }

    const key = normalizeSymbol(node.consoleSymbol);
    const held = holdings.bySymbol.get(key);
    if (held === undefined) {
      diagnostics.add({
        code: "UNMATCHED_SYMBOL",
        configKey,
        strategy,
        message:
          `'${configKey}' symbol '${node.consoleSymbol}' (normalised '${key}') has no row in ` +
          `console_equity_holdings for ${holdings.qcode}; treated as 0`,
      });
      return 0;
    }
    return held;
  }

  if (node.tagSuffix) return ms.values.get(`${strategy} ${node.tagSuffix}`) ?? null;

  diagnostics.add({
    code: "NO_VALUE_SOURCE",
    configKey,
    strategy,
    message: `'${configKey}' is a leaf with neither symbol nor tag_suffix -- no actual value source`,
  });
  return null;
}

/**
 * Symbols the client holds that no catalog leaf claims.
 *
 * By decision these are excluded from sleeve calculations, but they are real
 * positions (e.g. GOLDIAM, LOWVOL1, LIQUIDBEES, MOM50 -- genuinely different
 * securities, not aliases of the catalog's symbols), so they are reported
 * rather than dropped without trace.
 */
export function unclassifiedHoldings(
  catalog: Catalog,
  holdings: HoldingsSnapshot,
): { symbol: string; value: number }[] {
  const claimed = new Set<string>();
  for (const node of catalog.byKey.values()) {
    if (node.consoleSymbol) claimed.add(normalizeSymbol(node.consoleSymbol));
  }
  const out: { symbol: string; value: number }[] = [];
  for (const [symbol, value] of holdings.bySymbol) {
    if (!claimed.has(symbol)) out.push({ symbol, value });
  }
  return out;
}
