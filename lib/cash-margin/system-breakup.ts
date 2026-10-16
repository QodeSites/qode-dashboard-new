/**
 * lib/cash-margin/system-breakup.ts
 * System Breakup Scheme (Absolute) — §2d.
 *
 * Two sub-tables per scope (Combined + per-strategy): Equity Book (under
 * equity_pct) and Derivative Book (under debt_pct). Each book's rows come
 * from walking config_catalog's live tree under that macro key -- NOT a
 * hardcoded 3-row (Gold/Momentum/Low Vol) or 2-row (Cash/Liquid Case) shape.
 * A split added to the catalog (e.g. momentum -> momentum50/momidmtm,
 * lc_pct -> liquid_component -> liquidadd/liquidcase) appears here with no
 * code change -- see ratio-resolver.ts's resolveTarget/resolveAbsoluteTarget/
 * resolveActual, which this file is a thin caller of.
 *
 * Ported from managed_accounts_analysis/reports/qaw_report.py
 * (compute_qaw_equity_book, EQUITY_BOOK_PCT, QAW_SUBS) and
 * common_report_utils.py (compute_excess_cash, DEFAULT_IDEAL_CASH_PCT), then
 * generalized off the fixed *_pct columns onto config_catalog. See
 * docs/cash-margin-architecture.md (design/history) and
 * docs/cash-margin-api-contract.md (the SystemBreakupRow response shape).
 */
import type { MastersheetSnapshot } from "./mastersheet";
import { computeAccountSummary } from "./mastersheet";
import type { Tier } from "./tags";
import type { Catalog, CatalogNode } from "./catalog";
import type { HoldingsSnapshot } from "./holdings";
import {
  type ResolvedRatios,
  type RatioType,
  resolveTarget,
  resolveAbsoluteTarget,
  resolveActual,
  hasConfiguredLeaves,
  withModelFallback,
  Diagnostics,
} from "./ratio-resolver";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SystemBreakupRow {
  /** Stable catalog id -- use this for logic/keys, never `label` (display
   *  text, may be re-worded). See docs/cash-margin-api-contract.md. */
  configKey: string;
  label: string;
  /** 0 = direct child of the book's macro key, 1 = nested under that, etc. */
  depth: number;
  /** This row's share of its BOOK (not its immediate parent) -- e.g.
   *  momentum50 = 0.5(of momentum) x 0.4(momentum's own share) = 20% of the
   *  equity book, matching momentum's own displayed 40% at the level above
   *  it. Percent units (0-100). Null on the Combined total row only. */
  subPct: number | null;
  /** Book's share of Account Value -- constant across every row in a book. */
  systemPct: number;
  targetVal: number;
  /** null when the client has no data source at all for this leg (see
   *  NO_HOLDINGS_DATA) -- render as "--", never as Rs 0. A genuine zero
   *  position (catalog symbol with no matching holdings row) is a real 0,
   *  not null -- see UNMATCHED_SYMBOL. */
  currentVal: number | null;
  diffVal: number | null;
  targetPct: number;
  /** % of this book's own actual total (sum of the book's depth-0 rows'
   *  currentVal) -- NOT of Account Value. Matches Python's
   *  write_qaw_equity_pct denominator choice, generalized to any depth: a
   *  nested row (momentum50) is still shown against the WHOLE book's total,
   *  not just its immediate parent's, so every row in a book is comparable
   *  on the same denominator. Null when the book total itself is null. */
  currentPct: number | null;
  diffPct: number | null;
  /** [] for leaves. Recurse -- do not assume a fixed depth. */
  children: SystemBreakupRow[];
}

export interface SystemBreakupBook {
  /** Book's share of Account Value. Percent units (0-100). */
  systemPct: number;
  /** Sum of target values across this book's depth-0 rows. */
  targetTotal: number;
  /** Sum of resolved (non-null) depth-0 rows' currentVal. Never null --
   *  a book with every row unresolved sums to 0, same as "nothing here",
   *  and each unresolved row already carries its own diagnostic. */
  currentTotal: number;
  diffTotal: number;
  rows: SystemBreakupRow[];
}

export interface SystemBreakupScope {
  strategy: string;
  tier: Tier;
  accountValue: number;
  hasEquitySplit: boolean;
  equityBook: SystemBreakupBook;
  derivativeBook: SystemBreakupBook;
}

// ─── Tree walk ─────────────────────────────────────────────────────────────────

/**
 * Cash's actual value has no catalog leaf to read -- it was never a tag or a
 * symbol, only ever a plug figure (Account Value minus every other named
 * bucket). See ratio-resolver.ts's resolveActual doc comment for why this
 * can never be fixed by adding a tag/symbol to cash_pct's catalog row. This
 * is the one hand-computed exception in an otherwise fully catalog-driven
 * walk.
 */
const RESIDUAL_ACTUAL_KEYS: ReadonlySet<string> = new Set(["cash_pct"]);

interface BuiltRow {
  row: SystemBreakupRow;
  /** This row's own resolved fraction of ITS BOOK (not its immediate
   *  parent) -- carried separately from `row` so the caller can compute
   *  targetTotal/currentTotal from depth-0 rows without re-deriving it. */
  depth: number;
}

/**
 * Recursively builds one row (and its children) for `node`, or returns null
 * when this strategy has nothing configured for it -- callers omit an
 * unconfigured node entirely rather than rendering a zeroed-out row (see
 * PARTIAL_CHILDREN in ratio-resolver.ts for the diagnostic that flags the
 * gap this creates in a parent's total).
 */
function buildRow(
  catalog: Catalog,
  node: CatalogNode,
  depth: number,
  ratioType: RatioType,
  ratios: ResolvedRatios,
  holdings: HoldingsSnapshot,
  ms: MastersheetSnapshot,
  strategy: string,
  accountValue: number,
  macroFraction: number,
  residualCash: number,
  diagnostics: Diagnostics,
): SystemBreakupRow | null {
  const ownFraction = resolveTarget(catalog, node.configKey, ratioType, ratios, diagnostics);
  if (ownFraction === null) return null;

  const targetVal = resolveAbsoluteTarget(catalog, node.configKey, ratioType, ratios, accountValue, diagnostics) ?? 0;
  const currentVal = RESIDUAL_ACTUAL_KEYS.has(node.configKey)
    ? residualCash
    : resolveActual(catalog, node.configKey, holdings, ms, strategy, diagnostics);

  // Book-relative share: this node's own Account-Value fraction, divided by
  // the book's macro fraction -- e.g. momentum50's 0.14 of Account Value /
  // equity_pct's 0.7 = 0.2 (20% of the equity book), matching its parent
  // momentum's own displayed 40% one level up. Reuses resolveAbsoluteTarget
  // rather than re-deriving the chain by hand.
  const avFraction = accountValue > 0 ? targetVal / accountValue : 0;
  const bookFraction = macroFraction > 0 ? avFraction / macroFraction : 0;

  const children: SystemBreakupRow[] = [];
  for (const child of node.children) {
    const childRow = buildRow(
      catalog, child, depth + 1, ratioType, ratios, holdings, ms, strategy,
      accountValue, macroFraction, residualCash, diagnostics,
    );
    if (childRow) children.push(childRow);
  }

  return {
    configKey: node.configKey,
    label: node.label,
    depth,
    subPct: bookFraction * 100,
    systemPct: macroFraction * 100,
    targetVal,
    currentVal,
    diffVal: currentVal === null ? null : currentVal - targetVal,
    targetPct: bookFraction * 100,
    currentPct: null, // filled in by fillCurrentPct() once the book's total is known
    diffPct: null,
    children,
  };
}

/** Second pass: currentPct/diffPct need the book's total (sum of depth-0
 *  currentVal), which doesn't exist until every row in the book is built. */
function fillCurrentPct(row: SystemBreakupRow, bookCurrentTotal: number): void {
  row.currentPct = row.currentVal === null || !bookCurrentTotal ? (row.currentVal === null ? null : 0) : (row.currentVal / bookCurrentTotal) * 100;
  row.diffPct = row.currentPct === null ? null : row.currentPct - (row.subPct ?? 0);
  for (const child of row.children) fillCurrentPct(child, bookCurrentTotal);
}

/**
 * Builds one book (Equity or Derivative) by walking `bookRootKey`'s direct
 * children in config_catalog. Falls back to a single collapsed row (using
 * `fallback`) when NOTHING under bookRootKey resolves for this strategy --
 * the same "gate on resolved values, not catalog shape" rule as
 * hasEquitySplit: config_catalog is global (every strategy's equity_book has
 * the same 4 leaves), but sleeve config is per-strategy (QYE has none).
 *
 * `macroKey` and `bookRootKey` are DELIBERATELY separate parameters, not
 * assumed to be the same node. `macroKey` is only ever used to read the
 * book's Account-Value fraction (equity_pct's 0.7, debt_pct's 0.3).
 * `bookRootKey` is whichever node's children should become this book's
 * depth-0 rows -- which is NOT always the same as macroKey. For the
 * Derivative Book they coincide (debt_pct's own children ARE cash_pct/
 * lc_pct -- no intermediate grouping node was inserted there). For the
 * Equity Book they don't: equity_pct's only child is equity_book itself (a
 * grouping node), so its rows must come from equity_book's children
 * (gold/lowvol/momentum), not equity_pct's. Passing the same key for both
 * would render a single "Equity Book" row instead of Gold/Momentum/Low Vol
 * whenever an intermediate grouping node sits between the macro key and its
 * leaves (see docs/cash-margin-architecture.md §7.3). Keeping them separate
 * means neither assumption breaks if a future split adds or removes an
 * intermediate grouping node under either macro key.
 */
function buildBook(
  catalog: Catalog,
  macroKey: string,
  bookRootKey: string,
  ratioType: RatioType,
  ratios: ResolvedRatios,
  holdings: HoldingsSnapshot,
  ms: MastersheetSnapshot,
  strategy: string,
  accountValue: number,
  residualCash: number,
  fallback: { configKey: string; label: string; currentVal: number },
  diagnostics: Diagnostics,
): SystemBreakupBook {
  const macroFraction = ratios.get(macroKey, "value") ?? 0;
  const bookRootNode = catalog.byKey.get(bookRootKey);

  let rows: SystemBreakupRow[] = [];
  if (bookRootNode) {
    for (const child of bookRootNode.children) {
      const r = buildRow(
        catalog, child, 0, ratioType, ratios, holdings, ms, strategy,
        accountValue, macroFraction, residualCash, diagnostics,
      );
      if (r) rows.push(r);
    }
  }

  if (rows.length === 0) {
    const targetVal = macroFraction * accountValue;
    rows = [
      {
        configKey: fallback.configKey,
        label: fallback.label,
        depth: 0,
        subPct: null,
        systemPct: macroFraction * 100,
        targetVal,
        currentVal: fallback.currentVal,
        diffVal: fallback.currentVal - targetVal,
        targetPct: macroFraction * 100,
        currentPct: null,
        diffPct: null,
        children: [],
      },
    ];
  }

  const currentTotal = rows.reduce((s, r) => s + (r.currentVal ?? 0), 0);
  for (const r of rows) fillCurrentPct(r, currentTotal);

  const targetTotal = rows.reduce((s, r) => s + r.targetVal, 0);

  return {
    systemPct: macroFraction * 100,
    targetTotal,
    currentTotal,
    diffTotal: currentTotal - targetTotal,
    rows,
  };
}

// ─── Per-strategy computation ─────────────────────────────────────────────────

/**
 * Build Equity Book + Derivative Book for one active strategy, walking
 * config_catalog under equity_pct and debt_pct.
 *
 * The Equity Book's target/drift is always computed against the live daily
 * "model" weight for gold/lowvol/momentum(50/idmtm) -- not "ideal" -- falling
 * back to "ideal" per leg where a strategy's model sync hasn't populated yet
 * (see withModelFallback). Whether a strategy has the split configured AT
 * ALL (hasEquitySplit) is a separate question, always gated on "ideal" --
 * config existence, not which column the daily model job has reached.
 */
export function computeSystemBreakupForStrategy(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
  tier: Tier,
  catalog: Catalog,
  ratios: ResolvedRatios,
  holdings: HoldingsSnapshot,
  diagnostics: Diagnostics,
): SystemBreakupScope {
  // Only the plain summary is needed here -- mutualFunds/equityStock/
  // bondStock/cash/liquidcase/accountValue -- never consolidated.ts's
  // sleeve-augmented wrapper, which this function's own buildBook() replaces
  // anyway with the catalog-driven walk.
  const raw = computeAccountSummary(ms, strategy, exposureTagSuffix);
  const summary = { ...raw, holdings: raw.mutualFunds + raw.equityStock + raw.bondStock };
  const av = summary.accountValue;

  // Single source of truth for the split gate, shared with
  // consolidated.ts's Account Summary sleeves -- see hasConfiguredLeaves'
  // doc comment. Computed BEFORE buildBook() (which no longer needs to
  // infer it post-hoc from row shape) so both callers agree by construction.
  const hasEquitySplit = hasConfiguredLeaves(catalog, "equity_book", "ideal", ratios);

  const equityBook = buildBook(
    catalog, "equity_pct", "equity_book", "model", withModelFallback(ratios), holdings, ms, strategy, av,
    summary.cash, { configKey: "equity_pct", label: "Holdings", currentVal: summary.holdings },
    diagnostics,
  );

  const derivativeBook = buildBook(
    catalog, "debt_pct", "debt_pct", "value", ratios, holdings, ms, strategy, av,
    summary.cash, { configKey: "debt_pct", label: "Cash + Liquid Case", currentVal: summary.cash + summary.liquidcase },
    diagnostics,
  );

  return {
    strategy,
    tier,
    accountValue: av,
    hasEquitySplit,
    equityBook,
    derivativeBook,
  };
}

// ─── Combined computation ─────────────────────────────────────────────────────

export interface SystemBreakupCombined {
  /** Sum of per-strategy Account Values (NOT the no-prefix rollup tag — see
   *  docs/assumptions-and-changes-from-krish-logic.md §6). */
  accountValue: number;
  equityBook: SystemBreakupBook;
  derivativeBook: SystemBreakupBook;
}

/** Sums matching configKeys across scopes into one row per distinct key --
 *  robust to scopes having different row shapes (e.g. one strategy's equity
 *  book collapsed to "Holdings" while another has the full sleeve split).
 *  Recurses into children the same way. */
function sumRowsByKey(rowSets: SystemBreakupRow[][], combinedAv: number, bookSystemPct: number): SystemBreakupRow[] {
  const byKey = new Map<string, { label: string; depth: number; targetVal: number; currentVal: number | null; subPctSum: number; subPctCount: number; childSets: SystemBreakupRow[][] }>();
  const order: string[] = [];

  for (const rows of rowSets) {
    for (const row of rows) {
      if (!byKey.has(row.configKey)) {
        byKey.set(row.configKey, {
          label: row.label, depth: row.depth, targetVal: 0, currentVal: null,
          subPctSum: 0, subPctCount: 0, childSets: [],
        });
        order.push(row.configKey);
      }
      const agg = byKey.get(row.configKey)!;
      agg.targetVal += row.targetVal;
      if (row.currentVal !== null) agg.currentVal = (agg.currentVal ?? 0) + row.currentVal;
      if (row.subPct !== null) {
        agg.subPctSum += row.subPct;
        agg.subPctCount++;
      }
      if (row.children.length > 0) agg.childSets.push(row.children);
    }
  }

  const rows = order.map((configKey) => {
    const agg = byKey.get(configKey)!;
    const diffVal = agg.currentVal === null ? null : agg.currentVal - agg.targetVal;
    return {
      configKey,
      label: agg.label,
      depth: agg.depth,
      subPct: agg.subPctCount ? agg.subPctSum / agg.subPctCount : null,
      systemPct: bookSystemPct,
      targetVal: agg.targetVal,
      currentVal: agg.currentVal,
      diffVal,
      targetPct: combinedAv ? (agg.targetVal / combinedAv) * 100 : 0,
      currentPct: combinedAv && agg.currentVal !== null ? (agg.currentVal / combinedAv) * 100 : null,
      diffPct: combinedAv && diffVal !== null ? (diffVal / combinedAv) * 100 : null,
      children: agg.childSets.length ? sumRowsByKey(agg.childSets, combinedAv, bookSystemPct) : [],
    };
  });

  return rows;
}

/**
 * "Total / Combined" row — straight sum across all active-strategy scopes.
 * No Python precedent (qaw_report.py has no combined sheet). Row-shape
 * agnostic: sums by configKey, not by position, so it's correct whether
 * every scope shares the same split or not.
 */
export function computeSystemBreakupCombined(scopes: SystemBreakupScope[]): SystemBreakupCombined {
  if (scopes.length === 0) {
    return {
      accountValue: 0,
      equityBook: { systemPct: 0, targetTotal: 0, currentTotal: 0, diffTotal: 0, rows: [] },
      derivativeBook: { systemPct: 0, targetTotal: 0, currentTotal: 0, diffTotal: 0, rows: [] },
    };
  }

  const combinedAv = scopes.reduce((s, sc) => s + sc.accountValue, 0);

  const eqTargetTotal = scopes.reduce((s, sc) => s + sc.equityBook.targetTotal, 0);
  const eqCurrentTotal = scopes.reduce((s, sc) => s + sc.equityBook.currentTotal, 0);
  const eqSystemPct = combinedAv ? (eqTargetTotal / combinedAv) * 100 : 0;
  const combinedEquityBook: SystemBreakupBook = {
    systemPct: eqSystemPct,
    targetTotal: eqTargetTotal,
    currentTotal: eqCurrentTotal,
    diffTotal: eqCurrentTotal - eqTargetTotal,
    rows: sumRowsByKey(scopes.map((s) => s.equityBook.rows), combinedAv, eqSystemPct),
  };

  const derivTargetTotal = scopes.reduce((s, sc) => s + sc.derivativeBook.targetTotal, 0);
  const derivCurrentTotal = scopes.reduce((s, sc) => s + sc.derivativeBook.currentTotal, 0);
  const derivSystemPct = combinedAv ? (derivTargetTotal / combinedAv) * 100 : 0;
  const combinedDerivativeBook: SystemBreakupBook = {
    systemPct: derivSystemPct,
    targetTotal: derivTargetTotal,
    currentTotal: derivCurrentTotal,
    diffTotal: derivCurrentTotal - derivTargetTotal,
    rows: sumRowsByKey(scopes.map((s) => s.derivativeBook.rows), combinedAv, derivSystemPct),
  };

  return {
    accountValue: combinedAv,
    equityBook: combinedEquityBook,
    derivativeBook: combinedDerivativeBook,
  };
}
