"use client";

import Link from "next/link";
import { ArrowLeft, Users, CheckCircle, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props { clientName?: string; }

// ─── Data from CSV ────────────────────────────────────────────────────────────

const D = {
  clientName: "Arwani Research Services",
  asOf: "09 Jun 2026",
  strategies: "QYE++ & QAW++",

  // Row 7-9: Top KPIs
  kpis: {
    accountValue:      { v: 394688585, pct: "100.00%" },
    liquidCase:        { v: 82390266,  pct: "20.87%"  },
    holdings:          { v: 279868576, pct: "70.91%"  },
    cashPlusLC:        { v: 124820009, pct: "31.62%"  },
    excessCash:        { v: 6640955,   pct: "1.68%"   },
    alertStatus:       "Healthy",
  },

  // Rows 11-23: Account Summary tables
  accountSummary: {
    Combined: [
      ["Account Value",        404688585, "100.0%"],
      ["Mutual Funds",         213875573, "52.8%" ],
      ["Equity Stock Holdings", 65993003, "16.3%" ],
      ["Gold",                  27069820, "6.7%"  ],
      ["Low Vol",               12272998, "3.0%"  ],
      ["Momentum",              26650185, "6.6%"  ],
      ["Bond Stock Holdings",          0, "0.0%"  ],
      ["Liquidcase",            82390266, "20.4%" ],
      ["Cash",                  42429743, "10.5%" ],
      ["Holdings (MF+EQ+Bond)", 279868576,"69.2%" ],
      ["Cash + Liquidcase",     124820009,"30.8%" ],
    ],
    "QYE++": [
      ["Account Value",        312177488, "100.0%"],
      ["Mutual Funds",         213875573, "68.5%" ],
      ["Equity Stock Holdings",        0, "0.0%"  ],
      ["Gold",                         0, "0.0%"  ],
      ["Low Vol",                      0, "0.0%"  ],
      ["Momentum",                     0, "0.0%"  ],
      ["Bond Stock Holdings",          0, "0.0%"  ],
      ["Liquidcase",            63975604, "20.5%" ],
      ["Cash",                  34326310, "11.0%" ],
      ["Holdings (MF+EQ+Bond)", 213875573,"68.5%" ],
      ["Cash + Liquidcase",     98301915, "31.5%" ],
    ],
    "QAW++": [
      ["Account Value",         92511097, "100.0%"],
      ["Mutual Funds",                 0, "0.0%"  ],
      ["Equity Stock Holdings", 65993003, "71.3%" ],
      ["Gold",                  27069820, "41.02%"],
      ["Low Vol",               12272998, "18.60%"],
      ["Momentum",              26650185, "40.38%"],
      ["Bond Stock Holdings",          0, "0.0%"  ],
      ["Liquidcase",            18414662, "19.9%" ],
      ["Cash",                   8103432, "8.8%"  ],
      ["Holdings (MF+EQ+Bond)", 65993003, "71.3%" ],
      ["Cash + Liquidcase",     26518094, "28.7%" ],
    ],
  } as Record<string, [string, number, string][]>,

  // Rows 26-36: Cash & Non-Cash (Margin Health)
  marginHealth: {
    Combined: {
      summary: { required: 140980120, available: 194611567, shortfall: 53631447 },
      rows: [
        { label: "Long Options", cashComp: null,       nonCash: null,       cash: 6070329,   total: 6070329   },
        { label: "PSAR",         cashComp: 50586073,   nonCash: 50586073,   cash: null,      total: 101172146 },
        { label: "Put Protection",cashComp: null,      nonCash: null,       cash: 726781,    total: 726781    },
        { label: "Drawdown Margin",cashComp: null,     nonCash: null,       cash: 33010863,  total: 33010863  },
      ],
    },
    "QAW++": {
      summary: { required: 31717999, available: 42036821, shortfall: 10318822 },
      rows: [
        { label: "Long Options",  cashComp: null,      nonCash: null,       cash: 1387666,   total: 1387666  },
        { label: "PSAR",          cashComp: 11563887,  nonCash: 11563887,   cash: null,      total: 23127774 },
        { label: "Put Protection",cashComp: null,      nonCash: null,       cash: 726781,    total: 726781   },
        { label: "Drawdown Margin",cashComp: null,     nonCash: null,       cash: 6475777,   total: 6475777  },
      ],
    },
    "QYE++": {
      summary: { required: 109262121, available: 152574746, shortfall: 43312625 },
      rows: [
        { label: "Long Options",  cashComp: null,      nonCash: null,       cash: 4682662,   total: 4682662  },
        { label: "PSAR",          cashComp: 39022186,  nonCash: 39022186,   cash: null,      total: 78044372 },
        { label: "Put Protection",cashComp: null,      nonCash: null,       cash: 726781,    total: 726781   },
        { label: "Drawdown Margin",cashComp: null,     nonCash: null,       cash: 26535086,  total: 26535086 },
      ],
    },
  } as Record<string, any>,

  // Rows 39-64: System Breakup
  equityBook: {
    totalTarget: 283282010,
    rows: [
      { strategy: "Total",   label: "Holdings",    subPct: "—",     sysPct: "70.00%", target: 283282010, current: 279868577, diff: -3413433 },
      { strategy: "QAW++",  label: "Gold",        subPct: "40.00%",sysPct: "70.00%", target: 25903107,  current: 27069820,  diff: 1166713  },
      { strategy: "QAW++",  label: "Momentum",    subPct: "40.00%",sysPct: "—",      target: 25903107,  current: 26650185,  diff: 747078   },
      { strategy: "QAW++",  label: "Low Vol ETF", subPct: "20.00%",sysPct: "—",      target: 12951554,  current: 12272998,  diff: -678556  },
      { strategy: "QYE++",  label: "Holdings",    subPct: "—",     sysPct: "70.00%", target: 218524241, current: 213875573, diff: -4648668 },
    ],
    // Absolute % columns
    pct: [
      { strategy: "Total",  label: "Holdings",    target: "70.00%", current: "69.16%", diff: "-0.84%" },
      { strategy: "QAW++", label: "Gold",         target: "40.00%", current: "41.02%", diff: "+1.02%" },
      { strategy: "QAW++", label: "Momentum",     target: "40.00%", current: "40.38%", diff: "+0.38%" },
      { strategy: "QAW++", label: "Low Vol ETF",  target: "20.00%", current: "18.60%", diff: "-1.40%" },
      { strategy: "QYE++", label: "Holdings",     target: "70.00%", current: "68.51%", diff: "-1.49%" },
    ],
  },

  derivativeBook: {
    rows: [
      { strategy: "Total",  label: "Cash",        subPct: "10.00%", sysPct: "30.00%", target: 40468859,  current: 42429743,  diff: 1960884  },
      { strategy: "Total",  label: "Liquid Case", subPct: "20.00%", sysPct: "—",      target: 80937717,  current: 82390266,  diff: 1452549  },
      { strategy: "QAW++", label: "Cash",         subPct: "10.00%", sysPct: "30.00%", target: 9251110,   current: 8103432,   diff: -1147677 },
      { strategy: "QAW++", label: "Liquid Case",  subPct: "20.00%", sysPct: "—",      target: 18502219,  current: 18414662,  diff: -87558   },
      { strategy: "QYE++", label: "Cash",         subPct: "10.00%", sysPct: "30.00%", target: 31217749,  current: 34326310,  diff: 3108561  },
      { strategy: "QYE++", label: "Liquid Case",  subPct: "20.00%", sysPct: "—",      target: 62435498,  current: 63975604,  diff: 1540107  },
    ],
    pct: [
      { strategy: "Total",  label: "Cash",        target: "10.00%", current: "10.48%", diff: "+0.48%" },
      { strategy: "Total",  label: "Liquid Case", target: "20.00%", current: "20.36%", diff: "+0.36%" },
      { strategy: "QAW++", label: "Cash",         target: "10.00%", current: "8.76%",  diff: "-1.24%" },
      { strategy: "QAW++", label: "Liquid Case",  target: "20.00%", current: "19.91%", diff: "-0.09%" },
      { strategy: "QYE++", label: "Cash",         target: "10.00%", current: "11.00%", diff: "+1.00%" },
      { strategy: "QYE++", label: "Liquid Case",  target: "20.00%", current: "20.49%", diff: "+0.49%" },
    ],
  },

  // Rows 66-83: Debt-to-Equity
  debtEquity: {
    Combined: { debt: 30.84, equity: 69.16, hybrid: 0 },
    "QAW++":  { debt: 28.66, equity: 71.34, hybrid: 0 },
    "QYE++":  { debt: 31.49, equity: 68.51, hybrid: 0 },
  } as Record<string, { debt: number; equity: number; hybrid: number }>,

  debtEquityDetail: {
    Combined: {
      equityMF: 213875573.25, debtMF: 0, hybridMF: 0,
      mfTotal: 213875573.25, mfPct: "52.85%",
      liquidcase: 82390266.00, debtStock: 0, equityStock: 65993003.25,
      stockTotal: 148383269.25, stockPct: "36.67%",
      cash: 42429742.58, cashPct: "10.48%",
      accountValue: 404688585.08, accountPct: "100.00%",
      pcts: { equityMF: "52.85%", debtMF: "0.00%", hybridMF: "0.00%", liquidcase: "20.36%", debtStock: "0.00%", equityStock: "16.31%" },
    },
    "QAW++": {
      equityMF: 0, debtMF: 0, hybridMF: 0,
      mfTotal: 0, mfPct: "0.00%",
      liquidcase: 18414661.65, debtStock: 0, equityStock: 65993003.25,
      stockTotal: 84407664.90, stockPct: "20.86%",
      cash: 8103432.34, cashPct: "2.00%",
      accountValue: 92511097.24, accountPct: "22.86%",
      pcts: { equityMF: "0.00%", debtMF: "0.00%", hybridMF: "0.00%", liquidcase: "4.55%", debtStock: "0.00%", equityStock: "16.31%" },
    },
    "QYE++": {
      equityMF: 213875573.25, debtMF: 0, hybridMF: 0,
      mfTotal: 213875573.25, mfPct: "52.85%",
      liquidcase: 63975604.35, debtStock: 0, equityStock: 0,
      stockTotal: 63975604.35, stockPct: "15.81%",
      cash: 34326310.24, cashPct: "8.48%",
      accountValue: 312177487.84, accountPct: "77.14%",
      pcts: { equityMF: "52.85%", debtMF: "0.00%", hybridMF: "0.00%", liquidcase: "15.81%", debtStock: "0.00%", equityStock: "0.00%" },
    },
  } as Record<string, any>,

  // Rows 87-105: PSAR Inputs
  inputs: {
    "QYE+":  { psarMult: "1.0x", longOpt: "1.00%", drawdownMargin: "6.00%", liquidCase: "13.00%", cash: "7.00%", equityBook: "80.00%", derivBook: "20.00%" },
    "QYE++": { psarMult: "2.0x", longOpt: "1.50%", drawdownMargin: "8.50%", liquidCase: "20.00%", cash: "10.00%", equityBook: "70.00%", derivBook: "30.00%" },
    "QAW+":  { psarMult: "1.0x", longOpt: "1.00%", drawdownMargin: "5.00%", liquidCase: "13.00%", cash: "7.00%", equityBook: "80.00%", derivBook: "20.00%" },
    "QAW++": { psarMult: "2.0x", longOpt: "1.50%", drawdownMargin: "7.00%", liquidCase: "20.00%", cash: "10.00%", equityBook: "70.00%", derivBook: "30.00%" },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtInr(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

function DiffInr({ v }: { v: number }) {
  return <span className={v >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{fmtInr(v)}</span>;
}
function DiffPct({ v }: { v: string }) {
  const n = parseFloat(v);
  return <span className={n >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{n >= 0 ? "+" : ""}{v}</span>;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-logo-green min-h-screen flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-white font-serif text-base font-bold">Cash & Margin</div>
        <div className="text-white/50 text-xs mt-0.5">SMA Dashboard</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <Link href="/cash-margin" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors">
          <Users className="h-3.5 w-3.5" />P1 — Portfolio Overview
        </Link>
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium bg-white/15 text-white">
          <Users className="h-3.5 w-3.5" />P2 — Client Detail
        </div>
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <Link href="/cash-margin" className="flex items-center gap-2 text-white/60 hover:text-white text-xs transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />Back to P1
        </Link>
      </div>
    </aside>
  );
}

function SH({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-logo-green rounded-t-lg px-4 py-2.5">
      <span className="text-xs font-bold uppercase tracking-wide text-white">{children}</span>
    </div>
  );
}

function SubSH({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-l-[3px] border-logo-green pl-3 py-0.5 my-4">
      <span className="text-xs font-bold uppercase tracking-wide text-logo-green">{children}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CashMarginClientPageV2({ clientName }: Props) {
  const k = D.kpis;

  const combinedPie = [
    { name: "Holdings", value: 69.16, color: "#02422B" },
    { name: "Liquidcase", value: 20.36, color: "#4A9D7A" },
    { name: "Cash", value: 10.48, color: "#DABD38" },
  ];

  return (
    <div className="flex min-h-screen bg-primary-bg">
      <Sidebar />
      <main className="flex-1 overflow-x-auto">

        {/* Page header */}
        <div className="bg-white border-b border-logo-green/10 px-8 py-5">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/cash-margin" className="text-card-text-secondary hover:text-logo-green transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-button-text mb-0.5">P2 — Individual Client Dashboard & Analysis</div>
              <h1 className="font-serif text-2xl text-logo-green">{clientName || D.clientName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-card-text-secondary ml-7">
            <span>📅 As of {D.asOf}</span>
            <span>Strategies: {D.strategies}</span>
            <span className="inline-flex items-center gap-1 text-green-700 font-medium">
              <CheckCircle className="h-3 w-3" />{k.alertStatus}
            </span>
          </div>
        </div>

        <div className="px-8 py-6 space-y-8">

          {/* ── SECTION 1: Top KPIs ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Account Value", v: k.accountValue.v, pct: k.accountValue.pct, bg: "bg-logo-green" },
              { label: "Liquidcase", v: k.liquidCase.v, pct: k.liquidCase.pct, bg: "bg-[#4A9D7A]" },
              { label: "Holdings", v: k.holdings.v, pct: k.holdings.pct, bg: "bg-logo-green" },
              { label: "Cash + Liquidcase", v: k.cashPlusLC.v, pct: k.cashPlusLC.pct, bg: "bg-[#4A9D7A]" },
              { label: "Excess Cash", v: k.excessCash.v, pct: k.excessCash.pct, bg: "bg-green-700" },
              { label: "Alert Status", v: k.alertStatus, pct: null, bg: "bg-logo-green" },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl p-4 text-white`}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-white/70 mb-1">{item.label}</div>
                <div className="text-base font-bold leading-tight">
                  {typeof item.v === "number" ? fmtInr(item.v) : item.v}
                </div>
                {item.pct && <div className="text-[10px] text-white/60 mt-0.5">{item.pct}</div>}
              </div>
            ))}
          </div>

          {/* ── SECTION 2: Account Summary (3 tables side by side) ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Account Summary</SH>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {(["Combined", "QYE++", "QAW++"] as const).map((key) => (
                  <div key={key}>
                    <div className="text-xs font-bold text-logo-green mb-2">Account Summary — {key}</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-primary-bg/40 text-card-text-secondary">
                          <th className="px-2 py-1.5 text-left font-medium">Particulars</th>
                          <th className="px-2 py-1.5 text-right font-medium">₹ Value</th>
                          <th className="px-2 py-1.5 text-right font-medium">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {D.accountSummary[key].map(([label, value, pct]) => (
                          <tr key={label} className="border-t border-logo-green/5">
                            <td className="px-2 py-1.5 text-card-text-secondary">{label}</td>
                            <td className="px-2 py-1.5 text-right text-card-text whitespace-nowrap">{fmtInr(value as number)}</td>
                            <td className="px-2 py-1.5 text-right text-card-text-secondary">{pct}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              {/* Combined pie */}
              <div className="mt-5 pt-4 border-t border-logo-green/10">
                <div className="text-xs font-bold text-logo-green mb-2">Combined Portfolio Split</div>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={200} height={160}>
                    <PieChart>
                      <Pie data={combinedPie} dataKey="value" cx="50%" cy="50%" outerRadius={65}
                        label={({ value }: any) => `${value.toFixed(1)}%`} labelLine={false} fontSize={9}>
                        {combinedPie.map((e) => <Cell key={e.name} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 text-xs space-y-2">
                    {combinedPie.map((item) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: item.color }} />
                        <span className="text-card-text-secondary">{item.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-primary-bg overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${item.value}%`, background: item.color }} />
                        </div>
                        <span className="font-semibold text-card-text w-10 text-right">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 3: Cash & Non-Cash Component (Margin Health) ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Cash & Non-Cash Component — Margin Health</SH>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-5">
              {(["Combined", "QAW++", "QYE++"] as const).map((key) => {
                const mg = D.marginHealth[key];
                return (
                  <div key={key}>
                    <div className="text-xs font-bold text-logo-green mb-2">{key}</div>
                    <table className="w-full text-xs mb-2">
                      <thead>
                        <tr className="bg-primary-bg/40 text-card-text-secondary">
                          <th className="px-2 py-1.5 text-left font-medium">Scheme</th>
                          <th className="px-2 py-1.5 text-right font-medium">Cash (LC)</th>
                          <th className="px-2 py-1.5 text-right font-medium">Non-Cash</th>
                          <th className="px-2 py-1.5 text-right font-medium">Cash</th>
                          <th className="px-2 py-1.5 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mg.rows.map((row: any) => (
                          <tr key={row.label} className="border-t border-logo-green/5">
                            <td className="px-2 py-1.5 text-card-text-secondary">{row.label}</td>
                            <td className="px-2 py-1.5 text-right text-card-text-secondary">{row.cashComp ? fmtInr(row.cashComp) : "—"}</td>
                            <td className="px-2 py-1.5 text-right text-card-text-secondary">{row.nonCash ? fmtInr(row.nonCash) : "—"}</td>
                            <td className="px-2 py-1.5 text-right text-card-text-secondary">{row.cash ? fmtInr(row.cash) : "—"}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-card-text">{fmtInr(row.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="bg-primary-bg/40 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-card-text-secondary">Required</span><span className="font-semibold">{fmtInr(mg.summary.required)}</span></div>
                      <div className="flex justify-between"><span className="text-card-text-secondary">Available</span><span className="font-semibold text-green-700">{fmtInr(mg.summary.available)}</span></div>
                      <div className="flex justify-between border-t border-logo-green/10 pt-1">
                        <span className="text-card-text-secondary">Excess</span>
                        <span className={`font-bold ${mg.summary.shortfall >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtInr(mg.summary.shortfall)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SECTION 4: System Breakup ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>System Breakup — Absolute</SH>
            <div className="p-4 space-y-5">
              {/* Equity Book */}
              <SubSH>Equity Book</SubSH>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary-bg/40 text-card-text-secondary">
                      <th className="px-3 py-2 text-left font-medium">Strategy</th>
                      <th className="px-3 py-2 text-left font-medium">Instrument</th>
                      <th className="px-3 py-2 text-right font-medium">Sub%</th>
                      <th className="px-3 py-2 text-right font-medium">Sys%</th>
                      <th className="px-3 py-2 text-right font-medium">Target</th>
                      <th className="px-3 py-2 text-right font-medium">Current</th>
                      <th className="px-3 py-2 text-right font-medium">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.equityBook.rows.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary text-[10px]">{row.strategy}</td>
                        <td className="px-3 py-1.5 text-card-text">{row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.subPct}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.sysPct}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtInr(row.target)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{fmtInr(row.current)}</td>
                        <td className="px-3 py-1.5 text-right"><DiffInr v={row.diff} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary-bg/40 text-card-text-secondary">
                      <th className="px-3 py-2 text-left font-medium">Strategy</th>
                      <th className="px-3 py-2 text-right font-medium">Target</th>
                      <th className="px-3 py-2 text-right font-medium">Current</th>
                      <th className="px-3 py-2 text-right font-medium">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.equityBook.pct.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary">{row.strategy} {row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.target}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{row.current}</td>
                        <td className="px-3 py-1.5 text-right"><DiffPct v={row.diff} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Derivative Book */}
              <SubSH>Derivative Book</SubSH>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary-bg/40 text-card-text-secondary">
                      <th className="px-3 py-2 text-left font-medium">Strategy</th>
                      <th className="px-3 py-2 text-left font-medium">Particulars</th>
                      <th className="px-3 py-2 text-right font-medium">Sub%</th>
                      <th className="px-3 py-2 text-right font-medium">Sys%</th>
                      <th className="px-3 py-2 text-right font-medium">Target</th>
                      <th className="px-3 py-2 text-right font-medium">Current</th>
                      <th className="px-3 py-2 text-right font-medium">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.derivativeBook.rows.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary text-[10px]">{row.strategy}</td>
                        <td className="px-3 py-1.5 text-card-text">{row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.subPct}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.sysPct}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtInr(row.target)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{fmtInr(row.current)}</td>
                        <td className="px-3 py-1.5 text-right"><DiffInr v={row.diff} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary-bg/40 text-card-text-secondary">
                      <th className="px-3 py-2 text-left font-medium">Strategy</th>
                      <th className="px-3 py-2 text-right font-medium">Target</th>
                      <th className="px-3 py-2 text-right font-medium">Current</th>
                      <th className="px-3 py-2 text-right font-medium">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.derivativeBook.pct.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary">{row.strategy} {row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.target}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{row.current}</td>
                        <td className="px-3 py-1.5 text-right"><DiffPct v={row.diff} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── SECTION 5: Debt-to-Equity Ratio ── */}
      {/* ── SECTION 5: Debt-to-Equity Ratio ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Debt-to-Equity Ratio</SH>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {(["Combined", "QAW++", "QYE++"] as const).map((key) => {
                const de = D.debtEquity[key];
                const dd = D.debtEquityDetail[key];
                return (
                  <div key={key}>
                    <div className="text-xs font-bold text-logo-green mb-2">Debt To Equity Ratio — {key}</div>

                    {/* Breakup table */}
                    <table className="w-full text-xs mb-4">
                      <thead>
                        <tr className="bg-primary-bg/40 text-card-text-secondary">
                          <th className="px-2 py-1.5 text-left font-medium">Particulars</th>
                          <th className="px-2 py-1.5 text-right font-medium">Sub Total</th>
                          <th className="px-2 py-1.5 text-right font-medium">Total</th>
                          <th className="px-2 py-1.5 text-right font-medium">% of AV</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Equity Mutual Funds</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.equityMF)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{dd.pcts.equityMF}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Debt Mutual Funds</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.debtMF)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{dd.pcts.debtMF}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Hybrid Mutual Funds</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.hybridMF)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{dd.pcts.hybridMF}</td>
                        </tr>
                        <tr className="border-t border-logo-green/10 bg-primary-bg/20">
                          <td className="px-2 py-1 font-bold text-card-text">Mutual Funds</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtInr(dd.mfTotal)}</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{dd.mfPct}</td>
                        </tr>

                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Liquidcase Stock Holdings</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.liquidcase)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{dd.pcts.liquidcase}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Debt Stock Holdings</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.debtStock)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{dd.pcts.debtStock}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Equity Stock Holdings</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.equityStock)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{dd.pcts.equityStock}</td>
                        </tr>
                        <tr className="border-t border-logo-green/10 bg-primary-bg/20">
                          <td className="px-2 py-1 font-bold text-card-text">Stock Holdings</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtInr(dd.stockTotal)}</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{dd.stockPct}</td>
                        </tr>

                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Cash</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.cash)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{dd.cashPct}</td>
                        </tr>
                        <tr className="border-t border-logo-green/10 bg-primary-bg/20">
                          <td className="px-2 py-1 font-bold text-card-text">Account Value</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtInr(dd.accountValue)}</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{dd.accountPct}</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Ratio bar (unchanged) */}
                    <div className="flex items-center gap-4 mb-3">
                      {[
                        { label: "Debt",   value: de.debt,   color: "#DABD38" },
                        { label: "Equity", value: de.equity, color: "#02422B" },
                        { label: "Hybrid", value: de.hybrid, color: "#6B7280" },
                      ].map((item) => (
                        <div key={item.label} className="text-center">
                          <div className="text-xl font-bold" style={{ color: item.color }}>{item.value.toFixed(2)}%</div>
                          <div className="text-[10px] text-card-text-secondary">{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="h-4 rounded-full overflow-hidden flex">
                      <div className="h-full" style={{ width: `${de.debt}%`, background: "#DABD38" }} />
                      <div className="h-full" style={{ width: `${de.equity}%`, background: "#02422B" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SECTION 6: Inputs ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Strategy Inputs / Parameters</SH>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary-bg/40 text-card-text-secondary">
                    <th className="px-3 py-2 text-left font-medium">Parameter</th>
                    {Object.keys(D.inputs).map((s) => <th key={s} className="px-3 py-2 text-right font-medium">{s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "PSAR Multiplier",    key: "psarMult"      },
                    { label: "Long Options (%)",   key: "longOpt"       },
                    { label: "Drawdown Margin (%)",key: "drawdownMargin"},
                    { label: "Liquid Case (%)",    key: "liquidCase"    },
                    { label: "Cash (%)",           key: "cash"          },
                    { label: "Equity Book (%)",    key: "equityBook"    },
                    { label: "Derivative Book (%)",key: "derivBook"     },
                  ].map((param) => (
                    <tr key={param.key} className="border-t border-logo-green/5">
                      <td className="px-3 py-1.5 text-card-text-secondary">{param.label}</td>
                      {Object.entries(D.inputs).map(([s, vals]) => (
                        <td key={s} className="px-3 py-1.5 text-right text-card-text">
                          {(vals as any)[param.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}