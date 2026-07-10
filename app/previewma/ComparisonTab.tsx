"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Loader2, Plus, X, ChevronDown } from "lucide-react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  fetchClients, fetchSystemTags,
  type ClientListItem,
} from "./api";
import { SearchableSelect } from "./Searchableselect";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompareMetrics {
  start_date: string;
  end_date: string;
  since_inception: number;
  since_inception_pnl: number;
  max_drawdown: number;
  current_drawdown: number;
  monthly: { year: number; month: string; return_pct: number; pnl_inr: number }[];
  quarterly: { year: number; quarter: string; return_pct: number; pnl_inr: number }[];
  yearly: { year: number; return_pct: number; pnl_inr: number }[];
  series: { date: string; nav: number; drawdown: number }[];
}

interface CompareResult {
  qcode: string;
  system_tag: string;
  metrics: CompareMetrics;
  benchmark_overview: {
    since_inception: number;
    max_drawdown: number;
    current_drawdown: number;
  };
}

interface CompareResponse {
  benchmark_series: { date: string; nav: number }[];
  results: CompareResult[];
}

interface SelectionRow {
  id: string;
  qcode: string | null;
  strategy: string | null;
  selectedTags: string[];
  availableTags: string[];
  tagsLoading: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#02422B", "#E07B39", "#DABD38", "#1D4ED8", "#B91C1C",
  "#4A9D7A", "#7C3AED", "#0891B2", "#065F46", "#6B7280",
];

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }
function emptyRow(): SelectionRow {
  return { id: uid(), qcode: null, strategy: null, selectedTags: [], availableTags: [], tagsLoading: false };
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }

// Derive benchmark drawdown from NAV series
function deriveDrawdown(series: { date: string; nav: number }[]) {
  let peak = -Infinity;
  return series.map((p) => {
    peak = Math.max(peak, p.nav);
    return { date: p.date, dd: ((p.nav - peak) / peak) * 100 };
  });
}

// ─── Multi-select tag dropdown ────────────────────────────────────────────────

function TagMultiSelect({
  tags, selected, onChange, disabled, loading,
}: {
  tags: string[]; selected: string[];
  onChange: (v: string[]) => void; disabled?: boolean; loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  }

  return (
    <div className="relative" ref={ref}>
      <div
        role="button" tabIndex={0}
        onClick={() => !disabled && !loading && setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter") setOpen((v) => !v); }}
        className={`min-h-[40px] flex flex-wrap items-center gap-1 rounded-lg border border-logo-green/20 bg-white px-2.5 py-1.5 cursor-pointer ${disabled || loading ? "opacity-50 pointer-events-none" : "hover:border-logo-green/40"}`}
      >
        {loading ? (
          <span className="text-xs text-card-text-secondary flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Loading…</span>
        ) : selected.length === 0 ? (
          <span className="text-sm text-card-text-secondary/60">Select tags…</span>
        ) : (
          selected.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded bg-primary-bg px-1.5 py-0.5 text-xs text-card-text">
              {t.length > 20 ? t.slice(0, 18) + "…" : t}
              <button type="button" onClick={(e) => { e.stopPropagation(); toggle(t); }} className="hover:text-red-600">×</button>
            </span>
          ))
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-card-text-secondary ml-auto flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && tags.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-logo-green/15 bg-white shadow-lg py-1">
          {tags.map((tag) => {
            const checked = selected.includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggle(tag)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${checked ? "bg-primary-bg/60 text-logo-green font-medium" : "text-card-text hover:bg-primary-bg/30"}`}>
                <span className={`h-3.5 w-3.5 rounded border flex-shrink-0 ${checked ? "border-logo-green bg-logo-green" : "border-card-text-secondary/40"}`}>
                  {checked && <span className="block w-full h-full scale-50 rounded-sm bg-white" />}
                </span>
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Selection Row ────────────────────────────────────────────────────────────

function SelectionRowComponent({
  row, index, clients, onUpdate, onRemove, canRemove,
}: {
  row: SelectionRow; index: number; clients: ClientListItem[];
  onUpdate: (id: string, patch: Partial<SelectionRow>) => void;
  onRemove: (id: string) => void; canRemove: boolean;
}) {
  const clientOptions = clients.map((c) => ({ value: c.qcode, label: c.account_name, sublabel: c.qcode }));
  const selectedClient = clients.find((c) => c.qcode === row.qcode);
  const realStrategies = (selectedClient?.strategies || []).filter((s) => s.strategy !== "combined");
  const isSingle = realStrategies.length === 1;
  const strategyOptions = isSingle
    ? realStrategies.map((s) => ({ value: s.strategy, label: s.strategy }))
    : (selectedClient?.strategies || []).map((s) => ({
        value: s.strategy,
        label: s.strategy === "combined" ? "Combined (all strategies)" : s.strategy,
      }));

  async function loadTags(qcode: string, strategy: string) {
    onUpdate(row.id, { tagsLoading: true, availableTags: [], selectedTags: [] });
    try {
      const tags = await fetchSystemTags(qcode, strategy);
      onUpdate(row.id, { availableTags: tags, tagsLoading: false });
    } catch {
      onUpdate(row.id, { tagsLoading: false });
    }
  }

  function handleClientChange(qcode: string) {
    const client = clients.find((c) => c.qcode === qcode);
    const real = (client?.strategies || []).filter((s) => s.strategy !== "combined");
    const strategy = real.length === 1 ? real[0].strategy
      : (client?.strategies.find((s) => s.strategy === "combined")?.strategy || null);
    onUpdate(row.id, { qcode, strategy, selectedTags: [], availableTags: [] });
    if (qcode && strategy) loadTags(qcode, strategy);
  }

  function handleStrategyChange(strategy: string) {
    onUpdate(row.id, { strategy, selectedTags: [], availableTags: [] });
    if (row.qcode) loadTags(row.qcode, strategy);
  }

  return (
    <div className="grid grid-cols-[20px_1fr_1fr_1.5fr_28px] gap-3 items-start">
      <div className="flex items-center pt-8">
        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 mt-1"
          style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
      </div>
      <SearchableSelect
        label={index === 0 ? "Client" : undefined}
        placeholder="Select client"
        options={clientOptions}
        value={row.qcode}
        onChange={handleClientChange}
      />
      <SearchableSelect
        label={index === 0 ? "Strategy" : undefined}
        placeholder="Select strategy"
        options={strategyOptions}
        value={row.strategy}
        onChange={handleStrategyChange}
        disabled={!row.qcode}
      />
      <div>
        {index === 0 && <div className="text-xs font-semibold uppercase tracking-wide text-card-text-secondary mb-1.5">System Tags</div>}
        <TagMultiSelect
          tags={row.availableTags}
          selected={row.selectedTags}
          onChange={(tags) => onUpdate(row.id, { selectedTags: tags })}
          disabled={!row.strategy || row.availableTags.length === 0}
          loading={row.tagsLoading}
        />
      </div>
      <div className={index === 0 ? "pt-6" : ""}>
        {canRemove && (
          <button type="button" onClick={() => onRemove(row.id)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-card-text-secondary hover:text-red-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ComparisonTab() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [rows, setRows] = useState<SelectionRow[]>([emptyRow(), emptyRow()]);
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareNifty, setCompareNifty] = useState(true);
  const [returnFreq, setReturnFreq] = useState<"monthly" | "quarterly" | "yearly">("monthly");

  useEffect(() => { fetchClients().then(setClients).catch(() => {}); }, []);

  const updateRow = useCallback((id: string, patch: Partial<SelectionRow>) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Build selections payload — one entry per client row that has tags selected
  const selections = useMemo(() => {
    return rows
      .filter((r) => r.qcode && r.selectedTags.length > 0)
      .map((r) => ({ qcode: r.qcode!, system_tags: r.selectedTags }));
  }, [rows]);

  const canCompare = selections.length > 0;

  async function handleCompare() {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/portfolio-review/compare", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: CompareResponse = await res.json();
      setCompareData(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load comparison data.");
    } finally {
      setLoading(false);
    }
  }

  // Build chart data — one key per result tag
  const chartData = useMemo(() => {
    if (!compareData) return [];
    const dateMap = new Map<string, Record<string, number | null>>();

    compareData.results.forEach((r) => {
      r.metrics.series.forEach((p) => {
        if (!dateMap.has(p.date)) dateMap.set(p.date, {});
        const row = dateMap.get(p.date)!;
        const key = `${r.qcode}__${r.system_tag}`;
        row[`nav__${key}`] = p.nav;
        row[`cum__${key}`] = ((p.nav - 100) / 100) * 100;
        row[`dd__${key}`] = p.drawdown * 100;
      });
    });

    if (compareNifty && compareData.benchmark_series) {
      const benchDd = deriveDrawdown(compareData.benchmark_series);
      compareData.benchmark_series.forEach((p, i) => {
        if (!dateMap.has(p.date)) dateMap.set(p.date, {});
        const row = dateMap.get(p.date)!;
        row["nav__Nifty50"] = p.nav;
        row["cum__Nifty50"] = ((p.nav - 100) / 100) * 100;
        row["dd__Nifty50"] = benchDd[i]?.dd ?? null;
      });
    }

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [compareData, compareNifty]);

  // All lines for charts
  const allLines = useMemo(() => {
    if (!compareData) return [];
    const lines = compareData.results.map((r, i) => {
      const client = clients.find((c) => c.qcode === r.qcode);
      const clientName = client?.account_name || r.qcode;
      return {
        key: `${r.qcode}__${r.system_tag}`,
        label: `${clientName} ${r.system_tag}`,
        color: CHART_COLORS[i % CHART_COLORS.length],
        isNifty: false,
      };
    });
    if (compareNifty) lines.push({ key: "Nifty50", label: "Nifty50", color: "#6B7280", isNifty: true });
    return lines;
  }, [compareData, compareNifty, clients]);

  // One row-group per tag (client name + tag as label)
  const monthlyGroups = useMemo(() => {
    if (!compareData) return [];
    return compareData.results.map((r) => {
      const client = clients.find((c) => c.qcode === r.qcode);
      const clientName = client?.account_name || r.qcode;
      const label = `${clientName} ${r.system_tag}`;
      const years = Array.from(new Set(r.metrics.monthly.map((m) => m.year))).sort() as number[];
      return { label, result: r, years };
    });
  }, [compareData, clients]);

  return (
    <div>
      <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1 mb-6">
        <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
          Client Comparison
        </span>
      </div>

      {/* Selection rows */}
      <div className="bg-white rounded-xl border border-logo-green/10 p-5 mb-5">
        <div className="space-y-3">
          {rows.map((row, i) => (
            <SelectionRowComponent
              key={row.id} row={row} index={i} clients={clients}
              onUpdate={updateRow} onRemove={removeRow} canRemove={rows.length > 1}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          {rows.length < 5 && (
            <button type="button" onClick={() => setRows((p) => [...p, emptyRow()])}
              className="inline-flex items-center gap-2 rounded-lg border border-logo-green/20 px-4 py-2 text-sm text-logo-green hover:bg-primary-bg/40 transition-colors">
              <Plus className="h-4 w-4" />
              Add client
            </button>
          )}
          <button type="button" onClick={handleCompare} disabled={!canCompare || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-5 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors disabled:opacity-50">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Loading…" : "Compare"}
          </button>
          <label className="flex items-center gap-2 text-sm text-card-text cursor-pointer ml-2">
            <input type="checkbox" checked={compareNifty} onChange={(e) => setCompareNifty(e.target.checked)}
              className="h-4 w-4 rounded accent-logo-green" />
            Compare with Nifty50
          </label>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
      </div>

      {!compareData && !loading && (
        <p className="text-sm text-card-text-secondary italic text-center py-12">
          Select clients, strategies and system tags above, then click Compare.
        </p>
      )}

      {compareData && (
        <>
          {/* Overview table — one row per tag, grouped by client */}
          <div className="bg-white rounded-lg border border-logo-green/10 mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-bg/40 text-card-text-secondary text-xs border-b border-logo-green/10">
                  <th className="px-4 py-2.5 text-left font-medium">Client</th>
                  <th className="px-4 py-2.5 text-left font-medium">System Tag</th>
                  <th className="px-4 py-2.5 text-left font-medium">Start Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">End Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Since Inception</th>
                  <th className="px-4 py-2.5 text-right font-medium">Since Inception P&L</th>
                  <th className="px-4 py-2.5 text-right font-medium">Max Drawdown</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current Drawdown</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let prevQcode = "";
                  return compareData.results.map((r, i) => {
                    const client = clients.find((c) => c.qcode === r.qcode);
                    const name = client?.account_name || r.qcode;
                    const rowIndex = rows.findIndex((row) => row.qcode === r.qcode);
                    const color = CHART_COLORS[rowIndex >= 0 ? rowIndex : i % CHART_COLORS.length];
                    const isNewClient = r.qcode !== prevQcode;
                    prevQcode = r.qcode;
                    return (
                      <tr key={`${r.qcode}-${r.system_tag}`}
                        className={`border-t ${isNewClient && i > 0 ? "border-t-2 border-logo-green/20" : "border-logo-green/5"} hover:bg-primary-bg/20 transition-colors`}>
                        <td className="px-4 py-2.5 font-medium text-card-text whitespace-nowrap">
                          {isNewClient ? (
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                              {name}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-card-text-secondary whitespace-nowrap">{r.system_tag}</td>
                        <td className="px-4 py-2.5 text-card-text-secondary">{r.metrics.start_date}</td>
                        <td className="px-4 py-2.5 text-card-text-secondary">{r.metrics.end_date}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${r.metrics.since_inception >= 0 ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
                          {fmtPct(r.metrics.since_inception * 100)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${r.metrics.since_inception_pnl >= 0 ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
                          {r.metrics.since_inception_pnl >= 0 ? "+" : ""}₹{Math.abs(r.metrics.since_inception_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600 bg-red-50">
                          {fmtPct(r.metrics.max_drawdown * 100)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600 bg-red-50">
                          {fmtPct(r.metrics.current_drawdown * 100)}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          {/* NAV Time Series */}
          <div className="bg-white rounded-lg border border-logo-green/10 p-4 mb-5">
            <div className="text-sm font-semibold text-card-text mb-3">NAV Time Series</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#E8E4D4" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#555" }} minTickGap={50} tickFormatter={fmtDate} />
                <YAxis tick={{ fontSize: 9, fill: "#555" }} width={35} domain={["auto", "auto"]} />
                <Tooltip labelFormatter={fmtDate}
                  formatter={(v: number, name: string) => [v?.toFixed(2), allLines.find(l => `nav__${l.key}` === name)?.label || name]} />
                <Legend formatter={(name) => allLines.find(l => `nav__${l.key}` === name)?.label || name} wrapperStyle={{ fontSize: 11 }} />
                {allLines.map((l) => (
                  <Line key={l.key} type="monotone" dataKey={`nav__${l.key}`}
                    stroke={l.color} strokeWidth={l.isNifty ? 1.5 : 2}
                    strokeDasharray={l.isNifty ? "4 2" : undefined} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cumulative Return */}
          <div className="bg-white rounded-lg border border-logo-green/10 p-4 mb-5">
            <div className="text-sm font-semibold text-card-text mb-3">Cumulative Return (%)</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#E8E4D4" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#555" }} minTickGap={50} tickFormatter={fmtDate} />
                <YAxis tick={{ fontSize: 9, fill: "#555" }} width={40} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                <Tooltip labelFormatter={fmtDate}
                  formatter={(v: number, name: string) => [`${v?.toFixed(2)}%`, allLines.find(l => `cum__${l.key}` === name)?.label || name]} />
                <Legend formatter={(name) => allLines.find(l => `cum__${l.key}` === name)?.label || name} wrapperStyle={{ fontSize: 11 }} />
                {allLines.map((l) => (
                  <Line key={l.key} type="monotone" dataKey={`cum__${l.key}`}
                    stroke={l.color} strokeWidth={l.isNifty ? 1.5 : 2}
                    strokeDasharray={l.isNifty ? "4 2" : undefined} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Drawdown */}
          <div className="bg-white rounded-lg border border-logo-green/10 p-4 mb-5">
            <div className="text-sm font-semibold text-card-text mb-3">Drawdown (%)</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <CartesianGrid stroke="#E8E4D4" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#555" }} minTickGap={50} tickFormatter={fmtDate} />
                <YAxis tick={{ fontSize: 9, fill: "#555" }} width={40} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip labelFormatter={fmtDate}
                  formatter={(v: number, name: string) => [`${v?.toFixed(2)}%`, allLines.find(l => `dd__${l.key}` === name)?.label || name]} />
                <Legend formatter={(name) => allLines.find(l => `dd__${l.key}` === name)?.label || name} wrapperStyle={{ fontSize: 11 }} />
                {allLines.map((l) => (
                  <Area key={l.key} type="monotone" dataKey={`dd__${l.key}`}
                    stroke={l.color} fill={l.color}
                    fillOpacity={l.isNifty ? 0.08 : 0.12}
                    strokeWidth={l.isNifty ? 1.5 : 1.5}
                    strokeDasharray={l.isNifty ? "4 2" : undefined}
                    dot={false} connectNulls />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Returns — Monthly / Quarterly / Yearly tabs */}
          <div className="bg-white rounded-lg border border-logo-green/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-card-text">Returns</div>
              <div className="flex items-center gap-1 rounded-lg bg-primary-bg/60 border border-logo-green/10 p-1">
                {(["monthly", "quarterly", "yearly"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setReturnFreq(f)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${returnFreq === f ? "bg-white text-logo-green shadow-sm" : "text-card-text-secondary hover:text-card-text"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-logo-green/10 text-card-text-secondary">
                    <th className="px-3 py-2 text-left font-medium w-32">Client</th>
                    <th className="px-3 py-2 text-left font-medium w-12">Year</th>
                    {returnFreq === "monthly" && MONTH_SHORT.map((m) => (
                      <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>
                    ))}
                    {returnFreq === "quarterly" && ["Q1","Q2","Q3","Q4"].map((q) => (
                      <th key={q} className="px-3 py-2 text-right font-medium">{q}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyGroups.map(({ label, result: r, years }, gi) => (
                    years.map((yr, yi) => (
                      <tr key={`${r.qcode}-${r.system_tag}-${yr}`}
                        className={`border-t ${yi === 0 && gi > 0 ? "border-t-2 border-logo-green/20" : "border-logo-green/5"}`}>
                        <td className="px-3 py-2 font-medium text-card-text">
                          {yi === 0 ? (
                            <span className="block text-xs whitespace-nowrap" title={label}>{label}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-card-text-secondary">{yr}</td>

                        {returnFreq === "monthly" && MONTHS.map((mName) => {
                          const m = r.metrics.monthly.find((m) => m.year === yr && m.month === mName);
                          const v = m?.return_pct ?? null;
                          const tagSuffix = r.system_tag.split(" ").slice(-1)[0];
                          return (
                            <td key={mName} className="px-2 py-2 text-right">
                              <div className={`flex items-center justify-end gap-1 ${v === null ? "text-card-text-secondary/30" : v >= 0 ? "text-green-700" : "text-red-600"}`}>
                                {v !== null && <span className="text-[10px] text-card-text-secondary/60">{tagSuffix}</span>}
                                {v === null ? "—" : fmtPct(v)}
                              </div>
                            </td>
                          );
                        })}

                        {returnFreq === "quarterly" && ["Q1","Q2","Q3","Q4"].map((q) => {
                          const qt = r.metrics.quarterly.find((qt) => qt.year === yr && qt.quarter === q);
                          const v = qt?.return_pct ?? null;
                          const tagSuffix = r.system_tag.split(" ").slice(-1)[0];
                          return (
                            <td key={q} className="px-3 py-2 text-right">
                              <div className={`flex items-center justify-end gap-1 ${v === null ? "text-card-text-secondary/30" : v >= 0 ? "text-green-700" : "text-red-600"}`}>
                                {v !== null && <span className="text-[10px] text-card-text-secondary/60">{tagSuffix}</span>}
                                {v === null ? "—" : fmtPct(v)}
                              </div>
                            </td>
                          );
                        })}

                        <td className="px-3 py-2 text-right">
                          {(() => {
                            const tot = r.metrics.yearly.find((y) => y.year === yr);
                            const tagSuffix = r.system_tag.split(" ").slice(-1)[0];
                            return (
                              <div className={`flex items-center justify-end gap-1 font-semibold ${!tot ? "text-card-text-secondary/30" : tot.return_pct >= 0 ? "text-green-700" : "text-red-600"}`}>
                                {tot && <span className="text-[10px] text-card-text-secondary/60">{tagSuffix}</span>}
                                {tot ? fmtPct(tot.return_pct) : "—"}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ComparisonTab;