"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Download, ChevronRight, Layers } from "lucide-react";
import {
  fetchClientMonthlyReturns,
  type ClientReturnsRow,
  type ClientReturnsBreakdownNode,
  type ReturnsMetrics,
  type TrailingReturns,
} from "./api";

const MONTH_ORDER = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT: Record<string, string> = {
  January:"JAN", February:"FEB", March:"MAR", April:"APR", May:"MAY", June:"JUN",
  July:"JUL", August:"AUG", September:"SEP", October:"OCT", November:"NOV", December:"DEC",
};

const TRAILING_COLS: { key: keyof TrailingReturns; label: string }[] = [
  { key: "one_month", label: "1M" },
  { key: "three_month", label: "3M" },
  { key: "six_month", label: "6M" },
  { key: "one_year", label: "1Y" },
  { key: "two_year", label: "2Y" },
  { key: "three_year", label: "3Y" },
  { key: "four_year", label: "4Y" },
  { key: "five_year", label: "5Y" },
  { key: "since_inception", label: "SI" },
];

// ─── Formatters — all null-safe ───────────────────────────────────────────────

// monthly/yearly return_pct is already percent-scale (2.55 = "2.55%")
function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
// since_inception_absolute / xirr / drawdowns / trailing_returns are fraction-scale
function fmtFracPct(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}
function fmtInr(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "+";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
}
function cellClass(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "text-card-text-secondary/30";
  return v >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600";
}
function textClass(v: number | null | undefined) {
  if (v === null || v === undefined || !isFinite(v)) return "text-card-text-secondary/30";
  return v >= 0 ? "text-green-700" : "text-red-600";
}

// ─── Tree scanning helpers ────────────────────────────────────────────────────

type TreeNode = ReturnsMetrics & { strategy_breakdown?: ClientReturnsBreakdownNode[] };

function collectMonths(nodes: TreeNode[], into: Set<string>) {
  nodes.forEach((n) => {
    (n.monthly ?? []).forEach((m) => into.add(m.month));
    collectMonths(n.strategy_breakdown ?? [], into);
  });
}

function collectTrailingKeys(nodes: TreeNode[], into: Set<keyof TrailingReturns>) {
  nodes.forEach((n) => {
    if (n.trailing_returns) {
      TRAILING_COLS.forEach((c) => {
        if (n.trailing_returns![c.key] !== null && n.trailing_returns![c.key] !== undefined) into.add(c.key);
      });
    }
    collectTrailingKeys(n.strategy_breakdown ?? [], into);
  });
}

// ─── Recursive accordion row group ────────────────────────────────────────────

const DEPTH_BG = ["bg-white", "bg-primary-bg/20", "bg-primary-bg/40"];

function NodeRows({
  node, nodeKey, label, depth, months, showInr, trailingKeys, badge, isFirstTopLevel,
}: {
  node: TreeNode;
  nodeKey: string;
  label: string;
  depth: number;
  months: string[];
  showInr: boolean;
  trailingKeys: (keyof TrailingReturns)[];
  badge?: React.ReactNode;
  isFirstTopLevel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const children = node.strategy_breakdown ?? [];
  const hasChildren = children.length > 0;
  const bg = DEPTH_BG[Math.min(depth, DEPTH_BG.length - 1)];

  const { years, monthMap, yearMap } = useMemo(() => {
    const monthMap = new Map<string, { pct: number; inr: number }>();
    const yearMap = new Map<number, { pct: number; inr: number }>();
    const ys = new Set<number>();
    (node.monthly ?? []).forEach((m) => {
      monthMap.set(`${m.year}|${m.month}`, { pct: m.return_pct, inr: m.pnl_inr });
      ys.add(m.year);
    });
    (node.yearly ?? []).forEach((y) => {
      yearMap.set(y.year, { pct: y.return_pct, inr: y.pnl_inr });
      ys.add(y.year);
    });
    return { years: Array.from(ys).sort((a, b) => a - b), monthMap, yearMap };
  }, [node]);

  const tr = node.trailing_returns;

  // Label cell + summary metrics — rendered only on a node's first row
  function labelCell() {
    return (
      <td className={`px-4 py-2 whitespace-nowrap sticky left-0 ${bg}`}>
        <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-card-text-secondary hover:text-logo-green flex-shrink-0"
              title={open ? "Collapse breakdown" : "Show breakdown"}
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          {depth > 0 && <span className="text-card-text-secondary/60 text-xs">↳</span>}
          <span
            className={`truncate block max-w-[170px] ${depth === 0 ? "font-medium text-card-text text-sm" : "text-xs text-card-text-secondary"}`}
            title={label}
          >
            {label}
          </span>
          {badge}
        </div>
      </td>
    );
  }

  function summaryCells(show: boolean) {
    return (
      <>
        <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${show ? textClass(node.since_inception_absolute) : ""}`}>
          {show ? fmtFracPct(node.since_inception_absolute) : ""}
        </td>
        <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${show ? textClass(node.xirr) : ""}`}>
          {show ? fmtFracPct(node.xirr) : ""}
        </td>
        <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${show ? "text-red-600" : ""}`}>
          {show ? fmtFracPct(node.max_drawdown) : ""}
        </td>
        <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${show ? "text-red-600" : ""}`}>
          {show ? fmtFracPct(node.current_drawdown) : ""}
        </td>
        {trailingKeys.map((k) => (
          <td key={k} className={`px-3 py-2 text-right text-xs whitespace-nowrap ${show ? textClass(tr?.[k]) : ""}`}>
            {show ? fmtFracPct(tr?.[k]) : ""}
          </td>
        ))}
      </>
    );
  }

  return (
    <Fragment key={nodeKey}>
      {years.length === 0 ? (
        <tr className={`border-t ${depth === 0 && !isFirstTopLevel ? "border-logo-green/20 border-t-2" : "border-logo-green/5"} ${bg}`}>
          {labelCell()}
          <td className="px-4 py-2 text-card-text-secondary text-xs">—</td>
          <td colSpan={months.length + 1} className="px-3 py-2 text-xs text-card-text-secondary/50 italic">
            No return data
          </td>
          {summaryCells(true)}
        </tr>
      ) : (
        years.map((year, yi) => {
          const total = yearMap.get(year);
          const totalVal = total ? (showInr ? total.inr : total.pct) : null;
          const isFirst = yi === 0;
          return (
            <tr
              key={`${nodeKey}-${year}`}
              className={`border-t ${isFirst && depth === 0 && !isFirstTopLevel ? "border-logo-green/20 border-t-2" : "border-logo-green/5"} ${bg}`}
            >
              {isFirst ? labelCell() : <td className={`px-4 py-2 sticky left-0 ${bg}`} />}
              <td className="px-4 py-2 text-card-text-secondary text-xs">{year}</td>
              {months.map((mName) => {
                const d = monthMap.get(`${year}|${mName}`);
                const v = d ? (showInr ? d.inr : d.pct) : null;
                return (
                  <td key={mName} className={`px-3 py-2 text-right whitespace-nowrap text-xs font-medium ${cellClass(v)}`}>
                    {v === null ? "—" : showInr ? fmtInr(v) : fmtPct(v)}
                  </td>
                );
              })}
              <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap text-xs ${cellClass(totalVal)}`}>
                {totalVal === null ? "—" : showInr ? fmtInr(totalVal) : fmtPct(totalVal)}
              </td>
              {summaryCells(isFirst)}
            </tr>
          );
        })
      )}

      {/* Children — each can itself expand further */}
      {open && children.map((child) => (
        <NodeRows
          key={`${nodeKey}>${child.strategy}`}
          nodeKey={`${nodeKey}>${child.strategy}`}
          node={child}
          label={child.strategy}
          depth={depth + 1}
          months={months}
          showInr={showInr}
          trailingKeys={trailingKeys}
          isFirstTopLevel={false}
        />
      ))}
    </Fragment>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientwiseReturns({ accountType }: { accountType: "managed" | "prop" }) {
  const [data, setData] = useState<ClientReturnsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInr, setShowInr] = useState(false);
  const [showTrailing, setShowTrailing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchClientMonthlyReturns(accountType)
      .then((rows) => setData(rows ?? []))
      .catch((e) => setError(e?.message || "Failed to load client-wise returns."))
      .finally(() => setLoading(false));
  }, [accountType]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/internal/portfolio-review/client-monthly-returns/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_type: accountType }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "client-wise-returns.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // Month columns — scan the whole tree, not just the top level
  const months = useMemo(() => {
    const set = new Set<string>();
    collectMonths(data, set);
    return MONTH_ORDER.filter((m) => set.has(m));
  }, [data]);

  // Only offer trailing-return columns that have at least one real value anywhere
  const trailingKeys = useMemo(() => {
    if (!showTrailing) return [] as (keyof TrailingReturns)[];
    const set = new Set<keyof TrailingReturns>();
    collectTrailingKeys(data, set);
    return TRAILING_COLS.filter((c) => set.has(c.key)).map((c) => c.key);
  }, [data, showTrailing]);

  const sortedClients = useMemo(
    () => [...data].sort((a, b) => (a.account_name ?? "").localeCompare(b.account_name ?? "")),
    [data]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading client-wise returns…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-4">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load client-wise returns.</p>
          <p className="text-red-600/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5 border-l-[3px] border-logo-green pl-3.5 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-logo-green">
            Client-wise Returns
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-5 flex-shrink-0">
          <label className="flex items-center gap-2 text-sm text-card-text cursor-pointer">
            <span className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${!showInr ? "border-red-500" : "border-card-text-secondary/40"}`}>
              {!showInr && <span className="block h-full w-full scale-50 rounded-full bg-red-500" />}
            </span>
            <input type="radio" className="sr-only" checked={!showInr} onChange={() => setShowInr(false)} />
            % Returns
          </label>
          <label className="flex items-center gap-2 text-sm text-card-text cursor-pointer">
            <span className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${showInr ? "border-red-500" : "border-card-text-secondary/40"}`}>
              {showInr && <span className="block h-full w-full scale-50 rounded-full bg-red-500" />}
            </span>
            <input type="radio" className="sr-only" checked={showInr} onChange={() => setShowInr(true)} />
            ₹ Returns
          </label>
          <label className="flex items-center gap-2 text-sm text-card-text cursor-pointer">
            <input
              type="checkbox"
              checked={showTrailing}
              onChange={(e) => setShowTrailing(e.target.checked)}
              className="h-4 w-4 rounded accent-logo-green"
            />
            Trailing returns
          </label>
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
      </div>

      <div className="mb-2">
        <div className="flex items-center gap-3 rounded-t-lg bg-[#e8e4d0]/80 border-l-4 border-logo-green px-5 py-3">
          <span className="text-sm font-semibold text-logo-green">All Clients ({sortedClients.length})</span>
        </div>
        <div className="overflow-x-auto border border-t-0 border-logo-green/10 rounded-b-lg bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-card-text-secondary text-xs border-b border-logo-green/10 bg-white">
                <th className="px-4 py-2.5 text-left font-medium w-52 sticky left-0 bg-white">Client</th>
                <th className="px-4 py-2.5 text-left font-medium w-16">Year</th>
                {months.map((m) => (
                  <th key={m} className="px-3 py-2.5 text-right font-medium">{MONTH_SHORT[m]}</th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Since Inception</th>
                <th className="px-3 py-2.5 text-right font-medium">XIRR</th>
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Max DD</th>
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Current DD</th>
                {trailingKeys.map((k) => (
                  <th key={k} className="px-3 py-2.5 text-right font-medium">
                    {TRAILING_COLS.find((c) => c.key === k)?.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedClients.map((client, i) => (
                <NodeRows
                  key={client.qcode}
                  nodeKey={client.qcode}
                  node={client}
                  label={client.account_name}
                  depth={0}
                  months={months}
                  showInr={showInr}
                  trailingKeys={trailingKeys}
                  isFirstTopLevel={i === 0}
                  badge={
                    client.is_multi_strategy ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 flex-shrink-0"
                        title={`Combines: ${(client.strategy_breakdown ?? []).map((s) => s.strategy).join(", ")}`}
                      >
                        <Layers className="h-2.5 w-2.5" />
                        Multi-Strategy
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ClientwiseReturns;   