"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { fetchAccountValueBreakup, fetchClients, type AccountValueBreakupResponse, type AccountValueRow, type EquityBreakupRow, type ClientListItem } from "./api";
import { SearchableSelect } from "./Searchableselect";


// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtInr(v: number) {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function fmtPct(v: number | null, digits = 2) {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function diffClass(v: number | null) {
  if (v === null) return "text-card-text-secondary";
  return v > 0 ? "text-green-700 bg-green-50" : v < 0 ? "text-red-700 bg-red-50" : "text-card-text-secondary";
}

function fmtDiff(v: number | null) {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

// Strategy → leverage label (++ / + etc.)
function leverageLabel(strategy: string) {
  if (strategy.endsWith("++")) return "++";
  if (strategy.endsWith("+")) return "+";
  return "";
}

// Strategy base without leverage suffix
function stratBase(strategy: string) {
  return strategy.replace(/\+\+?$/, "");
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#e2ebe6] border-l-4 border-logo-green px-4 py-3 mb-4">
      <span className="text-sm font-bold text-logo-green">{children}</span>
    </div>
  );
}

// ─── Section 1: Account Value Break-up ───────────────────────────────────────

function Section1({ accounts }: { accounts: AccountValueRow[] }) {
  const sorted = useMemo(
    () => [...accounts].sort((a, b) => a.account_name.localeCompare(b.account_name)),
    [accounts]
  );

  return (
    <div className="mb-8">
      <SectionHeader>Section 1 — Account Value Break-up</SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/40 text-card-text-secondary text-xs">
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Strategy</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Leverage</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Client Name</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Total AV</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Equity Book</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Debt Book</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">EQ %</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Debt %</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Diff EQ</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Diff Debt</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={`${row.qcode}-${row.strategy}`} className="border-t border-logo-green/5 hover:bg-primary-bg/20 transition-colors">
                <td className="px-3 py-2.5 text-card-text-secondary text-xs">{stratBase(row.strategy)}</td>
                <td className="px-3 py-2.5 text-card-text-secondary text-xs">{leverageLabel(row.strategy)}</td>
                <td className="px-3 py-2.5 text-card-text font-medium whitespace-nowrap">
                  {row.account_name} {row.strategy}
                </td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.total_av)}</td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.equity_book)}</td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.debt_book)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.equity_pct)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.debt_pct)}</td>
                <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${diffClass(row.diff_equity)}`}>
                  {fmtDiff(row.diff_equity)}
                </td>
                <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${diffClass(row.diff_debt)}`}>
                  {fmtDiff(row.diff_debt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section 2: Debt Book Break-up ───────────────────────────────────────────

function Section2({ accounts }: { accounts: AccountValueRow[] }) {
  const sorted = useMemo(
    () => [...accounts].sort((a, b) => a.account_name.localeCompare(b.account_name)),
    [accounts]
  );

  const totals = useMemo(() => ({
    debt_book: sorted.reduce((s, r) => s + r.debt_book, 0),
    liquid_case: sorted.reduce((s, r) => s + r.liquid_case, 0),
    cash: sorted.reduce((s, r) => s + r.cash, 0),
  }), [sorted]);

  return (
    <div className="mb-8">
      <SectionHeader>Section 2 — Debt Book Break-up</SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/40 text-card-text-secondary text-xs">
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Leverage</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Client Name</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Debt Book</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">% of Total AV</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Liquid Case</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Cash</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">LC %</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Cash %</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Diff LC</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Diff Cash</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={`${row.qcode}-${row.strategy}`} className="border-t border-logo-green/5 hover:bg-primary-bg/20 transition-colors">
                <td className="px-3 py-2.5 text-card-text-secondary text-xs">{leverageLabel(row.strategy)}</td>
                <td className="px-3 py-2.5 text-card-text font-medium whitespace-nowrap">
                  {row.account_name} {row.strategy}
                </td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.debt_book)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.debt_pct)}</td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.liquid_case)}</td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.cash)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.lc_pct)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.cash_pct)}</td>
                <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${diffClass(row.diff_lc)}`}>
                  {fmtDiff(row.diff_lc)}
                </td>
                <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${diffClass(row.diff_cash)}`}>
                  {fmtDiff(row.diff_cash)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-logo-green/20 bg-primary-bg/40">
              <td className="px-3 py-2.5 font-semibold text-logo-green" />
              <td className="px-3 py-2.5 font-semibold text-logo-green">Total</td>
              <td className="px-3 py-2.5 text-right font-semibold text-card-text whitespace-nowrap">{fmtInr(totals.debt_book)}</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right font-semibold text-card-text whitespace-nowrap">{fmtInr(totals.liquid_case)}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-card-text whitespace-nowrap">{fmtInr(totals.cash)}</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section 3: Equity Book Break-up (QAW / QTF) ─────────────────────────────

function Section3({ rows }: { rows: EquityBreakupRow[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.account_name.localeCompare(b.account_name)),
    [rows]
  );

  const totals = useMemo(() => ({
    equity_book: sorted.reduce((s, r) => s + r.equity_book, 0),
    gold: sorted.reduce((s, r) => s + r.gold, 0),
    lowvol: sorted.reduce((s, r) => s + r.lowvol, 0),
    momentum: sorted.reduce((s, r) => s + r.momentum, 0),
  }), [sorted]);

  return (
    <div className="mb-8">
      <SectionHeader>Section 3 — Equity Book Break-up (QAW / QTF)</SectionHeader>
      <div className="overflow-x-auto rounded-lg border border-logo-green/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-bg/40 text-card-text-secondary text-xs">
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Strategy</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Client Name</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Equity Book</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">% of Total AV</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Gold</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Low Vol</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Momentum</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Gold %</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Low Vol %</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Mom %</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Diff Gold</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Diff LV</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Diff Mom</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={`${row.qcode}-${row.strategy}`} className="border-t border-logo-green/5 hover:bg-primary-bg/20 transition-colors">
                <td className="px-3 py-2.5 text-card-text-secondary text-xs">{stratBase(row.strategy)}</td>
                <td className="px-3 py-2.5 text-card-text font-medium whitespace-nowrap">
                  {row.account_name} {row.strategy}
                </td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.equity_book)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.equity_pct)}</td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.gold)}</td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.lowvol)}</td>
                <td className="px-3 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.momentum)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.gold_pct)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.lowvol_pct)}</td>
                <td className="px-3 py-2.5 text-right text-card-text-secondary">{fmtPct(row.momentum_pct)}</td>
                <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${diffClass(row.diff_gold)}`}>
                  {fmtDiff(row.diff_gold)}
                </td>
                <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${diffClass(row.diff_lowvol)}`}>
                  {fmtDiff(row.diff_lowvol)}
                </td>
                <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${diffClass(row.diff_momentum)}`}>
                  {fmtDiff(row.diff_momentum)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-logo-green/20 bg-primary-bg/40">
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 font-semibold text-logo-green">Total</td>
              <td className="px-3 py-2.5 text-right font-semibold text-card-text whitespace-nowrap">{fmtInr(totals.equity_book)}</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right font-semibold text-card-text whitespace-nowrap">{fmtInr(totals.gold)}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-card-text whitespace-nowrap">{fmtInr(totals.lowvol)}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-card-text whitespace-nowrap">{fmtInr(totals.momentum)}</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
              <td className="px-3 py-2.5 text-right text-card-text-secondary">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ideal Split Targets panel ────────────────────────────────────────────────

interface SplitOverride {
  equity_pct: string;
  debt_pct: string;
  lc_pct: string;
  cash_pct: string;
  gold_pct: string;
  lowvol_pct: string;
  momentum_pct: string;
}

function PctInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-card-text-secondary">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-md border border-logo-green/20 bg-white px-2 py-1.5 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
        />
        <span className="text-sm text-card-text-secondary">%</span>
      </div>
    </div>
  );
}

function IdealSplitTargets({
  overrides,
  onChange,
}: {
  overrides: SplitOverride;
  onChange: (v: SplitOverride) => void;
}) {
  function set(key: keyof SplitOverride) {
    return (v: string) => onChange({ ...overrides, [key]: v });
  }

  return (
    <div className="rounded-xl border border-logo-green/10 bg-white p-5 mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Account Value Split */}
        <div>
          <div className="text-sm font-semibold text-card-text mb-3">Account Value Split</div>
          <div className="rounded-lg border border-logo-green/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-bg/40 text-card-text-secondary text-xs">
                  <th className="px-3 py-2 text-left font-medium">Equity Book</th>
                  <th className="px-3 py-2 text-left font-medium">Debt Book</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-logo-green/5">
                  <td className="px-3 py-2"><PctInput label="" value={overrides.equity_pct} onChange={set("equity_pct")} /></td>
                  <td className="px-3 py-2"><PctInput label="" value={overrides.debt_pct} onChange={set("debt_pct")} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Debt Book Split */}
        <div>
          <div className="text-sm font-semibold text-card-text mb-3">Debt Book Split</div>
          <div className="rounded-lg border border-logo-green/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-bg/40 text-card-text-secondary text-xs">
                  <th className="px-3 py-2 text-left font-medium">Liquid Case</th>
                  <th className="px-3 py-2 text-left font-medium">Cash</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-logo-green/5">
                  <td className="px-3 py-2"><PctInput label="" value={overrides.lc_pct} onChange={set("lc_pct")} /></td>
                  <td className="px-3 py-2"><PctInput label="" value={overrides.cash_pct} onChange={set("cash_pct")} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Equity Book Split (QAW) */}
        <div>
          <div className="text-sm font-semibold text-card-text mb-3">Equity Book Split (QAW)</div>
          <div className="rounded-lg border border-logo-green/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-bg/40 text-card-text-secondary text-xs">
                  <th className="px-3 py-2 text-left font-medium">Gold</th>
                  <th className="px-3 py-2 text-left font-medium">Low Vol</th>
                  <th className="px-3 py-2 text-left font-medium">Momentum</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-logo-green/5">
                  <td className="px-3 py-2"><PctInput label="" value={overrides.gold_pct} onChange={set("gold_pct")} /></td>
                  <td className="px-3 py-2"><PctInput label="" value={overrides.lowvol_pct} onChange={set("lowvol_pct")} /></td>
                  <td className="px-3 py-2"><PctInput label="" value={overrides.momentum_pct} onChange={set("momentum_pct")} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DEFAULT_OVERRIDES: SplitOverride = {
  equity_pct: "80",
  debt_pct: "20",
  lc_pct: "13",
  cash_pct: "7",
  gold_pct: "40",
  lowvol_pct: "20",
  momentum_pct: "40",
};

export function AccountValueBreakup() {
  const [data, setData] = useState<AccountValueBreakupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "ideal">("dashboard");
  const [overrides, setOverrides] = useState<SplitOverride>(DEFAULT_OVERRIDES);
  const [exporting, setExporting] = useState(false);

  // Client + strategy selectors (same pattern as ClientDashboardsTab)
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [selectedQcode, setSelectedQcode] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);

  // Load client list on mount
  useEffect(() => {
    fetchClients().then((list) => {
      setClients(list);
    }).catch(() => {});
  }, []);

  const selectedClient = clients.find((c) => c.qcode === selectedQcode);
  const realStrategies = (selectedClient?.strategies || []).filter((s) => s.strategy !== "combined");
  const isSingleStrategy = realStrategies.length === 1;
  const strategyOptions = isSingleStrategy
    ? realStrategies.map((s) => ({ value: s.strategy, label: s.strategy }))
    : (selectedClient?.strategies || []).map((s) => ({
        value: s.strategy,
        label: s.strategy === "combined" ? "Combined (all strategies)" : s.strategy,
      }));
  const clientOptions = clients.map((c) => ({ value: c.qcode, label: c.account_name, sublabel: c.qcode }));

  function handleClientChange(qcode: string) {
    setSelectedQcode(qcode);
    const client = clients.find((c) => c.qcode === qcode);
    const real = (client?.strategies || []).filter((s) => s.strategy !== "combined");
    if (real.length === 1) {
      setSelectedStrategy(real[0].strategy);
    } else {
      const combined = client?.strategies.find((s) => s.strategy === "combined");
      setSelectedStrategy(combined ? "combined" : client?.strategies[0]?.strategy || null);
    }
  }

  function buildOverridePayload() {
    const pcts = {
      equity_pct: parseFloat(overrides.equity_pct) / 100,
      debt_pct: parseFloat(overrides.debt_pct) / 100,
      lc_pct: parseFloat(overrides.lc_pct) / 100,
      cash_pct: parseFloat(overrides.cash_pct) / 100,
      gold_pct: parseFloat(overrides.gold_pct) / 100,
      lowvol_pct: parseFloat(overrides.lowvol_pct) / 100,
      momentum_pct: parseFloat(overrides.momentum_pct) / 100,
    };
    // Only include qcode/strategy if a specific client is selected
    if (selectedQcode && selectedStrategy) {
      return { ...pcts, qcode: selectedQcode, strategy: selectedStrategy };
    }
    return pcts;
  }

  function doFetch(override?: ReturnType<typeof buildOverridePayload>) {
    setLoading(true);
    setError(null);
    fetchAccountValueBreakup(override)
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load account value breakup."))
      .finally(() => setLoading(false));
  }

  // Initial load — no override, just default data
  useEffect(() => { doFetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApply() {
    doFetch(buildOverridePayload());
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/account-value-breakup/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override: buildOverridePayload() }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "account-value-breakup.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading account value breakup…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load account value breakup.</p>
          <p className="text-red-600/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Account Value Break-up
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

      {/* Tab toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-primary-bg/60 border border-logo-green/10 p-1 w-fit mb-6">
        {(["dashboard", "ideal"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-logo-green shadow-sm"
                : "text-card-text-secondary hover:text-card-text"
            }`}
          >
            {tab === "dashboard" ? "Dashboard" : "Ideal Split Targets"}
          </button>
        ))}
      </div>

      {/* Ideal Split Targets panel */}
      {activeTab === "ideal" && (
        <div className="mb-6">
          {/* Client + Strategy selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 max-w-xl">
            <SearchableSelect
              label="Client (optional)"
              placeholder="All clients"
              options={clientOptions}
              value={selectedQcode}
              onChange={handleClientChange}
            />
            <SearchableSelect
              label="Strategy (optional)"
              placeholder="All strategies"
              options={strategyOptions}
              value={selectedStrategy}
              onChange={setSelectedStrategy}
              disabled={!selectedClient}
            />
          </div>

          <IdealSplitTargets overrides={overrides} onChange={setOverrides} />

          <button
            type="button"
            onClick={handleApply}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-logo-green px-5 py-2 text-sm font-medium text-button-text hover:bg-logo-green/90 transition-colors"
          >
            Apply & Refresh
          </button>
        </div>
      )}

      {/* Data sections */}
      <Section1 accounts={data.accounts} />
      <Section2 accounts={data.accounts} />
      <Section3 rows={data.equity_breakup} />
    </div>
  );
}

export default AccountValueBreakup;