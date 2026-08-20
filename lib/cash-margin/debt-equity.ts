/**
 * lib/cash-margin/debt-equity.ts
 * "Debt To Equity Ratio" table for one client (Combined + per-strategy).
 *
 * Ported from ma-portfolio-review/cash_margin/engine/individual_sheet.py
 * (Table 13, "Debt To Equity Ratio"), NOT managed_accounts_analysis --
 * see docs/debt-to-equity-plan.md. Same formula duplicated in that repo's
 * qye_sheet.py.
 *
 * Reads three new per-strategy MF tags (Equity/Debt/Hybrid Mutual Funds) in
 * addition to the existing bondStock/equityStock/liquidcase/accountValue
 * fields already read by mastersheet.ts's computeAccountSummary.
 */
import type { MastersheetSnapshot } from "./mastersheet";
import { getVal, computeAccountSummary } from "./mastersheet";

const MF_SPLIT_SUFFIX = {
  equity: "Equity Mutual Funds",
  debt: "Debt Mutual Funds",
  hybrid: "Hybrid Mutual Funds",
} as const;

export interface DebtEquityRow {
  strategy: string;
  equityMf: number;
  debtMf: number;
  hybridMf: number;
  mfTotal: number;
  liquidcase: number;
  debtStock: number;
  equityStock: number;
  stockTotal: number;
  /** Residual: accountValue - mfTotal - stockTotal. */
  cash: number;
  accountValue: number;
  debtAmt: number;
  equityAmt: number;
  hybridAmt: number;
  /** Percent units (0-100), of accountValue. */
  debtPct: number;
  equityPct: number;
  hybridPct: number;
}

function buildRow(
  strategy: string,
  accountValue: number,
  equityMf: number,
  debtMf: number,
  hybridMf: number,
  liquidcase: number,
  debtStock: number,
  equityStock: number,
): DebtEquityRow {
  const mfTotal = equityMf + debtMf + hybridMf;
  const stockTotal = liquidcase + debtStock + equityStock;
  const cash = accountValue - mfTotal - stockTotal;

  const debtAmt = debtMf + liquidcase + debtStock + cash;
  const equityAmt = equityMf + equityStock;
  const hybridAmt = hybridMf;

  const pct = (part: number) => (accountValue ? (part / accountValue) * 100 : 0);

  return {
    strategy,
    equityMf,
    debtMf,
    hybridMf,
    mfTotal,
    liquidcase,
    debtStock,
    equityStock,
    stockTotal,
    cash,
    accountValue,
    debtAmt,
    equityAmt,
    hybridAmt,
    debtPct: pct(debtAmt),
    equityPct: pct(equityAmt),
    hybridPct: pct(hybridAmt),
  };
}

/** Debt/Equity/Hybrid breakup for a single active strategy (prefixed tags). */
export function computeDebtEquityForStrategy(
  ms: MastersheetSnapshot,
  strategy: string,
  exposureTagSuffix: string,
): DebtEquityRow {
  const summary = computeAccountSummary(ms, strategy, exposureTagSuffix);
  const tag = (suffix: string) => `${strategy} ${suffix}`;
  const equityMf = getVal(ms, tag(MF_SPLIT_SUFFIX.equity));
  const debtMf = getVal(ms, tag(MF_SPLIT_SUFFIX.debt));
  const hybridMf = getVal(ms, tag(MF_SPLIT_SUFFIX.hybrid));

  return buildRow(
    strategy,
    summary.accountValue,
    equityMf,
    debtMf,
    hybridMf,
    summary.liquidcase,
    summary.bondStock,
    summary.equityStock,
  );
}

/**
 * Combined row -- sums every raw bucket across active strategies first, then
 * re-derives cash/debtAmt/equityAmt/hybridAmt/percentages from those sums.
 * NOT a sum of each strategy's already-computed cash/debtAmt (residual math
 * doesn't distribute across a sum in general). No Python precedent for a
 * Combined row here, same caveat as System Breakup/Margin Requirements.
 */
export function computeDebtEquityCombined(scopes: DebtEquityRow[]): DebtEquityRow {
  const sum = (pick: (r: DebtEquityRow) => number) => scopes.reduce((acc, r) => acc + pick(r), 0);

  return buildRow(
    "Combined",
    sum((r) => r.accountValue),
    sum((r) => r.equityMf),
    sum((r) => r.debtMf),
    sum((r) => r.hybridMf),
    sum((r) => r.liquidcase),
    sum((r) => r.debtStock),
    sum((r) => r.equityStock),
  );
}
