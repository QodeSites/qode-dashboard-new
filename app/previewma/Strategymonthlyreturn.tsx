"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { fetchStrategyMonthlyReturns, type StrategyMonthlyEntry } from "./api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_ORDER = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT: Record<string, string> = {
  January:"JAN", February:"FEB", March:"MAR", April:"APR",
  May:"MAY", June:"JUN", July:"JUL", August:"AUG",
  September:"SEP", October:"OCT", November:"NOV", December:"DEC",
};
const STRATEGY_PREFERRED_ORDER = ["QYE+","QYE++","QAW+","QAW++","QTF++"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtInr(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "+";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
}

// Cell background + text color matching the screenshots
function cellClass(v: number | null) {
  if (v === null) return "";
  return v >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600";
}

// ─── Strategy table ───────────────────────────────────────────────────────────

interface ClientYearRow {
  clientKey: string;
  accountName: string;
  isFirstRow: boolean;
  year: number;
  months: (number | null)[];
  total: number | null;
}

function StrategyTable({
  strategy,
  entries,
  showInr,
}: {
  strategy: string;
  entries: StrategyMonthlyEntry[];
  showInr: boolean;
}) {
  const { allYears, allMonths } = useMemo(() => {
    const years = Array.from(
      new Set(
        entries.flatMap((e) => [
          ...e.monthly.map((m) => m.year),
          ...e.yearly.map((y) => y.year),
        ])
      )
    ).sort();

    const monthSet = new Set(entries.flatMap((e) => e.monthly.map((m) => m.month)));
    const months = MONTH_ORDER.filter((m) => monthSet.has(m));

    return { allYears: years, allMonths: months };
  }, [entries]);

  const rows = useMemo((): ClientYearRow[] => {
    const result: ClientYearRow[] = [];

    const sorted = [...entries].sort((a, b) =>
      a.account_name.localeCompare(b.account_name)
    );

    sorted.forEach((entry) => {
      const clientKey = `${entry.qcode}__${entry.strategy}`;

      const monthMap = new Map<string, { pct: number; inr: number }>();
      entry.monthly.forEach((m) => {
        monthMap.set(`${m.year}-${m.month}`, { pct: m.return_pct, inr: m.pnl_inr });
      });
      const yearMap = new Map<number, { pct: number; inr: number }>();
      entry.yearly.forEach((y) => yearMap.set(y.year, { pct: y.return_pct, inr: y.pnl_inr }));

      allYears.forEach((year, yi) => {
        const months: (number | null)[] = allMonths.map((mName) => {
          const d = monthMap.get(`${year}-${mName}`);
          if (!d) return null;
          return showInr ? d.inr : d.pct;
        });
        const tot = yearMap.get(year);
        const total = tot ? (showInr ? tot.inr : tot.pct) : null;
        result.push({
          clientKey,
          accountName: entry.account_name,
          isFirstRow: yi === 0,
          year,
          months,
          total,
        });
      });
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, showInr, allYears, allMonths]);

  return (
    <div className="mb-8">
      {/* Olive/sage section header matching screenshot */}
      <div className="flex items-center gap-3 rounded-t-lg bg-[#e8e4d0]/80 border-l-4 border-logo-green px-5 py-3">
        <span className="text-sm font-semibold text-logo-green">{strategy} Clients</span>
      </div>
      <div className="overflow-x-auto border border-t-0 border-logo-green/10 rounded-b-lg bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-card-text-secondary text-xs border-b border-logo-green/10 bg-white">
              <th className="px-4 py-2.5 text-left font-medium w-36 sticky left-0 bg-white">Client</th>
              <th className="px-4 py-2.5 text-left font-medium w-16">Year</th>
              {allMonths.map((m) => (
                <th key={m} className="px-3 py-2.5 text-right font-medium">{MONTH_SHORT[m]}</th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isNewClient = row.isFirstRow && i > 0;
              // Check if any month or total has data
              const hasData = row.months.some((v) => v !== null) || row.total !== null;

              return (
                <tr
                  key={`${row.clientKey}-${row.year}`}
                  className={`border-t ${isNewClient ? "border-logo-green/20 border-t-2" : "border-logo-green/5"}`}
                >
                  {/* Client name — only on first year row */}
                  <td className="px-4 py-2 text-card-text font-medium whitespace-nowrap sticky left-0 bg-white">
                    {row.isFirstRow ? (
                      <span className="truncate block max-w-[130px]" title={row.accountName}>
                        {row.accountName}
                      </span>
                    ) : null}
                  </td>
                  <td className={`px-4 py-2 text-card-text-secondary ${!hasData ? "opacity-40" : ""}`}>
                    {row.year}
                  </td>
                  {row.months.map((v, mi) => (
                    <td
                      key={mi}
                      className={`px-3 py-2 text-right whitespace-nowrap text-xs font-medium ${
                        v !== null ? cellClass(v) : "text-card-text-secondary/30"
                      }`}
                    >
                      {v === null ? "—" : showInr ? fmtInr(v) : fmtPct(v)}
                    </td>
                  ))}
                  <td
                    className={`px-4 py-2 text-right font-semibold whitespace-nowrap text-xs ${
                      row.total !== null ? cellClass(row.total) : "text-card-text-secondary/30"
                    }`}
                  >
                    {row.total === null ? "—" : showInr ? fmtInr(row.total) : fmtPct(row.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StrategyMonthlyReturns() {
  const [data, setData] = useState<StrategyMonthlyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInr, setShowInr] = useState(false);

  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/strategy-monthly-returns/export", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "strategy-monthly-returns.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    fetchStrategyMonthlyReturns()
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load strategy monthly returns."))
      .finally(() => setLoading(false));
  }, []);

  // Group by strategy in preferred order
  const grouped = useMemo(() => {
    const map = new Map<string, StrategyMonthlyEntry[]>();
    data.forEach((e) => {
      if (!map.has(e.strategy)) map.set(e.strategy, []);
      map.get(e.strategy)!.push(e);
    });
    const known = STRATEGY_PREFERRED_ORDER.filter((s) => map.has(s));
    const unknown = Array.from(map.keys()).filter((s) => !STRATEGY_PREFERRED_ORDER.includes(s)).sort();
    return [...known, ...unknown].map((s) => ({ strategy: s, entries: map.get(s)! }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading strategy monthly returns…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load strategy monthly returns.</p>
          <p className="text-red-600/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header + toggle */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Strategy-wise Client Monthly Returns
          </span>
        </div>

        {/* % / ₹ toggle + Export */}
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

      {/* One table per strategy */}
      {grouped.map(({ strategy, entries }) => (
        <StrategyTable
          key={strategy}
          strategy={strategy}
          entries={entries}
          showInr={showInr}
        />
      ))}
    </div>
  );
}

export default StrategyMonthlyReturns;