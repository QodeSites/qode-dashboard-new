import { prisma } from "@/lib/prisma";
import { round, MS } from "@/lib/utils";

export interface CashFlow {
  date: Date;
  amount: number; // positive = deposit into the account, negative = withdrawal
}

/**
 * Money-weighted annualized return, solved from real dated cash flows plus
 * a final "as of" valuation — as opposed to calcSinceInception's CAGR,
 * which only looks at the NAV curve's start/end and has no idea when the
 * client's own money actually moved. Newton-Raphson with a bisection
 * fallback, since Newton-Raphson can diverge for pathological flow sets.
 */
export function solveXirr(
  flows: CashFlow[],
  asOfDate: Date,
  finalValue: number,
): number | null {
  if (flows.length === 0 || finalValue <= 0) return null;

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();
  const events = [
    ...sorted.map((f) => ({
      amount: -f.amount, // deposit = cash out of investor's pocket
      years: (f.date.getTime() - t0) / (MS * 365),
    })),
    { amount: finalValue, years: (asOfDate.getTime() - t0) / (MS * 365) },
  ].filter((e) => e.amount !== 0);

  if (events.length < 2) return null;
  const hasPositive = events.some((e) => e.amount > 0);
  const hasNegative = events.some((e) => e.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const npv = (r: number) =>
    events.reduce((s, e) => s + e.amount / (1 + r) ** e.years, 0);
  const dNpv = (r: number) =>
    events.reduce(
      (s, e) => s - (e.years * e.amount) / (1 + r) ** (e.years + 1),
      0,
    );

  let r = 0.1;
  let converged = false;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    const df = dNpv(r);
    if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-10) break;
    const next = r - f / df;
    if (!isFinite(next) || next <= -0.999) break;
    if (Math.abs(next - r) < 1e-7) {
      r = next;
      converged = true;
      break;
    }
    r = next;
  }

  if (!converged || !isFinite(r)) {
    // Bisection fallback over a wide, sane range.
    let lo = -0.9999,
      hi = 10;
    let fLo = npv(lo);
    const fHi = npv(hi);
    if ((fLo > 0) === (fHi > 0)) return null; // no sign change, can't bracket a root
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fMid = npv(mid);
      if (Math.abs(fMid) < 1e-6) {
        r = mid;
        converged = true;
        break;
      }
      if ((fMid > 0) === (fLo > 0)) {
        lo = mid;
        fLo = fMid;
      } else {
        hi = mid;
      }
      r = mid;
    }
    converged = true;
  }

  return converged ? round(r, 4) : null;
}

export interface XirrInputs {
  flows: CashFlow[];
  asOfDate: Date;
  finalValue: number;
}

/**
 * Cash flows + final valuation for XIRR, sourced entirely from the
 * exposure tag (never the profit tag — see the `exposure_tag` comment on
 * StrategyPair). Deliberately self-contained per tag rather than mixing
 * flows from one tag with a value from another, so there's no dependency
 * on whether the two tags' portfolio_value figures track each other.
 */
export async function fetchBulkXirrInputs(
  pairs: { qcode: string; tag: string }[],
  end?: Date,
): Promise<Map<string, XirrInputs>> {
  if (pairs.length === 0) return new Map();
  const params: any[] = [pairs.map((p) => p.qcode), pairs.map((p) => p.tag)];
  let dateClause = "";
  if (end) {
    params.push(end);
    dateClause = ` AND b.date <= $${params.length}`;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.qcode, b.system_tag, b.date, b.capital_in_out, b.portfolio_value
     FROM bifurcated_master_sheet_test b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.portfolio_value IS NOT NULL${dateClause}
     ORDER BY b.qcode, b.system_tag, b.date ASC`,
    ...params,
  );

  const result = new Map<string, XirrInputs>();
  for (const row of rows) {
    const key = `${row.qcode}|${row.system_tag}`;
    if (!result.has(key)) {
      result.set(key, { flows: [], asOfDate: new Date(0), finalValue: 0 });
    }
    const entry = result.get(key)!;
    const date = row.date instanceof Date ? row.date : new Date(row.date);
    const amount = Number(row.capital_in_out) || 0;
    if (amount !== 0) entry.flows.push({ date, amount });
    if (date >= entry.asOfDate) {
      entry.asOfDate = date;
      entry.finalValue = Number(row.portfolio_value) || 0;
    }
  }
  return result;
}
