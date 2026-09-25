"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Download, ChevronRight, Layers } from "lucide-react";
import { fetchClientMonthlyReturns, type StrategyMonthlyEntry } from "./api";

const MONTH_ORDER = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT: Record<string, string> = {
  January:"JAN", February:"FEB", March:"MAR", April:"APR",
  May:"MAY", June:"JUN", July:"JUL", August:"AUG",
  September:"SEP", October:"OCT", November:"NOV", December:"DEC",
};

function fmtPct(v: number | null) {
  if (v === null || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtInr(v: number | null) {
  if (v === null || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "+";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
}
function cellClass(v: number | null) {
  if (v === null) return "text-card-text-secondary/30";
  return v >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600";
}

// Combining % returns across strategies isn't a simple average — back out
// each leg's implied base value from its own pnl_inr/return_pct, then
// value-weight the combined percentage off those bases.
function impliedBase(pnlInr: number, returnPct: number): number | null {
  if (returnPct === 0) return null; // can't infer a base from a 0% leg
  return pnlInr / (returnPct / 100);
}
function combinePctAndInr(legs: { pnlInr: number; returnPct: number }[]): { pct: number | null; inr: number } {
  const totalInr = legs.reduce((sum, l) => sum + l.pnlInr, 0);
  let totalBase = 0;
  let anyBase = false;
  legs.forEach((l) => {
    const base = impliedBase(l.pnlInr, l.returnPct);
    if (base !== null) {
      totalBase += base;
      anyBase = true;
    }
  });
  const pct = anyBase && totalBase !== 0 ? (totalInr / totalBase) * 100 : (legs.length > 0 ? 0 : null);
  return { pct, inr: totalInr };
}

interface ConsolidatedClient {
  qcode: string;
  accountName: string;
  strategies: string[]; // e.g. ["QYE+", "QYE++"] — for the Multi-Strategy breakdown
  legs: StrategyMonthlyEntry[]; // raw per-strategy entries, for the expandable breakdown
}

interface ClientYearRow {
  clientKey: string;
  isFirstRow: boolean;
  year: number;
  months: (number | null)[];
  monthsInr: (number | null)[];
  total: number | null;
  totalInr: number | null;
}

function buildYearRows(
  legs: { monthly: StrategyMonthlyEntry["monthly"] }[],
  allYears: number[],
  allMonths: string[]
): ClientYearRow[] {
  const result: ClientYearRow[] = [];
  allYears.forEach((year, yi) => {
    const months: (number | null)[] = [];
    const monthsInr: (number | null)[] = [];
    allMonths.forEach((mName) => {
      const legsForMonth = legs
        .flatMap((l) => l.monthly)
        .filter((m) => m.year === year && m.month === mName)
        .map((m) => ({ pnlInr: m.pnl_inr, returnPct: m.return_pct }));
      if (legsForMonth.length === 0) {
        months.push(null);
        monthsInr.push(null);
      } else {
        const combined = combinePctAndInr(legsForMonth);
        months.push(combined.pct);
        monthsInr.push(combined.inr);
      }
    });

    const yearLegs = legs
      .flatMap((l) => l.monthly)
      .filter((m) => m.year === year)
      .map((m) => ({ pnlInr: m.pnl_inr, returnPct: m.return_pct }));
    const yearCombined = yearLegs.length > 0 ? combinePctAndInr(yearLegs) : { pct: null, inr: null };

    result.push({
      clientKey: "", // filled by caller
      isFirstRow: yi === 0,
      year,
      months,
      monthsInr,
      total: yearCombined.pct,
      totalInr: yearCombined.inr,
    });
  });
  return result;
}

function ClientRowGroup({
  client, allYears, allMonths, showInr,
}: {
  client: ConsolidatedClient; allYears: number[]; allMonths: string[]; showInr: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isMultiStrategy = client.strategies.length > 1;

  const consolidatedRows = useMemo(
    () => buildYearRows(client.legs, allYears, allMonths).map((r) => ({ ...r, clientKey: client.qcode })),
    [client, allYears, allMonths]
  );

  return (
    <>
      {consolidatedRows.map((row, i) => (
        <tr
          key={`${client.qcode}-${row.year}`}
          className={`border-t ${row.isFirstRow && i > 0 ? "border-logo-green/20 border-t-2" : "border-logo-green/5"}`}
        >
          <td className="px-4 py-2 text-card-text font-medium whitespace-nowrap sticky left-0 bg-white">
            {row.isFirstRow ? (
              <div className="flex items-center gap-1.5">
                {isMultiStrategy && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-card-text-secondary hover:text-logo-green flex-shrink-0"
                    title="Show strategy breakdown"
                  >
                    <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </button>
                )}
                <span className="truncate block max-w-[150px]" title={client.accountName}>
                  {client.accountName}
                </span>
                {isMultiStrategy && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 flex-shrink-0"
                    title={`Combines: ${client.strategies.join(", ")}`}
                  >
                    <Layers className="h-2.5 w-2.5" />
                    Multi-Strategy
                  </span>
                )}
              </div>
            ) : null}
          </td>
          <td className="px-4 py-2 text-card-text-secondary">{row.year}</td>
          {(showInr ? row.monthsInr : row.months).map((v, mi) => (
            <td key={mi} className={`px-3 py-2 text-right whitespace-nowrap text-xs font-medium ${cellClass(v)}`}>
              {v === null ? "—" : showInr ? fmtInr(v) : fmtPct(v)}
            </td>
          ))}
          <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap text-xs ${cellClass(showInr ? row.totalInr : row.total)}`}>
            {showInr ? fmtInr(row.totalInr) : fmtPct(row.total)}
          </td>
        </tr>
      ))}

      {/* Expandable per-strategy breakdown for multi-strategy clients */}
      {isMultiStrategy && expanded && client.legs.map((leg) => {
        const legRows = buildYearRows([leg], allYears, allMonths);
        return legRows.map((row, i) => (
          <tr key={`${client.qcode}-${leg.strategy}-${row.year}`} className="border-t border-logo-green/5 bg-primary-bg/20">
            <td className="px-4 py-1.5 text-card-text-secondary text-xs whitespace-nowrap sticky left-0 bg-primary-bg/20 pl-9">
              {i === 0 ? `↳ ${leg.strategy}` : ""}
            </td>
            <td className="px-4 py-1.5 text-card-text-secondary text-xs">{row.year}</td>
            {(showInr ? row.monthsInr : row.months).map((v, mi) => (
              <td key={mi} className={`px-3 py-1.5 text-right whitespace-nowrap text-[11px] ${v !== null ? (v >= 0 ? "text-green-700" : "text-red-600") : "text-card-text-secondary/30"}`}>
                {v === null ? "—" : showInr ? fmtInr(v) : fmtPct(v)}
              </td>
            ))}
            <td className={`px-4 py-1.5 text-right font-medium whitespace-nowrap text-[11px] ${(showInr ? row.totalInr : row.total) !== null ? ((showInr ? row.totalInr! : row.total!) >= 0 ? "text-green-700" : "text-red-600") : "text-card-text-secondary/30"}`}>
              {showInr ? fmtInr(row.totalInr) : fmtPct(row.total)}
            </td>
          </tr>
        ));
      })}
    </>
  );
}

export function ClientwiseReturns({ accountType }: { accountType: "managed" | "prop" }) {
  const [data, setData] = useState<StrategyMonthlyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInr, setShowInr] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchClientMonthlyReturns(accountType)
      .then((rows) => setData(rows ?? []))
      .catch((e) => setError(e?.message || "Failed to load client-wise returns."))
      .finally(() => setLoading(false));
  }, [accountType]);

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
    const map = new Map<string, StrategyMonthlyEntry[]>();
    data.forEach((e) => {
      if (!map.has(e.qcode)) map.set(e.qcode, []);
      map.get(e.qcode)!.push(e);
    });
    return Array.from(map.entries())
      .map(([qcode, legs]) => ({
        qcode,
        accountName: legs[0].account_name,
        strategies: legs.map((l) => l.strategy),
        legs,
      }))
      .sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [data]);

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
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Client-wise Returns
          </span>
        </div>

        <div className="flex items-center gap-5 flex-shrink-0">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-card-text-secondary text-xs border-b border-logo-green/10 bg-white">
                <th className="px-4 py-2.5 text-left font-medium w-44 sticky left-0 bg-white">Client</th>
                <th className="px-4 py-2.5 text-left font-medium w-16">Year</th>
                {allMonths.map((m) => (
                  <th key={m} className="px-3 py-2.5 text-right font-medium">{MONTH_SHORT[m]}</th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
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