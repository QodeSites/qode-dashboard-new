"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, X, ChevronDown, AlertTriangle } from "lucide-react";
import { fetchSubStrategyPerformance, type SubStrategyEntry } from "./api";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

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
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function valColor(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "text-card-text-secondary/40";
  return v >= 0 ? "text-green-700" : "text-red-600";
}

function defaultStartDate(monthsBack: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function sectionKey(family: string | undefined, value: number | null | undefined) {
  return `${family ?? "UNKNOWN"}::${value ?? "null"}`;
}
function fallbackLabel(family: string | undefined, value: number | null | undefined) {
  if (!family) return "Unknown Section";
  if (value === null || value === undefined) return family;
  if (family === "LONG" || family === "NLONG" || family === "SLONG") {
    const pct = value * 100;
    return `${family === "LONG" ? "Long Options" : family} (${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%)`;
  }
  return `${family} ${value}x`;
}

interface SectionOption { key: string; label: string; }

function SectionSelector({
  allSections, selected, onChange,
}: {
  allSections: SectionOption[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key]);
  }
  function selectAll() { onChange(allSections.map((s) => s.key)); }
  function clearAll() { onChange([]); }

  return (
    <div className="relative">
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-logo-green/20 bg-white px-3 py-2 cursor-pointer hover:border-logo-green/40 transition-colors"
      >
        {selected.length === 0 ? (
          <span className="text-sm text-card-text-secondary/60">Select sections…</span>
        ) : (
          selected.map((key) => {
            const def = allSections.find((s) => s.key === key);
            return (
              <span key={key} className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-2.5 py-0.5 text-xs font-medium text-card-text">
                {def?.label ?? key}
                <button type="button" onClick={(e) => { e.stopPropagation(); toggle(key); }} className="text-card-text-secondary hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })
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
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-logo-green/15 bg-white shadow-lg py-1">
          <button type="button" onClick={selectAll} className="w-full text-left px-4 py-2 text-sm text-logo-green font-medium hover:bg-primary-bg/50 border-b border-logo-green/10">
            Select all ({allSections.length})
          </button>
          {allSections.length === 0 ? (
            <p className="px-4 py-3 text-sm text-card-text-secondary italic">No sections in this date range.</p>
          ) : (
            allSections.map((s) => {
              const isSelected = selected.includes(s.key);
              return (
                <button
                  key={s.key} type="button" onClick={() => toggle(s.key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${isSelected ? "bg-logo-green text-white font-medium" : "text-card-text hover:bg-primary-bg/30"}`}
                >
                  {s.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface ClientYearRow {
  clientKey: string;
  accountName: string;
  strategy: string;
  year: number;
  months: (number | null)[];
  total: number | null;
  sinceInceptionAbsolute: number | null | undefined;
  maxDrawdown: number | null | undefined;
  currentDrawdown: number | null | undefined;
  totalXirr: number | null | undefined;
}

interface ExceptionPointer {
  clientKey: string;
  accountName: string;
  strategy: string;
  actualLabel: string;
}

function SectionTable({
  label, entries, showInr, exceptionPointers,
}: {
  label: string; entries: SubStrategyEntry[]; showInr: boolean; exceptionPointers: ExceptionPointer[];
}) {
  const rows = useMemo((): ClientYearRow[] => {
    const result: ClientYearRow[] = [];
    const clientMap = new Map<string, SubStrategyEntry[]>();
    entries.forEach((e) => {
      const key = `${e.qcode ?? "?"}__${e.strategy ?? "?"}`;
      if (!clientMap.has(key)) clientMap.set(key, []);
      clientMap.get(key)!.push(e);
    });

    const sortedKeys = Array.from(clientMap.keys()).sort((a, b) =>
      (clientMap.get(a)![0].account_name ?? "").localeCompare(clientMap.get(b)![0].account_name ?? "")
    );

    sortedKeys.forEach((key) => {
      const clientEntries = clientMap.get(key)!;
      const first = clientEntries[0];
      const accountName = first.account_name ?? "Unknown Client";
      const strategy = first.strategy ?? "—";

      const yearMonthMap = new Map<number, Map<string, { pct: number; inr: number }>>();
      const yearTotalMap = new Map<number, { pct: number; inr: number }>();
      clientEntries.forEach((e) => {
        (e.monthly ?? []).forEach((m) => {
          if (!yearMonthMap.has(m.year)) yearMonthMap.set(m.year, new Map());
          yearMonthMap.get(m.year)!.set(m.month, { pct: m.return_pct, inr: m.pnl_inr });
        });
        (e.yearly ?? []).forEach((y) => yearTotalMap.set(y.year, { pct: y.return_pct, inr: y.pnl_inr }));
      });

      const years = Array.from(new Set([...yearMonthMap.keys(), ...yearTotalMap.keys()])).sort();
      years.forEach((year) => {
        const monthData = yearMonthMap.get(year);
        const months: (number | null)[] = MONTHS.map((mName) => {
          const d = monthData?.get(mName);
          return d ? (showInr ? d.inr : d.pct) : null;
        });
        const tot = yearTotalMap.get(year);
        result.push({
          clientKey: key, accountName, strategy, year, months,
          total: tot ? (showInr ? tot.inr : tot.pct) : null,
          sinceInceptionAbsolute: first.since_inception_absolute,
          maxDrawdown: first.max_drawdown,
          currentDrawdown: first.current_drawdown,
          totalXirr: first.total_xirr,
        });
      });
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, showInr]);

  const shownClients = new Set<string>();

  return (
    <div className="mb-8">
      <div className="rounded-t-lg bg-logo-green px-5 py-3">
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <div className="overflow-x-auto rounded-b-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/40 text-card-text-secondary text-xs border-b border-logo-green/10">
              <th className="px-4 py-2.5 text-left font-medium w-56">Client</th>
              <th className="px-4 py-2.5 text-left font-medium w-16">Year</th>
              {MONTH_SHORT.map((m) => <th key={m} className="px-3 py-2.5 text-right font-medium">{m}</th>)}
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Since Inception</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Max DD</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Current DD</th>
              <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">XIRR</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && exceptionPointers.length === 0 ? (
              <tr><td colSpan={2 + MONTH_SHORT.length + 5} className="px-4 py-4 text-sm text-card-text-secondary italic text-center">No data for this section.</td></tr>
            ) : (
              rows.map((row, i) => {
                const isFirstForClient = !shownClients.has(row.clientKey);
                if (isFirstForClient) shownClients.add(row.clientKey);
                return (
                  <tr
                    key={`${row.clientKey}-${row.year}`}
                    className={`border-t ${isFirstForClient && i > 0 ? "border-logo-green/15 border-t-2" : "border-logo-green/5"} hover:bg-primary-bg/20 transition-colors`}
                  >
                    <td className="px-4 py-2 text-card-text font-medium whitespace-nowrap">
                      {isFirstForClient ? `${row.accountName} ${row.strategy}` : null}
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
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${isFirstForClient ? valColor(row.sinceInceptionAbsolute) : "text-card-text-secondary/20"}`}>
                      {isFirstForClient ? fmtFracPct(row.sinceInceptionAbsolute) : ""}
                    </td>
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${isFirstForClient ? "text-red-600" : "text-card-text-secondary/20"}`}>
                      {isFirstForClient ? fmtFracPct(row.maxDrawdown) : ""}
                    </td>
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${isFirstForClient ? "text-red-600" : "text-card-text-secondary/20"}`}>
                      {isFirstForClient ? fmtFracPct(row.currentDrawdown) : ""}
                    </td>
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${isFirstForClient ? valColor(row.totalXirr) : "text-card-text-secondary/20"}`}>
                      {isFirstForClient ? fmtFracPct(row.totalXirr) : ""}
                    </td>
                  </tr>
                );
              })
            )}
            {exceptionPointers.map((p) => (
              <tr key={`pointer-${p.clientKey}`} className="border-t border-amber-200 bg-amber-50/50">
                <td colSpan={2 + MONTH_SHORT.length + 5} className="px-4 py-2 text-xs text-amber-800 italic">
                  <AlertTriangle className="inline h-3 w-3 mr-1.5 -mt-0.5" />
                  {p.accountName} {p.strategy} runs {p.actualLabel} instead of the standard tier here — see the {p.actualLabel} table for actual figures.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SubStrategyPerformance({ accountType }: { accountType: "managed" | "prop" }) {
  const [data, setData] = useState<SubStrategyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInr, setShowInr] = useState(false);

  const [startDateInput, setStartDateInput] = useState(defaultStartDate(4));
  const [endDateInput, setEndDateInput] = useState(todayStr());
  const [appliedRange, setAppliedRange] = useState<{ start: string | null; end: string | null }>({
    start: null, end: null,
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSubStrategyPerformance(appliedRange.start, appliedRange.end, accountType)
      .then((rows) => setData(rows ?? []))
      .catch((e) => setError(e?.message || "Failed to load sub-strategy performance."))
      .finally(() => setLoading(false));
  }, [appliedRange, accountType]);

  useEffect(() => {
    setSelectedSections([]);
  }, [accountType]);

  const allSections = useMemo((): SectionOption[] => {
    const map = new Map<string, SectionOption>();
    data.forEach((e) => {
      const key = sectionKey(e.section_family, e.section_value);
      if (!map.has(key)) {
        map.set(key, { key, label: e.section || fallbackLabel(e.section_family, e.section_value) });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  useEffect(() => {
    if (allSections.length > 0 && selectedSections.length === 0) {
      setSelectedSections(allSections.map((s) => s.key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSections]);

  const entriesBySection = useMemo(() => {
    const map = new Map<string, SubStrategyEntry[]>();
    data.forEach((e) => {
      const key = sectionKey(e.section_family, e.section_value);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [data]);

  const pointersByStandardKey = useMemo(() => {
    const map = new Map<string, ExceptionPointer[]>();
    data.filter((e) => e.is_exception).forEach((e) => {
      const standardKey = sectionKey(e.section_family, e.standard_value);
      const actualKey = sectionKey(e.section_family, e.section_value);
      if (standardKey === actualKey) return;
      const actualDef = allSections.find((s) => s.key === actualKey);
      if (!map.has(standardKey)) map.set(standardKey, []);
      map.get(standardKey)!.push({
        clientKey: `${e.qcode ?? "?"}__${e.strategy ?? "?"}`,
        accountName: e.account_name ?? "Unknown Client",
        strategy: e.strategy ?? "—",
        actualLabel: actualDef?.label ?? fallbackLabel(e.section_family, e.section_value),
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, allSections]);

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
      <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1 mb-6">
        <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
          Sub-Strategy Performance
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
        <div className="flex-1">
          <p className="text-sm text-card-text-secondary mb-2">Show sections</p>
          <SectionSelector allSections={allSections} selected={selectedSections} onChange={setSelectedSections} />
        </div>

        <div className="flex items-center gap-2 pt-7">
          <input
            type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)}
            className="rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
          />
          <span className="text-card-text-secondary text-sm">to</span>
          <input
            type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)}
            className="rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
          />
          <button
            type="button"
            onClick={() => setAppliedRange({ start: startDateInput || null, end: endDateInput || null })}
            className="rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors"
          >
            Apply
          </button>
        </div>

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

      {selectedSections.length === 0 && (
        <p className="text-sm text-card-text-secondary italic py-8 text-center">
          Select at least one section above to view data.
        </p>
      )}
      {selectedSections.map((key) => {
        const entries = entriesBySection.get(key) ?? [];
        const def = allSections.find((s) => s.key === key);
        const pointers = pointersByStandardKey.get(key) ?? [];
        if (entries.length === 0 && pointers.length === 0) return null;
        return (
          <SectionTable
            key={key}
            label={def?.label ?? key}
            entries={entries}
            showInr={showInr}
            exceptionPointers={pointers}
          />
        );
      })}
    </div>
  );
}

export default SubStrategyPerformance;  