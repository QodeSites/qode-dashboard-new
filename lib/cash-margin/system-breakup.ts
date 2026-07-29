/**
 * lib/cash-margin/system-breakup.ts
 * System Breakup Scheme (Absolute) — §2d.
 *
 * Two sub-tables per scope (Combined + per-strategy):
 *   - Equity Book: Gold/Momentum/Low Vol ETF rows for QAW-split strategies,
 *     single "Holdings" row for non-split (e.g. QYE).
 *   - Derivative Book: Cash + Liquid Case rows for every strategy.
 *
 * Ported from managed_accounts_analysis/reports/qaw_report.py
 * (compute_qaw_equity_book, EQUITY_BOOK_PCT, QAW_SUBS) and
 * common_report_utils.py (compute_excess_cash, DEFAULT_IDEAL_CASH_PCT).
 *
 * Hardcodes tier defaults only — no per-client ideal-% override support,
 * since client_strategy_configs has no such columns (see
 * docs/assumptions-and-changes-from-krish-logic.md §10).
 */
import type { MastersheetSnapshot } from "./mastersheet";
import type { Tier } from "./tags";
import { computeAccountSummaryForStrategy } from "./consolidated";

// ─── Tier-based allocation constants ──────────────────────────────────────────
// Fractions (0-1) internally; *100 for output percent fields.
// Source: qaw_report.py EQUITY_BOOK_PCT / common_report_utils.py DEFAULT_IDEAL_CASH_PCT.
const EQUITY_BOOK_PCT: Record<Tier, number> = { "+": 0.8, "++": 0.7 };
const IDEAL_CASH_PCT: Record<Tier, number> = { "+": 0.07, "++": 0.1 };

// Sub-split within the QAW Equity Book.
// Source: qaw_report.py QAW_SUBS — tier-independent.
const QAW_SUB_PCT = { gold: 0.4, momentum: 0.4, lowVol: 0.2 } as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SystemBreakupRow {
  label: string;
  /** Sub System % within the book (null on the Combined total row). Percent units (0-100). */
  subPct: number | null;
  /** System % (= book's share of Account Value). Percent units (0-100). */
  systemPct: number;
  targetVal: number;
  currentVal: number;
  diffVal: number;
  /** Target % of Account Value. Percent units. */
  targetPct: number;
  /**
   * Current % within this book's current total (equity-book leg-sum for
   * hasEquitySplit rows; Account Value for non-split Holdings and Derivative
   * rows). Matches Python's write_qaw_equity_pct denominator choice.
   * Percent units.
   */
  currentPct: number;
  diffPct: number;
}

export interface SystemBreakupBook {
  /** Book's share of Account Value. Percent units (0-100). */
  systemPct: number;
  /** Sum of target values across all rows in this book. */
  targetTotal: number;
  /** Sum of current values across all rows in this book. */
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

// ─── Per-strategy computation ─────────────────────────────────────────────────

/**
 * Build Equity Book + Derivative Book for one active strategy.
 *
 * @param hasEquitySplit - true when the resolved config has gold_pct set
 *   (client override OR strategy_defaults fallback). Same gate as Krish's
 *   `has_equity_split = split.gold_pct != null` (internal-utils.ts:2153).
 */
export function computeSystemBreakupForStrategy(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
  tier: Tier,
  hasEquitySplit: boolean,
): SystemBreakupScope {
  const summary = computeAccountSummaryForStrategy(ms, strategy, exposureTagSuffix);
  const av = summary.accountValue;
  const equityBookPct = EQUITY_BOOK_PCT[tier];
  const funds = equityBookPct * av; // "Funds to Deploy in Equity Book" (Python)

  // ── Equity Book ──────────────────────────────────────────────────────────
  let equityRows: SystemBreakupRow[];

  if (hasEquitySplit) {
    // QAW-tier: 3 rows (Gold / Momentum / Low Vol ETF).
    // currentPct denominator = sum of the 3 current values (equity-book leg-sum),
    // matching Python's compute_qaw_equity_book() / write_qaw_equity_pct().
    const legSum = summary.gold + summary.momentum + summary.lowVol;

    const makeQawRow = (
      label: string,
      subPct: number,
      currentVal: number,
    ): SystemBreakupRow => {
      const targetVal = subPct * funds;
      return {
        label,
        subPct: subPct * 100,
        systemPct: equityBookPct * 100,
        targetVal,
        currentVal,
        diffVal: currentVal - targetVal,
        targetPct: (targetVal / av) * 100,
        currentPct: legSum ? (currentVal / legSum) * 100 : 0,
        diffPct: legSum ? (currentVal / legSum) * 100 - subPct * 100 : -subPct * 100,
      };
    };

    equityRows = [
      makeQawRow("Gold", QAW_SUB_PCT.gold, summary.gold),
      makeQawRow("Momentum", QAW_SUB_PCT.momentum, summary.momentum),
      makeQawRow("Low Vol ETF", QAW_SUB_PCT.lowVol, summary.lowVol),
    ];
  } else {
    // Non-split (e.g. QYE): single "Holdings" row.
    // currentPct denominator = Account Value (matches pasted QYE++ 68.51%).
    const currentVal = summary.holdings;
    const targetVal = funds;
    equityRows = [
      {
        label: "Holdings",
        subPct: null,
        systemPct: equityBookPct * 100,
        targetVal,
        currentVal,
        diffVal: currentVal - targetVal,
        targetPct: equityBookPct * 100,
        currentPct: av ? (currentVal / av) * 100 : 0,
        diffPct: av ? (currentVal / av) * 100 - equityBookPct * 100 : -equityBookPct * 100,
      },
    ];
  }

  const equityCurrentTotal = equityRows.reduce((s, r) => s + r.currentVal, 0);
  const equityTargetTotal = equityRows.reduce((s, r) => s + r.targetVal, 0);

  const equityBook: SystemBreakupBook = {
    systemPct: equityBookPct * 100,
    targetTotal: equityTargetTotal,
    currentTotal: equityCurrentTotal,
    diffTotal: equityCurrentTotal - equityTargetTotal,
    rows: equityRows,
  };

  // ── Derivative Book ───────────────────────────────────────────────────────
  // Always 2 rows: Cash (IDEAL_CASH_PCT) + Liquid Case (remainder up to derivPct).
  // currentPct denominator = Account Value (consistent with % columns shown in pasted table).
  const derivPct = 1 - equityBookPct;
  const cashSubPct = IDEAL_CASH_PCT[tier];
  const liquidSubPct = derivPct - cashSubPct;

  const makeDerivRow = (
    label: string,
    subPct: number,
    currentVal: number,
  ): SystemBreakupRow => {
    const targetVal = subPct * av;
    return {
      label,
      subPct: subPct * 100,
      systemPct: derivPct * 100,
      targetVal,
      currentVal,
      diffVal: currentVal - targetVal,
      targetPct: subPct * 100,
      currentPct: av ? (currentVal / av) * 100 : 0,
      diffPct: av ? (currentVal / av) * 100 - subPct * 100 : -subPct * 100,
    };
  };

  const derivRows: SystemBreakupRow[] = [
    makeDerivRow("Cash", cashSubPct, summary.cash),
    makeDerivRow("Liquid Case", liquidSubPct, summary.liquidcase),
  ];

  const derivCurrentTotal = derivRows.reduce((s, r) => s + r.currentVal, 0);
  const derivTargetTotal = derivRows.reduce((s, r) => s + r.targetVal, 0);

  const derivativeBook: SystemBreakupBook = {
    systemPct: derivPct * 100,
    targetTotal: derivTargetTotal,
    currentTotal: derivCurrentTotal,
    diffTotal: derivCurrentTotal - derivTargetTotal,
    rows: derivRows,
  };

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

/**
 * "Total / Combined" row — straight sum across all active-strategy scopes.
 * No Python precedent (qaw_report.py has no combined sheet). Equity Book
 * collapses to one "Holdings" row; Derivative Book stays Cash + Liquid Case.
 * % columns are derived from the combined Account Value sum (not a hardcoded
 * constant) so mixed-tier clients are handled correctly.
 */
export function computeSystemBreakupCombined(
  scopes: SystemBreakupScope[],
): SystemBreakupCombined {
  if (scopes.length === 0) {
    return {
      accountValue: 0,
      equityBook: { systemPct: 0, targetTotal: 0, currentTotal: 0, diffTotal: 0, rows: [] },
      derivativeBook: { systemPct: 0, targetTotal: 0, currentTotal: 0, diffTotal: 0, rows: [] },
    };
  }

  const combinedAv = scopes.reduce((s, sc) => s + sc.accountValue, 0);

  // Equity Book — collapse all per-strategy equity rows into one "Holdings" total.
  const eqTargetTotal = scopes.reduce((s, sc) => s + sc.equityBook.targetTotal, 0);
  const eqCurrentTotal = scopes.reduce((s, sc) => s + sc.equityBook.currentTotal, 0);
  const eqDiffTotal = eqCurrentTotal - eqTargetTotal;
  const eqSystemPct = combinedAv ? (eqTargetTotal / combinedAv) * 100 : 0;

  const combinedEquityBook: SystemBreakupBook = {
    systemPct: eqSystemPct,
    targetTotal: eqTargetTotal,
    currentTotal: eqCurrentTotal,
    diffTotal: eqDiffTotal,
    rows: [
      {
        label: "Holdings",
        subPct: null,
        systemPct: eqSystemPct,
        targetVal: eqTargetTotal,
        currentVal: eqCurrentTotal,
        diffVal: eqDiffTotal,
        targetPct: combinedAv ? (eqTargetTotal / combinedAv) * 100 : 0,
        currentPct: combinedAv ? (eqCurrentTotal / combinedAv) * 100 : 0,
        diffPct: combinedAv ? ((eqCurrentTotal - eqTargetTotal) / combinedAv) * 100 : 0,
      },
    ],
  };

  // Derivative Book — sum Cash rows together, sum Liquid Case rows together.
  const sumDerivRow = (label: string, rowIndex: number): SystemBreakupRow => {
    const targetVal = scopes.reduce((s, sc) => s + (sc.derivativeBook.rows[rowIndex]?.targetVal ?? 0), 0);
    const currentVal = scopes.reduce((s, sc) => s + (sc.derivativeBook.rows[rowIndex]?.currentVal ?? 0), 0);
    const diffVal = currentVal - targetVal;
    const subPctAvg = scopes.length
      ? scopes.reduce((s, sc) => s + (sc.derivativeBook.rows[rowIndex]?.subPct ?? 0), 0) / scopes.length
      : 0;
    return {
      label,
      subPct: subPctAvg,
      systemPct: combinedAv ? (scopes.reduce((s, sc) => s + sc.derivativeBook.targetTotal, 0) / combinedAv) * 100 : 0,
      targetVal,
      currentVal,
      diffVal,
      targetPct: combinedAv ? (targetVal / combinedAv) * 100 : 0,
      currentPct: combinedAv ? (currentVal / combinedAv) * 100 : 0,
      diffPct: combinedAv ? (diffVal / combinedAv) * 100 : 0,
    };
  };

  const derivTargetTotal = scopes.reduce((s, sc) => s + sc.derivativeBook.targetTotal, 0);
  const derivCurrentTotal = scopes.reduce((s, sc) => s + sc.derivativeBook.currentTotal, 0);

  const combinedDerivativeBook: SystemBreakupBook = {
    systemPct: combinedAv ? (derivTargetTotal / combinedAv) * 100 : 0,
    targetTotal: derivTargetTotal,
    currentTotal: derivCurrentTotal,
    diffTotal: derivCurrentTotal - derivTargetTotal,
    rows: [sumDerivRow("Cash", 0), sumDerivRow("Liquid Case", 1)],
  };

  return {
    accountValue: combinedAv,
    equityBook: combinedEquityBook,
    derivativeBook: combinedDerivativeBook,
  };
}
