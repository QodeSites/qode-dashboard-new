"use client";

import { Fragment, useMemo, useState } from "react";
import { Loader2, AlertCircle, Download, ChevronRight, Layers } from "lucide-react";
import { fetchClientMonthlyReturns, type ClientMonthlyReturnRow } from "./api";

const MONTH_ORDER = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT: Record<string, string> = {
  January:"JAN", February:"FEB", March:"MAR", April:"APR", May:"MAY", June:"JUN",
  July:"JUL", August:"AUG", September:"SEP", October:"OCT", November:"NOV", December:"DEC",
};

const COL = { label: 260, year: 72, month: 96, total: 104, since: 116, xirr: 90, dd: 100 };

// ─── Formatters — all null-safe ───────────────────────────────────────────────


function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtFracPct(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}
function fmtInr(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "+";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
}

function fmtFull(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v < 0 ? "-" : ""}₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function cellClass(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "text-card-text-secondary/30";
  return v >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600";
}
function textClass(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "text-card-text-secondary/30";
  return v >= 0 ? "text-green-700" : "text-red-600";
}

// ─── Client-side consolidation ─────────────────────────────────────────────────

interface ConsolidatedClient {
  qcode: string;
  accountName: string;
  isMultiStrategy: boolean;
  legs: ClientMonthlyReturnRow[];
  combinedSinceInceptionPnl: number;
  combinedSinceInception: number | null;
}

function combineSinceInception(legs: ClientMonthlyReturnRow[]): number | null {
  let totalBase = 0;
  let anyBase = false;
  legs.forEach((l) => {
    if (l.since_inception_absolute !== 0) {
      totalBase += l.since_inception_pnl / l.since_inception_absolute;
      anyBase = true;
    }
  });
  if (!anyBase || totalBase === 0) return null;
  const totalPnl = legs.reduce((s, l) => s + l.since_inception_pnl, 0);
  return totalPnl / totalBase;
}

function combineMonthlyPct(legsForMonth: { pnlInr: number; returnPct: number }[]): number | null {
  let totalBase = 0;
  let anyBase = false;
  legsForMonth.forEach((l) => {
    if (l.returnPct !== 0) {
      totalBase += l.pnlInr / (l.returnPct / 100);
      anyBase = true;
    }
  });
  if (!anyBase || totalBase === 0) return legsForMonth.length > 0 ? 0 : null;
  const totalPnl = legsForMonth.reduce((s, l) => s + l.pnlInr, 0);
  return (totalPnl / totalBase) * 100;
}

interface YearRow {
  isFirstRow: boolean;
  year: number;
  months: (number | null)[];
  total: number | null;
}

function buildYearRows(
  legs: { monthly: ClientMonthlyReturnRow["monthly"]; yearly: ClientMonthlyReturnRow["yearly"] }[],
  allYears: number[],
  allMonths: string[],
  showInr: boolean
): YearRow[] {
  return allYears.map((year, yi) => {
    const months: (number | null)[] = allMonths.map((mName) => {
      const legsForMonth = legs
        .flatMap((l) => l.monthly)
        .filter((m) => m.year === year && m.month === mName)
        .map((m) => ({ pnlInr: m.pnl_inr, returnPct: m.return_pct }));
      if (legsForMonth.length === 0) return null;
      if (showInr) return legsForMonth.reduce((s, m) => s + m.pnlInr, 0);
      return combineMonthlyPct(legsForMonth);
    });

    const yearLegs = legs
      .flatMap((l) => l.yearly)
      .filter((y) => y.year === year)
      .map((y) => ({ pnlInr: y.pnl_inr, returnPct: y.return_pct }));
    const total = yearLegs.length === 0
      ? null
      : showInr
        ? yearLegs.reduce((s, y) => s + y.pnlInr, 0)
        : combineMonthlyPct(yearLegs);

    return { isFirstRow: yi === 0, year, months, total };
  });
}

function ClientRowGroup({
  client, allYears, allMonths, showInr,
}: {
  client: ConsolidatedClient; allYears: number[]; allMonths: string[]; showInr: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const consolidatedRows = useMemo(
    () => buildYearRows(client.legs, allYears, allMonths, showInr),
    [client, allYears, allMonths, showInr]
  );

  return (
    <>
      {consolidatedRows.map((row, i) => (
        <tr
          key={`${client.qcode}-${row.year}`}
          className={`border-t ${row.isFirstRow && i > 0 ? "border-logo-green/20 border-t-2" : "border-logo-green/5"}`}
        >
          <td className="px-4 py-2 text-card-text font-medium whitespace-nowrap sticky left-0 bg-white overflow-hidden border-r border-logo-green/10">
            {row.isFirstRow ? (
              <div className="flex items-center gap-1.5 min-w-0">
                {client.isMultiStrategy && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-card-text-secondary hover:text-logo-green flex-shrink-0"
                    title="Show strategy breakdown"
                  >
                    <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </button>
                )}
                <span className="truncate min-w-0 flex-1" title={client.accountName}>
                  {client.accountName}
                </span>
                {client.isMultiStrategy && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 flex-shrink-0"
                    title={`Combines: ${client.legs.map((l) => l.strategy).join(", ")}`}
                  >
                    <Layers className="h-2.5 w-2.5" />
                    Multi-Strategy
                  </span>
                )}
              </div>
            ) : null}
          </td>
          <td className="px-4 py-2 text-card-text-secondary">{row.year}</td>
          {row.months.map((v, mi) => (
            <td key={mi} title={showInr && v !== null ? fmtFull(v) : undefined} className={`px-3 py-2 text-right whitespace-nowrap text-xs font-medium ${cellClass(v)}`}>
              {v === null ? "—" : showInr ? fmtInr(v) : fmtPct(v)}
            </td>
          ))}
          <td title={showInr && row.total !== null ? fmtFull(row.total) : undefined} className={`px-4 py-2 text-right font-semibold whitespace-nowrap text-xs ${cellClass(row.total)}`}>
            {row.total === null ? "—" : showInr ? fmtInr(row.total) : fmtPct(row.total)}
          </td>

          {/* Since Inception / XIRR / Max DD / Current DD — shown once, on the
              client's first row. For a multi-strategy client, only Since
              Inception is mathematically combined; the other three are only
              meaningful per-strategy and show as "—" on this consolidated row. */}
          {row.isFirstRow ? (
            <>
              <td
                title={showInr ? fmtFull(client.combinedSinceInceptionPnl) : undefined}
                className={`px-3 py-2 text-right text-xs whitespace-nowrap border-l-2 border-logo-green/25 ${textClass(showInr ? client.combinedSinceInceptionPnl : client.combinedSinceInception)}`}
              >
                {showInr ? fmtInr(client.combinedSinceInceptionPnl) : fmtFracPct(client.combinedSinceInception)}
              </td>
              <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${client.isMultiStrategy ? "text-card-text-secondary/30" : textClass(client.legs[0].xirr)}`}>
                {client.isMultiStrategy ? "—" : fmtFracPct(client.legs[0].xirr)}
              </td>
              <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${client.isMultiStrategy ? "text-card-text-secondary/30" : "text-red-600"}`}>
                {client.isMultiStrategy ? "—" : fmtFracPct(client.legs[0].max_drawdown)}
              </td>
              <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${client.isMultiStrategy ? "text-card-text-secondary/30" : "text-red-600"}`}>
                {client.isMultiStrategy ? "—" : fmtFracPct(client.legs[0].current_drawdown)}
              </td>
            </>
          ) : (
            <>
              <td className="px-3 py-2 border-l-2 border-logo-green/25" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
            </>
          )}
        </tr>
      ))}

      {client.isMultiStrategy && expanded && client.legs.map((leg) => {
        const legRows = buildYearRows([leg], allYears, allMonths, showInr);
        return legRows.map((row, i) => (
          <tr key={`${client.qcode}-${leg.strategy}-${row.year}`} className="border-t border-logo-green/5 bg-primary-bg/20">
            <td className="px-4 py-1.5 text-card-text-secondary text-xs whitespace-nowrap sticky left-0 bg-primary-bg/20 pl-9 border-r border-logo-green/10">
              {i === 0 ? `↳ ${leg.strategy}` : ""}
            </td>
            <td className="px-4 py-1.5 text-card-text-secondary text-xs">{row.year}</td>
            {row.months.map((v, mi) => (
              <td key={mi} title={showInr && v !== null ? fmtFull(v) : undefined} className={`px-3 py-1.5 text-right whitespace-nowrap text-[11px] ${v !== null ? textClass(v) : "text-card-text-secondary/30"}`}>
                {v === null ? "—" : showInr ? fmtInr(v) : fmtPct(v)}
              </td>
            ))}
            <td title={showInr && row.total !== null ? fmtFull(row.total) : undefined} className={`px-4 py-1.5 text-right font-medium whitespace-nowrap text-[11px] ${row.total !== null ? textClass(row.total) : "text-card-text-secondary/30"}`}>
              {row.total === null ? "—" : showInr ? fmtInr(row.total) : fmtPct(row.total)}
            </td>
            {i === 0 ? (
              <>
                <td title={showInr ? fmtFull(leg.since_inception_pnl) : undefined} className={`px-3 py-1.5 text-right text-[11px] whitespace-nowrap border-l-2 border-logo-green/25 ${textClass(showInr ? leg.since_inception_pnl : leg.since_inception_absolute)}`}>
                  {showInr ? fmtInr(leg.since_inception_pnl) : fmtFracPct(leg.since_inception_absolute)}
                </td>
                <td className={`px-3 py-1.5 text-right text-[11px] whitespace-nowrap ${textClass(leg.xirr)}`}>{fmtFracPct(leg.xirr)}</td>
                <td className="px-3 py-1.5 text-right text-[11px] whitespace-nowrap text-red-600">{fmtFracPct(leg.max_drawdown)}</td>
                <td className="px-3 py-1.5 text-right text-[11px] whitespace-nowrap text-red-600">{fmtFracPct(leg.current_drawdown)}</td>
              </>
            ) : (
              <>
                <td className="px-3 py-1.5 border-l-2 border-logo-green/25" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
              </>
            )}
          </tr>
        ));
      })}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientwiseReturns({ accountType }: { accountType: "managed" | "prop" }) {
  const [data, setData] = useState<ClientMonthlyReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInr, setShowInr] = useState(false);
  const [exporting, setExporting] = useState(false);

  useState(() => {
    setLoading(true);
    setError(null);
    fetchClientMonthlyReturns(accountType)
      .then((rows) => setData(rows ?? []))
      .catch((e) => setError(e?.message || "Failed to load client-wise returns."))
      .finally(() => setLoading(false));
  });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/client-monthly-returns/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_type: accountType }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "client-wise-returns.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const { allYears, allMonths } = useMemo(() => {
    const years = Array.from(
      new Set(data.flatMap((e) => [...e.monthly.map((m) => m.year), ...e.yearly.map((y) => y.year)]))
    ).sort();
    const monthSet = new Set(data.flatMap((e) => e.monthly.map((m) => m.month)));
    const months = MONTH_ORDER.filter((m) => monthSet.has(m));
    return { allYears: years, allMonths: months };
  }, [data]);

  const consolidatedClients = useMemo((): ConsolidatedClient[] => {
    const map = new Map<string, ClientMonthlyReturnRow[]>();
    data.forEach((e) => {
      if (!map.has(e.qcode)) map.set(e.qcode, []);
      map.get(e.qcode)!.push(e);
    });
    return Array.from(map.entries())
      .map(([qcode, legs]) => ({
        qcode,
        accountName: legs[0].account_name,
        isMultiStrategy: legs.length > 1,
        legs,
        combinedSinceInceptionPnl: legs.reduce((s, l) => s + l.since_inception_pnl, 0),
        combinedSinceInception: legs.length === 1 ? legs[0].since_inception_absolute : combineSinceInception(legs),
      }))
      .sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [data]);

  const tableWidth = COL.label + COL.year + allMonths.length * COL.month + COL.total + COL.since + COL.xirr + COL.dd * 2;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading client-wise returns…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load client-wise returns.</p>
          <p className="text-red-600/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Client-wise Returns
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-5 flex-shrink-0">
          <label className="flex items-center gap-2 text-sm text-card-text cursor-pointer">
            <span className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${!showInr ? "border-red-500" : "border-card-text-secondary/40"}`}>
              {!showInr && <span className="block h-full w-full scale-50 rounded-full bg-red-500" />}
            </span>
            <input type="radio" className="sr-only" checked={!showInr} onChange={() => setShowInr(false)} />
            % Returns
          </label>
          <label className="flex items-center gap-2 text-sm text-card-text cursor-pointer">
            <span className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${showInr ? "border-red-500" : "border-card-text-secondary/40"}`}>
              {showInr && <span className="block h-full w-full scale-50 rounded-full bg-red-500" />}
            </span>
            <input type="radio" className="sr-only" checked={showInr} onChange={() => setShowInr(true)} />
            ₹ Returns
          </label>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-center gap-3 rounded-t-lg bg-[#e8e4d0]/80 border-l-4 border-logo-green px-5 py-3">
          <span className="text-sm font-semibold text-logo-green">All Clients ({consolidatedClients.length})</span>
        </div>
        <div className="overflow-x-auto border border-t-0 border-logo-green/10 rounded-b-lg bg-white">
          <table className="text-sm" style={{ tableLayout: "fixed", width: "100%", minWidth: tableWidth }}>
            <colgroup>
              <col style={{ width: COL.label }} />
              <col style={{ width: COL.year }} />
              {allMonths.map((m) => <col key={m} style={{ width: COL.month }} />)}
              <col style={{ width: COL.total }} />
              <col style={{ width: COL.since }} />
              <col style={{ width: COL.xirr }} />
              <col style={{ width: COL.dd }} />
              <col style={{ width: COL.dd }} />
            </colgroup>
            <thead>
              <tr className="text-card-text-secondary text-xs border-b border-logo-green/10 bg-white">
                <th className="px-4 py-2.5 text-left font-medium sticky left-0 z-10 bg-white border-r border-logo-green/10">Client</th>
                <th className="px-4 py-2.5 text-left font-medium">Year</th>
                {allMonths.map((m) => (
                  <th key={m} className="px-3 py-2.5 text-right font-medium">{MONTH_SHORT[m]}</th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap border-l-2 border-logo-green/25">Since Inception</th>
                <th className="px-3 py-2.5 text-right font-medium">XIRR</th>
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Max DD</th>
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Current DD</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedClients.map((client) => (
                <ClientRowGroup
                  key={client.qcode}
                  client={client}
                  allYears={allYears}
                  allMonths={allMonths}
                  showInr={showInr}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ClientwiseReturns;