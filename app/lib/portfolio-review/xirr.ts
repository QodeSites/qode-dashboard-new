import { prisma } from "@/lib/prisma";
import { round, MS, toSqlDate } from "@/lib/utils";

export interface XirrTagConfig {
  strategy: string;
  profit_tag_suffix: string;
  exposure_tag_suffix: string;
}

export function isSoloPropConfigs(configs: XirrTagConfig[]): boolean {
  return configs.length === 1 && configs[0].strategy === "Prop";
}

// Whole-portfolio tag names (NAV + deposit tags) — a line on any of these is
// a total line for its level, not a sleeve, whatever a config's own
// profit/exposure suffix happens to be.
const TOTAL_TAG_SUFFIXES = [
  "Total Portfolio Value",
  "Total Portfolio Exposure",
  "Zerodha Total Portfolio",
];

/**
 * The exposure tag XIRR should be solved on for a system tag, or null when
 * the tag isn't a client- or strategy-level total (sleeves like Gold, PSAR,
 * LONG, Liquidcase get no XIRR). Same tags Client-Wise Returns uses: a
 * strategy's total tag → `<strategy> <exposure suffix>`; a client total
 * (Qode Total Portfolio or an unprefixed total tag) → Zerodha Total
 * Portfolio / Total Portfolio Exposure; solo Prop → its own bare exposure
 * tag. Never the tag's own capital_in_out — on a profit tag that column
 * carries internal transfer noise (see tags.ts).
 */
export function xirrSourceTag(tag: string, configs: XirrTagConfig[]): string | null {
  if (configs.length === 0) return null;
  const isTotalFor = (suffix: string, c: XirrTagConfig) =>
    suffix === c.profit_tag_suffix ||
    suffix === c.exposure_tag_suffix ||
    TOTAL_TAG_SUFFIXES.includes(suffix);

  if (isSoloPropConfigs(configs)) {
    const c = configs[0];
    return isTotalFor(tag, c) ? c.exposure_tag_suffix : null;
  }

  let source: string | null = null;
  for (const c of configs) {
    const prefix = `${c.strategy} `;
    if (tag.startsWith(prefix) && isTotalFor(tag.slice(prefix.length), c)) {
      source = `${c.strategy} ${c.exposure_tag_suffix}`;
    }
  }
  if (source) return source;

  const clientExposure = configs.some((c) =>
    c.exposure_tag_suffix.toLowerCase().includes("zerodha"),
  )
    ? "Zerodha Total Portfolio"
    : "Total Portfolio Exposure";
  return tag === "Qode Total Portfolio" || TOTAL_TAG_SUFFIXES.includes(tag)
    ? clientExposure
    : null;
}

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
  if (flows.length === 0) return null;
  // A zero/negative final value normally means "no usable data" and bails
  // — except when the account was fully withdrawn exactly on `asOfDate`:
  // that withdrawal is already present below as a same-day flow (negated
  // into a positive, realization-like event), so there IS a real exit to
  // solve against. Bailing here would silently turn a legitimate full
  // redemption into a null XIRR instead of a real (likely negative) one.
  const hasSameDayExit = flows.some(
    (f) => f.date.getTime() === asOfDate.getTime() && f.amount !== 0,
  );
  if (finalValue <= 0 && !hasSameDayExit) return null;

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
 *
 * `start`, when given, computes a WINDOWED XIRR rather than full-history:
 * the account's actual value at/before `start` is injected as a synthetic
 * opening deposit on that date, and only real flows strictly after `start`
 * are included. Without this, filtering flows to a window would drop the
 * account's true opening balance and produce a wrong (or unsolvable) rate
 * — see the "windowed XIRR" discussion. Omitting `start` preserves the
 * exact original full-history behavior, unchanged, for existing callers.
 */
export async function fetchBulkXirrInputs(
  pairs: { qcode: string; tag: string }[],
  end?: Date,
  start?: Date,
  // See fetchBulkNavSeries's `table` param — same reasoning, Prop-only.
  table: "bifurcated_master_sheet_test" | "master_sheet_test" = "bifurcated_master_sheet_test",
): Promise<Map<string, XirrInputs>> {
  if (pairs.length === 0) return new Map();
  const qcodes = pairs.map((p) => p.qcode);
  const tags = pairs.map((p) => p.tag);

  const result = new Map<string, XirrInputs>();

  if (start) {
    // Opening value: latest row strictly BEFORE `start` (t-1), per pair —
    // becomes the synthetic "deposit" that opens the window. Previously
    // `<=`, which could pick `start`'s own row as both the opening balance
    // AND (via the `> start` flow clause below) exclude that same day's
    // real flow — or double-count it, depending on which row the DISTINCT
    // ON happened to prefer. Strict `<` removes the ambiguity: the opening
    // balance is always from before the window, and the window's own flows
    // (today's `>=` clause below) are never confused with it.
    const openingRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT ON (b.qcode, b.system_tag)
         b.qcode, b.system_tag, b.date, b.portfolio_value
       FROM ${table} b
       JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
         ON b.qcode = v.qcode AND b.system_tag = v.tag
       WHERE b.portfolio_value IS NOT NULL AND b.date < $3::date
       ORDER BY b.qcode, b.system_tag, b.date DESC`,
      qcodes, tags, toSqlDate(start),
    );
    for (const row of openingRows) {
      const key = `${row.qcode}|${row.system_tag}`;
      const openingValue = Number(row.portfolio_value) || 0;
      result.set(key, {
        flows: [{ date: start, amount: openingValue }],
        asOfDate: start,
        finalValue: openingValue,
      });
    }
    // Real flows on/after `start` (and up to `end`, if given) — now that
    // the opening balance is sourced strictly before `start`, a flow dated
    // exactly on `start` is a real flow that happened during the window,
    // not part of the opening balance, so it belongs here (`>=`, not the
    // previous `>`).
    const params: any[] = [qcodes, tags, toSqlDate(start)];
    let dateClause = " AND b.date >= $3::date";
    if (end) {
      params.push(toSqlDate(end));
      dateClause += ` AND b.date <= $${params.length}::date`;
    }
    const flowRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT b.qcode, b.system_tag, b.date, b.capital_in_out, b.portfolio_value
       FROM ${table} b
       JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
         ON b.qcode = v.qcode AND b.system_tag = v.tag
       WHERE b.portfolio_value IS NOT NULL${dateClause}
       ORDER BY b.qcode, b.system_tag, b.date ASC`,
      ...params,
    );
    for (const row of flowRows) {
      const key = `${row.qcode}|${row.system_tag}`;
      const entry = result.get(key);
      if (!entry) continue; // no opening value found — handled below via full-history fallback
      const date = row.date instanceof Date ? row.date : new Date(row.date);
      const amount = Number(row.capital_in_out) || 0;
      if (amount !== 0) entry.flows.push({ date, amount });
      if (date >= entry.asOfDate) {
        entry.asOfDate = date;
        entry.finalValue = Number(row.portfolio_value) || 0;
      }
    }

    // A pair with no row before `start` means the account's own inception
    // is on/after the requested window start — there's no opening balance
    // to window from. Rather than silently dropping it, fall back to a
    // full-history XIRR from the account's actual inception for just those
    // pairs, so the caller still gets a real (if not window-scoped) rate
    // instead of nothing.
    const missing = pairs.filter(
      (p) => !result.has(`${p.qcode}|${p.tag}`),
    );
    if (missing.length > 0) {
      const fallback = await fetchBulkXirrInputs(missing, end, undefined, table);
      for (const [key, inputs] of fallback) result.set(key, inputs);
    }
    return result;
  }

  // Full-history path — unchanged from before `start` existed.
  const params: any[] = [qcodes, tags];
  let dateClause = "";
  if (end) {
    params.push(toSqlDate(end));
    dateClause = ` AND b.date <= $${params.length}::date`;
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT b.qcode, b.system_tag, b.date, b.capital_in_out, b.portfolio_value
     FROM ${table} b
     JOIN unnest($1::text[], $2::text[]) AS v(qcode, tag)
       ON b.qcode = v.qcode AND b.system_tag = v.tag
     WHERE b.portfolio_value IS NOT NULL${dateClause}
     ORDER BY b.qcode, b.system_tag, b.date ASC`,
    ...params,
  );
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
