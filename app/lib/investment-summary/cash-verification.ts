/**
 * Port of verify_cash_transactions.py — cross-checks config/cash_transactions.csv
 * against a client's Mastersheet Cash In/Out, across EVERY strategy the client has
 * ever held (from Master_Config.csv), not just the currently active one.
 *
 * Rules ported 1:1 from the Python script:
 *   1. Full-cash strategies (QAW+/QAW++/QTF+/QTF++), ordinary days:
 *        expected = raw "<Strategy> Zerodha Total Portfolio" Cash In/Out
 *   2. QYE strategies, ordinary days:
 *        expected = ZTP - Equity Stock Holdings - Mutual Funds - Bond Stock Holdings
 *      (Liquidcase / Liquidbees intentionally NOT subtracted; missing tags = 0.)
 *   3. Strategy transition days (cap-out / cap-in): the whole account (cash + equity)
 *      moves as one lump sum, so the QYE net-of-equity formula is wrong there:
 *        closing_value  = -raw ZTP Cash In/Out on the closing strategy's last day
 *        opening_inflow =  raw ZTP Cash In/Out on the new strategy's first day
 *        new_capital    = opening_inflow - closing_value
 *      Only new_capital should appear in cash_transactions.csv (new-strategy side);
 *      the closing side should show nothing (pure rollover, non-cash).
 *   4. Settlement-lag pairing (ordinary QYE days only): if Equity Stock Holdings has
 *      a non-zero Cash In/Out on date D but Zerodha Total Portfolio doesn't (or vice
 *      versa), check D-1/D+1 for the offsetting leg and net them together.
 *   5. "Internal Transfer" rows in cash_transactions.csv are excluded from the main
 *      comparison and listed separately (not treated as errors).
 *
 * Unlike Python, the Mastersheet here comes from mastersheet.ts (Postgres), and the
 * strategy timeline from config.ts's getClientConfig() (Master_Config.csv already
 * merges what Python's separate Strategy_Config.csv provided) — one fetch per
 * client covers full history, same as the Python script's design.
 */
import { isFullCashStrategy } from "./tradebook";
import type { BaseSystemTags, ClientStrategyConfigRow, MasterSheetRow } from "./types";
import type { CashTransactionRow } from "./cash-inputs";

const TOLERANCE = 1.0; // rupees — matches the rest of the codebase's reconciliation tolerance
const INTERNAL_TRANSFER_PREFIX = "Internal Transfer";

export type VerificationCategory =
  | "NO_MASTERSHEET_TAG"
  | "TRANSITION_CLOSE"
  | "TRANSITION_OPEN"
  | "ORDINARY"
  | "EXTRA"
  | "INTERNAL_TRANSFER"
  | "NO_DATA";

export type VerificationStatus =
  | "OK"
  | "MATCH"
  | "MISMATCH"
  | "MISSING"
  | "EXTRA"
  | "INTERNAL"
  | "UNEXPECTED_ENTRY"
  | "NEEDS_MANUAL_CHECK"
  | "NO_DATA";

export interface VerificationRow {
  client: string;
  strategy: string;
  date: string | null; // ISO date (YYYY-MM-DD)
  category: VerificationCategory;
  status?: VerificationStatus;
  expected?: number | null;
  recorded?: number | null;
  closingValue?: number;
  prevStrategy?: string | null;
  openingInflow?: number;
  note: string;
}

export interface SummaryRow {
  client: string;
  strategy: string;
  datesChecked: number;
  match: number;
  mismatch: number;
  missing: number;
  extra: number;
  internalUnverified: number;
  noDataFlag: string;
}

function ifmt(v: number): string {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nz(v: number): boolean {
  return Math.round(v * 100) / 100 !== 0;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return toDateKey(d);
}

/** date-string comparison works lexicographically for ISO YYYY-MM-DD */
function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Cash In/Out series for one system_tag, keyed by ISO date. */
function tagSeries(rows: MasterSheetRow[], tag: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.systemTag !== tag) continue;
    out.set(toDateKey(r.date), r.capitalInOut ?? 0);
  }
  return out;
}

/**
 * Settlement-lag pairing (rule 4). Prefers same-day ESH; falls back to D-1
 * then D+1 if same-day ESH is zero/missing but an adjacent day has a real
 * signal — only if that adjacent day's OWN ZTP is zero, i.e. the ESH move
 * isn't already fully explained by its own same-day ZTP pairing.
 */
function resolveEshForPairing(
  esh: Map<string, number>,
  ztp: Map<string, number>,
  date: string,
): { value: number; dateUsed: string } {
  const sameDay = esh.get(date) ?? 0;
  if (nz(sameDay)) return { value: sameDay, dateUsed: date };
  for (const delta of [-1, 1]) {
    const d2 = addDays(date, delta);
    const v = esh.get(d2) ?? 0;
    const ztpD2 = ztp.get(d2) ?? 0;
    if (nz(v) && !nz(ztpD2)) return { value: v, dateUsed: d2 };
  }
  return { value: 0, dateUsed: date };
}

function recordedAmount(
  ct: CashTransactionRow[],
  client: string,
  strategy: string,
  date: string,
  excludeInternal = true,
): { sum: number; count: number } {
  const rows = ct.filter(
    (r) =>
      r.clientName === client &&
      r.strategy === strategy &&
      r.date === date &&
      (!excludeInternal || !r.type.startsWith(INTERNAL_TRANSFER_PREFIX)),
  );
  return { sum: rows.reduce((s, r) => s + r.amount, 0), count: rows.length };
}

function internalTransferRows(ct: CashTransactionRow[], client: string, strategy: string): CashTransactionRow[] {
  return ct.filter(
    (r) => r.clientName === client && r.strategy === strategy && r.type.startsWith(INTERNAL_TRANSFER_PREFIX),
  );
}

/** Every strategy this client has ever held, in chronological order (all statuses, not just Active). */
function buildStrategyTimeline(rows: ClientStrategyConfigRow[]): ClientStrategyConfigRow[] {
  return [...rows].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** Returns a flat list of result rows for this client, across every strategy it has ever held. */
export function verifyClient(
  clientName: string,
  timelineRows: ClientStrategyConfigRow[],
  mastersheetRows: MasterSheetRow[],
  cashTransactions: CashTransactionRow[],
  baseTags: BaseSystemTags,
): VerificationRow[] {
  const results: VerificationRow[] = [];
  const timeline = buildStrategyTimeline(timelineRows);

  const ztpBase = baseTags.zerodhaTotalPortfolio;
  const eshBase = baseTags.equityStockHoldings;
  const mfBase = baseTags.mutualFunds;
  const bondBase = baseTags.bondStockHoldings;

  // Carry forward each strategy's closing raw ZTP value, keyed by strategy name, so
  // the NEXT strategy in the timeline can compute new_capital on its opening day.
  const closingValues = new Map<string, number>();

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const strat = entry.strategy;
    const effFrom = entry.effectiveFrom;
    const effTo = entry.effectiveTo; // null if ongoing
    const isFirst = i === 0;
    const fullCash = isFullCashStrategy(strat);

    const ztpTag = `${strat} ${ztpBase}`;
    const eshTag = `${strat} ${eshBase}`;
    const mfTag = `${strat} ${mfBase}`;
    const bondTag = `${strat} ${bondBase}`;

    const ztp = tagSeries(mastersheetRows, ztpTag);
    const esh = tagSeries(mastersheetRows, eshTag);
    const mf = tagSeries(mastersheetRows, mfTag);
    const bond = tagSeries(mastersheetRows, bondTag);

    if (ztp.size === 0) {
      results.push({
        client: clientName,
        strategy: strat,
        date: null,
        category: "NO_MASTERSHEET_TAG",
        note: `Tag '${ztpTag}' not found in Mastersheet at all — cannot verify this strategy.`,
      });
      continue;
    }

    const closingDate = effTo;
    const openingDate = isFirst ? null : effFrom;

    let windowEnd = effTo;
    if (windowEnd === null) {
      windowEnd = [...ztp.keys()].sort().at(-1)!;
    }

    let nzDates: string[];
    if (fullCash) {
      // Full-cash strategies (QAW/QTF) don't track holdings separately — only the raw ZTP signal matters.
      nzDates = [...ztp.entries()].filter(([d, v]) => nz(v) && inRange(d, effFrom, windowEnd!)).map(([d]) => d);
    } else {
      // QYE strategies: also catch days where Equity/MF/Bond moved but ZTP stayed FLAT — a flat
      // ZTP does NOT mean "nothing to check", the residual must still be reconciled against cash.
      const candidates = new Set<string>();
      for (const m of [ztp, esh, mf, bond]) {
        for (const [d, v] of m) if (nz(v)) candidates.add(d);
      }
      nzDates = [...candidates].filter((d) => inRange(d, effFrom, windowEnd!));
    }
    nzDates.sort();

    // Safety net: always check the transition close/open dates even if they fell outside the scan above.
    for (const special of [closingDate, openingDate]) {
      if (special !== null && inRange(special, effFrom, windowEnd) && !nzDates.includes(special)) {
        nzDates.push(special);
        nzDates.sort();
      }
    }

    const signalDates = new Set(nzDates); // dates considered "explained" by a Mastersheet signal

    for (const date of nzDates) {
      const rawZtp = ztp.get(date) ?? 0;

      // ---- Transition: closing (cap-out) day ----
      if (closingDate !== null && date === closingDate) {
        const closingVal = -rawZtp;
        closingValues.set(strat, closingVal);
        const { sum: recSum, count: recN } = recordedAmount(cashTransactions, clientName, strat, date);
        const flag: VerificationStatus = recN === 0 ? "OK" : Math.abs(recSum) < TOLERANCE ? "MATCH" : "UNEXPECTED_ENTRY";
        results.push({
          client: clientName,
          strategy: strat,
          date,
          category: "TRANSITION_CLOSE",
          expected: null,
          recorded: recN ? recSum : null,
          closingValue: closingVal,
          status: flag,
          note: `Cap-out day. Closing value ${ifmt(closingVal)} rolls into the next strategy.`,
        });
        continue;
      }

      // ---- Transition: opening (cap-in) day ----
      if (openingDate !== null && date === openingDate) {
        const prevEntries = timeline.filter((e) => e.effectiveTo !== null && e.effectiveTo <= date);
        const prevStrat = prevEntries.length ? prevEntries[prevEntries.length - 1].strategy : null;
        const prevClosing = prevStrat ? closingValues.get(prevStrat) : undefined;

        if (prevClosing === undefined) {
          results.push({
            client: clientName,
            strategy: strat,
            date,
            category: "TRANSITION_OPEN",
            expected: null,
            recorded: null,
            status: "NEEDS_MANUAL_CHECK",
            note:
              "Opening/cap-in day but no prior strategy's closing value was found " +
              "(check Master_Config.csv effective dates alignment).",
          });
          continue;
        }

        const newCapital = rawZtp - prevClosing;
        const { sum: recSum, count: recN } = recordedAmount(cashTransactions, clientName, strat, date);
        const status: VerificationStatus =
          recN === 0
            ? Math.abs(newCapital) < TOLERANCE
              ? "MATCH"
              : "MISSING"
            : Math.abs(newCapital - recSum) < TOLERANCE
              ? "MATCH"
              : "MISMATCH";
        results.push({
          client: clientName,
          strategy: strat,
          date,
          category: "TRANSITION_OPEN",
          expected: newCapital,
          recorded: recN ? recSum : null,
          prevStrategy: prevStrat,
          closingValue: prevClosing,
          openingInflow: rawZtp,
          status,
          note: `Cap-in day from ${prevStrat}. Rollover base ${ifmt(prevClosing)}, opening inflow ${ifmt(rawZtp)}, new capital ${ifmt(newCapital)}.`,
        });
        continue;
      }

      // ---- Ordinary day ----
      let expected: number;
      let pairingNote = "";
      if (fullCash) {
        expected = rawZtp;
      } else {
        const { value: eshVal, dateUsed: eshDateUsed } = resolveEshForPairing(esh, ztp, date);
        const mfVal = mf.get(date) ?? 0;
        const bondVal = bond.get(date) ?? 0;
        expected = rawZtp - eshVal - mfVal - bondVal;
        if (eshDateUsed !== date) {
          pairingNote = `(settlement-lag pair: ESH on ${eshDateUsed} netted with ZTP on ${date})`;
          signalDates.add(eshDateUsed);
        } else if (!nz(rawZtp) && nz(expected)) {
          pairingNote =
            "(ZTP flat this day — equity/MF moved without a matching portfolio-value change; residual should sit as cash)";
        }
      }

      const { sum: recSum, count: recN } = recordedAmount(cashTransactions, clientName, strat, date);
      const status: VerificationStatus =
        recN === 0
          ? Math.abs(expected) < TOLERANCE
            ? "OK"
            : "MISSING"
          : Math.abs(expected - recSum) < TOLERANCE
            ? "MATCH"
            : "MISMATCH";

      results.push({
        client: clientName,
        strategy: strat,
        date,
        category: "ORDINARY",
        expected,
        recorded: recN ? recSum : null,
        status,
        note: pairingNote,
      });
    }

    // ---- Extra / unexplained cash_transactions.csv rows ----
    const clientStratRows = cashTransactions.filter(
      (r) => r.clientName === clientName && r.strategy === strat && !r.type.startsWith(INTERNAL_TRANSFER_PREFIX),
    );
    for (const row of clientStratRows) {
      const d = row.date;
      if (!d || d < effFrom || d > windowEnd) continue;
      if (!signalDates.has(d)) {
        results.push({
          client: clientName,
          strategy: strat,
          date: d,
          category: "EXTRA",
          expected: null,
          recorded: row.amount,
          status: "EXTRA",
          note: `Type: ${row.type} — no Mastersheet Cash In/Out signal found for this date.`,
        });
      }
    }

    // ---- Internal Transfers — listed, not verified ----
    for (const row of internalTransferRows(cashTransactions, clientName, strat)) {
      results.push({
        client: clientName,
        strategy: strat,
        date: row.date,
        category: "INTERNAL_TRANSFER",
        expected: null,
        recorded: row.amount,
        status: "INTERNAL",
        note: "Internal Transfer — not verified against Mastersheet.",
      });
    }

    // ---- Flag: zero cash_transactions.csv data at all for this strategy ----
    if (clientStratRows.length === 0 && nzDates.length > 0) {
      results.push({
        client: clientName,
        strategy: strat,
        date: null,
        category: "NO_DATA",
        status: "NO_DATA",
        note: `No cash_transactions.csv data exists at all for ${clientName} / ${strat} — needs manual data entry before this can be verified.`,
      });
    }
  }

  return results;
}

export function buildSummaryTable(allResults: VerificationRow[]): SummaryRow[] {
  const summary = new Map<string, SummaryRow>();

  for (const r of allResults) {
    const key = `${r.client}|||${r.strategy}`;
    let s = summary.get(key);
    if (!s) {
      s = {
        client: r.client,
        strategy: r.strategy,
        datesChecked: 0,
        match: 0,
        mismatch: 0,
        missing: 0,
        extra: 0,
        internalUnverified: 0,
        noDataFlag: "",
      };
      summary.set(key, s);
    }

    const { category, status } = r;
    if (category === "NO_DATA") {
      s.noDataFlag = "YES — needs manual data entry";
    } else if (category === "INTERNAL_TRANSFER") {
      s.internalUnverified += 1;
    } else if (category === "EXTRA") {
      s.datesChecked += 1;
      s.extra += 1;
    } else if (category === "ORDINARY" || category === "TRANSITION_OPEN") {
      if (status === "OK") continue;
      s.datesChecked += 1;
      if (status === "MATCH") s.match += 1;
      else if (status === "MISMATCH") s.mismatch += 1;
      else if (status === "MISSING") s.missing += 1;
    }
    // TRANSITION_CLOSE / NO_MASTERSHEET_TAG intentionally excluded from counted totals
  }

  return [...summary.values()];
}
