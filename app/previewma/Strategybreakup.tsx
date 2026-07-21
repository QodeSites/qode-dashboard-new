"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, X, ChevronDown, Download } from "lucide-react";
import { fetchStrategyBreakup, type StrategyBreakupRow } from "./api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPct(v: number | null, digits = 2) {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

function fmtNum(v: number | null, digits = 3) {
  if (v === null || v === undefined) return "—";
  return v.toFixed(digits);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Optional ratio columns config ───────────────────────────────────────────

const RATIO_COLUMNS = [
  { key: "sharpe", label: "Sharpe", fmt: (v: number | null) => fmtNum(v) },
  { key: "sortino", label: "Sortino", fmt: (v: number | null) => fmtNum(v) },
  { key: "calmar", label: "Calmar", fmt: (v: number | null) => fmtNum(v) },
  { key: "ann_volatility", label: "Volatility (Ann.)", fmt: (v: number | null) => fmtPct(v) },
  { key: "tracking_error", label: "Tracking Error", fmt: (v: number | null) => fmtPct(v) },
  { key: "information_ratio", label: "Information Ratio", fmt: (v: number | null) => fmtNum(v) },
  { key: "alpha", label: "Alpha", fmt: (v: number | null) => fmtPct(v) },
  { key: "beta", label: "Beta", fmt: (v: number | null) => fmtNum(v) },
] as const;

type RatioKey = typeof RATIO_COLUMNS[number]["key"];

const STRATEGY_ORDER = ["QYE+", "QYE++", "QAW+", "QAW++", "QTF++"];

// Color coding helpers
function returnClass(v: number) {
  return v >= 0 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50";
}
function drawdownClass(v: number) {
  return "text-red-700 bg-red-50";
}
function captureClass(v: number | null) {
  if (v === null) return "";
  return v >= 0 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50";
}

// ─── Column selector dropdown ─────────────────────────────────────────────────

function ColumnSelector({
  selected,
  onChange,
}: {
  selected: RatioKey[];
  onChange: (cols: RatioKey[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(key: RatioKey) {
    onChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    );
  }

  return (
    <div className="relative mb-6">
      <p className="text-sm text-card-text-secondary mb-2">Optional ratio columns to include</p>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-logo-green/20 bg-white px-3 py-2 cursor-pointer hover:border-logo-green/40 transition-colors"
      >
        {selected.length === 0 ? (
          <span className="text-sm text-card-text-secondary/60">Select columns…</span>
        ) : (
          selected.map((key) => {
            const col = RATIO_COLUMNS.find((c) => c.key === key)!;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-2.5 py-0.5 text-xs font-medium text-card-text"
              >
                {col.label}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(key); }}
                  className="text-card-text-secondary hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })
        )}
        <ChevronDown className={`h-4 w-4 text-card-text-secondary ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-logo-green/15 bg-white shadow-lg py-1">
          {RATIO_COLUMNS.map((col) => {
            const isSelected = selected.includes(col.key);
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => toggle(col.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${isSelected ? "text-logo-green font-medium bg-primary-bg/50" : "text-card-text hover:bg-primary-bg/30"
                  }`}
              >
                <span className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "border-logo-green bg-logo-green" : "border-card-text-secondary/40"}`}>
                  {isSelected && <span className="block h-2 w-2 rounded-sm bg-white" />}
                </span>
                {col.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Per-strategy table ───────────────────────────────────────────────────────

function StrategyTable({
  strategy,
  rows,
  selectedRatios,
}: {
  strategy: string;
  rows: StrategyBreakupRow[];
  selectedRatios: RatioKey[];
}) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.account_name.localeCompare(b.account_name)),
    [rows]
  );

  const selectedCols = RATIO_COLUMNS.filter((c) => selectedRatios.includes(c.key));

  return (
    <div className="mb-8">
      {/* Strategy header */}
      <div className="flex items-center gap-3 border-l-[3px] border-logo-green pl-3.5 mb-3">
        <span className="text-sm font-bold text-logo-green">{strategy} Clients</span>
        <span className="text-xs text-card-text-secondary">({rows.length})</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/40 text-card-text-secondary text-xs">
              <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Client</th>
              <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Inception Date</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Return Since Inception</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Benchmark Return</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Max Drawdown</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Current Drawdown</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Upside Capture</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Downside Capture</th>
              {selectedCols.map((col) => (
                <th key={col.key} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={`${row.qcode}-${row.strategy}`} className="border-t border-logo-green/5 hover:bg-primary-bg/20 transition-colors">
                <td className="px-4 py-2.5 text-card-text font-medium whitespace-nowrap">
                  {row.account_name} {row.strategy}
                </td>
                <td className="px-4 py-2.5 text-card-text-secondary whitespace-nowrap">
                  {fmtDate(row.inception_date)}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${returnClass(row.since_inception)}`}>
                  {fmtPct(row.since_inception)}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${returnClass(row.benchmark_return)}`}>
                  {fmtPct(row.benchmark_return)}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${drawdownClass(row.max_drawdown)}`}>
                  {fmtPct(row.max_drawdown)}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${drawdownClass(row.current_drawdown)}`}>
                  {fmtPct(row.current_drawdown)}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${captureClass(row.upside_capture)}`}>
                  {row.upside_capture === null ? "—" : fmtPct(row.upside_capture)}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${captureClass(row.downside_capture)}`}>
                  {row.downside_capture === null ? "—" : fmtPct(row.downside_capture)}
                </td>
                {selectedCols.map((col) => {
                  const v = row[col.key as keyof StrategyBreakupRow] as number | null;
                  return (
                    <td key={col.key} className="px-4 py-2.5 text-right text-card-text-secondary whitespace-nowrap">
                      {v === null ? "—" : col.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface StrategyBreakupProps {
  riskFreeRate?: number;
  fetchTrigger?: number;
}

export function StrategyBreakup({ riskFreeRate = 0.065, fetchTrigger = 0 }: StrategyBreakupProps) {
  const [data, setData] = useState<StrategyBreakupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/strategy-breakup/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risk_free_rate: riskFreeRate,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "strategy-wise-client-breakup.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const [selectedRatios, setSelectedRatios] = useState<RatioKey[]>(
    RATIO_COLUMNS.map((c) => c.key)
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStrategyBreakup(riskFreeRate)
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load strategy breakup."))
      .finally(() => setLoading(false));
    // fetchTrigger increments when the "Apply" button is clicked —
    // that's the only time we re-fetch with the updated riskFreeRate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTrigger]);

  // Group rows by strategy, in preferred order
  const grouped = useMemo(() => {
    const map = new Map<string, StrategyBreakupRow[]>();
    // Only show active clients (end_date is null)
    data.filter((row) => !row.end_date).forEach((row) => {
      if (!map.has(row.strategy)) map.set(row.strategy, []);
      map.get(row.strategy)!.push(row);
    });
    // Sort strategies in preferred order, then alphabetically for unknowns
    const knownOrder = STRATEGY_ORDER.filter((s) => map.has(s));
    const unknown = Array.from(map.keys()).filter((s) => !STRATEGY_ORDER.includes(s)).sort();
    return [...knownOrder, ...unknown].map((s) => ({ strategy: s, rows: map.get(s)! }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading strategy breakup…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load strategy breakup.</p>
          <p className="text-red-600/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
     <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Strategy-wise Client Breakup
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
          />
          <span className="text-card-text-secondary text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
          />
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors disabled:opacity-60"
          >
            {exporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />
            }
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        </div>
      </div>

      <ColumnSelector selected={selectedRatios} onChange={setSelectedRatios} />

      {grouped.map(({ strategy, rows }) => (
        <StrategyTable
          key={strategy}
          strategy={strategy}
          rows={rows}
          selectedRatios={selectedRatios}
        />
      ))}
    </div>
  );
}

export default StrategyBreakup;