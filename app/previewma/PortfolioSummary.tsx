"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fetchPortfolioSummary, type PortfolioSummaryResponse } from "./api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

const STRATEGY_COLORS: Record<string, string> = {
  "QYE++": "#02422B",
  "QYE+":  "#4A9D7A",
  "QAW++": "#DABD38",
  "QAW+":  "#E07B39",
  "QTF++": "#1D4ED8",
};
function stratColor(s: string) {
  return STRATEGY_COLORS[s] || "#6B7280";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCr(v: number) {
  const cr = v / 1e7;
  return `₹${cr.toLocaleString("en-IN", { maximumFractionDigits: cr >= 100 ? 0 : 2 })} Cr`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtMonthKey(date: string) {
  const d = new Date(date);
  return `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

// Aggregate daily series into monthly end-of-month values
function toMonthly(series: { date: string; aum: number }[]) {
  const map = new Map<string, { label: string; aum: number; year: number; month: number }>();
  series.forEach((p) => {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, { label: fmtMonthKey(p.date), aum: p.aum, year: d.getFullYear(), month: d.getMonth() });
  });
  return Array.from(map.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

// Aggregate daily series into quarterly (last day of each quarter)
function toQuarterly(series: { date: string; aum: number }[]) {
  const map = new Map<string, { label: string; aum: number }>();
  series.forEach((p) => {
    const d = new Date(p.date);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const key = `${d.getFullYear()}-Q${q}`;
    map.set(key, { label: `Q${q} '${String(d.getFullYear()).slice(2)}`, aum: p.aum });
  });
  return Array.from(map.values());
}

// Build year×month table from daily series
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function AumTable({ series }: { series: { date: string; aum: number }[] }) {
  const rows = useMemo(() => toYearMonthTable(series), [series]);
  return (
    <div className="overflow-x-auto rounded-lg border border-logo-green/10">
      <table className="w-full text-sm">
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

function StrategyAumTables({ strategyAumDaily }: { strategyAumDaily: Record<string, { date: string; aum: number }[]> }) {
  return (
    <div className="space-y-5">
      {Object.entries(strategyAumDaily).map(([strategy, series]) => {
        const rows = toYearMonthTable(series);
        return (
          <div key={strategy} className="overflow-x-auto rounded-lg border border-logo-green/10">
            <div className="bg-logo-green text-white px-4 py-2.5 font-semibold text-sm">{strategy}</div>
            <table className="w-full text-sm">
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

function PortfolioSummaryInner({ data }: { data: PortfolioSummaryResponse }) {
  const { total_investors, total_aum, mom, investors, aum_daily, strategy_aum_daily } = data;

  const [aumView, setAumView] = useState<"chart" | "table">("chart");
  const [aumFreq, setAumFreq] = useState("Daily");
  const [strategyView, setStrategyView] = useState<"chart" | "table">("chart");
  const [strategyFreq, setStrategyFreq] = useState("Daily");

  const momPositive = mom.change_pct >= 0;

  // AUM line series based on frequency
  const aumLineSeries = useMemo(() => {
    if (aumFreq === "Monthly") return toMonthly(aum_daily).map((m) => ({ date: m.label, aum: m.aum / 1e7 }));
    if (aumFreq === "Quarterly") return toQuarterly(aum_daily).map((m) => ({ date: m.label, aum: m.aum / 1e7 }));
    return aum_daily.map((p) => ({ date: p.date, aum: p.aum / 1e7 }));
  }, [aum_daily, aumFreq]);

  // Strategy series merged onto a common date axis
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

  // Strategy AUM breakdown from investors
  const strategyBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    investors.forEach((inv) => map.set(inv.strategy, (map.get(inv.strategy) || 0) + inv.aum));
    return Array.from(map.entries()).map(([name, aum]) => ({ name, aum, pct: (aum / total_aum) * 100 })).sort((a, b) => b.aum - a.aum);
  }, [investors, total_aum]);

  // Investor count per strategy
  const strategyInvestorCount = useMemo(() => {
    const map = new Map<string, number>();
    investors.forEach((inv) => map.set(inv.strategy, (map.get(inv.strategy) || 0) + 1));
    return map;
  }, [investors]);

  // First investment by month bar chart
  const firstInvestmentByMonth = useMemo(() => {
    // Group by unique qcode, take earliest 'since' per investor
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

  // Investor donut (strategy-wise count)
  const investorsDonut = useMemo(() => {
    return strategyBreakdown.map((s) => ({
      strategy: s.name,
      count: strategyInvestorCount.get(s.name) || 0,
      color: stratColor(s.name),
    }));
  }, [strategyBreakdown, strategyInvestorCount]);

  // Investor AUM donut
  const investorAumDonut = useMemo(() => {
    return [...investors]
      .sort((a, b) => b.aum - a.aum)
      .map((inv) => ({ name: inv.account_name, value: inv.aum, color: stratColor(inv.strategy) }));
  }, [investors]);

  const sortedInvestors = useMemo(() => [...investors].sort((a, b) => b.aum - a.aum), [investors]);

  return (
    <div>
      <h2 className="font-serif text-2xl text-logo-green mb-1">Portfolio Summary</h2>
      <p className="text-sm text-card-text-secondary mb-6">
        Executive overview &middot; All figures as of latest available data
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-2">
        <div className="rounded-xl bg-white border border-logo-green/10 border-t-4 border-t-logo-green p-5">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-card-text-secondary mb-2">Total Investors</div>
          <div className="text-3xl font-bold text-card-text">{total_investors}</div>
          <div className="text-xs text-card-text-secondary mt-1">Active clients</div>
        </div>
        <div className="rounded-xl bg-white border border-logo-green/10 border-t-4 border-t-button-text p-5">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-card-text-secondary mb-2">Total AUM</div>
          <div className="text-3xl font-serif font-bold text-card-text">{fmtCr(total_aum)}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${momPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {momPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {momPositive ? "+" : ""}{(mom.change_pct * 100).toFixed(2)}%
            </span>
            <span className="text-xs text-card-text-secondary">vs {fmtDate(mom.prev_date)} ({fmtCr(mom.prev_aum)})</span>
          </div>
        </div>
      </div>

      {/* AUM Over Time */}
      <SectionHeader>AUM Over Time</SectionHeader>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-5 mb-4">
        <ViewToggle value={aumView} onChange={setAumView} />
        <FreqToggle
          options={aumView === "chart" ? ["Daily", "Monthly", "Quarterly"] : ["Monthly", "Quarterly"]}
          value={aumFreq}
          onChange={setAumFreq}
        />
      </div>
      {aumView === "chart" ? (
        <div className="rounded-lg border border-logo-green/10 bg-white p-4">
          <div className="text-sm font-semibold text-card-text mb-3">Portfolio AUM — {aumFreq}</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={aumLineSeries}>
              <CartesianGrid stroke="#E8E4D4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#555" }} minTickGap={40} tickFormatter={(d) => aumFreq === "Daily" ? fmtDate(d) : d} />
              <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={(v) => `₹${v.toFixed(0)}Cr`} width={65} />
              <Tooltip labelFormatter={(d) => aumFreq === "Daily" ? fmtDate(d) : d} formatter={(v: number) => [fmtCr(v * 1e7), "AUM"]} />
              <Line type="monotone" dataKey="aum" stroke="#02422B" strokeWidth={2.5} dot={false} name="Total AUM" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <AumTable series={aum_daily} />
      )}

      {/* Strategy-wise AUM Breakup */}
      <SectionHeader>Strategy-wise AUM Breakup</SectionHeader>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-5 mb-4">
        <ViewToggle value={strategyView} onChange={setStrategyView} />
        <FreqToggle
          options={["Daily", "Monthly", "Quarterly"]}
          value={strategyFreq}
          onChange={setStrategyFreq}
        />
      </div>
      {strategyView === "chart" ? (
        <div className="rounded-lg border border-logo-green/10 bg-white p-4">
          <div className="text-sm font-semibold text-card-text mb-3">AUM by Strategy — {strategyFreq}</div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={strategyLineSeries}>
              <CartesianGrid stroke="#E8E4D4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#555" }} minTickGap={50} tickFormatter={(d) => strategyFreq === "Daily" ? fmtDate(d) : d} />
              <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={(v) => `₹${v.toFixed(0)}Cr`} width={65} />
              <Tooltip labelFormatter={(d) => strategyFreq === "Daily" ? fmtDate(d) : d} formatter={(v: number, name: string) => [v != null ? fmtCr(v * 1e7) : "—", name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {strategies.map((s) => (
                <Line key={s} type="monotone" dataKey={s} stroke={stratColor(s)} strokeWidth={2.2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <StrategyAumTables strategyAumDaily={strategy_aum_daily} />
      )}

      {/* Strategy Breakdown charts */}
      <SectionHeader>Strategy Breakdown</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* AUM pie */}
        <div className="rounded-lg border border-logo-green/10 bg-white p-4">
          <div className="text-sm font-semibold text-card-text mb-2">AUM — Strategy Wise</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={strategyBreakdown} dataKey="aum" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                label={({ name, pct }) => `${name} ${pct.toFixed(1)}%`} labelLine={false} fontSize={11}>
                {strategyBreakdown.map((s) => <Cell key={s.name} fill={stratColor(s.name)} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtCr(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Investors donut */}
        <div className="rounded-lg border border-logo-green/10 bg-white p-4">
          <div className="text-sm font-semibold text-card-text mb-2">No. of Investors — Strategy Wise</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={investorsDonut} dataKey="count" nameKey="strategy" cx="50%" cy="50%"
                innerRadius={45} outerRadius={80}
                label={({ strategy, count }) => `${strategy} ${count}`} labelLine={false} fontSize={11}>
                {investorsDonut.map((e) => <Cell key={e.strategy} fill={e.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-32 mb-24 pointer-events-none">
            <div className="text-2xl font-bold text-card-text">{total_investors}</div>
            <div className="text-[0.65rem] text-card-text-secondary uppercase tracking-wide">Investors</div>
          </div>
        </div>

        {/* MoM bar */}
        <div className="rounded-lg border border-logo-green/10 bg-white p-4">
          <div className="text-sm font-semibold text-card-text mb-2">
            Month-over-Month: {fmtDate(mom.prev_date)} vs Latest
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={[
              { label: fmtDate(mom.prev_date), aum: mom.prev_aum / 1e7 },
              { label: "Latest", aum: total_aum / 1e7 },
            ]}>
              <CartesianGrid stroke="#E8E4D4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} />
              <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={(v) => `₹${v.toFixed(0)}Cr`} width={65} />
              <Tooltip formatter={(v: number) => fmtCr(v * 1e7)} />
              <Bar dataKey="aum" radius={[4, 4, 0, 0]}>
                <Cell fill="#DABD38" />
                <Cell fill="#02422B" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Investor Detail */}
      <SectionHeader>Investor Detail</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
        <div className="rounded-lg border border-logo-green/10 bg-white p-4">
          <div className="text-sm font-semibold text-card-text mb-2">Investor-wise AUM Breakup</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={investorAumDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100}>
                {investorAumDonut.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={1 - (i / investorAumDonut.length) * 0.5} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtCr(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-36 mb-24 pointer-events-none">
            <div className="text-xl font-bold text-card-text">{fmtCr(total_aum)}</div>
            <div className="text-[0.65rem] text-card-text-secondary uppercase tracking-wide">Total AUM</div>
          </div>
        </div>

        <div className="rounded-lg border border-logo-green/10 bg-white p-4">
          <div className="text-sm font-semibold text-card-text mb-2">First Investment — By Month</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={firstInvestmentByMonth}>
              <CartesianGrid stroke="#E8E4D4" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#555" }} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: "#555" }} width={28} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#02422B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Investor AUM Table */}
      <SectionHeader>Investor AUM Table</SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-logo-green/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-logo-green text-white">
              <th className="px-4 py-2.5 text-left font-semibold">#</th>
              <th className="px-4 py-2.5 text-left font-semibold">Client</th>
              <th className="px-4 py-2.5 text-left font-semibold">Strategy</th>
              <th className="px-4 py-2.5 text-left font-semibold">Since</th>
              <th className="px-4 py-2.5 text-right font-semibold">AUM</th>
              <th className="px-4 py-2.5 text-right font-semibold">Share</th>
            </tr>
          </thead>
          <tbody>
            {sortedInvestors.map((inv, i) => (
              <tr key={`${inv.qcode}-${inv.strategy}`} className="border-t border-logo-green/5 bg-white hover:bg-primary-bg/30 transition-colors">
                <td className="px-4 py-2.5 text-card-text-secondary">{i + 1}</td>
                <td className="px-4 py-2.5 font-semibold text-card-text">{inv.account_name}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-block rounded-md bg-button-text/15 border border-button-text/40 px-2 py-0.5 text-xs font-semibold text-card-text">
                    {inv.strategy}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-card-text-secondary">{fmtDate(inv.since)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-card-text">{fmtCr(inv.aum)}</td>
                <td className="px-4 py-2.5 text-right text-card-text-secondary">{((inv.aum / total_aum) * 100).toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="bg-logo-green">
              <td colSpan={4} className="px-4 py-3 font-semibold text-white">Total</td>
              <td className="px-4 py-3 text-right font-bold text-white">{fmtCr(total_aum)}</td>
              <td className="px-4 py-3 text-right font-semibold text-button-text">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PortfolioSummary;