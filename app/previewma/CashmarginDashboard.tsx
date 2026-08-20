"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {  AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { Sidebar } from "./Sidebar";

// ─── Types (matching the real client-registry response) ──────────────────────

interface ClientRow {
  qcode: string;
  client: string;
  strategy: string;
  tier: string;
  accountValue: number;
  cash: number;
  cashPct: number;
  excessCash: number;
  excessCashPct: number;
  cashDriftPct:number
  cashComponentValue:number
  cashComponentPct:number
  cashComponentDriftPct:number
  excessCashStatus: "Excess Cash Levels" | "Low Cash Levels";
  holdings: number;
  holdingsPct: number;
  holdingsDriftPct:number
  marginStatus: "Healthy" | "Shortfall";
  currentDrawdownPct: number | null;
  alertStatus: "HEALTHY" | "WARNING" | "ACTION_REQUIRED" | "UPSIDE" | "UNAVAILABLE";
  clientAlertStatus: "HEALTHY" | "WARNING" | "ACTION_REQUIRED" | "UPSIDE" | "UNAVAILABLE";
  action: "Review Margin & Collateral" | "Deploy - Excess Cash" | "No action required";
  debtEquityHybridRatio: string;
}

interface RegistryResponse {
  generatedAt: string;
  rows: ClientRow[];
  summary: {
    totalClients: number;
    totalAum: number;
    totalExcessCash: number;
    totalExcessCashCount:number,
    marginShortfalls: number;
    alertsTriggered: number;
  };
  actionQueue: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtInr(v: number) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number | null) {
  if (v === null || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function alertBadgeStyles(status: ClientRow["alertStatus"]) {
  switch (status) {
    case "HEALTHY": return "bg-green-50 text-green-700 border-green-200";
    case "WARNING": return "bg-red-50 text-red-700 border-red-200";
    case "ACTION_REQUIRED": return "bg-amber-50 text-amber-700 border-amber-200";
    case "UPSIDE": return "bg-blue-50 text-blue-700 border-blue-200";
    default: return "bg-gray-100 text-gray-500 border-gray-200"; // UNAVAILABLE
  }
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, bg }: { label: string; value: string | number; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-5 flex-1 min-w-[140px]`}>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-white/70">{label}</div>
    </div>
  );
}

function ExcessCashBadge({ status }: { status: ClientRow["excessCashStatus"] }) {
  const styles: Record<string, string> = {
    "Excess Cash Levels": "bg-green-50 text-green-700 border border-green-200",
    "Low Cash Levels": "bg-red-50 text-red-700 border border-red-200",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${styles[status]}`}>
      {status}
    </span>
  );
}
function MarginBadge({ status }: { status: "Healthy" | "Shortfall" }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      status === "Healthy" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
    }`}>
      {status}
    </span>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashMarginDashboard() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);  

  useEffect(() => {
    fetch("/api/internal/cash-margin/client-registry", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => { if (!r.ok) throw new Error(`Request failed (${r.status})`); return r.json(); })
      .then((res: RegistryResponse) => setData(res))
      .catch((e) => setError(e?.message || "Failed to load client registry."))
      .finally(() => setLoading(false));
  }, []);

const grouped = useMemo(() => {
  if (!data) return {};
  const seen = new Set<string>();
  return data.rows.reduce<Record<string, ClientRow[]>>((acc, row) => {
    const dedupeKey = `${row.qcode}__${row.strategy}`;
    if (seen.has(dedupeKey)) {
      console.warn(`Duplicate client-registry row for ${dedupeKey} — keeping the first occurrence.`);
      return acc;
    }
    seen.add(dedupeKey);
    if (!acc[row.qcode]) acc[row.qcode] = [];
    acc[row.qcode].push(row);
    return acc;
  }, {});
}, [data]);


  if (loading) {
    return (
      <div className="flex min-h-screen bg-primary-bg">
        <Sidebar active="p1" />
        <main className="flex-1 flex items-center justify-center gap-2 text-card-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading client registry…
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen bg-primary-bg">
        <Sidebar active="p1" />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-md">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {error || "Failed to load client registry."}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-primary-bg">
      <Sidebar active="p1" />

      <main className="flex-1 overflow-x-auto">
        {/* Header */}
        <div className="bg-white border-b border-logo-green/10 px-8 py-5">
          <h1 className="font-serif text-2xl text-logo-green">Dashboard</h1>
          <p className="text-xs text-card-text-secondary mt-1">
            As of {(() => {
  const d = new Date(data.generatedAt);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
})()}
          </p>
        </div>

        <div className="px-8 py-6">
          {/* KPI row */}
          <div className="flex gap-4 mb-8 flex-wrap">
            <KpiCard label="Total Clients" value={data.summary.totalClients} bg="bg-logo-green" />
            <KpiCard label="Total AUM (₹)" value={fmtInr(data.summary.totalAum)} bg="bg-logo-green" />
            <KpiCard label="Total Excess Count" value={data.summary.totalExcessCashCount} bg="bg-logo-green" />
            <KpiCard label="Margin Shortfalls" value={data.summary.marginShortfalls} bg="bg-red-700" />
          </div>

          {/* Action Queue */}
        {data.actionQueue.length > 0 && (
  <div className="bg-white rounded-xl border border-logo-green/10 mb-6">
    <div className="bg-logo-green rounded-t-xl px-5 py-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-button-text" />
        <span className="text-sm font-semibold text-white">
          Action Queue
        </span>
      </div>
    </div>
<div className="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
  {data.actionQueue.map((item, i) => {
    const formatted = item.replace(/\s*[—-]\s*/, ": ");
    return (
      <div key={i} className="flex items-center gap-2 text-sm text-card-text">
        <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${
          item.includes("Deploy") ? "text-green-700" :
          item.includes("Review") ? "text-red-500" :
          "text-card-text-secondary"
        }`} />
        <span className={`font-medium ${
          item.includes("Deploy") ? "text-green-700" :
          item.includes("Review") ? "text-red-600" :
          "text-card-text"
        }`}>
          {formatted}
        </span>
      </div>
    );
  })}
</div>
  </div>
)}

          {/* Client Registry */}
          <div className="bg-white rounded-xl border border-logo-green/10">
            <div className="bg-logo-green rounded-t-xl px-5 py-3">
              <span className="text-sm font-semibold text-white">Client Registry</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-bg/40 text-card-text-secondary text-xs border-b border-logo-green/10">
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Client</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Strategy</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Account Value</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Excess Cash</th>
                    <th className="px-4 py-2.5 text-middle font-medium whitespace-nowrap">Cash Status</th>
                    <th className="px-4 py-2.5 text-middle font-medium whitespace-nowrap">Cash</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Cash %</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Cash Drift %</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Cash Component</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Cash Component %</th>

                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Cash Drift Component %</th>

                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Holdings</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Holdings %</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Holdings Drift %</th>

                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Margin</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Current Drawdown</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Debt-Equity-Hybrid</th>
                  </tr>
                </thead>
                <tbody>
  {Object.entries(grouped).map(([qcode, rows]) => {
    const clientName = rows[0].client;
    return rows.map((row, ri) => (
      <tr
        key={`${qcode}-${row.strategy}-${ri}`}
        className={`border-t ${ri === 0 ? "border-logo-green/15" : "border-logo-green/5"} hover:bg-primary-bg/20 transition-colors`}
      >
        {ri === 0 && (
          <td
            rowSpan={rows.length}
            className="px-4 py-2.5 font-semibold text-logo-green whitespace-nowrap align-middle border-r border-logo-green/5"
          >
            <Link href={`/cash-margin/client?qcode=${encodeURIComponent(qcode)}`} className="hover:underline hover:text-button-text transition-colors">
              {clientName}
            </Link>
          </td>
        )}
        <td className="px-4 py-2.5">
          <span className="inline-block rounded-md bg-button-text/15 border border-button-text/30 px-2 py-0.5 text-xs font-semibold text-card-text">
            {row.strategy}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.accountValue)}</td>
        <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${row.excessCash >= 0 ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
          {fmtInr(row.excessCash)}
        </td>
        <td className="px-4 py-2.5"><ExcessCashBadge status={row.excessCashStatus} /></td>
        <td className="px-4 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.cash)}</td>
        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row.cashOnlyPct?.toFixed(2)}%</td>
        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row.cashDriftPct?.toFixed(2)}%</td>
        <td className="px-4 py-2.5 text-right text-card-text-secondary">{fmtInr(row?.cashComponentValue)}</td>
        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row?.cashComponentPct?.toFixed(2)}%</td>

        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row?.cashComponentDriftPct?.toFixed(2)}%</td>


        <td className="px-4 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row?.holdings)}</td>
        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row.holdingsPct?.toFixed(2)}%</td>
        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row.holdingsDriftPct?.toFixed(2)}%</td>

        <td className="px-4 py-2.5"><MarginBadge status={row.marginStatus} /></td>
        <td className={`px-4 py-2.5 text-right font-semibold ${row.currentDrawdownPct !== null && row.currentDrawdownPct >= 0 ? "text-green-700" : "text-red-600"}`}>
          {fmtPct(row.currentDrawdownPct)}
        </td>
        <td className="px-4 py-2.5 text-card-text-secondary text-xs whitespace-nowrap">{row.debtEquityHybridRatio}</td>
      </tr>
    ));
  })}
</tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}