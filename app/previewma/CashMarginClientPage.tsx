"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, CheckCircle, AlertTriangle, Loader2, Search } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useSearchParams } from "next/navigation";

interface Props { qcode?: string; clientName?: string; }

// ─── Types (matching the real API response) ────────────────────────────────

interface ClientListEntry { qcode: string; account_name: string; strategy: string; }
interface SummaryRow { label: string; value: number; pct: number; }
interface AccountSummaryScoped {
  accountValue: number; holdings: number; liquidcase: number; cash: number; rows: SummaryRow[];
}
interface SystemBreakupBookRow {
  label: string; subPct: number | null; systemPct: number; targetVal: number; currentVal: number;
  diffVal: number; targetPct: number; currentPct: number; diffPct: number;
}
interface SystemBreakupBook { rows: SystemBreakupBookRow[]; }
interface SystemBreakupScoped { equityBook: SystemBreakupBook; derivativeBook: SystemBreakupBook; }
interface MarginLine { system: string; cashComponent: number | null; nonCashComponent: number | null; cash: number | null; }
interface MarginTotals { cc: number | null; ncc: number | null; cash: number | null; }
interface MarginScoped {
  lines: MarginLine[]; required: MarginTotals; available: MarginTotals | null;
  excessShortfall: MarginTotals | null; marginFetchOk: boolean;
}
interface DebtEquityScoped {
  equityMf: number; debtMf: number; hybridMf: number; mfTotal: number;
  liquidcase: number; debtStock: number; equityStock: number; stockTotal: number; cash: number;
  accountValue: number; debtAmt: number; equityAmt: number; hybridAmt: number;
  debtPct: number; equityPct: number; hybridPct: number;
}
interface TierRefRow {
  strategy: string; psarMultiplier: number; longOptPct: number; drawdownMarginPct: number;
  lcPct: number; cashPct: number; equityPct: number; derivativePct: number;
}
interface Page2Response {
  qcode: string; accountName: string; strategies: string[]; mastersheetDate: string | null;
  accountSummary: { combined: AccountSummaryScoped; byStrategy: Record<string, AccountSummaryScoped> };
  systemBreakup: { combined: SystemBreakupScoped; byStrategy: Record<string, SystemBreakupScoped> };
  marginRequirements: { combined: MarginScoped; byStrategy: Record<string, MarginScoped> };
  debtEquity: { combined: DebtEquityScoped; byStrategy: Record<string, DebtEquityScoped> };
  inputs: { tierReference: TierRefRow[] };
}
interface TopBarResponse {
  tier: string;
  alertStatus: "HEALTHY" | "ACTION_REQUIRED" | "WARNING" | "CRITICAL";
  kpis: {
    accountValue: { value: number; pct: number };
    liquidcase: { value: number; pct: number };
    holdings: { value: number; pct: number };
    cashPlusLiquidcase: { value: number; pct: number };
    excessCash: { value: number; pct: number };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtInr(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

function DiffInr({ v }: { v: number }) {
  return <span className={v >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{fmtInr(v)}</span>;
}
function DiffPct({ v }: { v: number }) {
  return <span className={v >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
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
          <Users className="h-3.5 w-3.5" />Dashboard
        </Link>
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium bg-white/15 text-white">
          <Users className="h-3.5 w-3.5" />CLient Dashboard
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

// ─── Fallback client picker (only shown if no qcode prop is passed) ───────────

function ClientPicker({ onSelect }: { onSelect: (qcode: string) => void }) {
  const [clients, setClients] = useState<ClientListEntry[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);


  const filtered = clients.filter(
    (c) => c.account_name.toLowerCase().includes(search.toLowerCase()) || c.qcode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-card-text-secondary" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setOpen(true)}
          placeholder="Search client name or qcode…"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40"
        />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-logo-green/15 bg-white shadow-lg py-1">
            {filtered.map((c) => (
              <button key={`${c.qcode}-${c.strategy}`} type="button"
                onClick={() => { onSelect(c.qcode); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-primary-bg/40 transition-colors">
                <span className="font-medium text-card-text">{c.account_name}</span>
                <span className="text-card-text-secondary ml-2 text-xs">{c.qcode} · {c.strategy}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CashMarginClientPageV2({ qcode: qcodeProp, clientName }: Props) {
  const [page2, setPage2] = useState<Page2Response | null>(null);
  const [topBar, setTopBar] = useState<TopBarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const qcode = searchParams.get("qcode");


  console.log("==========>", qcode)
  useEffect(() => {
    if (!qcode) return;
    setLoading(true);
    setError(null);
    fetch("/api/internal/cash-margin/page2", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qcode }),
    })
      .then((r) => { if (!r.ok) throw new Error(`page2 failed (${r.status})`); return r.json(); })
      .then((p2: Page2Response) => setPage2(p2))
      .catch((e) => setError(e?.message || "Failed to load client detail."))
      .finally(() => setLoading(false));
  }, [qcode]);

  useEffect(() => {
    if (!qcode) return;
    fetch("/api/internal/cash-margin/top-bar", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qcode }),
    })
      .then((r) => { if (!r.ok) throw new Error(`top-bar failed (${r.status})`); return r.json(); })
      .then((tb: TopBarResponse) => setTopBar(tb))
      .catch(() => setTopBar(null)); // leave placeholders showing, don't surface an error for this
  }, [qcode]);

  if (loading || !page2 || !topBar) {
    return (
      <div className="flex min-h-screen bg-primary-bg">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center gap-2 text-card-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading client detail…
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen bg-primary-bg">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-md">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        </main>
      </div>
    );
  }

  const strategies = page2.strategies;
  const summaryCombined = page2.accountSummary.combined;

  const combinedPie = [
    { name: "Holdings", value: (summaryCombined.holdings / summaryCombined.accountValue) * 100, color: "#02422B" },
    { name: "Liquidcase", value: (summaryCombined.liquidcase / summaryCombined.accountValue) * 100, color: "#4A9D7A" },
    { name: "Cash", value: (summaryCombined.cash / summaryCombined.accountValue) * 100, color: "#DABD38" },
  ];

  // Union of Combined + per-strategy rows for the System Breakup tables.
  const equityRows = [
    ...page2.systemBreakup.combined.equityBook.rows.map((r) => ({ strategy: "Total", ...r })),
    ...strategies.flatMap((s) => page2.systemBreakup.byStrategy[s].equityBook.rows.map((r) => ({ strategy: s, ...r }))),
  ];
  const derivativeRows = [
    ...page2.systemBreakup.combined.derivativeBook.rows.map((r) => ({ strategy: "Total", ...r })),
    ...strategies.flatMap((s) => page2.systemBreakup.byStrategy[s].derivativeBook.rows.map((r) => ({ strategy: s, ...r }))),
  ];

  function marginTotal(l: MarginLine) {
    return l.cash !== null ? l.cash : (l.cashComponent ?? 0) + (l.nonCashComponent ?? 0);
  }
  function sumTotals(t: MarginTotals | null) {
    if (!t) return null;
    return (t.cc ?? 0) + (t.ncc ?? 0) + (t.cash ?? 0);
  }

  const alertColor = topBar.alertStatus === "HEALTHY" ? "text-green-700" : topBar.alertStatus === "CRITICAL" ? "text-red-800" : "text-amber-700";

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
              <h1 className="font-serif text-2xl text-logo-green">{page2.accountName || clientName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-card-text-secondary ml-7">
            <span>📅 As of {page2.mastersheetDate || "—"}</span>
          </div>
        </div>

        <div className="px-8 py-6 space-y-8">

          {/* ── SECTION 1: Top KPIs ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Account Value", v: topBar.kpis.accountValue.value, pct: `${topBar.kpis.accountValue.pct.toFixed(2)}%`, bg: "bg-logo-green" },
              { label: "Liquidcase", v: topBar.kpis.liquidcase.value, pct: `${topBar.kpis.liquidcase.pct.toFixed(2)}%`, bg: "bg-[#4A9D7A]" },
              { label: "Holdings", v: topBar.kpis.holdings.value, pct: `${topBar.kpis.holdings.pct.toFixed(2)}%`, bg: "bg-logo-green" },
              { label: "Cash + Liquidcase", v: topBar.kpis.cashPlusLiquidcase.value, pct: `${topBar.kpis.cashPlusLiquidcase.pct.toFixed(2)}%`, bg: "bg-[#4A9D7A]" },
              { label: "Excess Cash", v: topBar.kpis.excessCash.value, pct: `${topBar.kpis.excessCash.pct.toFixed(2)}%`, bg: "bg-green-700" },
              { label: "Alert Status", v: topBar.alertStatus.replace("_", " "), pct: null, bg: "bg-logo-green" },
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

          {/* ── SECTION 2: Account Summary ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Account Summary</SH>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {["Combined", ...strategies].map((key) => {
                  const s = key === "Combined" ? summaryCombined : page2.accountSummary.byStrategy[key];
                  return (
                    <div key={key}>
                      <div className="text-xs font-bold text-logo-green mb-2">Account Summary : {key}</div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-primary-bg/40 text-card-text-secondary">
                            <th className="px-2 py-1.5 text-left font-medium">Particulars</th>
                            <th className="px-2 py-1.5 text-right font-medium">₹ Value</th>
                            <th className="px-2 py-1.5 text-right font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.rows.map((r) => {
                            const isTotal = r.label === "Account Value";
                            const isSubtotal = r.label === "Holdings" || r.label === "Cash + Liquidcase";
                            const isSubRow = ["Gold", "Low Vol", "Momentum"].includes(r.label);
                            return (
                              <tr
                                key={r.label}
                                className={`border-t border-logo-green/5 ${isTotal ? "bg-primary-bg/40" :
                                    isSubtotal ? "bg-primary-bg/20 border-y border-logo-green/15" :
                                      ""
                                  }`}
                              >
                                <td className={`px-2 py-1.5 ${isTotal ? "font-bold text-card-text" :
                                    isSubtotal ? "font-semibold text-card-text" :
                                      isSubRow ? "pl-5 italic text-card-text-secondary" :
                                        "text-card-text-secondary"
                                  }`}>
                                  {r.label}
                                </td>
                                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${isTotal ? "font-bold text-card-text" :
                                    isSubtotal ? "font-semibold text-card-text" :
                                      isSubRow ? "italic text-card-text-secondary" :
                                        "text-card-text"
                                  }`}>
                                  {fmtInr(r.value)}
                                </td>
                                <td className={`px-2 py-1.5 text-right ${isTotal ? "font-bold text-card-text" :
                                    isSubtotal ? "font-semibold text-card-text" :
                                      isSubRow ? "italic text-card-text-secondary" :
                                        "text-card-text-secondary"
                                  }`}>
                                  {fmtPct(r.pct)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 pt-4 border-t border-logo-green/10">
                <div className="text-xs font-bold text-logo-green mb-2">Combined Portfolio Split</div>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={200} height={160}>
                    <PieChart>
                      <Pie data={combinedPie} dataKey="value" cx="50%" cy="50%" outerRadius={65}>
                        {combinedPie.map((e) => <Cell key={e.name} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
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
                        <span className="font-semibold text-card-text w-10 text-right">{item.value.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 3: Margin Health ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Margin Summary</SH>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-5">
              {["Combined", ...strategies].map((key) => {
                const mg = key === "Combined" ? page2.marginRequirements.combined : page2.marginRequirements.byStrategy[key];
                const required = sumTotals(mg.required);
                const available = sumTotals(mg.available);
                const excess = available !== null && required !== null ? available - required : null;
                return (
                  <div key={key}>
                    <div className="text-xs font-bold text-logo-green mb-2">{key}</div>
                    {!mg.marginFetchOk && (
                      <p className="text-[10px] text-amber-700 mb-1.5">⚠ Margin fetch failed — Available figures unavailable.</p>
                    )}
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
                        {mg.lines.map((row) => (
                          <tr key={row.system} className="border-t border-logo-green/5">
                            <td className="px-2 py-1.5 text-card-text-secondary">{row.system}</td>
                            <td className="px-2 py-1.5 text-right text-card-text-secondary">{row.cashComponent !== null ? fmtInr(row.cashComponent) : "—"}</td>
                            <td className="px-2 py-1.5 text-right text-card-text-secondary">{row.nonCashComponent !== null ? fmtInr(row.nonCashComponent) : "—"}</td>
                            <td className="px-2 py-1.5 text-right text-card-text-secondary">{row.cash !== null ? fmtInr(row.cash) : "—"}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-card-text">{fmtInr(marginTotal(row))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="bg-primary-bg/40 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-card-text-secondary">Required</span><span className="font-semibold">{fmtInr(required)}</span></div>
                      <div className="flex justify-between"><span className="text-card-text-secondary">Available</span><span className="font-semibold text-green-700">{fmtInr(available)}</span></div>
                      <div className="flex justify-between border-t border-logo-green/10 pt-1">
                        <span className="text-card-text-secondary">Excess</span>
                        <span className={`font-bold ${excess !== null && excess >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtInr(excess)}</span>
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
                    {equityRows.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary text-[10px]">{row.strategy}</td>
                        <td className="px-3 py-1.5 text-card-text">{row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.subPct !== null ? fmtPct(row.subPct) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtPct(row.systemPct)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtInr(row.targetVal)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{fmtInr(row.currentVal)}</td>
                        <td className="px-3 py-1.5 text-right"><DiffInr v={row.diffVal} /></td>
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
                    {equityRows.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary">{row.strategy} {row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtPct(row.targetPct)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{fmtPct(row.currentPct)}</td>
                        <td className="px-3 py-1.5 text-right"><DiffPct v={row.diffPct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
                    {derivativeRows.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary text-[10px]">{row.strategy}</td>
                        <td className="px-3 py-1.5 text-card-text">{row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{row.subPct !== null ? fmtPct(row.subPct) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtPct(row.systemPct)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtInr(row.targetVal)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{fmtInr(row.currentVal)}</td>
                        <td className="px-3 py-1.5 text-right"><DiffInr v={row.diffVal} /></td>
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
                    {derivativeRows.map((row, i) => (
                      <tr key={i} className="border-t border-logo-green/5">
                        <td className="px-3 py-1.5 text-card-text-secondary">{row.strategy} {row.label}</td>
                        <td className="px-3 py-1.5 text-right text-card-text-secondary">{fmtPct(row.targetPct)}</td>
                        <td className="px-3 py-1.5 text-right text-card-text">{fmtPct(row.currentPct)}</td>
                        <td className="px-3 py-1.5 text-right"><DiffPct v={row.diffPct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── SECTION 5: Debt-to-Equity Ratio ── */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Debt-to-Equity Ratio</SH>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {["Combined", ...strategies].map((key) => {
                const dd = key === "Combined" ? page2.debtEquity.combined : page2.debtEquity.byStrategy[key];
                return (
                  <div key={key}>
                    <div className="text-xs font-bold text-logo-green mb-2">Debt To Equity Ratio — {key}</div>
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
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.equityMf)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtPct((dd.equityMf / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Debt Mutual Funds</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.debtMf)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtPct((dd.debtMf / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Hybrid Mutual Funds</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.hybridMf)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtPct((dd.hybridMf / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/10 bg-primary-bg/20">
                          <td className="px-2 py-1 font-bold text-card-text">Mutual Funds</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtInr(dd.mfTotal)}</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtPct((dd.mfTotal / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Liquidcase Stock Holdings</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.liquidcase)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtPct((dd.liquidcase / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Debt Stock Holdings</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.debtStock)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtPct((dd.debtStock / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Equity Stock Holdings</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.equityStock)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtPct((dd.equityStock / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/10 bg-primary-bg/20">
                          <td className="px-2 py-1 font-bold text-card-text">Stock Holdings</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtInr(dd.stockTotal)}</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtPct((dd.stockTotal / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/5">
                          <td className="px-2 py-1 text-card-text-secondary">Cash</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtInr(dd.cash)}</td>
                          <td className="px-2 py-1 text-right text-card-text-secondary">{fmtPct((dd.cash / dd.accountValue) * 100)}</td>
                        </tr>
                        <tr className="border-t border-logo-green/10 bg-primary-bg/20">
                          <td className="px-2 py-1 font-bold text-card-text">Account Value</td>
                          <td className="px-2 py-1 text-right">—</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">{fmtInr(dd.accountValue)}</td>
                          <td className="px-2 py-1 text-right font-bold text-card-text">100.00%</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="flex items-center gap-4 mb-3">
                      {[
                        { label: "Debt", value: dd.debtPct, color: "#DABD38" },
                        { label: "Equity", value: dd.equityPct, color: "#02422B" },
                        { label: "Hybrid", value: dd.hybridPct, color: "#6B7280" },
                      ].map((item) => (
                        <div key={item.label} className="text-center">
                          <div className="text-xl font-bold" style={{ color: item.color }}>{item.value.toFixed(2)}%</div>
                          <div className="text-[10px] text-card-text-secondary">{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="h-4 rounded-full overflow-hidden flex">
                      <div className="h-full" style={{ width: `${dd.debtPct}%`, background: "#DABD38" }} />
                      <div className="h-full" style={{ width: `${dd.equityPct}%`, background: "#02422B" }} />
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
                    {page2.inputs.tierReference.map((t) => <th key={t.strategy} className="px-3 py-2 text-right font-medium">{t.strategy}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "PSAR Multiplier", key: "psarMultiplier", fmt: (v: number) => `${v}x` },
                    { label: "Long Options (%)", key: "longOptPct", fmt: fmtPct },
                    { label: "Drawdown Margin (%)", key: "drawdownMarginPct", fmt: fmtPct },
                    { label: "Liquid Case (%)", key: "lcPct", fmt: fmtPct },
                    { label: "Cash (%)", key: "cashPct", fmt: fmtPct },
                    { label: "Equity Book (%)", key: "equityPct", fmt: fmtPct },
                    { label: "Derivative Book (%)", key: "derivativePct", fmt: fmtPct },
                  ].map((param) => (
                    <tr key={param.key} className="border-t border-logo-green/5">
                      <td className="px-3 py-1.5 text-card-text-secondary">{param.label}</td>
                      {page2.inputs.tierReference.map((t) => (
                        <td key={t.strategy} className="px-3 py-1.5 text-right text-card-text">
                          {param.fmt((t as any)[param.key])}
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