"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, X, ChevronDown, Download } from "lucide-react";
import { fetchSubStrategyPerformance, type SubStrategyEntry } from "./api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtInr(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "+";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  // Always use L (lakhs) for everything below 1Cr — keeps columns aligned
  return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
}

function valColor(v: number) {
  return v >= 0 ? "text-green-700" : "text-red-600";
}

// ─── Section Multiselect Dropdown ─────────────────────────────────────────────

function SectionSelector({
  allSections,
  selected,
  onChange,
}: {
  allSections: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(s: string) {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  }

  function selectAll() { onChange([...allSections]); }
  function clearAll() { onChange([]); }

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-logo-green/20 bg-white px-3 py-2 cursor-pointer hover:border-logo-green/40 transition-colors"
      >
        {selected.length === 0 ? (
          <span className="text-sm text-card-text-secondary/60">Select sections…</span>
        ) : (
          selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-2.5 py-0.5 text-xs font-medium text-card-text">
              {s}
              <button type="button" onClick={(e) => { e.stopPropagation(); toggle(s); }} className="text-card-text-secondary hover:text-red-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {selected.length > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); clearAll(); }} className="text-card-text-secondary hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className={`h-4 w-4 text-card-text-secondary transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-logo-green/15 bg-white shadow-lg py-1">
          <button
            type="button"
            onClick={() => { selectAll(); setOpen(false); }}
            className="w-full text-left px-4 py-2 text-sm text-logo-green font-medium hover:bg-primary-bg/50"
          >
            Select all
          </button>
          {allSections.map((s) => {
            const isSelected = selected.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${
                  isSelected ? "bg-logo-green text-white font-medium" : "text-card-text hover:bg-primary-bg/30"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Single section table ──────────────────────────────────────────────────────

interface ClientYearRow {
  clientKey: string; // account_name + strategy
  accountName: string;
  strategy: string;
  year: number;
  months: (number | null)[];  // index 0=Jan..11=Dec
  total: number | null;
}

function SectionTable({
  sectionName,
  entries,
  showInr,
}: {
  sectionName: string;
  entries: SubStrategyEntry[];
  showInr: boolean;
}) {
  // Build client×year rows, sorted by client name then year
  const rows = useMemo((): ClientYearRow[] => {
    const result: ClientYearRow[] = [];

    // Group by clientKey (account_name + strategy)
    const clientMap = new Map<string, SubStrategyEntry[]>();
    entries.forEach((e) => {
      const key = `${e.account_name}__${e.strategy}`;
      if (!clientMap.has(key)) clientMap.set(key, []);
      clientMap.get(key)!.push(e);
    });

    // Sort client keys alphabetically
    const sortedKeys = Array.from(clientMap.keys()).sort((a, b) =>
      a.localeCompare(b)
    );

    sortedKeys.forEach((key) => {
      const clientEntries = clientMap.get(key)!;
      const [accountName, strategy] = key.split("__");

      // Collect all year×month data
      const yearMonthMap = new Map<number, Map<string, { pct: number; inr: number }>>();
      const yearTotalMap = new Map<number, { pct: number; inr: number }>();

      clientEntries.forEach((e) => {
        e.monthly.forEach((m) => {
          if (!yearMonthMap.has(m.year)) yearMonthMap.set(m.year, new Map());
          yearMonthMap.get(m.year)!.set(m.month, { pct: m.return_pct, inr: m.pnl_inr });
        });
        e.yearly.forEach((y) => {
          yearTotalMap.set(y.year, { pct: y.return_pct, inr: y.pnl_inr });
        });
      });

      const years = Array.from(new Set([...yearMonthMap.keys(), ...yearTotalMap.keys()])).sort();

      years.forEach((year) => {
        const monthData = yearMonthMap.get(year);
        const months: (number | null)[] = MONTHS.map((mName) => {
          const d = monthData?.get(mName);
          if (!d) return null;
          return showInr ? d.inr : d.pct;
        });
        const tot = yearTotalMap.get(year);
        const total = tot ? (showInr ? tot.inr : tot.pct) : null;
        result.push({ clientKey: key, accountName, strategy, year, months, total });
      });
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, showInr]);

  // Track which client keys we've already shown the name for
  const shownClients = new Set<string>();

  return (
    <div className="mb-8">
      {/* Dark green section header matching screenshot */}
      <div className="rounded-t-lg bg-logo-green px-5 py-3">
        <span className="text-sm font-semibold text-white">{sectionName}</span>
      </div>
      <div className="overflow-x-auto rounded-b-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/40 text-card-text-secondary text-xs border-b border-logo-green/10">
              <th className="px-4 py-2.5 text-left font-medium w-52">Client</th>
              <th className="px-4 py-2.5 text-left font-medium w-16">Year</th>
              {MONTH_SHORT.map((m) => (
                <th key={m} className="px-3 py-2.5 text-right font-medium">{m}</th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isFirstForClient = !shownClients.has(row.clientKey);
              if (isFirstForClient) shownClients.add(row.clientKey);
              const isNewClientGroup = isFirstForClient && i > 0;

              return (
                <tr
                  key={`${row.clientKey}-${row.year}`}
                  className={`border-t ${isNewClientGroup ? "border-logo-green/15 border-t-2" : "border-logo-green/5"} hover:bg-primary-bg/20 transition-colors`}
                >
                  <td className="px-4 py-2 text-card-text font-medium whitespace-nowrap">
                    {isFirstForClient ? (
                      <span className="text-card-text">
                        {row.accountName} {row.strategy}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-card-text-secondary">{row.year}</td>
                  {row.months.map((v, mi) => (
                    <td key={mi} className={`px-3 py-2 text-right whitespace-nowrap ${v !== null ? valColor(v) : "text-card-text-secondary/40"}`}>
                      {v === null ? "—" : showInr ? fmtInr(v) : fmtPct(v)}
                    </td>
                  ))}
                  <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${row.total !== null ? valColor(row.total) : "text-card-text-secondary/40"}`}>
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

export function SubStrategyPerformance() {
  const [data, setData] = useState<SubStrategyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInr, setShowInr] = useState(false);

  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/sub-strategy-performance/export", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sub-strategy-performance.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    fetchSubStrategyPerformance()
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load sub-strategy performance."))
      .finally(() => setLoading(false));
  }, []);

  // All unique sections in the order they appear
  const allSections = useMemo(
    () => Array.from(new Set(data.map((d) => d.section))),
    [data]
  );

  // Default: first 4 sections selected (matching screenshot)
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  useEffect(() => {
    if (allSections.length > 0 && selectedSections.length === 0) {
      setSelectedSections(allSections.slice(0, 4));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSections]);

  // Group entries by section
  const entriesBySection = useMemo(() => {
    const map = new Map<string, SubStrategyEntry[]>();
    data.forEach((e) => {
      if (!map.has(e.section)) map.set(e.section, []);
      map.get(e.section)!.push(e);
    });
    return map;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading sub-strategy performance…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load sub-strategy performance.</p>
          <p className="text-red-600/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header + controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Sub-Strategy Performance
          </span>
        </div>
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

      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
        {/* Section filter */}
        <div className="flex-1">
          <p className="text-sm text-card-text-secondary mb-2">Show sections</p>
          <SectionSelector
            allSections={allSections}
            selected={selectedSections}
            onChange={setSelectedSections}
          />
        </div>

        {/* % / ₹ toggle */}
        <div className="flex items-center gap-5 pt-7 flex-shrink-0">
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
        </div>
      </div>

      {/* One table per selected section */}
      {selectedSections.length === 0 && (
        <p className="text-sm text-card-text-secondary italic py-8 text-center">
          Select at least one section above to view data.
        </p>
      )}
      {selectedSections.map((section) => {
        const entries = entriesBySection.get(section);
        if (!entries?.length) return null;
        return (
          <SectionTable
            key={section}
            sectionName={section}
            entries={entries}
            showInr={showInr}
          />
        );
      })}
    </div>
  );
}

export default SubStrategyPerformance;