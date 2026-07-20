"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertCircle, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Download } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { fetchPortfolioSummary, type PortfolioSummaryResponse } from "./api";

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

const STRATEGY_COLORS: Record<string, string> = {
  "QYE++": "#02422B", "QYE+": "#4A9D7A",
  "QAW++": "#DABD38", "QAW+": "#E07B39", "QTF++": "#1D4ED8",
};
function stratColor(s: string) { return STRATEGY_COLORS[s] || "#6B7280"; }

function fmtCr(v: number) {
  const cr = v / 1e7;
  return `₹${cr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmtMonthKey(date: string) {
  const d = new Date(date);
  return `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

function toMonthly(series: { date: string; aum: number }[]) {
  const map = new Map<string, { label: string; aum: number; year: number; month: number }>();
  [...series].sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, { label: fmtMonthKey(p.date), aum: p.aum, year: d.getFullYear(), month: d.getMonth() });
  });
  return Array.from(map.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

function toQuarterly(series: { date: string; aum: number }[]) {
  const map = new Map<string, { label: string; aum: number; year: number; q: number }>();
  [...series].sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => {
    const d = new Date(p.date);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const key = `${d.getFullYear()}-Q${q}`;
    map.set(key, { label: `Q${q} '${String(d.getFullYear()).slice(2)}`, aum: p.aum, year: d.getFullYear(), q });
  });
  return Array.from(map.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.q - b.q);
}

// Monthly: year × 12 months grid
function toYearMonthTable(series: { date: string; aum: number }[]) {
  const monthly = toMonthly(series);
  const years = Array.from(new Set(monthly.map((m) => m.year))).sort();
  return years.map((yr) => {
    const months: (number | null)[] = Array(12).fill(null);
    monthly.filter((m) => m.year === yr).forEach((m) => { months[m.month] = m.aum; });
    const values = months.filter((v) => v !== null) as number[];
    return { year: yr, months, total: values.length > 0 ? values[values.length - 1] : 0 };
  });
}

// Quarterly: year × 4 quarters grid
function toYearQuarterTable(series: { date: string; aum: number }[]) {
  const quarterly = toQuarterly(series);
  const years = Array.from(new Set(quarterly.map((q) => q.year))).sort();
  return years.map((yr) => {
    const quarters: (number | null)[] = Array(4).fill(null);
    quarterly.filter((q) => q.year === yr).forEach((q) => { quarters[q.q - 1] = q.aum; });
    const values = quarters.filter((v) => v !== null) as number[];
    return { year: yr, quarters, total: values.length > 0 ? values[values.length - 1] : 0 };
  });
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-logo-green pl-3.5 py-1 my-6">
      <span className="text-xs font-bold uppercase tracking-wide text-logo-green">{children}</span>
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: "chart" | "table"; onChange: (v: "chart" | "table") => void }) {
  return (
    <div className="flex flex-col gap-2">
      {(["chart", "table"] as const).map((v) => (
        <label key={v} className="flex items-center gap-2.5 text-sm text-card-text cursor-pointer">
          <span className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${value === v ? "border-red-500" : "border-card-text-secondary/40"}`}>
            {value === v && <span className="block h-full w-full scale-50 rounded-full bg-red-500" />}
          </span>
          <input type="radio" className="sr-only" checked={value === v} onChange={() => onChange(v)} />
          {v === "chart" ? "📈 Chart" : "📋 Table"}
        </label>
      ))}
    </div>
  );
}

function FreqToggle({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-sm text-card-text cursor-pointer">
          <span className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${value === opt ? "border-red-500" : "border-card-text-secondary/40"}`}>
            {value === opt && <span className="block h-full w-full scale-50 rounded-full bg-red-500" />}
          </span>
          <input type="radio" className="sr-only" checked={value === opt} onChange={() => onChange(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}

// ── AumTable: respects freq ────────────────────────────────────────────────────

function AumTable({ series, freq }: { series: { date: string; aum: number }[]; freq: string }) {
  if (freq === "Quarterly") {
    const rows = toYearQuarterTable(series);
    return (
      <div className="overflow-x-auto rounded-lg border border-logo-green/10 pdf-section">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-logo-green text-white">
              <th className="px-3 py-2.5 text-left font-semibold">Year</th>
              {QUARTER_LABELS.map((q) => <th key={q} className="px-3 py-2.5 text-center font-semibold">{q}</th>)}
              <th className="px-3 py-2.5 text-right font-semibold">End AUM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="border-t border-logo-green/5 bg-white">
                <td className="px-3 py-2.5 font-semibold text-card-text">{row.year}</td>
                {row.quarters.map((v, i) => (
                  <td key={i} className="px-3 py-2.5 text-center text-card-text-secondary text-xs">
                    {v === null ? "—" : fmtCr(v)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-bold text-card-text bg-primary-bg/50">{fmtCr(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Monthly (default)
  const rows = toYearMonthTable(series);
  return (
    <div className="overflow-x-auto rounded-lg border border-logo-green/10 pdf-section">
      <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr className="bg-logo-green text-white">
            <th className="px-3 py-2.5 text-left font-semibold">Year</th>
            {MONTH_LABELS.map((m) => <th key={m} className="px-3 py-2.5 text-center font-semibold">{m}</th>)}
            <th className="px-3 py-2.5 text-right font-semibold bg-logo-green/80">End AUM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year} className="border-t border-logo-green/5 bg-white">
              <td className="px-3 py-2.5 font-semibold text-card-text">{row.year}</td>
              {row.months.map((v, i) => (
                <td key={i} className="px-3 py-2.5 text-center text-card-text-secondary text-xs">
                  {v === null ? "—" : fmtCr(v)}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right font-bold text-card-text bg-primary-bg/50">{fmtCr(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── StrategyAumTables: respects freq ─────────────────────────────────────────

function StrategyAumTables({
  strategyAumDaily, freq,
}: {
  strategyAumDaily: Record<string, { date: string; aum: number }[]>;
  freq: string;
}) {
  return (
    <div className="space-y-5">
      {Object.entries(strategyAumDaily).map(([strategy, series]) => {
        if (freq === "Quarterly") {
          const rows = toYearQuarterTable(series);
          return (
            <div key={strategy} className="overflow-x-auto rounded-lg border border-logo-green/10 pdf-section">
              <div className="bg-logo-green text-white px-4 py-2.5 font-semibold text-sm">{strategy}</div>
              <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="bg-primary-bg/60 text-card-text-secondary">
                    <th className="px-3 py-2 text-left font-medium">Year</th>
                    {QUARTER_LABELS.map((q) => <th key={q} className="px-3 py-2 text-center font-medium">{q}</th>)}
                    <th className="px-3 py-2 text-right font-medium bg-primary-bg">End AUM</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.year} className="border-t border-logo-green/5 bg-white">
                      <td className="px-3 py-2 font-semibold text-card-text">{row.year}</td>
                      {row.quarters.map((v, i) => (
                        <td key={i} className="px-3 py-2 text-center text-card-text-secondary text-xs">
                          {v === null ? "—" : fmtCr(v)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-bold text-card-text bg-primary-bg/50">{fmtCr(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Monthly
        const rows = toYearMonthTable(series);
        return (
          <div key={strategy} className="overflow-x-auto rounded-lg border border-logo-green/10 pdf-section">
            <div className="bg-logo-green text-white px-4 py-2.5 font-semibold text-sm">{strategy}</div>
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="bg-primary-bg/60 text-card-text-secondary">
                  <th className="px-3 py-2 text-left font-medium">Year</th>
                  {MONTH_LABELS.map((m) => <th key={m} className="px-3 py-2 text-center font-medium">{m}</th>)}
                  <th className="px-3 py-2 text-right font-medium bg-primary-bg">End AUM</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.year} className="border-t border-logo-green/5 bg-white">
                    <td className="px-3 py-2 font-semibold text-card-text">{row.year}</td>
                    {row.months.map((v, i) => (
                      <td key={i} className="px-3 py-2 text-center text-card-text-secondary text-xs">
                        {v === null ? "—" : fmtCr(v)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold text-card-text bg-primary-bg/50">{fmtCr(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PortfolioSummary() {
  const [data, setData] = useState<PortfolioSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPortfolioSummary()
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load portfolio summary."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading portfolio summary…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load portfolio summary.</p>
          <p className="text-red-600/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return <PortfolioSummaryInner data={data} />;
}

const INVESTOR_GRID_COLS = "48px minmax(160px,1fr) 150px 110px 130px 90px";

function InvestorAumTable({ investors, totalAum }: {
  investors: { qcode: string; account_name: string; strategy: string; since: string; aum: number }[];
  totalAum: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const map = new Map<string, number>();
    investors.forEach((inv) => {
      map.set(inv.account_name, (map.get(inv.account_name) || 0) + 1);
    });
    return new Set(
      Array.from(map.entries())
        .filter(([, count]) => count > 1)
        .map(([name]) => name)
    );
  });
  const [sortKey, setSortKey] = useState<"name" | "since" | "aum" | "share">("aum");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const sortArrow = (col: typeof sortKey) => {
    if (sortKey !== col) return <span className="text-white/30 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { qcode: string; account_name: string; since: string; totalAum: number; strategies: typeof investors }>();
    investors.forEach((inv) => {
      if (!map.has(inv.account_name)) {
        map.set(inv.account_name, { qcode: inv.qcode, account_name: inv.account_name, since: inv.since, totalAum: 0, strategies: [] });
      }
      const e = map.get(inv.account_name)!;
      e.totalAum += inv.aum;
      e.strategies.push(inv);
      if (inv.since < e.since) e.since = inv.since;
    });
    return Array.from(map.values()).sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.account_name.localeCompare(b.account_name);
      if (sortKey === "since") cmp = a.since.localeCompare(b.since);
      if (sortKey === "aum" || sortKey === "share") cmp = a.totalAum - b.totalAum;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [investors, sortKey, sortDir]);

  function toggle(name: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-logo-green/10 pdf-section">
      {/* Header row */}
      <div
        className="grid bg-logo-green text-white text-sm font-semibold"
        style={{ gridTemplateColumns: INVESTOR_GRID_COLS ,minWidth: 688 }}
      >
        <div className="px-4 py-2.5">#</div>
        <div className="px-4 py-2.5 cursor-pointer select-none hover:bg-logo-green/80" onClick={() => handleSort("name")}>
          Client {sortArrow("name")}
        </div>
        <div className="px-4 py-2.5">Strategy</div>
        <div className="px-4 py-2.5 cursor-pointer select-none hover:bg-logo-green/80" onClick={() => handleSort("since")}>
          Since {sortArrow("since")}
        </div>
        <div className="px-4 py-2.5 text-right cursor-pointer select-none hover:bg-logo-green/80" onClick={() => handleSort("aum")}>
          AUM {sortArrow("aum")}
        </div>
        <div className="px-4 py-2.5 text-right cursor-pointer select-none hover:bg-logo-green/80" onClick={() => handleSort("share")}>
          Share {sortArrow("share")}
        </div>
      </div>

      {/* Body rows */}
      <div>
        {grouped.map((client, i) => {
          const isExpanded = expanded.has(client.account_name);
          const isMulti = client.strategies.length > 1;
          return (
            // Each client group (main row + any expanded sub-rows) is one
            // break-avoid unit so it never splits mid-group across a page.
            <div key={client.account_name} className="pdf-row-group">
              <div
                className="grid items-center border-t border-logo-green/5 bg-white hover:bg-primary-bg/20 transition-colors text-sm"
                style={{ gridTemplateColumns: INVESTOR_GRID_COLS,minWidth: 688  }}
              >
                <div className="px-4 py-2.5 text-card-text-secondary">{i + 1}</div>
                <div className="px-4 py-2.5 font-semibold text-card-text">{client.account_name}</div>
                <div className="px-4 py-2.5">
                  {isMulti ? (
                    <button type="button" onClick={() => toggle(client.account_name)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-button-text/15 border border-button-text/40 px-2 py-0.5 text-xs font-semibold text-card-text hover:bg-button-text/25 transition-colors">
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {client.strategies.length} strategies
                    </button>
                  ) : (
                    <span className="inline-block rounded-md bg-button-text/15 border border-button-text/40 px-2 py-0.5 text-xs font-semibold text-card-text leading-none">
                      {client.strategies[0].strategy}
                    </span>
                  )}
                </div>
                <div className="px-4 py-2.5 text-card-text-secondary">{fmtDate(client.since)}</div>
                <div className="px-4 py-2.5 text-right font-medium text-card-text">{fmtCr(client.totalAum)}</div>
                <div className="px-4 py-2.5 text-right text-card-text-secondary">{((client.totalAum / totalAum) * 100).toFixed(1)}%</div>
              </div>

              {isMulti && isExpanded && client.strategies.sort((a, b) => b.aum - a.aum).map((strat) => (
                <div
                  key={`${client.account_name}-${strat.strategy}`}
                  className="grid items-center border-t border-logo-green/5 bg-primary-bg/30 text-xs"
                  style={{ gridTemplateColumns: INVESTOR_GRID_COLS ,minWidth: 688 }}
                >
                  <div className="px-4 py-2" />
                  <div className="px-4 py-2 text-card-text-secondary pl-8">↳ {strat.account_name}</div>
                  <div className="px-4 py-2">
                    <span className="inline-block rounded-md bg-logo-green/10 border border-logo-green/20 px-2 py-0.5 text-xs font-semibold text-logo-green leading-none">
                      {strat.strategy}
                    </span>
                  </div>
                  <div className="px-4 py-2 text-card-text-secondary">{fmtDate(strat.since)}</div>
                  <div className="px-4 py-2 text-right font-medium text-card-text">{fmtCr(strat.aum)}</div>
                  <div className="px-4 py-2 text-right text-card-text-secondary">{((strat.aum / totalAum) * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          );
        })}

        {/* Total row */}
        <div
          className="grid items-center bg-logo-green text-sm"
          style={{ gridTemplateColumns: INVESTOR_GRID_COLS ,minWidth: 688 }}
        >
          <div className="px-4 py-3 font-semibold text-white" style={{ gridColumn: "1 / span 4" }}>Total</div>
          <div className="px-4 py-3 text-right font-bold text-white">{fmtCr(totalAum)}</div>
          <div className="px-4 py-3 text-right font-semibold text-button-text">100%</div>
        </div>
      </div>
    </div>
  );
}

function PortfolioSummaryInner({ data }: { data: PortfolioSummaryResponse }) {
  const { total_investors, total_aum, mom, investors, aum_daily, strategy_aum_daily } = data;

  const [aumView, setAumView] = useState<"chart" | "table">("chart");
  const [aumFreq, setAumFreq] = useState("Daily");
  const [strategyView, setStrategyView] = useState<"chart" | "table">("chart");
  const [strategyFreq, setStrategyFreq] = useState("Daily");
  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    const html2pdf = (await import("html2pdf.js")).default;

    setIsExporting(true);
     await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      await html2pdf()
        .set({
          margin: 8,
          filename: "portfolio-summary.pdf",
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 1400,
            onclone: async (clonedDoc: Document) => {
              clonedDoc.defaultView?.dispatchEvent(new Event("resize"));
              await clonedDoc.fonts.ready
            },
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
          // @ts-ignore
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(printRef.current)
        .save();
    } finally {
      setIsExporting(false);
    }
  }

  const momPositive = mom.change_pct >= 0;

  const aumLineSeries = useMemo(() => {
    if (aumFreq === "Monthly") return toMonthly(aum_daily).map((m) => ({ date: m.label, aum: m.aum / 1e7 }));
    if (aumFreq === "Quarterly") return toQuarterly(aum_daily).map((m) => ({ date: m.label, aum: m.aum / 1e7 }));
    return aum_daily.map((p) => ({ date: p.date, aum: p.aum / 1e7 }));
  }, [aum_daily, aumFreq]);

  const strategies = useMemo(() => Object.keys(strategy_aum_daily), [strategy_aum_daily]);

  const strategyLineSeries = useMemo(() => {
    const getPoints = (series: { date: string; aum: number }[]) => {
      if (strategyFreq === "Monthly") return toMonthly(series).map((m) => ({ date: m.label, aum: m.aum / 1e7 }));
      if (strategyFreq === "Quarterly") return toQuarterly(series).map((m) => ({ date: m.label, aum: m.aum / 1e7 }));
      return series.map((p) => ({ date: p.date, aum: p.aum / 1e7 }));
    };
    const dateMap = new Map<string, Record<string, number>>();
    Object.entries(strategy_aum_daily).forEach(([name, series]) => {
      getPoints(series).forEach((p) => {
        if (!dateMap.has(p.date)) dateMap.set(p.date, {});
        dateMap.get(p.date)![name] = p.aum;
      });
    });
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [strategy_aum_daily, strategyFreq]);

  const activeInvestors = useMemo(() => investors.filter((inv) => !inv.until), [investors]);

  const strategyBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    activeInvestors.forEach((inv) => map.set(inv.strategy, (map.get(inv.strategy) || 0) + inv.aum));
    return Array.from(map.entries()).map(([name, aum]) => ({ name, aum, pct: (aum / total_aum) * 100 })).sort((a, b) => b.aum - a.aum);
  }, [activeInvestors, total_aum]);

  const strategyInvestorCount = useMemo(() => {
    const map = new Map<string, number>();
    activeInvestors.forEach((inv) => map.set(inv.strategy, (map.get(inv.strategy) || 0) + 1));
    return map;
  }, [activeInvestors]);

  const firstInvestmentByMonth = useMemo(() => {
    const earliest = new Map<string, string>();
    investors.forEach((inv) => {
      if (!earliest.has(inv.qcode) || inv.since < earliest.get(inv.qcode)!) earliest.set(inv.qcode, inv.since);
    });
    const counts = new Map<string, number>();
    Array.from(earliest.values()).forEach((since) => {
      const label = fmtMonthKey(since);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([month, count]) => ({ month, count }));
  }, [investors]);

  const investorsDonut = useMemo(() => {
    return strategyBreakdown.map((s) => ({
      strategy: s.name,
      count: strategyInvestorCount.get(s.name) || 0,
      color: stratColor(s.name),
    }));
  }, [strategyBreakdown, strategyInvestorCount]);

  const investorAumDonut = useMemo(() => {
    return [...activeInvestors]
      .sort((a, b) => b.aum - a.aum)
      .map((inv) => ({ name: inv.account_name, value: inv.aum, color: stratColor(inv.strategy) }));
  }, [activeInvestors]);

  return (
    <div ref={printRef} className="print-area">
      <style>{`
        .print-area .pdf-section { break-inside: avoid; page-break-inside: avoid; }
        .print-area .pdf-row-group { break-inside: avoid; page-break-inside: avoid; }
        /* Forces these sections onto a fresh PDF page rather than trying
           to fit under whatever chart preceded them on the current page. */
        .print-area .pdf-page-break { break-before: page; page-break-before: always; }
      `}</style>

      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-serif text-2xl text-logo-green mb-1">Portfolio Summary</h2>
            <p className="text-sm text-card-text-secondary">
              Executive overview · All figures as of latest available data
            </p>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={isExporting}
            data-html2canvas-ignore="true"
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-white hover:bg-logo-green/90 disabled:opacity-60 transition-colors flex-shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isExporting ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-2 pdf-section">
          <div className="rounded-xl bg-white border border-logo-green/10 border-t-4 border-t-logo-green p-5 overflow-hidden">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-card-text-secondary mb-2">Total Investors</div>
            <div className="text-3xl font-bold text-card-text">{total_investors}</div>
            <div className="text-xs text-card-text-secondary mt-1">Active clients</div>
          </div>
          <div className="rounded-xl bg-white border border-logo-green/10 border-t-4 border-t-button-text p-5 overflow-hidden">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-card-text-secondary mb-2">Total AUM</div>
            <div className="text-3xl mb-5 font-serif font-bold text-card-text">{fmtCr(total_aum)}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold leading-none ${momPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {momPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {momPositive ? "+" : ""}{(mom.change_pct * 100).toFixed(2)}%
              </span>
              <span className="text-xs text-card-text-secondary">vs {fmtDate(mom.prev_date)} ({fmtCr(mom.prev_aum)})</span>
            </div>
          </div>
        </div>

        {/* AUM Over Time */}
        <SectionHeader>AUM Over Time</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-5 mb-4 pdf-section">
          <ViewToggle value={aumView} onChange={(v) => {
            setAumView(v);
            if (v === "table" && aumFreq === "Daily") setAumFreq("Monthly");
          }} />
          <FreqToggle
            options={aumView === "chart" ? ["Daily", "Monthly", "Quarterly"] : ["Monthly", "Quarterly"]}
            value={aumFreq}
            onChange={setAumFreq}
          />
        </div>
        {aumView === "chart" ? (
          <div className="overflow-x-auto p-3 bg-white rounded-lg border border-logo-green/10 pdf-section">
            <div className="text-sm font-semibold text-card-text mb-3">Portfolio AUM — {aumFreq}</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={aumLineSeries}>
                <CartesianGrid stroke="#E8E4D4" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#555" }} minTickGap={40} tickFormatter={(d) => aumFreq === "Daily" ? fmtDate(d) : d} />
                <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={(v) => `₹${v.toFixed(0)}Cr`} width={65} />
                <Tooltip labelFormatter={(d) => aumFreq === "Daily" ? fmtDate(d) : d} formatter={(v: number) => [fmtCr(v * 1e7), "AUM"]} />
                <Line type="monotone" dataKey="aum" stroke="#02422B" strokeWidth={2.5} dot={false} name="Total AUM" isAnimationActive={!isExporting} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <AumTable series={aum_daily} freq={aumFreq} />
        )}

        {/* Strategy-wise AUM Breakup */}
        <SectionHeader>Strategy-wise AUM Breakup</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-5 mb-4 pdf-section">
          <ViewToggle value={strategyView} onChange={(v) => {
            setStrategyView(v);
            if (v === "table" && strategyFreq === "Daily") setStrategyFreq("Monthly");
          }} />
          <FreqToggle
            options={strategyView === "chart" ? ["Daily", "Monthly", "Quarterly"] : ["Monthly", "Quarterly"]}
            value={strategyFreq}
            onChange={setStrategyFreq}
          />
        </div>
        {strategyView === "chart" ? (
          <div className="rounded-lg border border-logo-green/10 bg-white p-4 pdf-section">
            <div className="text-sm font-semibold text-card-text mb-3">AUM by Strategy — {strategyFreq}</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={strategyLineSeries}>
                <CartesianGrid stroke="#E8E4D4" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#555" }} minTickGap={50} tickFormatter={(d) => strategyFreq === "Daily" ? fmtDate(d) : d} />
                <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={(v) => `₹${v.toFixed(0)}Cr`} width={65} />
                <Tooltip labelFormatter={(d) => strategyFreq === "Daily" ? fmtDate(d) : d} formatter={(v: number, name: string) => [v != null ? fmtCr(v * 1e7) : "—", name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {strategies.map((s) => (
                  <Line key={s} type="monotone" dataKey={s} stroke={stratColor(s)} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={!isExporting} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <StrategyAumTables strategyAumDaily={strategy_aum_daily} freq={strategyFreq} />
        )}

        {/* Strategy Breakdown — forced onto its own page, non-responsive
            auto-fit grid so it doesn't depend on media-query evaluation
            inside html2canvas's capture. */}
        <div className="pdf-page-break">
          <SectionHeader>Strategy Breakdown</SectionHeader>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div className="rounded-lg border border-logo-green/10 bg-white p-4 pdf-section">
              <div className="text-sm font-semibold text-card-text mb-2">AUM — Strategy Wise</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={strategyBreakdown} dataKey="aum" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, pct }) => `${name} ${pct.toFixed(1)}%`} labelLine={false} fontSize={11}
                    isAnimationActive={!isExporting}>
                    {strategyBreakdown.map((s) => <Cell key={s.name} fill={stratColor(s.name)} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtCr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-logo-green/10 bg-white p-4 pdf-section">
              <div className="text-sm font-semibold text-card-text mb-2">No. of Investors — Strategy Wise</div>
              <div className="relative">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={investorsDonut} dataKey="count" nameKey="strategy" cx="50%" cy="50%"
                      innerRadius={45} outerRadius={80}
                      label={({ strategy, count }) => `${strategy} ${count}`} labelLine={false} fontSize={11}
                      isAnimationActive={!isExporting}>
                      {investorsDonut.map((e) => <Cell key={e.strategy} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-2xl font-bold text-card-text">{total_investors}</div>
                  <div className="text-[0.65rem] text-card-text-secondary uppercase tracking-wide">Investors</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-logo-green/10 bg-white p-4 pdf-section">
              <div className="text-sm font-semibold text-card-text mb-2">Month-over-Month: {fmtDate(mom.prev_date)} vs Latest</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { label: fmtDate(mom.prev_date), AUM: mom.prev_aum / 1e7 },
                  { label: "Latest", AUM: total_aum / 1e7 },
                ]}>
                  <CartesianGrid stroke="#E8E4D4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={(v) => `₹${v.toFixed(0)}Cr`} width={65} />
                  <Tooltip formatter={(v: number) => fmtCr(v * 1e7)} />
                  <Bar dataKey="AUM" radius={[4, 4, 0, 0]} isAnimationActive={!isExporting}>
                    <Cell fill="#DABD38" /><Cell fill="#02422B" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Investor Detail — same treatment: own page, auto-fit grid. */}
        <div className="pdf-page-break">
          <SectionHeader>Investor Detail</SectionHeader>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="rounded-lg border border-logo-green/10 bg-white p-4 pdf-section">
              <div className="text-sm font-semibold text-card-text mb-2">Investor-wise AUM Breakup</div>
              <div className="relative">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={investorAumDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100}
                      isAnimationActive={!isExporting}>
                      {investorAumDonut.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={1 - (i / investorAumDonut.length) * 0.5} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtCr(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-xl font-bold text-card-text">{fmtCr(total_aum)}</div>
                  <div className="text-[0.65rem] text-card-text-secondary uppercase tracking-wide">Total AUM</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-logo-green/10 bg-white p-4 pdf-section">
              <div className="text-sm font-semibold text-card-text mb-2">Number of Investors Added by Month.</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={firstInvestmentByMonth}>
                  <CartesianGrid stroke="#E8E4D4" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#555" }} angle={-25} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: "#555" }} width={28} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#02422B" radius={[4, 4, 0, 0]} isAnimationActive={!isExporting} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Investor AUM Table */}
        <SectionHeader>Investor AUM Table</SectionHeader>
        <InvestorAumTable investors={activeInvestors} totalAum={total_aum} />
      </div>
    </div>
  );
}

export default PortfolioSummary;