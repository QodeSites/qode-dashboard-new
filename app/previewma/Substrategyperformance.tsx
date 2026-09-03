"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, X, ChevronDown, Download } from "lucide-react";
import { fetchSubStrategyPerformance, type SubStrategyEntry } from "./api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

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

function valColor(v: number) {
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

// ─── Section Multiselect Dropdown ─────────────────────────────────────────────

function SectionSelector({
  allSections,
  selected,
  onChange,
  placeholder = "Select sections…",
}: {
  allSections: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
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
          <span className="text-sm text-card-text-secondary/60">{placeholder}</span>
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
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${isSelected ? "bg-logo-green text-white font-medium" : "text-card-text hover:bg-primary-bg/30"
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

// ─── Client Multiselect Dropdown (searchable) ─────────────────────────────────

interface ClientOption {
  qcode: string;
  accountName: string;
  strategy: string;
}

function ClientSelector({
  allClients,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  allClients: ClientOption[];
  selected: Set<string>;
  onToggle: (qcode: string, strategy: string) => void;
  onSelectAll: (clients: ClientOption[]) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return allClients;
    const q = search.toLowerCase();
    return allClients.filter(
      (c) => c.accountName.toLowerCase().includes(q) || c.strategy.toLowerCase().includes(q)
    );
  }, [allClients, search]);

  const selectedList = allClients.filter((c) => selected.has(`${c.qcode}__${c.strategy}`));
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(`${c.qcode}__${c.strategy}`));

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-logo-green/20 bg-white px-3 py-2 cursor-pointer hover:border-logo-green/40 transition-colors"
      >
        {selectedList.length === 0 ? (
          <span className="text-sm text-card-text-secondary/60">Select clients…</span>
        ) : (
          selectedList.map((c) => (
            <span key={`${c.qcode}__${c.strategy}`} className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-2.5 py-0.5 text-xs font-medium text-card-text">
              {c.accountName} {c.strategy}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle(c.qcode, c.strategy); }}
                className="text-card-text-secondary hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {selectedList.length > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onClearAll(); }} className="text-card-text-secondary hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className={`h-4 w-4 text-card-text-secondary transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-logo-green/15 bg-white shadow-lg py-1">
          <div className="px-3 py-2 border-b border-logo-green/10">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search clients…"
              autoFocus
              className="w-full text-sm px-2 py-1.5 rounded border border-logo-green/20 focus:outline-none focus:border-logo-green/40"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (allFilteredSelected) {
                filtered.forEach((c) => { if (selected.has(`${c.qcode}__${c.strategy}`)) onToggle(c.qcode, c.strategy); });
              } else {
                onSelectAll(filtered);
              }
            }}
            className="w-full text-left px-4 py-2 text-sm text-logo-green font-medium hover:bg-primary-bg/50 border-b border-logo-green/10"
          >
            {allFilteredSelected ? "Deselect all" : search.trim() ? `Select all (${filtered.length} matching)` : "Select all"}
          </button>

          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-card-text-secondary italic">No matches.</p>
            ) : (
              filtered.map((c) => {
                const key = `${c.qcode}__${c.strategy}`;
                const isSelected = selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggle(c.qcode, c.strategy)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${isSelected ? "bg-logo-green text-white font-medium" : "text-card-text hover:bg-primary-bg/30"
                      }`}
                  >
                    <span className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "border-white bg-white/20" : "border-card-text-secondary/40"}`}>
                      {isSelected && <span className="block h-2 w-2 rounded-sm bg-white" />}
                    </span>
                    {c.accountName} {c.strategy}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Date range picker (reused for main filter + daily P&L export) ───────────

function DateRangeInputs({
  startDate, endDate, onStartChange, onEndChange,
}: {
  startDate: string; endDate: string;
  onStartChange: (v: string) => void; onEndChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className="rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
      />
      <span className="text-card-text-secondary text-sm">to</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className="rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
      />
    </div>
  );
}

// ─── Daily P&L Export popover (triggered from header button) ─────────────────

function DailyPnlExportPopover({
  allSections,
  allClients,
  selectedClients,
  onToggleClient,
  pnlSections,
  onPnlSectionsChange,
  pnlStartDate,
  pnlEndDate,
  onPnlStartChange,
  onPnlEndChange,
  onExport,
  exporting,
  onSelectAllClients,
  onClearAllClients,
}: {
  allSections: string[];
  allClients: ClientOption[];
  selectedClients: Set<string>;
  onToggleClient: (qcode: string, strategy: string) => void;
  pnlSections: string[];
  onPnlSectionsChange: (v: string[]) => void;
  pnlStartDate: string;
  pnlEndDate: string;
  onPnlStartChange: (v: string) => void;
  onPnlEndChange: (v: string) => void;
  onExport: () => void;
  exporting: boolean;
  onSelectAllClients: (clients: ClientOption[]) => void;
  onClearAllClients: () => void;

}) {
  const [open, setOpen] = useState(false);
  const selectedCount = selectedClients.size;


  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-logo-green/30 px-4 py-2 text-sm font-medium text-logo-green hover:bg-primary-bg/50 transition-colors"
      >
        <Download className="h-4 w-4" />
        Export Daily P&L{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </button>

      {open && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-96 rounded-lg border border-logo-green/15 bg-white shadow-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-logo-green mb-3">
              Daily P&L Export
            </p>

            <p className="text-xs text-card-text-secondary mb-1.5">Clients</p>
            <div className="mb-3">
              <ClientSelector
                allClients={allClients}
                selected={selectedClients}
                onToggle={onToggleClient}
                onSelectAll={onSelectAllClients}
                onClearAll={onClearAllClients}
              />
            </div>

            <p className="text-xs text-card-text-secondary mb-1.5">Sections</p>
            <div className="mb-3">
              <SectionSelector
                allSections={allSections}
                selected={pnlSections}
                onChange={onPnlSectionsChange}
                placeholder="Select sections…"
              />
            </div>

            <p className="text-xs text-card-text-secondary mb-1.5">Date range</p>
            <div className="mb-4">
              <DateRangeInputs
                startDate={pnlStartDate}
                endDate={pnlEndDate}
                onStartChange={onPnlStartChange}
                onEndChange={onPnlEndChange}
              />
            </div>

            <button
              type="button"
              onClick={onExport}
              disabled={exporting || selectedCount === 0 || pnlSections.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Single section table ──────────────────────────────────────────────────────

interface ClientYearRow {
  clientKey: string; // qcode + strategy
  qcode: string;
  accountName: string;
  strategy: string;
  year: number;
  months: (number | null)[];
  total: number | null;
}

function SectionTable({
  sectionName,
  entries,
  showInr,
  onTogglePnl,
}: {
  sectionName: string;
  entries: SubStrategyEntry[];
  showInr: boolean;
  onTogglePnl: (qcode: string, strategy: string) => void;
}) {
  const rows = useMemo((): ClientYearRow[] => {
    const result: ClientYearRow[] = [];

    const clientMap = new Map<string, SubStrategyEntry[]>();
    entries.forEach((e) => {
      const key = `${e.qcode}__${e.strategy}`;
      if (!clientMap.has(key)) clientMap.set(key, []);
      clientMap.get(key)!.push(e);
    });

    const sortedKeys = Array.from(clientMap.keys()).sort((a, b) => {
      const ea = clientMap.get(a)![0];
      const eb = clientMap.get(b)![0];
      return ea.account_name.localeCompare(eb.account_name);
    });

    sortedKeys.forEach((key) => {
      const clientEntries = clientMap.get(key)!;
      const { qcode, account_name: accountName, strategy } = clientEntries[0];

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
        result.push({ clientKey: key, qcode, accountName, strategy, year, months, total });
      });
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, showInr]);

  const shownClients = new Set<string>();

  return (
    <div className="mb-8">
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

  // Main date range (used for both the on-screen table fetch and the
  // "Export Excel" button, so the export always matches what's shown).
  const [startDateInput, setStartDateInput] = useState(defaultStartDate(4));
  const [endDateInput, setEndDateInput] = useState(todayStr());
  const [appliedRange, setAppliedRange] = useState({ start: defaultStartDate(4), end: todayStr() });

  function handleApplyRange() {
    setAppliedRange({ start: startDateInput, end: endDateInput });
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSubStrategyPerformance(appliedRange.start, appliedRange.end)
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load sub-strategy performance."))
      .finally(() => setLoading(false));
  }, [appliedRange]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/sub-strategy-performance/excel-export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: appliedRange.start, end_date: appliedRange.end }),
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

  // All unique sections in the order they appear
  const allSections = useMemo(
    () => Array.from(new Set(data.map((d) => d.section))),
    [data]
  );

  // All unique client+strategy combos, for the Daily P&L client selector
  const allClients = useMemo((): ClientOption[] => {
    const map = new Map<string, ClientOption>();
    data.forEach((e) => {
      const key = `${e.qcode}__${e.strategy}`;
      if (!map.has(key)) {
        map.set(key, { qcode: e.qcode, accountName: e.account_name, strategy: e.strategy });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [data]);

  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  useEffect(() => {
    if (allSections.length > 0 && selectedSections.length === 0) {
      setSelectedSections(allSections.slice(0, 4));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSections]);

  const entriesBySection = useMemo(() => {
    const map = new Map<string, SubStrategyEntry[]>();
    data.forEach((e) => {
      if (!map.has(e.section)) map.set(e.section, []);
      map.get(e.section)!.push(e);
    });
    return map;
  }, [data]);

  // ── Daily P&L Export state ──────────────────────────────────────────────────
  const [selectedForPnl, setSelectedForPnl] = useState<Set<string>>(new Set());
  const [pnlSections, setPnlSections] = useState<string[]>([]);
  const [pnlStartDate, setPnlStartDate] = useState(defaultStartDate(0));
  const [pnlEndDate, setPnlEndDate] = useState(todayStr());
  const [pnlExporting, setPnlExporting] = useState(false);

  function togglePnlSelection(qcode: string, strategy: string) {
    const key = `${qcode}__${strategy}`;
    setSelectedForPnl((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectAllPnl(clients: ClientOption[]) {
    setSelectedForPnl((prev) => {
      const next = new Set(prev);
      clients.forEach((c) => next.add(`${c.qcode}__${c.strategy}`));
      return next;
    });
  }

  function clearAllPnl() {
    setSelectedForPnl(new Set());
  }

  async function handleDailyPnlExport() {
    if (selectedForPnl.size === 0) {
      alert("Select at least one client to export.");
      return;
    }
    if (pnlSections.length === 0) {
      alert("Select at least one section for the Daily P&L export.");
      return;
    }

    const selections = Array.from(selectedForPnl).map((key) => {
      const [qcode, strategy] = key.split("__");
      return { qcode, strategy };
    });

    setPnlExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/sub-strategy-performance/daily-pnl-export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections,
          sections: pnlSections,
          start_date: pnlStartDate,
          end_date: pnlEndDate,
        }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sub-strategy-daily-pnl.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Export failed");
    } finally {
      setPnlExporting(false);
    }
  }

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
      {/* Header + main date range + exports */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Sub-Strategy Performance
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <DailyPnlExportPopover
            allSections={allSections}
            allClients={allClients}
            selectedClients={selectedForPnl}
            onToggleClient={togglePnlSelection}
            onSelectAllClients={selectAllPnl}
            onClearAllClients={clearAllPnl}
            pnlSections={pnlSections}
            onPnlSectionsChange={setPnlSections}
            pnlStartDate={pnlStartDate}
            pnlEndDate={pnlEndDate}
            onPnlStartChange={setPnlStartDate}
            onPnlEndChange={setPnlEndDate}
            onExport={handleDailyPnlExport}
            exporting={pnlExporting}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
        <div className="flex-1">
          <p className="text-sm text-card-text-secondary mb-2">Show sections</p>
          <SectionSelector
            allSections={allSections}
            selected={selectedSections}
            onChange={setSelectedSections}
          />
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
      {selectedSections.map((section) => {
        const entries = entriesBySection.get(section);
        if (!entries?.length) return null;
        return (
          <SectionTable
            key={section}
            sectionName={section}
            entries={entries}
            showInr={showInr}
            onTogglePnl={togglePnlSelection}
          />
        );
      })}
    </div>
  );
}

export default SubStrategyPerformance;