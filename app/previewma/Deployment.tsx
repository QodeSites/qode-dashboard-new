"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { AlertTriangle, Loader2, Search, Settings2 } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ClientStrategyEntry {
  id: number | null;
  strategy: string;
  effective_from: string;
  effective_to: string | null;
}
interface ClientRecord {
  qcode: string;
  account_name: string;
  strategies: ClientStrategyEntry[];
}
function isActiveStrategy(s: ClientStrategyEntry) {
  if (s.strategy === "combined") return false;
  if (!s.effective_to) return true;
  return new Date(s.effective_to) >= new Date();
}

type RatioType = "current" | "ideal" | "model";

interface SnapshotRow {
  account_name: string;
  strategy: string;
  account_value: number;
  gold: number;
  momentum: number;
  lowvol: number;
  mutual_funds: number;
  holdings: number;
  has_equity_split: boolean;
  liquidcase: number;
  cash: number;
  cash_plus_liquidcase: number;
  excess_cash: number;
  excess_cash_pct: number;
  cash_drift: number | null;
  holdings_drift: number | null;
  cash_component_drift: number | null;
  snapshot_below_floor: boolean | null;
}

interface DeploySleeve {
  particular: string;
  current_value: number;
  addition_target: number;
  addition_actual: number;
  new_value: number;
  ltp: number | null;
  quantity: number | null;
}

interface AdditionalCashRequired {
  ideal_account_value: number;
  additional_cash_required: number;
  liquidcase_ideal: number;
  liquidcase_inflow: number;
  cash_ideal: number;
  cash_inflow: number;
}
interface AdditionalHoldingsRequired {
  gap: number;
  ratio_type: RatioType | null;
  new_account_value: number;
  sleeves: DeploySleeve[];
  undeployed_stock_value: number | null;
  stock_deployed: number | null;
  remaining_gap_after_stock: number | null;
}
interface ExcessCashDeployment {
  amount_available: number;
  blocked: boolean;
  ratio_type: RatioType | null;
  full: { amount_deployed: number; sleeves: DeploySleeve[] } | null;
  partial: { amount_deployed: number; sleeves: DeploySleeve[] } | null;
}
interface LiquidCaseFromExcessCash {
  ideal_cash: number;
  excess_cash_over_ideal: number;
  blocked: boolean;
  sleeves: DeploySleeve[];
}
interface SpecificDeployment {
  amount: number;
  ratio_type: RatioType | null;
  eq_book_amount: number;
  deriv_book_amount: number;
  new_account_value: number;
  sleeves: DeploySleeve[];
}

interface DeploymentResponse {
  snapshot: SnapshotRow;
  additional_cash_required: AdditionalCashRequired | null;
  additional_holdings_required: AdditionalHoldingsRequired | null;
  excess_cash_deployment: ExcessCashDeployment;
  liquid_case_from_excess_cash: LiquidCaseFromExcessCash;
  specific_deployment: SpecificDeployment | null;
}

// D0 — hypothetical new client shape, entirely unrelated to DeploymentResponse
interface D0Sleeve {
  particular: string;
  target_pct: number;
  target_value: number;
  actual_value: number;
  ltp: number | null;
  quantity: number | null;
}
interface D0Response {
  ratio_type: RatioType;
  strategy: string;
  account_value: number;
  sleeves: D0Sleeve[];
}

// ─── Color tokens ───────────────────────────────────────────────────────────

const DV = {
  headerGreen: "#1F4E3D",
  headerGreenDark: "#163A2D",
  gold: "#B99B3D",
  goldLight: "#E8DDB5",
  highlightCyan: "#CDEFEF",
  highlightCyan2: "#E4F7F7",
  border: "#C9C9B8",
  cHoldings: "#1F4E3D",
  cMf: "#B99B3D",
  cLiquidcase: "#4A9E9E",
  cCash: "#8A8570",
  cGold: "#D4AF37",
  cMomentum: "#7A9E4A",
  cLowVol: "#6B8CAE",
};

function segmentColor(particular: string) {
  switch (particular) {
    case "Holdings": return DV.cHoldings;
    case "Mutual Funds": return DV.cMf;
    case "Liquidcase": return DV.cLiquidcase;
    case "Cash": return DV.cCash;
    case "Gold": return DV.cGold;
    case "Momentum": return DV.cMomentum;
    case "Low Vol": return DV.cLowVol;
    default: return "#999999";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inr(n: number | null | undefined, decimals = 2) {
  if (n === null || n === undefined || !isFinite(n)) return "";
  const neg = n < 0;
  const num = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (neg ? "-₹" : "₹") + num;
}
function pct(n: number | null | undefined, decimals = 2) {
  if (n === null || n === undefined || !isFinite(n)) return "";
  return (n * 100).toFixed(decimals) + "%";
}
function numFromInput(v: string) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function signedTextClass(n: number | null) {
  if (n === null) return "text-card-text-secondary";
  return n < 0 ? "text-red-600" : n > 0 ? "text-[#1F7A4D]" : "text-[#8a8a7a]";
}

function DeltaText({ value }: { value: number }) {
  const cls = value < 0 ? "text-red-600" : value > 0 ? "text-[#1F7A4D]" : "text-[#8a8a7a]";
  return <span className={`font-semibold ${cls}`}>{value > 0 ? "+" : ""}{inr(value)}</span>;
}

// ─── Flag pill row ──────────────────────────────────────────────────────────

function FlagPillRow({
  cashDrift, holdingsDrift, cashComponentDrift, belowFloor,
}: {
  cashDrift: number | null; holdingsDrift: number | null; cashComponentDrift: number | null; belowFloor: boolean | null;
}) {
  const flags = [
    { label: `Cash Drift ${pct(cashDrift)}`, ok: cashDrift === null || Math.abs(cashDrift) < 0.05 },
    { label: `Holdings Drift ${pct(holdingsDrift)}`, ok: holdingsDrift === null || Math.abs(holdingsDrift) < 0.05 },
    { label: `Cash Component Drift ${pct(cashComponentDrift)}`, ok: cashComponentDrift === null || Math.abs(cashComponentDrift) < 0.05 },
    { label: belowFloor ? "Below Floor" : "Above Floor", ok: !belowFloor },
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {flags.map((f, i) => (
        <span
          key={i}
          className={`bg-white border rounded-full px-3.5 py-1.5 text-xs font-semibold ${f.ok ? "border-[#1F7A4D] text-[#1F7A4D]" : "border-[#B99B3D] text-[#8a6d1a]"
            }`}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

// ─── Scenario card wrapper ──────────────────────────────────────────────────

function ScenarioCard({
  title, variant = "green", children,
}: {
  title: string; variant?: "green" | "gold" | "dark"; children: React.ReactNode;
}) {
  const headerBg = variant === "gold" ? DV.gold : variant === "dark" ? DV.headerGreenDark : DV.headerGreen;
  const headerText = variant === "gold" ? "#2b2410" : "#fff";
  return (
    <div className="bg-white border border-[#C9C9B8] rounded-md overflow-hidden mb-5">
      <div className="px-3.5 py-2.5" style={{ background: headerBg, color: headerText }}>
        <span className="text-[13px] font-semibold tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Current Account Split table ───────────────────────────────────────────

function CurrentAccountSplit({ snapshot }: { snapshot: SnapshotRow }) {
  const av = snapshot.account_value;
  const rows = [
    { label: "Account Value", val: av, pctVal: 1, highlight: true },
    { label: "Holdings", val: snapshot.holdings, pctVal: av > 0 ? snapshot.holdings / av : 0 },
    { label: "Mutual Funds", val: snapshot.mutual_funds, pctVal: av > 0 ? snapshot.mutual_funds / av : 0 },
    { label: "Liquidcase", val: snapshot.liquidcase, pctVal: av > 0 ? snapshot.liquidcase / av : 0 },
    { label: "Cash", val: snapshot.cash, pctVal: av > 0 ? snapshot.cash / av : 0 },
  ];
  return (
    <ScenarioCard title="Current Account Split">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="text-left font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Particulars</th>
            <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Value</th>
            <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>% Allocation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-[#EDECE3] last:border-0">
              <td className={`px-3 py-1.5 ${r.highlight ? "font-bold" : "font-medium"}`}>{r.label}</td>
              <td className={`px-3 py-1.5 text-right ${r.highlight ? "font-semibold" : ""}`} style={r.highlight ? { background: DV.highlightCyan } : undefined}>{inr(r.val)}</td>
              <td className="px-3 py-1.5 text-right">{pct(r.pctVal, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScenarioCard>
  );
}

function StatBox({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="bg-white border border-[#C9C9B8] rounded-md px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b5f] mb-1">{label}</div>
      <div className={`text-[16px] font-bold ${colorClass || "text-card-text"}`}>{value}</div>
    </div>
  );
}

// ─── Sleeve table ───────────────────────────────────────────────────────────

function SleeveGridTable({ sleeves, showTargetColumn = false }: { sleeves: DeploySleeve[]; showTargetColumn?: boolean }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          <th className="text-left font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Particulars</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Value</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Target Value</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>(%)</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>LTP</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Qty</th>
        </tr>
      </thead>
      <tbody>
        {sleeves.map((s, i) => {
          const pctVal = s.new_value > 0 && s.addition_target > 0 ? s.addition_target / s.new_value : null;
          return (
            <tr key={i} className="border-b border-[#EDECE3] last:border-0">
              <td className="px-3 py-1.5 font-medium">{s.particular}</td>
              <td className="px-3 py-1.5 text-right">{inr(s.current_value)}</td>
              <td className="px-3 py-1.5 text-right">{inr(s.addition_target)}</td>
              <td className="px-3 py-1.5 text-right">{pctVal !== null ? pct(pctVal) : ""}</td>
              <td className="px-3 py-1.5 text-right">{s.ltp !== null ? inr(s.ltp) : ""}</td>
              <td className="px-3 py-1.5 text-right">{s.quantity !== null ? s.quantity.toLocaleString("en-IN") : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
// ─── Account Impact visual ──────────────────────────────────────────────────

function AccountImpact({ current, updated }: { current: Record<string, number>; updated: Record<string, number> }) {
  const keys = Object.keys(current);
  const curAV = keys.reduce((sum, k) => sum + current[k], 0);
  const newAV = keys.reduce((sum, k) => sum + (updated[k] ?? current[k]), 0);
  const avDelta = newAV - curAV;
  const badgeCls = Math.abs(avDelta) < 1 ? "bg-[#EFEFE6] text-[#77776a]" : avDelta > 0 ? "bg-[#E3F3EA] text-[#1F7A4D]" : "bg-[#FBEAEA] text-[#B23A3A]";
  const badgeText = Math.abs(avDelta) < 1 ? "No Change" : `${avDelta > 0 ? "+" : ""}${inr(avDelta, 0)}`;

  function buildBar(vals: Record<string, number>, total: number) {
    return keys.map((k) => {
      const v = vals[k] ?? 0;
      const p = total > 0 ? (v / total) * 100 : 0;
      const label = p >= 8 ? pct(v / total, 0) : "";
      return (
        <div
          key={k}
          className="h-full flex items-center justify-center text-[10px] font-semibold text-white overflow-hidden whitespace-nowrap transition-[width] duration-200"
          style={{ width: `${p.toFixed(2)}%`, background: segmentColor(k) }}
        >
          {label}
        </div>
      );
    });
  }

  return (
    <div>
      <div className="flex items-baseline gap-2.5 px-3.5 py-2.5 bg-[#FAFAF4] border-b border-dashed border-[#C9C9B8] flex-wrap">
        <span className="text-[13px] text-[#6b6b5f]">{inr(curAV, 0)}</span>
        <span className="text-[#6b6b5f]">→</span>
        <span className="text-[17px] font-bold">{inr(newAV, 0)}</span>
        <span className={`ml-auto px-2.5 py-1 rounded-full text-[11px] font-bold ${badgeCls}`}>{badgeText}</span>
      </div>
      <div className="p-3.5 space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="w-11 text-[10px] font-bold uppercase tracking-wide text-[#6b6b5f] flex-shrink-0">Current</span>
          <div className="flex-1 flex h-6 rounded border border-[#C9C9B8] overflow-hidden">{buildBar(current, curAV)}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-11 text-[10px] font-bold uppercase tracking-wide text-[#6b6b5f] flex-shrink-0">New</span>
          <div className="flex-1 flex h-6 rounded border border-[#C9C9B8] overflow-hidden">{buildBar(updated, newAV)}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3.5 px-3.5 pb-3 text-[10.5px] text-[#4a4a3f]">
        {keys.map((k) => (
          <span key={k}>
            <span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle" style={{ background: segmentColor(k) }} />
            {k}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 px-3.5 pb-3.5">
        {keys.map((k) => {
          const d = (updated[k] ?? current[k]) - current[k];
          const cls = Math.abs(d) < 1 ? "text-[#8a8a7a]" : d > 0 ? "text-[#1F7A4D]" : "text-[#B23A3A]";
          const txt = Math.abs(d) < 1 ? "No Change" : `${d > 0 ? "+" : ""}${inr(d, 0)}`;
          return (
            <div key={k} className="flex-1 min-w-[110px] bg-white border border-[#C9C9B8] rounded-md px-2.5 py-1.5">
              <span className="block text-[9.5px] font-bold uppercase tracking-wide text-[#6b6b5f]">{k}</span>
              <span className={`block text-[13px] font-bold mt-0.5 ${cls}`}>{txt}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Small shared form UI ──────────────────────────────────────────────────

function SH({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-logo-green rounded-t-lg px-4 py-2.5">
      <span className="text-xs font-bold uppercase tracking-wide text-white">{children}</span>
    </div>
  );
}
function RadioPair<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-primary-bg/60 border border-logo-green/10 p-1 w-fit">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${value === o.value ? "bg-white text-logo-green shadow-sm" : "text-card-text-secondary hover:text-card-text"
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
function NumberField({ label, value, onChange, prefix = "₹" }: { label: string; value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-card-text-secondary mb-1.5">{label}</span>
      <div className="flex items-center rounded-lg border border-logo-green/20 bg-white overflow-hidden focus-within:border-logo-green/40">
        {prefix && <span className="px-3 text-sm text-card-text-secondary bg-primary-bg/40">{prefix}</span>}
        <input type="number" value={value || ""} onChange={(e) => onChange(numFromInput(e.target.value))} className="w-full px-3 py-2 text-sm text-card-text outline-none" />
      </div>
    </label>
  );
}
function ClientSelector({
  allClients, selectedQcode, onSelect, placeholder = "Select a client…",
}: {
  allClients: ClientRecord[]; selectedQcode: string | null; onSelect: (qcode: string, accountName: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = allClients.filter(
    (c) => c.account_name.toLowerCase().includes(search.toLowerCase()) || c.qcode.toLowerCase().includes(search.toLowerCase())
  );
  const selected = allClients.find((c) => c.qcode === selectedQcode);

  return (
    <div className="relative">
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-lg border border-logo-green/20 bg-white px-3 py-2 text-sm text-left hover:border-logo-green/40 transition-colors"
      >
        <span className={selected ? "text-card-text" : "text-card-text-secondary/60"}>
          {selected ? `${selected.account_name} (${selected.qcode})` : placeholder}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-logo-green/15 bg-white shadow-lg py-1">
            <div className="px-3 py-2 border-b border-logo-green/10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-card-text-secondary" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
                  placeholder="Search client name or qcode…"
                  className="w-full text-sm pl-8 pr-2 py-1.5 rounded border border-logo-green/20 outline-none focus:border-logo-green/40"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-card-text-secondary italic">No matches.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.qcode} type="button"
                    onClick={() => { onSelect(c.qcode, c.account_name); setOpen(false); setSearch(""); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-primary-bg/40 transition-colors"
                  >
                    <span className="font-medium text-card-text">{c.account_name}</span>
                    <span className="text-card-text-secondary ml-2 text-xs">{c.qcode}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-primary-bg/40 border border-logo-green/10 px-4 py-3">
      <div className="text-xs font-medium text-card-text-secondary mb-1">{label}</div>
      <div className="text-lg font-bold text-card-text">{value}</div>
    </div>
  );
}

// ─── D0: Hypothetical New Client panel ─────────────────────────────────────

function NewClientPanel({ clients }: { clients: ClientRecord[] }) {
  const [strategy, setStrategy] = useState("QAW++");
  const isQAW = strategy.startsWith("QAW");
  const isQYE = strategy.startsWith("QYE");
  const [qyeInputType, setQyeInputType] = useState<"account_value" | "holdings" | "cash">("account_value");
  const [ratioType, setRatioType] = useState<RatioType>("ideal");
  const [accountValue, setAccountValue] = useState(0);
  const [referenceQcode, setReferenceQcode] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");

  const qawClients = useMemo(
    () => clients.filter((c) => c.strategies.some((s) => isActiveStrategy(s) && s.strategy.startsWith("QAW"))),
    [clients]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<D0Response | null>(null);

 async function handleSubmit() {
  if (accountValue <= 0) return;
  if (isQAW && ratioType === "current" && !referenceQcode) return;

  const body: Record<string, unknown> = { strategy };

  if (isQYE) {
    body.input_mode = qyeInputType;
    body.value = accountValue;
  } else {
    // QAW
    body.account_value = accountValue;
    body.ratio_type = ratioType;
    if (ratioType === "current") {
      body.reference_qcode = referenceQcode;
    }
  }

  setLoading(true);
  setError(null);
  try {
    const res = await fetch("/api/internal/cash-margin/deployment", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    setResult(await res.json());
  } catch (e: any) {
    setError(e?.message || "Failed to compute deployment.");
    setResult(null);
  } finally {
    setLoading(false);
  }
}

  return (
    <>
      <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
        <SH>New Client Deployment</SH>
        <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
  <label className="block">
    <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Strategy</span>
    <select value={strategy} onChange={(e) => setStrategy(e.target.value)}
      className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white">
      {["QAW+", "QAW++", "QYE+", "QYE++"].map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  </label>

  <label className="block">
    <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Client Name (for export)</span>
    <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
      placeholder="Enter client name…"
      className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white" />
  </label>

  {isQYE && (
    <label className="block">
      <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Input Type</span>
      <select value={qyeInputType} onChange={(e) => setQyeInputType(e.target.value as "account_value" | "holdings" | "cash")}
        className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white">
        <option value="account_value">Account Value</option>
        <option value="holdings">Holdings Value</option>
        <option value="cash">Cash Value</option>
      </select>
    </label>
  )}

  <NumberField
    label={isQYE ? (qyeInputType === "account_value" ? "Account Value" : qyeInputType === "holdings" ? "Holdings Value" : "Cash Value") : "Account Value"}
    value={accountValue}
    onChange={setAccountValue}
  />

  {isQAW && (
    <label className="block">
      <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Ratio Type</span>
      <select value={ratioType} onChange={(e) => setRatioType(e.target.value as RatioType)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white">
        <option value="ideal">Ideal (40/40/20)</option>
        <option value="model">Model</option>
        <option value="current">Current — copy a real client</option>
      </select>
    </label>
  )}
</div>

          {isQAW && ratioType === "current" && (
            <div className="mb-5">
              <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Reference Client (copies their Gold/Momentum/Low Vol proportions)</span>
              <ClientSelector allClients={qawClients} selectedQcode={referenceQcode} onSelect={(q) => setReferenceQcode(q)} placeholder="Select a QAW client to copy ratios from…" />
            </div>
          )}

          <button
            type="button" onClick={handleSubmit}
            disabled={loading || accountValue <= 0 || (isQAW && ratioType === "current" && !referenceQcode)}
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-5 py-2.5 text-sm font-medium text-white hover:bg-logo-green/90 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Computing…" : "Compute Deployment"}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
{result && (
  <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
    <SH>Deployment Split — {result.strategy} ({result.ratio_type})</SH>
    <div className="p-5">
      <ResultCard label="Account Value" value={inr(result.account_value)} />
      <div className="overflow-x-auto rounded-lg border border-logo-green/10 mt-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-primary-bg/40 text-card-text-secondary">
              <th className="px-3 py-2 text-left font-medium">Particular</th>
              <th className="px-3 py-2 text-right font-medium">Target %</th>
              <th className="px-3 py-2 text-right font-medium">Target Value</th>
              <th className="px-3 py-2 text-right font-medium">Actual Value</th>
              <th className="px-3 py-2 text-right font-medium">LTP</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            {result.sleeves.map((s, i) => {
              const isHeader = s.particular === "Equity - Stock";
              return (
                <tr key={i} className={`border-t border-logo-green/5 ${isHeader ? "bg-primary-bg/30 font-semibold" : ""}`}>
                  <td className={`px-3 py-2 text-card-text whitespace-nowrap ${isHeader ? "font-semibold" : "font-medium"}`}>{s.particular}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary whitespace-nowrap">{pct(s.target_pct)}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary whitespace-nowrap">{inr(s.target_value)}</td>
                  <td className="px-3 py-2 text-right text-card-text whitespace-nowrap">{inr(s.actual_value)}</td>
                  <td className="px-3 py-2 text-right text-card-text-secondary whitespace-nowrap">
                    {s.ltp !== null ? inr(s.ltp) : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-card-text-secondary whitespace-nowrap">
                    {s.quantity !== null ? s.quantity.toLocaleString("en-IN") : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  </div>
)}
    </>
  );
}

// ─── D1/D2: Existing Client panel ──────────────────────────────────────────

type ScenarioTab = "cash" | "holdings" | "excess-full" | "excess-partial" | "liquidcase" | "specific";

const SCENARIO_TABS: { value: ScenarioTab; label: string }[] = [
  { value: "cash", label: "Additional Cash Required" },
  { value: "holdings", label: "Additional Holdings Required" },
  { value: "excess-full", label: "Excess Cash — Full" },
  { value: "excess-partial", label: "Excess Cash — Partial" },
  { value: "liquidcase", label: "Liquidcase Top-up" },
  { value: "specific", label: "Specific Deployment" },
];

function ExistingClientPanel({ clients }: { clients: ClientRecord[] }) {
  const [qcode, setQcode] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const selectedClient = useMemo(() => clients.find((c) => c.qcode === qcode), [clients, qcode]);
  const availableStrategies = useMemo(
    () => (selectedClient ? selectedClient.strategies.filter(isActiveStrategy).map((s) => s.strategy) : []),
    [selectedClient]
  );
  const [strategy, setStrategy] = useState("");
  useEffect(() => {
    setStrategy(availableStrategies.length > 0 ? availableStrategies[0] : "");
  }, [availableStrategies]);
  const isQAW = strategy.startsWith("QAW");

  const [ratioType, setRatioType] = useState<RatioType>("current");
  const [amount, setAmount] = useState(0);
  const [todayPnl, setTodayPnl] = useState(0);

  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [equityPct, setEquityPct] = useState(70);
  const [cashPct, setCashPct] = useState(10);
  const [lcPct, setLcPct] = useState(20);
  const overrideValid = equityPct + cashPct + lcPct === 100;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeploymentResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ScenarioTab>("cash");

  async function handleSubmit() {
    if (!qcode || !strategy) return;
    if (overrideEnabled && !overrideValid) return;
    const body: Record<string, unknown> = { qcode, strategy };
    if (isQAW) body.ratio_type = ratioType;
    if (amount > 0) body.amount = amount;
    if (todayPnl !== 0) body.today_pnl = todayPnl;
    if (overrideEnabled) {
      body.equity_pct = equityPct / 100;
      body.cash_pct = cashPct / 100;
      body.lc_pct = lcPct / 100;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/cash-margin/deployment", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: DeploymentResponse = await res.json();
      setResult(data);
      setActiveTab("cash");
    } catch (e: any) {
      setError(e?.message || "Failed to compute deployment.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const baseline: Record<string, number> = result
    ? { Holdings: result.snapshot.holdings, "Mutual Funds": result.snapshot.mutual_funds, Liquidcase: result.snapshot.liquidcase, Cash: result.snapshot.cash }
    : { Holdings: 0, "Mutual Funds": 0, Liquidcase: 0, Cash: 0 };

  return (
    <>
      <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
        <SH>Deployment Request</SH>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Client</span>
              <ClientSelector allClients={clients} selectedQcode={qcode} onSelect={(q, name) => { setQcode(q); setAccountName(name); }} />
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Strategy</span>
              <select
                value={strategy} onChange={(e) => setStrategy(e.target.value)} disabled={availableStrategies.length === 0}
                className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white disabled:bg-primary-bg/30"
              >
                {availableStrategies.length === 0 && <option>Select a client first</option>}
                {availableStrategies.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {isQAW && (
              <label className="block">
                <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Ratio Type</span>
                <select
                  value={ratioType} onChange={(e) => setRatioType(e.target.value as RatioType)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white"
                >
                  <option value="current">Current</option>
                  <option value="ideal">Ideal (40/40/20)</option>
                  <option value="model">Model</option>
                </select>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <NumberField label="Specific Amount to Deploy (optional)" value={amount} onChange={setAmount} />
            <NumberField label="Today's P&L Overlay (optional)" value={todayPnl} onChange={setTodayPnl} />
          </div>

          <div className="border-t border-logo-green/10 pt-4 mb-5">
            <label className="flex items-center gap-2 text-xs font-medium text-card-text-secondary cursor-pointer mb-3">
              <input type="checkbox" checked={overrideEnabled} onChange={(e) => setOverrideEnabled(e.target.checked)} className="h-4 w-4 rounded accent-logo-green" />
              <Settings2 className="h-3.5 w-3.5" />
              Override ratios for this calculation
            </label>
            {overrideEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Equity %</span>
                    <div className="flex items-center rounded-lg border border-logo-green/20 bg-white overflow-hidden">
                      <input type="number" step="0.1" value={equityPct} onChange={(e) => setEquityPct(numFromInput(e.target.value))} className="w-full px-3 py-2 text-sm outline-none" />
                      <span className="px-3 text-sm text-card-text-secondary bg-primary-bg/40">%</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Cash %</span>
                    <div className="flex items-center rounded-lg border border-logo-green/20 bg-white overflow-hidden">
                      <input type="number" step="0.1" value={cashPct} onChange={(e) => setCashPct(numFromInput(e.target.value))} className="w-full px-3 py-2 text-sm outline-none" />
                      <span className="px-3 text-sm text-card-text-secondary bg-primary-bg/40">%</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Liquid Case %</span>
                    <div className="flex items-center rounded-lg border border-logo-green/20 bg-white overflow-hidden">
                      <input type="number" step="0.1" value={lcPct} onChange={(e) => setLcPct(numFromInput(e.target.value))} className="w-full px-3 py-2 text-sm outline-none" />
                      <span className="px-3 text-sm text-card-text-secondary bg-primary-bg/40">%</span>
                    </div>
                  </label>
                </div>
                {!overrideValid && (
                  <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Percentages must sum to 100% (currently {(equityPct + cashPct + lcPct).toFixed(1)}%).
                  </p>
                )}
              </>
            )}
          </div>

          <button
            type="button" onClick={handleSubmit}
            disabled={loading || !qcode || !strategy || (overrideEnabled && !overrideValid)}
            className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-5 py-2.5 text-sm font-medium text-white hover:bg-logo-green/90 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Computing…" : "Compute Deployment"}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>

      {result && (
        <>
          {/* Current Account Split (always visible) */}
          <CurrentAccountSplit snapshot={result.snapshot} />

          {/* Stat boxes (always visible) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <StatBox label="Excess Cash" value={inr(result.snapshot.excess_cash, 0)} colorClass={signedTextClass(result.snapshot.excess_cash)} />
            <StatBox label="Cash Drift" value={pct(result.snapshot.cash_drift)} colorClass={signedTextClass(result.snapshot.cash_drift)} />
            <StatBox label="Holdings Drift" value={pct(result.snapshot.holdings_drift)} colorClass={signedTextClass(result.snapshot.holdings_drift)} />
          </div>

          {/* Scenario tabs — always all 6, each shows a "Not available" fallback if its data is missing */}
          <RadioPair value={activeTab} onChange={setActiveTab} options={SCENARIO_TABS} />

          <div className="mt-5">
            {activeTab === "cash" && (
              result.additional_cash_required ? (
                <ScenarioCard title="Additional Cash Required">
                  <table className="w-full text-[13px]">
                    <tbody>
                      <tr className="border-b border-[#EDECE3]">
                        <td className="px-3 py-1.5 font-bold">Ideal Account Value</td>
                        <td className="px-3 py-1.5 text-right font-semibold" style={{ background: DV.highlightCyan }}>{inr(result.additional_cash_required.ideal_account_value)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1.5 font-bold">Additional Cash Required</td>
                        <td className="px-3 py-1.5 text-right font-semibold" style={{ background: DV.highlightCyan }}><DeltaText value={result.additional_cash_required.additional_cash_required} /></td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full text-[13px]">
                    <thead><tr>
                      <th className="text-left font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Sleeve</th>
                      <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Ideal</th>
                      <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Δ Inflow</th>
                    </tr></thead>
                    <tbody>
                      <tr className="border-b border-[#EDECE3]">
                        <td className="px-3 py-1.5">Liquidcase</td>
                        <td className="px-3 py-1.5 text-right">{inr(result.additional_cash_required.liquidcase_ideal)}</td>
                        <td className="px-3 py-1.5 text-right"><DeltaText value={result.additional_cash_required.liquidcase_inflow} /></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1.5">Cash</td>
                        <td className="px-3 py-1.5 text-right">{inr(result.additional_cash_required.cash_ideal)}</td>
                        <td className="px-3 py-1.5 text-right"><DeltaText value={result.additional_cash_required.cash_inflow} /></td>
                      </tr>
                    </tbody>
                  </table>
                  <AccountImpact
                    current={baseline}
                    updated={{ Liquidcase: result.additional_cash_required.liquidcase_ideal, Cash: result.additional_cash_required.cash_ideal }}
                  />
                </ScenarioCard>
              ) : (
                <ScenarioCard title="Additional Cash Required">
                  <p className="p-4 text-sm text-card-text-secondary italic">Not available for this deployment.</p>
                </ScenarioCard>
              )
            )}

            {activeTab === "holdings" && (
              result.additional_holdings_required ? (
                <ScenarioCard title="Additional Holdings Required" variant="gold">
                  <table className="w-full text-[13px]">
                    <tbody>
                      <tr className="border-b border-[#EDECE3]"><td className="px-3 py-1.5 font-bold">Gap to Ideal Holdings</td><td className="px-3 py-1.5 text-right font-semibold" style={{ background: DV.highlightCyan }}>{inr(result.additional_holdings_required.gap)}</td></tr>
                      <tr className="border-b border-[#EDECE3]"><td className="px-3 py-1.5 font-bold">New Account Value</td><td className="px-3 py-1.5 text-right font-semibold" style={{ background: DV.highlightCyan }}>{inr(result.additional_holdings_required.new_account_value)}</td></tr>
                      {result.additional_holdings_required.undeployed_stock_value !== null && (
                        <>
                          <tr><td className="px-3 py-1.5">Undeployed Stock Available</td><td className="px-3 py-1.5 text-right">{inr(result.additional_holdings_required.undeployed_stock_value)}</td></tr>
                          <tr><td className="px-3 py-1.5">Remaining Gap After Stock</td><td className="px-3 py-1.5 text-right">{inr(result.additional_holdings_required.remaining_gap_after_stock)}</td></tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  <SleeveGridTable sleeves={result.additional_holdings_required.sleeves} />
                  <div className="text-[11px] text-[#6b6b5f] px-3.5 py-2.5 bg-[#FAFAF4] border-t border-dashed border-[#C9C9B8]">
                    Remaining gap after deploying undeployed stock is carried into Holdings by default. LTP/Qty apply only to Liquidcase — everything else moves by value.
                  </div>
                  <AccountImpact
                    current={baseline}
                    updated={Object.fromEntries(result.additional_holdings_required.sleeves.map((s) => [s.particular, s.new_value]))}
                  />
                </ScenarioCard>
              ) : (
                <ScenarioCard title="Additional Holdings Required" variant="gold">
                  <p className="p-4 text-sm text-card-text-secondary italic">Not available for this deployment.</p>
                </ScenarioCard>
              )
            )}

            {activeTab === "excess-full" && (
              result.excess_cash_deployment.full ? (
                <ScenarioCard title={`Excess Cash Deployment — Full (${inr(result.excess_cash_deployment.full.amount_deployed)})`} variant="gold">
                  <SleeveGridTable sleeves={result.excess_cash_deployment.full.sleeves} />
                  <AccountImpact
                    current={baseline}
                    updated={Object.fromEntries(result.excess_cash_deployment.full.sleeves.map((s) => [s.particular, s.new_value]))}
                  />
                </ScenarioCard>
              ) : (
                <ScenarioCard title="Excess Cash Deployment — Full" variant="gold">
                  <p className="p-4 text-sm text-card-text-secondary italic">
                    {result.excess_cash_deployment.blocked ? "Blocked — no excess cash available to deploy." : "Not available for this deployment."}
                  </p>
                </ScenarioCard>
              )
            )}

            {activeTab === "excess-partial" && (
              result.excess_cash_deployment.partial ? (
                <ScenarioCard title={`Excess Cash Deployment — Partial (${inr(result.excess_cash_deployment.partial.amount_deployed)})`} variant="gold">
                  <SleeveGridTable sleeves={result.excess_cash_deployment.partial.sleeves} />
                  <AccountImpact
                    current={baseline}
                    updated={Object.fromEntries(result.excess_cash_deployment.partial.sleeves.map((s) => [s.particular, s.new_value]))}
                  />
                </ScenarioCard>
              ) : (
                <ScenarioCard title="Excess Cash Deployment — Partial" variant="gold">
                  <p className="p-4 text-sm text-card-text-secondary italic">Not available for this deployment.</p>
                </ScenarioCard>
              )
            )}

            {activeTab === "liquidcase" && (
              !result.liquid_case_from_excess_cash.blocked ? (
                <ScenarioCard title="Liquidcase Top-up from Excess Cash" variant="gold">
                  <table className="w-full text-[13px]">
                    <tbody>
                      <tr className="border-b border-[#EDECE3]"><td className="px-3 py-1.5 font-bold">Ideal Cash</td><td className="px-3 py-1.5 text-right font-semibold" style={{ background: DV.highlightCyan }}>{inr(result.liquid_case_from_excess_cash.ideal_cash)}</td></tr>
                      <tr><td className="px-3 py-1.5 font-bold">Excess Over Ideal → to Liquidcase</td><td className="px-3 py-1.5 text-right font-semibold" style={{ background: DV.highlightCyan }}>{inr(result.liquid_case_from_excess_cash.excess_cash_over_ideal)}</td></tr>
                    </tbody>
                  </table>
                  <SleeveGridTable sleeves={result.liquid_case_from_excess_cash.sleeves} />
                  <AccountImpact
                    current={{ Liquidcase: result.snapshot.liquidcase, Cash: result.snapshot.cash }}
                    updated={Object.fromEntries(result.liquid_case_from_excess_cash.sleeves.map((s) => [s.particular, s.new_value]))}
                  />
                </ScenarioCard>
              ) : (
                <ScenarioCard title="Liquidcase Top-up from Excess Cash" variant="gold">
                  <p className="p-4 text-sm text-card-text-secondary italic">Blocked — Cash is already below its ideal target; nothing to move into Liquidcase.</p>
                </ScenarioCard>
              )
            )}

            {activeTab === "specific" && (
              result.specific_deployment ? (
                <ScenarioCard title={`Specific Deployment (${inr(result.specific_deployment.amount, 0)})`} variant="gold">
                  <SleeveGridTable sleeves={result.specific_deployment.sleeves} showTargetColumn />
                  <div className="text-[11px] text-[#6b6b5f] px-3.5 py-2.5 bg-[#FAFAF4] border-t border-dashed border-[#C9C9B8]">
                    Deploying {inr(result.specific_deployment.amount, 0)} → New Account Value {inr(result.specific_deployment.new_account_value, 0)}
                  </div>
                  <AccountImpact
                    current={baseline}
                    updated={Object.fromEntries(result.specific_deployment.sleeves.map((s) => [s.particular, s.new_value]))}
                  />
                </ScenarioCard>
              ) : (
                <ScenarioCard title="Specific Deployment" variant="gold">
                  <p className="p-4 text-sm text-card-text-secondary italic">
                    No amount was specified for this deployment — enter a "Specific Amount to Deploy" above and recompute to see this scenario.
                  </p>
                </ScenarioCard>
              )
            )}
          </div>
        </>
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DeploymentPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  useEffect(() => {
    fetch("/api/internal/clients", { credentials: "include" })
      .then((r) => r.json()).then(setClients).catch(() => setClients([]));
  }, []);

  const [mode, setMode] = useState<"existing" | "new">("existing");

  return (
    <div className="flex min-h-screen bg-primary-bg">
      <Sidebar active="p5" />
      <main className="flex-1 overflow-x-auto">
        <div className="bg-white border-b border-logo-green/10 px-8 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-button-text mb-0.5">Cash & Margin</div>
          <h1 className="font-serif text-2xl text-logo-green">Deployment</h1>
        </div>

        <div className="px-8 py-6 space-y-6 max-w-auto">
          <RadioPair
            value={mode}
            onChange={setMode}
            options={[
              { value: "existing", label: "Existing Client" },
              { value: "new", label: "New Client" },
            ]}
          />
          {mode === "existing" ? <ExistingClientPanel clients={clients} /> : <NewClientPanel clients={clients} />}
        </div>
      </main>
    </div>
  );
}