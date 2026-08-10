"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, AlertOctagon, CheckCircle2, Bell, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useAlerts, fmtPct, fmtSignedPct, fmtDate, type Severity } from "./alert";
import { Sidebar } from "./Sidebar";

const PAGE_SIZE = 10;

function severityStyles(sev: Severity) {
  switch (sev) {
    case "Warning":
      return { badge: "bg-red-50 text-red-700 border-red-200", row: "bg-red-50/40", icon: AlertOctagon, iconColor: "text-red-600" };
    case "Action Required":
      return { badge: "bg-amber-50 text-amber-700 border-amber-200", row: "bg-amber-50/40", icon: AlertTriangle, iconColor: "text-amber-600" };
    default:
      return { badge: "bg-green-50 text-green-700 border-green-200", row: "", icon: CheckCircle2, iconColor: "text-green-600" };
  }
}

function SH({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-logo-green rounded-t-lg px-4 py-2.5">
      <span className="text-xs font-bold uppercase tracking-wide text-white">{children}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { alerts, loading, generatedAt, summary } = useAlerts();
  const [severityFilter, setSeverityFilter] = useState<"All" | Severity>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (severityFilter !== "All" && a.severity !== severityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !a.client.toLowerCase().includes(q) &&
          !a.strategy.toLowerCase().includes(q) &&
          !a.metric.toLowerCase().includes(q) &&
          !a.qcode.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [alerts, severityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE));

  // Reset to page 1 whenever the filter/search changes the result set,
  // so you don't land on an empty "page 6 of 2" after narrowing a filter.
  useEffect(() => {
    setPage(1);
  }, [severityFilter, search]);

  const paginatedAlerts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAlerts.slice(start, start + PAGE_SIZE);
  }, [filteredAlerts, page]);

  return (
    <div className="flex min-h-screen bg-primary-bg">
      <Sidebar active="p4" />
      <main className="flex-1 overflow-x-auto">
        {/* Page header */}
        <div className="bg-white border-b border-logo-green/10 px-8 py-5">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/cash-margin" className="text-card-text-secondary hover:text-logo-green transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="font-serif text-2xl text-logo-green">Alerts</h1>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-card-text-secondary ml-7">
            {generatedAt && <span>📅 Generated {fmtDate(generatedAt)}</span>}
            <span>Live data — {alerts.length} metric checks across all clients</span>
          </div>
        </div>

        <div className="px-8 py-6 space-y-8">
          {loading ? (
            <p className="text-sm text-card-text-secondary italic text-center py-16">Loading alerts…</p>
          ) : (
            <>
              {/* ── SECTION 1: Summary KPIs ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Open", value: summary.totalOpen, bg: "bg-logo-green", Icon: Bell },
                  { label: "Warning", value: summary.warning, bg: "bg-red-600", Icon: AlertOctagon },
                  { label: "Action Required", value: summary.actionRequired, bg: "bg-amber-600", Icon: AlertTriangle },
                  { label: "Healthy", value: summary.healthy, bg: "bg-green-700", Icon: CheckCircle2 },
                ].map((item) => (
                  <div key={item.label} className={`${item.bg} rounded-xl p-4 text-white overflow-hidden`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{item.label}</span>
                      <item.Icon className="h-4 w-4 text-white/50" />
                    </div>
                    <div className="text-2xl font-bold leading-tight">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* ── SECTION 2: Live Alert Table ── */}
              <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
                <SH>Live Alert Table — Auto-updates from Collateral Inputs + P3 Current State</SH>
                <div className="p-4">
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    {/* <div className="flex items-center gap-1 rounded-lg bg-primary-bg/60 border border-logo-green/10 p-1">
                      {(["All", "Healthy", "Action Required", "Warning"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSeverityFilter(s)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            severityFilter === s ? "bg-white text-logo-green shadow-sm" : "text-card-text-secondary hover:text-card-text"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div> */}
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-card-text-secondary" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search client, qcode, strategy, metric…"
                        className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-logo-green/20 focus:outline-none focus:border-logo-green/40"
                      />
                    </div>
                    <span className="text-xs text-card-text-secondary ml-auto">
                      {filteredAlerts.length} of {alerts.length} alerts
                    </span>
                  </div>

                  {filteredAlerts.length === 0 ? (
                    <p className="text-sm text-card-text-secondary italic text-center py-10">
                      No alerts match the current filter.
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-logo-green/10">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-logo-green text-white">
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Client</th>
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Strategy</th>
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Metric</th>
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Current Value</th>
                              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Severity</th>
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Healthy Threshold</th>
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Warning Threshold</th>
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Upside Threshold</th>
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Δ vs Healthy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedAlerts.map((a, i) => {
                              const s = severityStyles(a.severity);
                              const Icon = s.icon;
                              return (
                                <tr key={`${a.qcode}-${a.metricKey}-${i}`} className={`border-t border-logo-green/5 ${s.row} hover:bg-primary-bg/20 transition-colors`}>
                                  <td className="px-3 py-2 font-medium text-card-text whitespace-nowrap">{a.client}</td>
                                  <td className="px-3 py-2 text-card-text-secondary whitespace-nowrap">
                                    <span className="inline-block rounded-md bg-button-text/15 border border-button-text/40 px-2 py-0.5 text-[10px] font-semibold text-card-text">
                                      {a.strategy}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-card-text whitespace-nowrap">{a.metric}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-card-text whitespace-nowrap">{fmtPct(a.currentValue)}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}>
                                      <Icon className={`h-3 w-3 ${s.iconColor}`} />
                                      {a.severity}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right text-card-text-secondary whitespace-nowrap">{fmtPct(a.healthyThreshold)}</td>
                                  <td className="px-3 py-2 text-right text-card-text-secondary whitespace-nowrap">{fmtPct(a.warningThreshold)}</td>
                                  <td className="px-3 py-2 text-right text-card-text-secondary whitespace-nowrap">{fmtPct(a.upsideThreshold)}</td>
                                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${a.delta >= 0 ? "text-green-700" : "text-red-600"}`}>
                                    {fmtSignedPct(a.delta)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination controls */}
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-card-text-secondary">
                          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredAlerts.length)} of {filteredAlerts.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="inline-flex items-center gap-1 rounded-lg border border-logo-green/20 px-3 py-1.5 text-xs font-medium text-card-text hover:bg-primary-bg/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Previous
                          </button>
                          <span className="text-xs text-card-text-secondary px-2">
                            Page {page} of {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="inline-flex items-center gap-1 rounded-lg border border-logo-green/20 px-3 py-1.5 text-xs font-medium text-card-text hover:bg-primary-bg/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Next
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}