"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Users, TrendingDown, AlertTriangle, Bell, ChevronDown, ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientRow {
  masterClient: string;
  client: string;
  strategy: string;
  accountValue: number;
  cash: number;
  cashPct: number;
  excessCash: number;
  excessCashPct: number;
  excessCashStatus: "Excess Cash Levels" | "Low Cash Levels" | "Normal";
  holdings: number;
  holdingsPct: number;
  marginStatus: "Healthy" | "Shortfall";
  currentDrawdown: number;
  alertStatus: string;
  action: string;
}

// ─── Mock data matching the CSV ───────────────────────────────────────────────

const MOCK_ROWS: ClientRow[] = [
  {
    masterClient: "Arwani Research Services",
    client: "Arwani Research Services QYE++",
    strategy: "QYE++",
    accountValue: 312177488,
    cash: 34326310,
    cashPct: 31.5,
    excessCash: 6640955,
    excessCashPct: 2.13,
    excessCashStatus: "Excess Cash Levels",
    holdings: 213875573,
    holdingsPct: 68.5,
    marginStatus: "Healthy",
    currentDrawdown: -4.12,
    alertStatus: "Healthy",
    action: "Deploy - Excess Cash",
  },
  {
    masterClient: "",
    client: "Arwani Research Services QAW++",
    strategy: "QAW++",
    accountValue: 92511097,
    cash: 8103432,
    cashPct: 28.7,
    excessCash: -1764622,
    excessCashPct: -1.91,
    excessCashStatus: "Low Cash Levels",
    holdings: 65993003,
    holdingsPct: 71.3,
    marginStatus: "Shortfall",
    currentDrawdown: -4.79,
    alertStatus: "Healthy",
    action: "Review Margin & Collateral",
  },
  {
    masterClient: "Suresh Somani",
    client: "Suresh Somani",
    strategy: "QYE+",
    accountValue: 56058414,
    cash: 5130137,
    cashPct: 29.1,
    excessCash: -731636,
    excessCashPct: -1.31,
    excessCashStatus: "Low Cash Levels",
    holdings: 39753035,
    holdingsPct: 70.9,
    marginStatus: "Healthy",
    currentDrawdown: -4.07,
    alertStatus: "—",
    action: "Deploy - Excess Cash",
  },
  {
    masterClient: "Bakul Shah",
    client: "Bakul Shah",
    strategy: "QYE+",
    accountValue: 74981246,
    cash: 6028371,
    cashPct: 21.1,
    excessCash: 1014128,
    excessCashPct: 1.35,
    excessCashStatus: "Excess Cash Levels",
    holdings: 59173694,
    holdingsPct: 78.9,
    marginStatus: "Healthy",
    currentDrawdown: -2.46,
    alertStatus: "—",
    action: "No action required",
  },
  {
    masterClient: "Neha Ramani",
    client: "Neha Ramani",
    strategy: "QAW++",
    accountValue: 55389190,
    cash: 5846784,
    cashPct: 30.5,
    excessCash: 409242,
    excessCashPct: 0.74,
    excessCashStatus: "Excess Cash Levels",
    holdings: 38485964,
    holdingsPct: 69.5,
    marginStatus: "Healthy",
    currentDrawdown: -4.71,
    alertStatus: "—",
    action: "No action required",
  },
  {
    masterClient: "Dinesh Goel",
    client: "Dinesh Goel QAW++",
    strategy: "QAW++",
    accountValue: 72053834,
    cash: 7737715,
    cashPct: 30.2,
    excessCash: 184430,
    excessCashPct: 0.26,
    excessCashStatus: "Excess Cash Levels",
    holdings: 50308583,
    holdingsPct: 69.8,
    marginStatus: "Healthy",
    currentDrawdown: -4.70,
    alertStatus: "—",
    action: "No action required",
  },
  {
    masterClient: "",
    client: "Dinesh Goel QYE++",
    strategy: "QYE++",
    accountValue: 101548203,
    cash: 6823832,
    cashPct: 27.2,
    excessCash: -4062416,
    excessCashPct: -4.00,
    excessCashStatus: "Low Cash Levels",
    holdings: 73927433,
    holdingsPct: 72.8,
    marginStatus: "Shortfall",
    currentDrawdown: -4.09,
    alertStatus: "—",
    action: "Review Margin & Collateral",
  },
];

const ACTION_QUEUE = [
  "Arwani Research Services QYE++ — Deploy Excess Cash",
  "Arwani Research Services QAW++ — Review Margin & Collateral",
  "Suresh Somani — Deploy Excess Cash",
  "Dinesh Goel QYE++ — Review Margin & Collateral",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtInr(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, bg, textColor,
}: {
  label: string; value: string | number; sub?: string;
  bg: string; textColor?: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-5 flex-1 min-w-[140px]`}>
      <div className={`text-3xl font-bold ${textColor || "text-white"} mb-1`}>{value}</div>
      <div className={`text-xs font-semibold uppercase tracking-wide ${textColor ? "opacity-70" : "text-white/70"}`}>{label}</div>
      {sub && <div className={`text-xs mt-1 ${textColor ? "opacity-50" : "text-white/50"}`}>{sub}</div>}
    </div>
  );
}

// ─── Excess Cash Status badge ─────────────────────────────────────────────────

function ExcessCashBadge({ status }: { status: ClientRow["excessCashStatus"] }) {
  const styles: Record<string, string> = {
    "Excess Cash Levels": "bg-green-50 text-green-700 border border-green-200",
    "Low Cash Levels": "bg-red-50 text-red-700 border border-red-200",
    "Normal": "bg-yellow-50 text-yellow-700 border border-yellow-200",
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

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ active }: { active: string }) {
  const navItems = [
    { key: "p1", label: "P1 — Clients / Portfolio Overview", icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-logo-green min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="text-white font-serif text-lg font-bold">Cash & Margin</div>
        <div className="text-white/50 text-xs mt-0.5">SMA Dashboard</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4">
        {navItems.map((item) => (
          <div
            key={item.key}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
              active === item.key
                ? "bg-white/15 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.icon}
            {item.label}
          </div>
        ))}
      </nav>

      {/* Back link */}
      <div className="px-4 py-4 border-t border-white/10">
        <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>
    </aside>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashMarginDashboard() {
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set(["Arwani Research Services", "Dinesh Goel"]));

  const totalAum = MOCK_ROWS.reduce((s, r) => s + r.accountValue, 0);
  const totalExcessCash = MOCK_ROWS.filter((r) => r.excessCash > 0).length;
  const marginShortfalls = MOCK_ROWS.filter((r) => r.marginStatus === "Shortfall").length;
  const alertsTriggered = 0;
  const totalClients = new Set(MOCK_ROWS.map((r) => r.masterClient || r.client)).size;

  // Group by master client
  const grouped = MOCK_ROWS.reduce<Record<string, ClientRow[]>>((acc, row) => {
    const key = row.masterClient || row.client;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  function toggleMaster(key: string) {
    setExpandedMasters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-primary-bg">
      <Sidebar active="p1" />

      <main className="flex-1 overflow-x-auto">
        {/* Header */}
        <div className="bg-white border-b border-logo-green/10 px-8 py-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-button-text mb-1">Qode Advisors</div>
          <h1 className="font-serif text-2xl text-logo-green">P1: Clients / Portfolio Overview</h1>
          <p className="text-xs text-card-text-secondary mt-1">As of 09 Jun 2026 &middot; All values live-linked from mastersheet</p>
        </div>

        <div className="px-8 py-6">
          {/* KPI row */}
          <div className="flex gap-4 mb-8 flex-wrap">
            <KpiCard label="Total Clients (Config Sheet)" value={totalClients} bg="bg-logo-green" />
            <KpiCard label="Total AUM (₹)" value={fmtInr(totalAum)} bg="bg-logo-green" />
            <KpiCard label="Total Excess Cash" value={totalExcessCash} bg="bg-logo-green" />
            <KpiCard label="Margin Shortfalls" value={marginShortfalls} bg="bg-red-700" />
            <KpiCard label="Alerts Triggered" value={alertsTriggered} bg="bg-[#E07B39]" />
          </div>

          {/* Action Queue */}
          <div className="bg-white rounded-xl border border-logo-green/10 mb-6">
            <div className="bg-logo-green rounded-t-xl px-5 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-button-text" />
                <span className="text-sm font-semibold text-white">Action Queue — Clients requiring attention</span>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2">
              {ACTION_QUEUE.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-card-text">
                  <ChevronRight className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-red-600 font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Client Registry */}
          <div className="bg-white rounded-xl border border-logo-green/10">
            <div className="bg-logo-green rounded-t-xl px-5 py-3">
              <span className="text-sm font-semibold text-white">Client Registry — All strategy entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-bg/40 text-card-text-secondary text-xs border-b border-logo-green/10">
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Master Client</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Client</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Strategy</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Account Value</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Cash</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Cash %</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Excess Cash</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Excess Cash %</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Holdings</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Holdings %</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Margin</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Drawdown</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Alert</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([masterKey, rows]) => {
                    const isExpanded = expandedMasters.has(masterKey);
                    const hasMultiple = rows.length > 1;
                    return rows.map((row, ri) => (
                      <tr
                        key={`${masterKey}-${ri}`}
                        className={`border-t ${ri === 0 ? "border-logo-green/15" : "border-logo-green/5"} hover:bg-primary-bg/20 transition-colors`}
                      >
                        {/* Master Client — only first row, collapsible if multiple */}
                        <td className="px-4 py-2.5 font-semibold text-logo-green whitespace-nowrap">
                          {ri === 0 ? (
                            hasMultiple ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleMaster(masterKey)}
                                  className="hover:text-logo-green/70 transition-colors"
                                >
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                                </button>
                                <Link
                                  href={`/cash-margin/${encodeURIComponent(masterKey)}`}
                                  className="hover:underline hover:text-button-text transition-colors"
                                >
                                  {masterKey}
                                </Link>
                              </div>
                            ) : (
                              <Link
                                href={`/cash-margin/${encodeURIComponent(masterKey)}`}
                                className="hover:underline hover:text-button-text transition-colors"
                              >
                                {masterKey}
                              </Link>
                            )
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-card-text whitespace-nowrap">{row.client}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block rounded-md bg-button-text/15 border border-button-text/30 px-2 py-0.5 text-xs font-semibold text-card-text">
                            {row.strategy}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.accountValue)}</td>
                        <td className="px-4 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.cash)}</td>
                        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row.cashPct.toFixed(1)}%</td>
                        <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${row.excessCash >= 0 ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
                          {fmtInr(row.excessCash)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${row.excessCashPct >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {fmtPct(row.excessCashPct)}
                        </td>
                        <td className="px-4 py-2.5"><ExcessCashBadge status={row.excessCashStatus} /></td>
                        <td className="px-4 py-2.5 text-right text-card-text whitespace-nowrap">{fmtInr(row.holdings)}</td>
                        <td className="px-4 py-2.5 text-right text-card-text-secondary">{row.holdingsPct.toFixed(1)}%</td>
                        <td className="px-4 py-2.5"><MarginBadge status={row.marginStatus} /></td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${row.currentDrawdown >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {fmtPct(row.currentDrawdown)}
                        </td>
                        <td className="px-4 py-2.5 text-card-text-secondary text-xs">{row.alertStatus}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium whitespace-nowrap ${
                            row.action.includes("Deploy") ? "text-green-700" :
                            row.action.includes("Review") ? "text-red-600" :
                            "text-card-text-secondary"
                          }`}>
                            {row.action}
                          </span>
                        </td>
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