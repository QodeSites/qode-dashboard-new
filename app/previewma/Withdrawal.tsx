"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { AlertTriangle, Loader2, Search, Settings2, XCircle } from "lucide-react";

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

type Source = "all_profits" | "specific" | "fees" | "excess_cash";
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

interface WithdrawSleeve {
  particular: string;
  current_value: number;
  new_value: number;
  change_amount: number; // positive = leaves this sleeve (Sell), negative = added (Deposit)
  direction: "Sell" | "Deposit" | "None";
  ltp: number | null;
  quantity: number | null;
  new_pct: number;
}
interface WithdrawalView {
  new_account_value: number;
  sleeves: WithdrawSleeve[];
}
interface WithdrawalResponse {
  snapshot: { strategies: SnapshotRow[]; combined: SnapshotRow };
  blocked: boolean;
  warning: string | null;
  amount_to_withdraw: number | null;
  excess_cash_before_withdrawal: number;
  ratio_type: RatioType | null;
  balanced: WithdrawalView | null;
  holdings_frozen: WithdrawalView | null;
  cash_frozen: WithdrawalView | null;
  cash_frozen_unavailable_reason: string | null;
}

// ─── Color tokens (same as Deployment.tsx) ─────────────────────────────────

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
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const neg = n < 0;
  const num = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (neg ? "-₹" : "₹") + num;
}
function pct(n: number | null | undefined, decimals = 2) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
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
          className={`bg-white border rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            f.ok ? "border-[#1F7A4D] text-[#1F7A4D]" : "border-[#B99B3D] text-[#8a6d1a]"
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

// ─── Sleeve table (adapted for change_amount/direction) ────────────────────

function WithdrawSleeveTable({ sleeves }: { sleeves: WithdrawSleeve[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          <th className="text-left font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Particulars</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Current</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Δ Change</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>New Value</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>New %</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>LTP</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Qty</th>
        </tr>
      </thead>
      <tbody>
        {sleeves.map((s, i) => {
          const displayDelta = s.direction === "Sell" ? -Math.abs(s.change_amount) : s.direction === "Deposit" ? Math.abs(s.change_amount) : 0;
          return (
            <tr key={i} className="border-b border-[#EDECE3] last:border-0">
              <td className="px-3 py-1.5 font-medium">{s.particular}</td>
              <td className="px-3 py-1.5 text-right">{inr(s.current_value)}</td>
              <td className="px-3 py-1.5 text-right"><DeltaText value={displayDelta} /></td>
              <td className="px-3 py-1.5 text-right font-semibold" style={{ background: DV.highlightCyan2 }}>{inr(s.new_value)}</td>
              <td className="px-3 py-1.5 text-right">{pct(s.new_pct)}</td>
              <td className="px-3 py-1.5 text-right">{s.ltp !== null ? inr(s.ltp) : "—"}</td>
              <td className="px-3 py-1.5 text-right">{s.quantity !== null ? s.quantity.toLocaleString("en-IN") : "—"}</td>
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

// ─── Account Snapshot summary table (all strategies + combined) ───────────

function SnapshotTable({ snapshot, activeStrategy }: { snapshot: WithdrawalResponse["snapshot"]; activeStrategy: string }) {
  const rows = [...snapshot.strategies, { ...snapshot.combined, strategy: "Combined" }];
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          <th className="text-left font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Strategy</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Account Value</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Holdings</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Liquidcase</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Cash</th>
          <th className="text-right font-semibold px-3 py-1.5 text-[12px]" style={{ background: DV.goldLight, color: "#4a3d10" }}>Excess Cash</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={i} className="border-b border-[#EDECE3] last:border-0" style={s.strategy === activeStrategy ? { background: DV.highlightCyan2 } : undefined}>
            <td className="px-3 py-1.5 font-medium">
              {s.strategy}{s.strategy === activeStrategy && <span className="ml-1.5 text-[10px] text-[#1F7A4D] font-semibold">(requested)</span>}
            </td>
            <td className="px-3 py-1.5 text-right">{inr(s.account_value)}</td>
            <td className="px-3 py-1.5 text-right">{inr(s.holdings)}</td>
            <td className="px-3 py-1.5 text-right">{inr(s.liquidcase)}</td>
            <td className="px-3 py-1.5 text-right">{inr(s.cash)}</td>
            <td className="px-3 py-1.5 text-right"><DeltaText value={s.excess_cash} /></td>
          </tr>
        ))}
      </tbody>
    </table>
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
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === o.value ? "bg-white text-logo-green shadow-sm" : "text-card-text-secondary hover:text-card-text"
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
  allClients, selectedQcode, onSelect,
}: {
  allClients: ClientRecord[]; selectedQcode: string | null; onSelect: (qcode: string, accountName: string) => void;
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
          {selected ? `${selected.account_name} (${selected.qcode})` : "Select a client…"}
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

// ─── Scenario tabs for the withdrawal views ────────────────────────────────

type ViewTab = "balanced" | "holdings_frozen" | "cash_frozen";
const VIEW_TABS: { value: ViewTab; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "holdings_frozen", label: "Holdings Frozen" },
  { value: "cash_frozen", label: "Cash Frozen" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function WithdrawalPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  useEffect(() => {
    fetch("/api/internal/clients", { credentials: "include" })
      .then((r) => r.json()).then(setClients).catch(() => setClients([]));
  }, []);

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

  const [source, setSource] = useState<Source>("excess_cash");
  const [totalProfits, setTotalProfits] = useState(0);
  const [amount, setAmount] = useState(0);
  const [ratioType, setRatioType] = useState<RatioType>("current");

  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [equityPct, setEquityPct] = useState(70);
  const [cashPct, setCashPct] = useState(10);
  const [lcPct, setLcPct] = useState(20);
  const overrideValid = equityPct + cashPct + lcPct === 100;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WithdrawalResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("balanced");

  async function handleSubmit() {
    if (!qcode || !strategy) return;
    if (overrideEnabled && !overrideValid) return;

    const body: Record<string, unknown> = { qcode, strategy, source };
    if (source === "all_profits") body.total_profits = totalProfits;
    if (source === "specific" || source === "fees") body.amount = amount;
    if (isQAW) body.ratio_type = ratioType;
    if (overrideEnabled) {
      body.equity_pct = equityPct / 100;
      body.cash_pct = cashPct / 100;
      body.lc_pct = lcPct / 100;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/cash-margin/withdrawal", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: WithdrawalResponse = await res.json();
      setResult(data);
      setActiveTab("balanced");
    } catch (e: any) {
      setError(e?.message || "Failed to compute withdrawal.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const activeSnapshot = result
    ? result.snapshot.strategies.find((s) => s.strategy === strategy) ?? result.snapshot.combined
    : null;

  return (
    <div className="flex min-h-screen bg-primary-bg">
      <Sidebar active="p6" />
      <main className="flex-1 overflow-x-auto">
        <div className="bg-white border-b border-logo-green/10 px-8 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-button-text mb-0.5">Cash & Margin</div>
          <h1 className="font-serif text-2xl text-logo-green">Withdrawal</h1>
        </div>

        <div className="px-8 py-6 space-y-6 max-w-auto">
          {/* Request form */}
          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            <SH>Withdrawal Request</SH>
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
                <label className="block">
                  <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Source</span>
                  <select
                    value={source} onChange={(e) => setSource(e.target.value as Source)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white"
                  >
                    <option value="excess_cash">Excess Cash</option>
                    <option value="all_profits">All Profits</option>
                    <option value="specific">Specific Amount</option>
                    <option value="fees">Fees</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                {source === "all_profits" && (
                  <NumberField label="Total Profits (Realized + Unrealized − Charges)" value={totalProfits} onChange={setTotalProfits} />
                )}
                {(source === "specific" || source === "fees") && (
                  <NumberField label="Amount" value={amount} onChange={setAmount} />
                )}
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
                {loading ? "Computing…" : "Compute Withdrawal"}
              </button>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>
          </div>

          {result && activeSnapshot && (
            <>
              {/* Current Account Split (always visible) */}
              <CurrentAccountSplit snapshot={activeSnapshot} />

              {/* Stat boxes (always visible) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatBox label="Excess Cash" value={inr(activeSnapshot.excess_cash, 0)} colorClass={signedTextClass(activeSnapshot.excess_cash)} />
                <StatBox label="Cash Drift" value={pct(activeSnapshot.cash_drift)} colorClass={signedTextClass(activeSnapshot.cash_drift)} />
                <StatBox label="Holdings Drift" value={pct(activeSnapshot.holdings_drift)} colorClass={signedTextClass(activeSnapshot.holdings_drift)} />
              </div>

              {/* Account Snapshot table (all strategies + combined) */}
              <ScenarioCard title="Account Snapshot">
                <SnapshotTable snapshot={result.snapshot} activeStrategy={strategy} />
              </ScenarioCard>

              {result.blocked ? (
                <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-5 py-4">
                  <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700">Withdrawal Blocked</p>
                    <p className="text-sm text-red-600 mt-0.5">{result.warning || "This withdrawal cannot proceed."}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                    <div className="rounded-lg bg-primary-bg/40 border border-logo-green/10 px-4 py-3">
                      <div className="text-xs font-medium text-card-text-secondary mb-1">Amount to Withdraw</div>
                      <div className="text-lg font-bold text-card-text">{inr(result.amount_to_withdraw)}</div>
                    </div>
                    <div className="rounded-lg bg-primary-bg/40 border border-logo-green/10 px-4 py-3">
                      <div className="text-xs font-medium text-card-text-secondary mb-1">Excess Cash Before</div>
                      <div className="text-lg font-bold text-card-text">{inr(result.excess_cash_before_withdrawal)}</div>
                    </div>
                    {result.ratio_type && (
                      <div className="rounded-lg bg-primary-bg/40 border border-logo-green/10 px-4 py-3">
                        <div className="text-xs font-medium text-card-text-secondary mb-1">Ratio Type</div>
                        <div className="text-lg font-bold text-card-text capitalize">{result.ratio_type}</div>
                      </div>
                    )}
                  </div>

                  {/* Withdrawal view tabs — always all 3, each falls back gracefully if unavailable */}
                  <RadioPair value={activeTab} onChange={setActiveTab} options={VIEW_TABS} />

                  <div className="mt-5">
                    {activeTab === "balanced" && (
                      result.balanced ? (
                        <ScenarioCard title="Balanced">
                          <WithdrawSleeveTable sleeves={result.balanced.sleeves} />
                          <AccountImpact
                            current={Object.fromEntries(result.balanced.sleeves.map((s) => [s.particular, s.current_value]))}
                            updated={Object.fromEntries(result.balanced.sleeves.map((s) => [s.particular, s.new_value]))}
                          />
                        </ScenarioCard>
                      ) : (
                        <ScenarioCard title="Balanced">
                          <p className="p-4 text-sm text-card-text-secondary italic">Not available for this withdrawal.</p>
                        </ScenarioCard>
                      )
                    )}

                    {activeTab === "holdings_frozen" && (
                      result.holdings_frozen ? (
                        <ScenarioCard title="Holdings Frozen" variant="gold">
                          <WithdrawSleeveTable sleeves={result.holdings_frozen.sleeves} />
                          <AccountImpact
                            current={Object.fromEntries(result.holdings_frozen.sleeves.map((s) => [s.particular, s.current_value]))}
                            updated={Object.fromEntries(result.holdings_frozen.sleeves.map((s) => [s.particular, s.new_value]))}
                          />
                        </ScenarioCard>
                      ) : (
                        <ScenarioCard title="Holdings Frozen" variant="gold">
                          <p className="p-4 text-sm text-card-text-secondary italic">Not available for this withdrawal.</p>
                        </ScenarioCard>
                      )
                    )}

                    {activeTab === "cash_frozen" && (
                      result.cash_frozen ? (
                        <ScenarioCard title="Cash Frozen" variant="gold">
                          <WithdrawSleeveTable sleeves={result.cash_frozen.sleeves} />
                          <AccountImpact
                            current={Object.fromEntries(result.cash_frozen.sleeves.map((s) => [s.particular, s.current_value]))}
                            updated={Object.fromEntries(result.cash_frozen.sleeves.map((s) => [s.particular, s.new_value]))}
                          />
                        </ScenarioCard>
                      ) : (
                        <ScenarioCard title="Cash Frozen" variant="gold">
                          <p className="p-4 text-sm text-card-text-secondary italic">
                            {result.cash_frozen_unavailable_reason ? `Unavailable: ${result.cash_frozen_unavailable_reason}` : "Not available for this withdrawal."}
                          </p>
                        </ScenarioCard>
                      )
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}