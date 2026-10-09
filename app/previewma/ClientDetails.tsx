"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pin, Ruler, Search, X, LineChart as LineChartIcon } from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  YAxis,
  XAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { UnderlineTabs } from "./UnderlineTabs";
import { MultiSelectDropdown } from "./MultiselectDropdown";
import type { ClientDashboardResponse, TagDetail } from "./api";

function fmtPct(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function fmtInr(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Exact figure for the hover tooltip — Indian grouping, always 2 decimals
function fmtFull(value: number | null | undefined) {
  if (value === null || value === undefined || !isFinite(value)) return "—";
  return `${value < 0 ? "-" : ""}₹${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pctBadge(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return <span className="text-card-text-secondary/50 text-sm">—</span>;
  }
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-bold ${
        positive ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
      }`}
    >
      {fmtPct(value)}
    </span>
  );
}

function MiniCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl bg-white border border-logo-green/10 px-3 py-3 text-center shadow-sm ${
        accent ? "border-t-2 border-t-button-text" : ""
      }`}
    >
      <div className="text-[0.62rem] font-semibold uppercase tracking-wide text-card-text-secondary mb-2">
        {label}
      </div>
      <div className="text-sm font-bold text-card-text">{value}</div>
    </div>
  );
}

// ─── Chart zoom (drag across a section of a chart to zoom into it) ───────────

// Works across Recharts versions: prefer activeLabel, fall back to the hovered index
function labelFromEvent(e: any, rows: { date: string }[]): string | null {
  if (e?.activeLabel !== undefined && e?.activeLabel !== null) return String(e.activeLabel);
  const idx = Number(e?.activeTooltipIndex ?? e?.activeIndex);
  return Number.isFinite(idx) && rows[idx] ? rows[idx].date : null;
}

// Drawdown is always <= 0, so pin the top at 0 and fit the bottom to whatever is
// currently visible — otherwise a zoomed slice keeps the full-history scale.
function drawdownDomain(rows: Record<string, any>[], keys: string[]): [number, number] {
  let min = 0;
  rows.forEach((r) =>
    keys.forEach((k) => {
      const v = r[k];
      if (typeof v === "number" && v < min) min = v;
    })
  );
  return [Math.min(min * 1.1, -0.5), 0]; // -0.5 floor stops a flat-at-zero slice collapsing
}

// Keeps decimals when zoomed in: -0.4 stays "-0.4%", -5 stays "-5%"
const fmtDdTick = (v: number) => `${Number(v.toFixed(2))}%`;

// For Recharts charts whose x-axis is a `date` string. Zooming slices the data
// to the selected range, so the y-axis can rescale to the visible portion.
function useChartZoom<T extends { date: string }>(data: T[]) {
  const [range, setRange] = useState<[number, number] | null>(null);
  const [drag, setDrag] = useState<{ left: string; right: string | null } | null>(null);

  // Reset when the underlying series changes (different tag / client / window).
  // Keyed on shape, not identity, so re-created arrays don't wipe the zoom.
  const dataKey = `${data.length}|${data[0]?.date ?? ""}|${data[data.length - 1]?.date ?? ""}`;
  useEffect(() => {
    setRange(null);
    setDrag(null);
  }, [dataKey]);

  const visible = useMemo(
    () => (range ? data.slice(range[0], range[1] + 1) : data),
    [data, range]
  );

  const chartProps = {
    onMouseDown: (e: any) => {
      const l = labelFromEvent(e, visible);
      if (l) setDrag({ left: l, right: null });
    },
    onMouseMove: (e: any) => {
      if (!drag) return;
      const l = labelFromEvent(e, visible);
      if (l) setDrag({ left: drag.left, right: l });
    },
    onMouseUp: () => {
      if (!drag || !drag.right || drag.left === drag.right) {
        setDrag(null);
        return;
      }
      const i1 = visible.findIndex((p) => p.date === drag.left);
      const i2 = visible.findIndex((p) => p.date === drag.right);
      if (i1 < 0 || i2 < 0) {
        setDrag(null);
        return;
      }
      const [a, b] = i1 < i2 ? [i1, i2] : [i2, i1];
      const base = range ? range[0] : 0; // indices are relative to the visible slice
      setRange([base + a, base + b]);
      setDrag(null);
    },
    onMouseLeave: () => setDrag(null),
  };

  return {
    data: visible,
    chartProps,
    selection: drag && drag.right ? { x1: drag.left, x2: drag.right } : null,
    isZoomed: range !== null,
    reset: () => setRange(null),
  };
}

// Wrapper: shows a hint, a "Reset zoom" button once zoomed, and double-click resets.
function ZoomFrame({
  zoom, children,
}: {
  zoom: { isZoomed: boolean; reset: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="relative select-none" onDoubleClick={zoom.reset}>
      <div className="absolute right-2 top-0 z-10">
        {zoom.isZoomed ? (
          <button
            type="button"
            onClick={zoom.reset}
            className="rounded-md border border-logo-green/20 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-logo-green hover:bg-primary-bg/60 transition-colors"
          >
            Reset zoom
          </button>
        ) : (
          <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] text-card-text-secondary/60">
            Drag to zoom
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// Replaces the old Nifty 50 MiniCard — Nifty 50's since-inception comparison
// now lives as a static row in the Since Inception table below instead.
function DayPnlCard({
  pnlOn, onPnlOnChange, pnlSnapshot, showInr,
}: {
  pnlOn: string;
  onPnlOnChange: (v: string) => void;
  pnlSnapshot: { pnl_inr: number; pnl_pct: number } | null;
  showInr: boolean;
}) {
  return (
    <div className="rounded-xl bg-white border border-logo-green/10 px-3 py-3 text-center shadow-sm border-t-2 border-t-button-text">
      <div className="text-[0.62rem] font-semibold uppercase tracking-wide text-card-text-secondary mb-1.5">
        Day P&amp;L
      </div>
      {pnlSnapshot === null ? (
        <div className="text-xs text-card-text-secondary/60 italic">No data</div>
      ) : showInr ? (
        <div className="text-sm font-bold text-card-text" title={fmtFull(pnlSnapshot.pnl_inr)}>
          {fmtInr(pnlSnapshot.pnl_inr)}
        </div>
      ) : (
        pctBadge(pnlSnapshot.pnl_pct)
      )}
      <input
        type="date"
        value={pnlOn}
        onChange={(e) => onPnlOnChange(e.target.value)}
        className="w-full mb-1.5 rounded border border-logo-green/20 px-1.5 py-1 text-[0.65rem] text-card-text text-center focus:outline-none focus:border-logo-green/40"
      />
    </div>
  );
}

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1 my-6">
      <span className="text-logo-green/60">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-wide text-logo-green">{children}</span>
    </div>
  );
}

// Tags that represent aggregate/total views rather than individual sub-strategies —
// shown first and highlighted, mirroring how the Streamlit app surfaces them.
const PRIMARY_TAG_HINTS = [
  "Qode Total Portfolio",
  "Net Qode Total Portfolio",
  "Zerodha Total Portfolio",
  "Total Portfolio Value",
];

function OverviewTab({
  data, tagFilter, tagOptions, onTagsChange, pnlOn, onPnlOnChange,
}: {
  data: ClientDashboardResponse;
  tagFilter: string[];
  tagOptions: string[];
  onTagsChange: (tags: string[]) => void;
  pnlOn: string;
  onPnlOnChange: (v: string) => void;
}) {
  const [showInr, setShowInr] = useState(false);
  const { tags, profit_tag, benchmark, pnl_snapshot } = data;

  const primaryTag = tags[profit_tag] || tags[PRIMARY_TAG_HINTS.find((t) => tags[t]) || ""];
  const tagEntries = useMemo(() => {
    const allEntries = Object.entries(tags);
    if (tagFilter.length === 0) return allEntries;
    return allEntries.filter(([name]) => tagFilter.includes(name));
  }, [tags, tagFilter]);

  return (
    <div>
      <div className="flex justify-center gap-2 mb-5">
        <button
          onClick={() => setShowInr(false)}
          className={`flex items-center gap-1.5 text-sm px-1 ${
            !showInr ? "text-card-text font-medium" : "text-card-text-secondary"
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full border-2 ${
              !showInr ? "border-red-500 bg-red-500" : "border-card-text-secondary/40"
            }`}
          />
          % Returns
        </button>
        <button
          onClick={() => setShowInr(true)}
          className={`flex items-center gap-1.5 text-sm px-1 ${
            showInr ? "text-card-text font-medium" : "text-card-text-secondary"
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full border-2 ${
              showInr ? "border-red-500 bg-red-500" : "border-card-text-secondary/40"
            }`}
          />
          ₹ Returns
        </button>
      </div>

      <SectionHeader icon={<Pin className="h-3.5 w-3.5" />}>Portfolio Overview</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniCard label="Start Date" value={primaryTag?.start_date || "—"} />
        <MiniCard label="End Date" value={primaryTag?.end_date || "—"} />
        <MiniCard
          label="Since Inception Returns"
          value={
            showInr ? (
              <span title={fmtFull(primaryTag?.since_inception_pnl)}>
                {fmtInr(primaryTag?.since_inception_pnl)}
              </span>
            ) : (
              pctBadge(primaryTag?.since_inception)
            )
          }
        />
        <MiniCard label="Max Drawdown" value={pctBadge(primaryTag?.max_drawdown)} />
        <MiniCard label="Current Drawdown" value={pctBadge(primaryTag?.current_drawdown)} />
        <DayPnlCard pnlOn={pnlOn} onPnlOnChange={onPnlOnChange} pnlSnapshot={pnl_snapshot} showInr={showInr} />
      </div>

      <SectionHeader icon={<span className="text-xs">📋</span>}>
        Strategy-wise Since Inception Returns
      </SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/60 text-left text-card-text-secondary">
              <th className="px-4 py-2.5 font-medium">Strategy</th>
              <th className="px-4 py-2.5 font-medium">Start Date</th>
              <th className="px-4 py-2.5 font-medium">End Date</th>
              <th className="px-4 py-2.5 font-medium text-right border-l-2 border-logo-green/25">
                {showInr ? "Since Inception P&L" : "Since Inception"}
              </th>
              <th className="px-4 py-2.5 font-medium text-right">Max Drawdown</th>
              <th className="px-4 py-2.5 font-medium text-right">Current Drawdown</th>
            </tr>
          </thead>
          <tbody>
            {tagEntries.map(([name, tag]) => (
              <tr key={name} className="border-t border-logo-green/5">
                <td className="px-4 py-2.5 text-card-text">{name}</td>
                <td className="px-4 py-2.5 text-card-text-secondary">{tag.start_date}</td>
                <td className="px-4 py-2.5 text-card-text-secondary">{tag.end_date}</td>
                <td
                  title={showInr ? fmtFull(tag.since_inception_pnl) : undefined}
                  className={`px-4 py-2.5 text-right font-semibold border-l-2 border-logo-green/25 ${
                    (showInr ? tag.since_inception_pnl : tag.since_inception) >= 0
                      ? "text-green-700 bg-green-50"
                      : "text-red-700 bg-red-50"
                  }`}
                >
                  {showInr ? fmtInr(tag.since_inception_pnl) : fmtPct(tag.since_inception)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-red-700 bg-red-50">
                  {fmtPct(tag.max_drawdown)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-red-700 bg-red-50">
                  {fmtPct(tag.current_drawdown)}
                </td>
              </tr>
            ))}
            {/* Static Nifty 50 benchmark row */}
            <tr className="border-t-2 border-logo-green/20 bg-primary-bg/30">
              <td className="px-4 py-2.5 text-card-text font-bold">Nifty 50</td>
              <td className="px-4 py-2.5 text-card-text-secondary">{benchmark.start_date}</td>
              <td className="px-4 py-2.5 text-card-text-secondary">{benchmark.end_date}</td>
              <td
                className={`px-4 py-2.5 text-right font-bold border-l-2 border-logo-green/25 ${
                  showInr ? "text-card-text-secondary/50" : benchmark.since_inception >= 0 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"
                }`}
              >
                {showInr ? "— (index)" : fmtPct(benchmark.since_inception)}
              </td>
              <td className="px-4 py-2.5 text-right font-bold text-red-700 bg-red-50">{fmtPct(benchmark.max_drawdown)}</td>
              <td className="px-4 py-2.5 text-right font-bold text-red-700 bg-red-50">{fmtPct(benchmark.current_drawdown)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <SectionHeader icon={<span className="text-xs">📈</span>}>Return Tables</SectionHeader>

      <div className="mb-5 max-w-md">
        <MultiSelectDropdown
          label="System Tags"
          options={tagOptions}
          selected={tagFilter}
          onChange={onTagsChange}
        />
      </div>

      <div className="space-y-8">
        {tagEntries.map(([name, tag]) => (
          <div key={name}>
            <span className="inline-block rounded-full border border-button-text bg-button-text/10 px-3 py-1 text-xs font-semibold text-card-text mb-3">
              {name.toUpperCase()}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-sm font-semibold text-card-text mb-1.5">Monthly</div>
                <ReturnMiniTable
                  showInr={showInr}
                  headers={["Year", "Month", showInr ? "P&L (₹)" : "Return (%)"]}
                  rows={tag.monthly.map((m) => [`${m.year}`, m.month, m.return_pct, m.pnl_inr])}
                />
              </div>
              <div>
                <div className="text-sm font-semibold text-card-text mb-1.5">Quarterly</div>
                <ReturnMiniTable
                  showInr={showInr}
                  headers={["Year", "Quarter", showInr ? "P&L (₹)" : "Return (%)"]}
                  rows={tag.quarterly.map((q) => [`${q.year}`, q.quarter, q.return_pct, q.pnl_inr])}
                />
              </div>
              <div>
                <div className="text-sm font-semibold text-card-text mb-1.5">Yearly</div>
                <ReturnMiniTable
                  showInr={showInr}
                  headers={["Year", "", showInr ? "P&L (₹)" : "Return (%)"]}
                  rows={tag.yearly.map((y) => [`${y.year}`, "", y.return_pct, y.pnl_inr])}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReturnMiniTable({
  headers,
  rows,
  showInr,
}: {
  headers: string[];
  rows: [string, string, number, number][];
  showInr: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-logo-green/10 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-primary-bg/60 text-card-text-secondary">
            {headers.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const [yr, period, returnPct, pnlInr] = row;
            const displayVal = showInr ? pnlInr : returnPct;
            const positive = displayVal >= 0;
            return (
              <tr key={i} className="border-t border-logo-green/5">
                <td className="px-2.5 py-1.5 text-card-text-secondary">{yr}</td>
                <td className="px-2.5 py-1.5 text-card-text-secondary">{period}</td>
                <td
                  title={showInr ? fmtFull(pnlInr) : undefined}
                  className={`px-2.5 py-1.5 text-right font-semibold ${
                    positive ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"
                  }`}
                >
                  {showInr ? fmtInr(pnlInr) : `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const RATIO_ROWS: { key: keyof TagDetail["ratios"]; label: string; pct: boolean }[] = [
  { key: "ann_volatility", label: "Annualised Volatility", pct: true },
  { key: "sharpe", label: "Sharpe Ratio", pct: false },
  { key: "calmar", label: "Calmar Ratio", pct: false },
  { key: "best_month", label: "Best Month", pct: true },
  { key: "worst_month", label: "Worst Month", pct: true },
  { key: "avg_monthly_return", label: "Avg Monthly Return", pct: true },
  { key: "win_rate", label: "Win Rate (Monthly)", pct: true },
  { key: "monthly_volatility", label: "Monthly Volatility", pct: true },
  { key: "downside_deviation", label: "Downside Deviation", pct: true },
];

function SearchableTagSelect({
  options, value, onChange,
}: {
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Start fresh each time the dropdown opens
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, search]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-logo-green/20 bg-white px-4 py-2.5 text-sm text-card-text text-left hover:border-logo-green/40 transition-colors"
      >
        <span className="truncate">{value || "Select a system tag"}</span>
        <ChevronDown className={`h-4 w-4 text-card-text-secondary flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-logo-green/15 bg-white shadow-lg">
          <div className="p-2 border-b border-logo-green/10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-card-text-secondary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length > 0) {
                    e.preventDefault();
                    pick(filtered[0]); // Enter picks the top match
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder={`Search ${options.length} tags…`}
                autoFocus
                className="w-full rounded-md border border-logo-green/20 pl-8 pr-7 py-1.5 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-card-text-secondary hover:text-red-600"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-card-text-secondary italic">No tags match &quot;{search}&quot;.</p>
            ) : (
              filtered.map((name) => {
                const selected = name === value;
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(name)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      selected ? "bg-primary-bg/60 text-logo-green font-medium" : "text-card-text hover:bg-primary-bg/30"
                    }`}
                  >
                    {name}
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

function AnalysisTab({ data, tagFilter }: { data: ClientDashboardResponse; tagFilter: string[] }) {
  const { tags } = data;
  const tagNames = useMemo(() => Object.keys(tags), [tags]);

  const filteredTagNames = useMemo(
    () => (tagFilter.length === 0 ? tagNames : tagNames.filter((n) => tagFilter.includes(n))),
    [tagNames, tagFilter]
  );

  const [selectedTag, setSelectedTag] = useState(tagNames[0]);
  const tag = tags[selectedTag];

  const navSeries = tag?.series.map((p) => ({ date: p.date, nav: p.nav })) || [];
  const drawdownSeries = tag?.series.map((p) => ({ date: p.date, drawdownPct: p.drawdown * 100 })) || [];

  const navZoom = useChartZoom(navSeries);
  const drawdownZoom = useChartZoom(drawdownSeries);
  const ddDomain = drawdownDomain(drawdownZoom.data, ["drawdownPct"]);

  return (
    <div>
      <SectionHeader icon={<Ruler className="h-3.5 w-3.5" />}>Performance &amp; Risk Ratios</SectionHeader>
      <p className="text-xs text-card-text-secondary mb-4">
        Risk-free rate: <strong>{(data.risk_free_rate * 100).toFixed(1)}%</strong> p.a. &middot; Daily NAV-based
        returns
      </p>

<div className="mb-5 max-w-md">
  <SearchableTagSelect options={tagNames} value={selectedTag} onChange={setSelectedTag} />
</div>

      {tag && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="overflow-hidden rounded-lg border border-logo-green/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-bg/60 text-left text-card-text-secondary">
                  <th className="px-4 py-2 font-medium">Metric</th>
                  <th className="px-4 py-2 font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-logo-green/5">
                  <td className="px-4 py-2 text-card-text-secondary">Return (Absolute)</td>
                  <td className="px-4 py-2 text-right font-medium text-card-text">{fmtPct(tag.since_inception)}</td>
                </tr>
                {RATIO_ROWS.map((row) => {
                  const v = tag.ratios[row.key];
                  return (
                    <tr key={row.label} className="border-t border-logo-green/5">
                      <td className="px-4 py-2 text-card-text-secondary">{row.label}</td>
                      <td className="px-4 py-2 text-right font-medium text-card-text">
                        {v === null || v === undefined ? "—" : row.pct ? fmtPct(v) : v.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-logo-green/10 p-3">
              <div className="text-xs font-serif text-logo-green mb-2 ml-1">NAV — {selectedTag}</div>
              <ZoomFrame zoom={navZoom}>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={navZoom.data} {...navZoom.chartProps}>
                    <CartesianGrid stroke="#E8E4D4" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#555" }}
                      tickFormatter={(d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      minTickGap={30}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#555" }} domain={["auto", "auto"]} width={32} />
                    <Tooltip />
                    {navZoom.selection && (
                      <ReferenceArea x1={navZoom.selection.x1} x2={navZoom.selection.x2} fill="#02422B" fillOpacity={0.12} />
                    )}
                    <Line type="monotone" dataKey="nav" stroke="#02422B" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ZoomFrame>
            </div>

            <div className="bg-white rounded-lg border border-logo-green/10 p-3">
              <div className="text-xs font-serif text-logo-green mb-2 ml-1">Drawdown — {selectedTag}</div>
              <ZoomFrame zoom={drawdownZoom}>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={drawdownZoom.data} {...drawdownZoom.chartProps}>
                    <CartesianGrid stroke="#E8E4D4" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#555" }}
                      tickFormatter={(d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      minTickGap={30}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#555" }} width={40} domain={ddDomain} tickFormatter={fmtDdTick} />
                    <Tooltip />
                    {drawdownZoom.selection && (
                      <ReferenceArea x1={drawdownZoom.selection.x1} x2={drawdownZoom.selection.x2} fill="#B71C1C" fillOpacity={0.12} />
                    )}
                    <Area
                      type="monotone"
                      dataKey="drawdownPct"
                      stroke="#B71C1C"
                      fill="#B71C1C"
                      fillOpacity={0.25}
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ZoomFrame>
            </div>
          </div>
        </div>
      )}

      <SectionHeader icon={<span className="text-xs">📊</span>}>All Tags — Ratio Summary</SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/60 text-left text-card-text-secondary">
              <th className="px-3 py-2 font-medium">Strategy</th>
              <th className="px-3 py-2 font-medium text-right border-l-2 border-logo-green/25">Return</th>
              <th className="px-3 py-2 font-medium text-right">Ann. Vol</th>
              <th className="px-3 py-2 font-medium text-right">Sharpe</th>
              <th className="px-3 py-2 font-medium text-right">Calmar</th>
              <th className="px-3 py-2 font-medium text-right">Max DD</th>
              <th className="px-3 py-2 font-medium text-right">Win Rate</th>
              <th className="px-3 py-2 font-medium text-right">Best Month</th>
              <th className="px-3 py-2 font-medium text-right">Worst Month</th>
            </tr>
          </thead>
          <tbody>
            {filteredTagNames.map((name) => {
              const t = tags[name];
              return (
                <tr key={name} className="border-t border-logo-green/5">
                  <td className="px-3 py-2 text-card-text">{name}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary border-l-2 border-logo-green/25">{fmtPct(t.since_inception)}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary">{fmtPct(t.ratios.ann_volatility)}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary">
                    {t.ratios.sharpe === null ? "—" : t.ratios.sharpe.toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-right text-card-text-secondary">
                    {t.ratios.calmar === null ? "—" : t.ratios.calmar.toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-right text-card-text-secondary">{fmtPct(t.max_drawdown)}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary">{fmtPct(t.ratios.win_rate, 1)}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary">{fmtPct(t.ratios.best_month)}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary">{fmtPct(t.ratios.worst_month)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Palette for multi-strategy comparison lines
const CHART_COLORS = [
  "#02422B", "#4A9D7A", "#DABD38", "#6B7280",
  "#1D4ED8", "#B91C1C", "#7C3AED", "#0891B2", "#065F46",
];

function deriveDrawdown(series: { date: string; nav: number }[]): { date: string; drawdownPct: number }[] {
  let peak = -Infinity;
  return series.map((p) => {
    peak = Math.max(peak, p.nav);
    return { date: p.date, drawdownPct: ((p.nav - peak) / peak) * 100 };
  });
}

function ChartsTab({
  data,
  tagFilter,
}: {
  data: ClientDashboardResponse;
  tagFilter: string[];
}) {
  const { tags, benchmark } = data;
  const allTagNames = useMemo(() => Object.keys(tags), [tags]);

  const [selectedTags, setSelectedTags] = useState<string[]>(
    () => (tagFilter.length > 0 ? tagFilter.filter((t) => tags[t]) : allTagNames.slice(0, 3))
  );

  const [compareNifty, setCompareNifty] = useState(true);

  const CHART_TYPE_OPTIONS = ["NAV Time Series", "Drawdown", "Monthly Returns Heatmap"];
  const [selectedChartTypes, setSelectedChartTypes] = useState<string[]>(CHART_TYPE_OPTIONS);

  function toggleChartType(ct: string) {
    setSelectedChartTypes((prev) =>
      prev.includes(ct) ? prev.filter((c) => c !== ct) : [...prev, ct]
    );
  }

  const comparisonData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | null>>();

    selectedTags.forEach((tagName) => {
      const tag = tags[tagName];
      if (!tag) return;
      tag.series.forEach((p) => {
        if (!dateMap.has(p.date)) dateMap.set(p.date, {});
        const row = dateMap.get(p.date)!;
        row[`nav__${tagName}`] = p.nav;
        row[`cum__${tagName}`] = ((p.nav - 100) / 100) * 100;
        row[`dd__${tagName}`] = p.drawdown * 100;
      });
    });

    if (compareNifty && benchmark?.series) {
      const benchDd = deriveDrawdown(benchmark.series);
      benchmark.series.forEach((p, i) => {
        if (!dateMap.has(p.date)) dateMap.set(p.date, {});
        const row = dateMap.get(p.date)!;
        row["nav__Nifty50"] = p.nav;
        row["cum__Nifty50"] = ((p.nav - 100) / 100) * 100;
        row["dd__Nifty50"] = benchDd[i]?.drawdownPct ?? null;
      });
    }

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [selectedTags, tags, compareNifty, benchmark]);

  // Independent zoom per chart, both driven by the same underlying series
  const navZoom = useChartZoom(comparisonData);
  const ddZoom = useChartZoom(comparisonData);

  // Fit the drawdown y-axis to whatever is currently visible after zooming
  const ddDomain = useMemo(
    () =>
      drawdownDomain(ddZoom.data, [
        ...selectedTags.map((t) => `dd__${t}`),
        ...(compareNifty ? ["dd__Nifty50"] : []),
      ]),
    [ddZoom.data, selectedTags, compareNifty]
  );

  const tagLines = useMemo(
    () => selectedTags.map((name, i) => ({ key: name, color: CHART_COLORS[i % CHART_COLORS.length] })),
    [selectedTags]
  );

  const allLines = useMemo(() => {
    const lines = [...tagLines];
    if (compareNifty) lines.push({ key: "Nifty50", color: "#E07B39" });
    return lines;
  }, [tagLines, compareNifty]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-5">
        <div>
          <div className="text-sm font-medium text-card-text mb-1.5">Strategies</div>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-logo-green/20 bg-white p-2 min-h-[42px]">
            {selectedTags.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-bg px-2.5 py-1 text-xs text-card-text"
              >
                {s.length > 22 ? s.slice(0, 20) + "…" : s}
                <button
                  type="button"
                  onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== s))}
                  className="text-card-text-secondary hover:text-red-600"
                >
                  ×
                </button>
              </span>
            ))}
            <select
              onChange={(e) => {
                if (e.target.value && !selectedTags.includes(e.target.value)) {
                  setSelectedTags((prev) => [...prev, e.target.value]);
                }
                e.target.value = "";
              }}
              defaultValue=""
              className="text-xs text-card-text-secondary bg-transparent outline-none cursor-pointer py-0.5 px-1"
            >
              <option value="" disabled>+ add</option>
              {allTagNames.filter((n) => !selectedTags.includes(n)).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-card-text mb-1.5">Chart types</div>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-logo-green/20 bg-white p-2 min-h-[42px]">
            {selectedChartTypes.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-bg px-2.5 py-1 text-xs text-card-text"
              >
                {c}
                <button
                  type="button"
                  onClick={() => toggleChartType(c)}
                  className="text-card-text-secondary hover:text-red-600"
                >
                  ×
                </button>
              </span>
            ))}
            {CHART_TYPE_OPTIONS.filter((c) => !selectedChartTypes.includes(c)).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedChartTypes((prev) => [...prev, c])}
                className="text-xs text-card-text-secondary hover:text-logo-green px-1 py-0.5"
              >
                + {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-card-text mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={compareNifty}
          onChange={(e) => setCompareNifty(e.target.checked)}
          className="h-4 w-4 rounded border-logo-green/40 accent-logo-green"
        />
        Compare with Nifty50
      </label>

      {selectedTags.length === 0 && (
        <p className="text-sm text-card-text-secondary italic py-8 text-center">
          Select at least one strategy above to generate charts.
        </p>
      )}

      {selectedChartTypes.includes("NAV Time Series") && selectedTags.length > 0 && (
        <div className="bg-white rounded-lg border border-logo-green/10 p-4 mb-5">
          <div className="text-sm font-semibold text-card-text mb-3">NAV Time Series</div>
          <ZoomFrame zoom={navZoom}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={navZoom.data} {...navZoom.chartProps}>
                <CartesianGrid stroke="#E8E4D4" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#555" }} minTickGap={50} tickFormatter={fmtDate} />
                <YAxis tick={{ fontSize: 9, fill: "#555" }} width={35} domain={["auto", "auto"]} />
                <Tooltip labelFormatter={fmtDate} formatter={(v: number, name: string) => [v?.toFixed(2), name.replace("nav__", "")]} />
                <Legend formatter={(v) => v.replace("nav__", "")} wrapperStyle={{ fontSize: 11 }} />
                {navZoom.selection && (
                  <ReferenceArea x1={navZoom.selection.x1} x2={navZoom.selection.x2} fill="#02422B" fillOpacity={0.12} />
                )}
                {allLines.map((l) => (
                  <Line key={l.key} type="monotone" dataKey={`nav__${l.key}`} name={`nav__${l.key}`}
                    stroke={l.color} strokeWidth={l.key === "Nifty50" ? 1.5 : 2}
                    strokeDasharray={l.key === "Nifty50" ? "4 2" : undefined} dot={false} connectNulls
                    isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ZoomFrame>
        </div>
      )}

      {selectedChartTypes.includes("Drawdown") && selectedTags.length > 0 && (
        <div className="bg-white rounded-lg border border-logo-green/10 p-4 mb-5">
          <div className="text-sm font-semibold text-card-text mb-3">Drawdown (%)</div>
          <ZoomFrame zoom={ddZoom}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={ddZoom.data} {...ddZoom.chartProps}>
                <CartesianGrid stroke="#E8E4D4" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#555" }} minTickGap={50} tickFormatter={fmtDate} />
                <YAxis tick={{ fontSize: 9, fill: "#555" }} width={44} domain={ddDomain} allowDecimals tickFormatter={fmtDdTick} />
                <Tooltip
                  labelFormatter={fmtDate}
                  formatter={(v: number, name: string) => [v != null ? `${v.toFixed(2)}%` : "—", name.replace("dd__", "")]}
                />
                <Legend formatter={(v) => v.replace("dd__", "")} wrapperStyle={{ fontSize: 11 }} />
                {ddZoom.selection && (
                  <ReferenceArea x1={ddZoom.selection.x1} x2={ddZoom.selection.x2} fill="#B71C1C" fillOpacity={0.12} />
                )}
                {tagLines.map((l) => (
                  <Area
                    key={l.key}
                    type="monotone"
                    dataKey={`dd__${l.key}`}
                    name={`dd__${l.key}`}
                    stroke={l.color}
                    fill={l.color}
                    fillOpacity={0.15}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                {compareNifty && (
                  <Area 
                    type="monotone"
                    dataKey="dd__Nifty50"
                    name="dd__Nifty50"
                    stroke="#E07B39"
                    fill="#E07B39"
                    fillOpacity={0.12}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </ZoomFrame>
        </div>
      )}

      {selectedChartTypes.includes("Monthly Returns Heatmap") && selectedTags.length > 0 && (
        <div className="bg-white rounded-lg border border-logo-green/10 p-4">
          <div className="text-sm font-semibold text-card-text mb-3">Monthly Returns Heatmap</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-card-text-secondary font-medium w-28">Strategy / Year</th>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m) => (
                    <th key={m} className="px-1 py-1 text-center text-card-text-secondary font-medium">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedTags.map((tagName, ti) => {
                  const tag = tags[tagName];
                  if (!tag) return null;
                  const years = Array.from(new Set(tag.monthly.map((m) => m.year))).sort() as number[];
                  const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  return years.map((yr, yi) => {
                    const rowData: Record<string, number | null> = {};
                    tag.monthly.filter((m) => m.year === yr).forEach((m) => { rowData[m.month.slice(0, 3)] = m.return_pct; });
                    return (
                      <tr key={`${tagName}-${yr}`} className={yi === 0 && ti > 0 ? "border-t-2 border-logo-green/20" : "border-t border-logo-green/5"}>
                        <td className="px-2 py-1 font-semibold text-card-text whitespace-nowrap">
                          {yi === 0 ? (
                            <span className="flex flex-col">
                              <span className="text-logo-green truncate max-w-[100px]" title={tagName}>{tagName.length > 14 ? tagName.slice(0, 12) + "…" : tagName}</span>
                              <span className="text-card-text-secondary font-normal">{yr}</span>
                            </span>
                          ) : (
                            <span className="text-card-text-secondary font-normal pl-1">{yr}</span>
                          )}
                        </td>
                        {MONTH_SHORT.map((monthName) => {
                          const val = rowData[monthName] ?? null;
                          const bg = val === null ? "bg-transparent" : val >= 3 ? "bg-green-700 text-white" : val >= 1 ? "bg-green-400 text-white" : val >= 0 ? "bg-green-100 text-green-800" : val >= -1 ? "bg-red-100 text-red-700" : val >= -3 ? "bg-red-400 text-white" : "bg-red-700 text-white";
                          return (
                            <td key={monthName} className={`px-1 py-1 text-center rounded-sm ${bg}`}>
                              {val === null ? "" : `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClientDetail({
  data, tagFilter, tagOptions, onTagsChange, pnlOn, onPnlOnChange,
}: {
  data: ClientDashboardResponse;
  tagFilter: string[];
  tagOptions: string[];
  onTagsChange: (tags: string[]) => void;
  pnlOn: string;
  onPnlOnChange: (v: string) => void;
}) {
  const [subTab, setSubTab] = useState("overview");

  const tabs = useMemo(
    () => [
      { key: "overview", label: "Overview", icon: <Pin className="h-3.5 w-3.5" /> },
      { key: "analysis", label: "Analysis", icon: <Ruler className="h-3.5 w-3.5" /> },
      { key: "charts", label: "Charts", icon: <LineChartIcon className="h-3.5 w-3.5" /> },
    ],
    []
  );

  const tagCount = Object.keys(data.tags).length;

  return (
    <div>
      <div className="mb-3">
        <h2 className="font-serif text-2xl text-logo-green mb-1.5">{data.account_name}</h2>
        <div className="flex flex-wrap items-center gap-4 text-xs text-card-text-secondary">
          <span>
            <strong className="text-logo-green">Profit tag:</strong> {data.profit_tag}
          </span>
          <span>📅 Data as of {data.data_as_of}</span>
          <span className="text-card-text-secondary/60">{tagCount} tags</span>
        </div>
      </div>

      <UnderlineTabs tabs={tabs} active={subTab} onChange={setSubTab} size="sm" />

      <div className="pt-5">
        {subTab === "overview" && (
          <OverviewTab
            data={data}
            tagFilter={tagFilter}
            tagOptions={tagOptions}
            onTagsChange={onTagsChange}
            pnlOn={pnlOn}
            onPnlOnChange={onPnlOnChange}
          />
        )}
        {subTab === "analysis" && <AnalysisTab data={data} tagFilter={tagFilter} />}
        {subTab === "charts" && <ChartsTab data={data} tagFilter={tagFilter} />}
      </div>
    </div>
  );
}