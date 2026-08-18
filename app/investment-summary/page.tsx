"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../dashboard/layout";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Loader2 } from "lucide-react";
import type { MultiStrategyInvestmentData } from "@/app/lib/parse-investment-pdf";
import { printInvestmentSummaryReport, type LiveAllocation } from "./print-report";
import { buildLiveAllocation } from "@/app/lib/investment-summary/live-allocation";
import { withProfitRedeploymentOverrides, withSectionTotals } from "./profit-redeployment-overrides";
import { Badge } from "@/components/ui/badge";

function isInactiveStrategy(s: string): boolean {
  return /\(inactive\)/i.test(s);
}

function displayStrategyName(s: string): string {
  return s.replace(/\s*\(inactive\)/i, "").trim();
}

type ApiResponse = MultiStrategyInvestmentData & {
  strategyPdfAvailability?: Record<string, boolean>;
};

// Sarla/Satidham-only: the Zerodha side of the allocation tables comes from
// the parsed xlsx report (holdingsBifurcation); only the PMS account's current
// exposure is fetched live from /api/sarla-api (same endpoint
// app/holding-summary/page.tsx uses), since the report never carries it.
interface SarlaSchemeResponse {
  data?: {
    currentExposure?: string;
    totalProfit?: string;
  };
}

const SARLA_ICODE = "QUS0007";
const SATIDHAM_ICODE = "QUS0010";
const SATIDHAM_NEW_ICODE = "QUS00081";
const ASHOK_ICODE = "QUS00124";

// Equity/MF transaction tables only show QYE+ and QYE++ strategies
const QYE_STRATEGIES = new Set(["QYE+", "QYE++"]);

const DISTRIBUTION_COLORS = [
  "bg-logo-green",
  "bg-[#DABD38]",
  "bg-[#008455]",
  "bg-[#5B7FA6]",
  "bg-[#A05195]",
];

function AccountDistributionChart({
  rows,
}: {
  rows: { label: string; value: number; pct: number }[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
        {rows.map((r, i) =>
          r.pct > 0 ? (
            <div
              key={r.label}
              className={`${DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length]} h-full flex items-center justify-center text-white text-xs font-medium`}
              style={{ width: `${r.pct}%` }}
            >
              {r.pct > 10 ? `${r.pct.toFixed(2)}%` : ""}
            </div>
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-6">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center gap-2">
            <div className={`w-4 h-4 ${DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length]} rounded`} />
            <div className="text-sm">
              <span className="font-medium text-card-text">{r.label}</span>
              <div className="text-sm text-gray-600">{formatter.format(r.value)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const formatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmt(n: number): string {
  if (n < 0) return `-${formatter.format(Math.abs(n))}`;
  return formatter.format(n);
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 0];

function parseDateForSort(dateStr: string): number {
  if (!dateStr) return 0;
  // Try DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
  }
  // Try YYYY-MM-DD (ISO)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(dateStr).getTime();
  // Fallback: let JS parse it
  const ts = Date.parse(dateStr);
  return isNaN(ts) ? 0 : ts;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (currentPage > 3) pages.push("...");
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push("...");
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

function TypeBadge({ value }: { value: string }) {
  if (!value) return <span className="text-gray-400">—</span>;
  const lower = value.toLowerCase();
  const badgeClass =
    lower === "equity"
      ? "bg-logo-green text-[#DABD38]"
      : lower === "debt"
        ? "bg-[#DABD38] text-logo-green"
        : "bg-[#008455] text-white";
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${badgeClass}`}>
      {value}
    </span>
  );
}

function StrategyBadge({ value }: { value: string }) {
  if (!value) return <span className="text-gray-400">—</span>;
  return (
    <span className="px-2 py-1 rounded text-xs bg-logo-green/10 text-logo-green font-medium">
      {value}
    </span>
  );
}

function PercentBadge({ value, bold = false }: { value: number; bold?: boolean }) {
  return (
    <span className={`tabular-nums text-gray-600 ${bold ? "text-sm font-bold text-card-text" : "text-xs"}`}>
      {value.toFixed(2)}%
    </span>
  );
}

function AmountCell({ value }: { value: number }) {
  return (
    <TableCell className="py-3 text-sm font-medium text-center tabular-nums text-gray-600">
      {fmt(value)}
    </TableCell>
  );
}

function PnlAmountCell({ value }: { value: number }) {
  return (
    <TableCell
      className={`py-3 text-sm text-center font-medium tabular-nums ${
        value > 0 ? "text-green-600" : value < 0 ? "text-red-600" : "text-card-text"
      }`}
    >
      {fmt(value)}
    </TableCell>
  );
}

function GroupCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  return (
    <div className="bg-white/50 rounded-md backdrop-blur-sm card-shadow overflow-visible">
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col">
              <div className="text-xs font-normal text-card-text truncate text-center">{item.label}</div>
              <div className="mt-2 text-xl font-[500] text-card-text-secondary font-heading text-center">
                ₹ {fmt(item.value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type HoldingRow = { name: string; type: string; broker?: string; exchange?: string; strategy: string; amount: number };

function HoldingsTable({
  title,
  rows,
  nameCol = "Name",
  itemLabel = "entry",
  itemLabelPlural = "entries",
}: {
  title: string;
  rows: HoldingRow[];
  nameCol?: string;
  itemLabel?: string;
  itemLabelPlural?: string;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<keyof HoldingRow | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => { setCurrentPage(1); }, [rows]);

  const handleSort = (key: keyof HoldingRow) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortKey(null);
        setSortDirection("asc");
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: keyof HoldingRow }) =>
    sortKey === col
      ? sortDirection === "asc"
        ? <ArrowUp className="h-3.5 w-3.5" />
        : <ArrowDown className="h-3.5 w-3.5" />
      : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = typeof aVal === "string" && typeof bVal === "string"
        ? aVal.localeCompare(bVal)
        : (Number(aVal) || 0) - (Number(bVal) || 0);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDirection]);

  const effectiveSize = pageSize === 0 ? sortedRows.length : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / (effectiveSize || 1)));
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    if (pageSize === 0 || sortedRows.length === 0) return sortedRows;
    return sortedRows.slice((safePage - 1) * effectiveSize, safePage * effectiveSize);
  }, [sortedRows, safePage, effectiveSize, pageSize]);

  const startEntry = rows.length === 0 ? 0 : (safePage - 1) * effectiveSize + 1;
  const endEntry = Math.min(safePage * effectiveSize, rows.length);

  if (!rows.length) return null;

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
        <span>{title}</span>
      </CardTitle>
      <CardContent>
        {/* Top bar: count + page size selector */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-card-text-secondary">
            {rows.length} {rows.length !== 1 ? itemLabelPlural : itemLabel} total
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-card-text-secondary">Show</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}
            >
              <SelectTrigger className="w-[72px] h-8 text-sm bg-transparent text-card-text border border-black/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-sm">
                    {s === 0 ? "All" : String(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-card-text-secondary">{itemLabelPlural}</span>
          </div>
        </div>

        {/* Scrollable table area — fixed height for ~5 visible rows */}
        <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
          <Table className="min-w-full">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                {([
                  { key: "name" as keyof HoldingRow, label: nameCol, align: "left" },
                  { key: "type" as keyof HoldingRow, label: "Type", align: "center" },
                  { key: "strategy" as keyof HoldingRow, label: "Strategy", align: "center" },
                  { key: "amount" as keyof HoldingRow, label: "Amount (₹)", align: "center" },
                ] as { key: keyof HoldingRow; label: string; align: "left" | "right" }[]).map(({ key, label, align }) => (
                  <TableHead
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`py-3 text-${align} text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] cursor-pointer select-none`}
                  >
                    <div className={`flex items-center gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
                      {label}
                      <SortIcon col={key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((row, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className="py-3 text-sm text-left">
                    <div className="font-medium text-card-text">{row.name}</div>
                    {(row.broker || row.exchange) && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {row.exchange && row.exchange !== "NaN"
                          ? `${row.exchange} • ${row.broker}`
                          : row.broker}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 text-center">
                    <TypeBadge value={row.type} />
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 text-center">
                    <StrategyBadge value={row.strategy} />
                  </TableCell>
                  <TableCell className="py-3 text-sm font-medium tabular-nums text-gray-600 text-center">{fmt(row.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot className="sticky bottom-0 z-10">
              <TableRow className="bg-[#E9E8DE] border-t-2 border-gray-300">
                <TableCell className="py-3 text-sm font-bold text-card-text text-left">Total</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="py-3 text-sm font-bold tabular-nums text-card-text text-center">
                  {fmt(rows.reduce((sum, r) => sum + r.amount, 0))}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>

        {/* Bottom bar: showing info + pagination controls */}
        {rows.length > 0 && pageSize !== 0 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <div className="text-sm text-card-text-secondary">
              Showing {startEntry} to {endEntry} of {rows.length} {itemLabelPlural}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                {getPageNumbers(safePage, totalPages).map((pageNum, idx) =>
                  pageNum === "..." ? (
                    <span key={idx} className="w-8 text-center text-card-text-secondary">...</span>
                  ) : (
                    <button
                      key={idx}
                      onClick={() => setCurrentPage(pageNum as number)}
                      className={`w-8 h-8 text-sm rounded-md cursor-pointer transition-colors ${
                        pageNum === safePage
                          ? "bg-logo-green text-white font-medium"
                          : "text-card-text-secondary hover:bg-black/5 hover:text-card-text"
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
        {rows.length > 0 && pageSize === 0 && (
          <div className="mt-3 text-sm text-card-text-secondary">
            Showing all {rows.length} {itemLabelPlural}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type EquityTxRow = { name: string; capitalFlow: string; date: string; strategy: string; amount: number };

function EquityTransactionTable({ rows, hideStrategy = false }: { rows: EquityTxRow[]; hideStrategy?: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<keyof EquityTxRow | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => { setCurrentPage(1); }, [rows]);

  const handleSort = (key: keyof EquityTxRow) => {
    if (sortKey === key) {
      if (sortDirection === "asc") { setSortDirection("desc"); }
      else { setSortKey(null); setSortDirection("asc"); }
    } else { setSortKey(key); setSortDirection("asc"); }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: keyof EquityTxRow }) =>
    sortKey === col
      ? sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey];
      let cmp: number;
      if (sortKey === "date" && typeof aVal === "string" && typeof bVal === "string") {
        cmp = parseDateForSort(aVal) - parseDateForSort(bVal);
      } else {
        cmp = typeof aVal === "string" && typeof bVal === "string"
          ? aVal.localeCompare(bVal) : (Number(aVal) || 0) - (Number(bVal) || 0);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDirection]);

  const effectiveSize = pageSize === 0 ? sortedRows.length : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / (effectiveSize || 1)));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    if (pageSize === 0 || sortedRows.length === 0) return sortedRows;
    return sortedRows.slice((safePage - 1) * effectiveSize, safePage * effectiveSize);
  }, [sortedRows, safePage, effectiveSize, pageSize]);
  const startEntry = rows.length === 0 ? 0 : (safePage - 1) * effectiveSize + 1;
  const endEntry = Math.min(safePage * effectiveSize, rows.length);

  const cols: { key: keyof EquityTxRow; label: string; align: "left" | "center" }[] = [
    { key: "name", label: "Name", align: "left" },
    { key: "capitalFlow", label: "Capital Inflow", align: "center" },
    { key: "date", label: "Date", align: "center" },
    ...(hideStrategy ? [] : [{ key: "strategy" as keyof EquityTxRow, label: "Strategy", align: "center" as const }]),
    { key: "amount", label: "Amount (₹)", align: "center" },
  ];

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
        <span>Equity Transactions</span>
      </CardTitle>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-card-text-secondary">
            {rows.length} {rows.length !== 1 ? "transactions" : "transaction"} total
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-card-text-secondary">Show</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[72px] h-8 text-sm bg-transparent text-card-text border border-black/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-sm">{s === 0 ? "All" : String(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-card-text-secondary">transactions</span>
          </div>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
          <Table className="min-w-full">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                {cols.map(({ key, label, align }) => (
                  <TableHead
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`py-3 text-${align} text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] cursor-pointer select-none`}
                  >
                    <div className={`flex items-center gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
                      {label}<SortIcon col={key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((tx, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className="py-3 text-sm font-medium text-card-text text-left">{tx.name}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 text-center">{tx.capitalFlow}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 text-center whitespace-nowrap">{tx.date}</TableCell>
                  {!hideStrategy && (
                    <TableCell className="py-3 text-sm text-gray-600 text-center">
                      <StrategyBadge value={tx.strategy} />
                    </TableCell>
                  )}
                  <TableCell className="py-3 text-sm font-medium tabular-nums text-gray-600 text-center">{fmt(tx.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot className="sticky bottom-0 z-10">
              <TableRow className="bg-[#E9E8DE] border-t-2 border-gray-300">
                <TableCell className="py-3 text-sm font-bold text-card-text text-left">Total</TableCell>
                <TableCell />
                <TableCell />
                {!hideStrategy && <TableCell />}
                <TableCell className="py-3 text-sm font-bold tabular-nums text-card-text text-center">
                  {fmt(rows.reduce((sum, r) => sum + r.amount, 0))}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
        {rows.length > 0 && pageSize !== 0 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <div className="text-sm text-card-text-secondary">Showing {startEntry} to {endEntry} of {rows.length} transactions</div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors"><ChevronLeft className="h-4 w-4" />Prev</button>
                {getPageNumbers(safePage, totalPages).map((p, idx) =>
                  p === "..." ? <span key={idx} className="w-8 text-center text-card-text-secondary">...</span> :
                  <button key={idx} onClick={() => setCurrentPage(p as number)} className={`w-8 h-8 text-sm rounded-md cursor-pointer transition-colors ${p === safePage ? "bg-logo-green text-white font-medium" : "text-card-text-secondary hover:bg-black/5 hover:text-card-text"}`}>{p}</button>
                )}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors">Next<ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
        {rows.length > 0 && pageSize === 0 && <div className="mt-3 text-sm text-card-text-secondary">Showing all {rows.length} transactions</div>}
      </CardContent>
    </Card>
  );
}

type CashTxRow = { date: string; transactionType: string; strategy: string; amount: number };

function CashTransactionTable({ rows, hideStrategy = false }: { rows: CashTxRow[]; hideStrategy?: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<keyof CashTxRow | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => { setCurrentPage(1); }, [rows]);

  const handleSort = (key: keyof CashTxRow) => {
    if (sortKey === key) {
      if (sortDirection === "asc") { setSortDirection("desc"); }
      else { setSortKey(null); setSortDirection("asc"); }
    } else { setSortKey(key); setSortDirection("asc"); }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: keyof CashTxRow }) =>
    sortKey === col
      ? sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey];
      let cmp: number;
      if (sortKey === "transactionType" && typeof aVal === "string" && typeof bVal === "string") {
        cmp = parseDateForSort(aVal) - parseDateForSort(bVal);
      } else {
        cmp = typeof aVal === "string" && typeof bVal === "string"
          ? aVal.localeCompare(bVal) : (Number(aVal) || 0) - (Number(bVal) || 0);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDirection]);

  const effectiveSize = pageSize === 0 ? sortedRows.length : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / (effectiveSize || 1)));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    if (pageSize === 0 || sortedRows.length === 0) return sortedRows;
    return sortedRows.slice((safePage - 1) * effectiveSize, safePage * effectiveSize);
  }, [sortedRows, safePage, effectiveSize, pageSize]);
  const startEntry = rows.length === 0 ? 0 : (safePage - 1) * effectiveSize + 1;
  const endEntry = Math.min(safePage * effectiveSize, rows.length);

  const cols: { key: keyof CashTxRow; label: string; align: "left" | "center" }[] = [
    { key: "date", label: "Type", align: "left" },
    { key: "transactionType", label: "Date", align: "center" },
    ...(hideStrategy ? [] : [{ key: "strategy" as keyof CashTxRow, label: "Strategy", align: "center" as const }]),
    { key: "amount", label: "Amount (₹)", align: "center" },
  ];

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
        <span>Cash Transactions</span>
      </CardTitle>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-card-text-secondary">
            {rows.length} {rows.length !== 1 ? "transactions" : "transaction"} total
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-card-text-secondary">Show</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[72px] h-8 text-sm bg-transparent text-card-text border border-black/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-sm">{s === 0 ? "All" : String(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-card-text-secondary">transactions</span>
          </div>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
          <Table className="min-w-full">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                {cols.map(({ key, label, align }) => (
                  <TableHead
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`py-3 text-${align} text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] cursor-pointer select-none`}
                  >
                    <div className={`flex items-center gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
                      {label}<SortIcon col={key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((tx, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className="py-3 text-sm font-medium text-card-text">{tx.date}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 whitespace-nowrap text-center">{tx.transactionType}</TableCell>
                  {!hideStrategy && (
                    <TableCell className="py-3 text-sm text-gray-600 text-center">
                      <StrategyBadge value={tx.strategy} />
                    </TableCell>
                  )}
                  <AmountCell value={tx.amount} />
                </TableRow>
              ))}
            </TableBody>
            <tfoot className="sticky bottom-0 z-10">
              <TableRow className="bg-[#E9E8DE] border-t-2 border-gray-300">
                <TableCell className="py-3 text-sm font-bold text-card-text text-left">Total</TableCell>
                <TableCell />
                {!hideStrategy && <TableCell />}
                <TableCell className="py-3 text-sm font-bold tabular-nums text-card-text text-center">
                  {fmt(rows.reduce((sum, r) => sum + r.amount, 0))}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
        {rows.length > 0 && pageSize !== 0 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <div className="text-sm text-card-text-secondary">Showing {startEntry} to {endEntry} of {rows.length} transactions</div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors"><ChevronLeft className="h-4 w-4" />Prev</button>
                {getPageNumbers(safePage, totalPages).map((p, idx) =>
                  p === "..." ? <span key={idx} className="w-8 text-center text-card-text-secondary">...</span> :
                  <button key={idx} onClick={() => setCurrentPage(p as number)} className={`w-8 h-8 text-sm rounded-md cursor-pointer transition-colors ${p === safePage ? "bg-logo-green text-white font-medium" : "text-card-text-secondary hover:bg-black/5 hover:text-card-text"}`}>{p}</button>
                )}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors">Next<ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
        {rows.length > 0 && pageSize === 0 && <div className="mt-3 text-sm text-card-text-secondary">Showing all {rows.length} transactions</div>}
      </CardContent>
    </Card>
  );
}

type MfTxRow = { name: string; capitalFlow: string; date: string; strategy: string; amount: number };

function MfTransactionTable({ rows, hideStrategy = false }: { rows: MfTxRow[]; hideStrategy?: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<keyof MfTxRow | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => { setCurrentPage(1); }, [rows]);

  const handleSort = (key: keyof MfTxRow) => {
    if (sortKey === key) {
      if (sortDirection === "asc") { setSortDirection("desc"); }
      else { setSortKey(null); setSortDirection("asc"); }
    } else { setSortKey(key); setSortDirection("asc"); }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: keyof MfTxRow }) =>
    sortKey === col
      ? sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      : <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey];
      let cmp: number;
      if (sortKey === "date" && typeof aVal === "string" && typeof bVal === "string") {
        cmp = parseDateForSort(aVal) - parseDateForSort(bVal);
      } else {
        cmp = typeof aVal === "string" && typeof bVal === "string"
          ? aVal.localeCompare(bVal) : (Number(aVal) || 0) - (Number(bVal) || 0);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDirection]);

  const effectiveSize = pageSize === 0 ? sortedRows.length : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / (effectiveSize || 1)));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    if (pageSize === 0 || sortedRows.length === 0) return sortedRows;
    return sortedRows.slice((safePage - 1) * effectiveSize, safePage * effectiveSize);
  }, [sortedRows, safePage, effectiveSize, pageSize]);
  const startEntry = rows.length === 0 ? 0 : (safePage - 1) * effectiveSize + 1;
  const endEntry = Math.min(safePage * effectiveSize, rows.length);

  const cols: { key: keyof MfTxRow; label: string; align: "left" | "center" }[] = [
    { key: "name", label: "Name", align: "left" },
    { key: "capitalFlow", label: "Capital Inflow", align: "center" },
    { key: "date", label: "Date", align: "center" },
    ...(hideStrategy ? [] : [{ key: "strategy" as keyof MfTxRow, label: "Strategy", align: "center" as const }]),
    { key: "amount", label: "Amount (₹)", align: "center" },
  ];

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
        <span>Mutual Fund Transactions</span>
      </CardTitle>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-card-text-secondary">
            {rows.length} {rows.length !== 1 ? "transactions" : "transaction"} total
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-card-text-secondary">Show</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[72px] h-8 text-sm bg-transparent text-card-text border border-black/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-sm">{s === 0 ? "All" : String(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-card-text-secondary">transactions</span>
          </div>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
          <Table className="min-w-full">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                {cols.map(({ key, label, align }) => (
                  <TableHead
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`py-3 text-${align} text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] cursor-pointer select-none`}
                  >
                    <div className={`flex items-center gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
                      {label}<SortIcon col={key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((tx, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className="py-3 text-sm font-medium text-card-text">{tx.name}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 text-center">{tx.capitalFlow}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 whitespace-nowrap text-center">{tx.date}</TableCell>
                  {!hideStrategy && (
                    <TableCell className="py-3 text-sm text-gray-600 text-center">
                      <StrategyBadge value={tx.strategy} />
                    </TableCell>
                  )}
                  <AmountCell value={tx.amount} />
                </TableRow>
              ))}
            </TableBody>
            <tfoot className="sticky bottom-0 z-10">
              <TableRow className="bg-[#E9E8DE] border-t-2 border-gray-300">
                <TableCell className="py-3 text-sm font-bold text-card-text text-left">Total</TableCell>
                <TableCell />
                <TableCell />
                {!hideStrategy && <TableCell />}
                <TableCell className="py-3 text-sm font-bold tabular-nums text-card-text text-center">
                  {fmt(rows.reduce((sum, r) => sum + r.amount, 0))}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
        {rows.length > 0 && pageSize !== 0 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <div className="text-sm text-card-text-secondary">Showing {startEntry} to {endEntry} of {rows.length} transactions</div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors"><ChevronLeft className="h-4 w-4" />Prev</button>
                {getPageNumbers(safePage, totalPages).map((p, idx) =>
                  p === "..." ? <span key={idx} className="w-8 text-center text-card-text-secondary">...</span> :
                  <button key={idx} onClick={() => setCurrentPage(p as number)} className={`w-8 h-8 text-sm rounded-md cursor-pointer transition-colors ${p === safePage ? "bg-logo-green text-white font-medium" : "text-card-text-secondary hover:bg-black/5 hover:text-card-text"}`}>{p}</button>
                )}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors">Next<ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
        {rows.length > 0 && pageSize === 0 && <div className="mt-3 text-sm text-card-text-secondary">Showing all {rows.length} transactions</div>}
      </CardContent>
    </Card>
  );
}

export default function InvestmentSummaryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<string>("overview");
  // PMS account's live current exposure (₹). null = not applicable / failed.
  const [pmsAum, setPmsAum] = useState<number | null>(null);
  // PMS account's live total profit (₹) — used in Profit Redeployment table.
  const [pmsProfits, setPmsProfits] = useState<number | null>(null);
  // Gates the whole page render so the two PMS tables don't pop in after the
  // rest of the page has already rendered — starts true so we don't flash a
  // "loaded" page before we even know if this account needs the live fetch.
  const [liveAllocationLoading, setLiveAllocationLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const isAdmin =
    (session?.user as { accessType?: string } | undefined)?.accessType === "admin";

  const icode = isAdmin
    ? ((session?.user as { impersonating?: { icode?: string } })
        ?.impersonating?.icode ??
      (session?.user as { icode?: string })?.icode)
    : (session?.user as { icode?: string })?.icode;

  const isSarla = icode === SARLA_ICODE;
  const isSatidham = icode === SATIDHAM_ICODE || icode === SATIDHAM_NEW_ICODE;
  const isAshok = icode === ASHOK_ICODE;

  useEffect(() => {
    if (status !== "authenticated" || (!isSarla && !isSatidham && !isAshok)) {
      setPmsAum(null);
      setPmsProfits(null);
      setLiveAllocationLoading(false);
      return;
    }
    setLiveAllocationLoading(true);

    if (isAshok) {
      fetch("/api/bifurcated-portfolio?qcode=QAC00110", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const json: Record<string, SarlaSchemeResponse> = await res.json();
          const total = ["Scheme PMS QAW", "Scheme PMS QGF", "Scheme PMS QTF"].reduce(
            (sum, s) => sum + (parseFloat(json[s]?.data?.currentExposure || "0") || 0),
            0,
          );
          setPmsAum(total);
        })
        .catch(() => setPmsAum(null))
        .finally(() => setLiveAllocationLoading(false));
      return;
    }

    // Sarla uses the lightweight PMS-only route (one query, no unused
    // per-scheme computation); Satidham stays on the full /api/sarla-api
    // route for now — same response shape either way, only the URL differs.
    const fetchUrl = isSarla
      ? "/api/sarla-api/pms-summary?qcode=QAC00041"
      : "/api/sarla-api?qcode=QAC00046&accountCode=AC8";

    fetch(fetchUrl, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const json: Record<string, SarlaSchemeResponse> = await res.json();
        const scheme = json["Scheme PMS QAW"];
        setPmsAum(parseFloat(scheme?.data?.currentExposure || "0") || 0);
        setPmsProfits(parseFloat(scheme?.data?.totalProfit || "0") || 0);
      })
      .catch(() => { setPmsAum(null); setPmsProfits(null); })
      .finally(() => setLiveAllocationLoading(false));
  }, [status, isSarla, isSatidham, isAshok]);

  // Zerodha side comes from the parsed xlsx report (holdingsBifurcation —
  // same figures the backend Excel pipeline produced); only the PMS exposure
  // is live. Mirrors the tech-team prototype: Zerodha bifurcation is whatever
  // the report already says, PMS is appended as a full-cash row.
  const liveAllocation = useMemo<LiveAllocation | null>(() => {
    if (pmsAum === null || !data) return null;
    return buildLiveAllocation(data, pmsAum);
  }, [pmsAum, data]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setData(null);
    setError(null);
    setSelectedStrategy("ALL");
    fetch("/api/investment-summary", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) {
          setData(null);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load report");
        setLoading(false);
      });
  }, [status, icode]);

  const isMultiStrategy = (data?.strategies?.length ?? 0) > 0;

  const activeSummary = useMemo(() => {
    if (!data) return null;
    if (selectedStrategy === "ALL") {
      return {
        amountInvested: data.amountInvested,
        overviewCashSummary: data.overviewCashSummary,
        cashInvestmentSummary: data.cashInvestmentSummary,
        holdingsInvestmentSummary: data.holdingsInvestmentSummary,
        currentAccountSummary: data.currentAccountSummary,
        holdingsBifurcation: data.holdingsBifurcation,
      };
    }
    return data.perStrategy[selectedStrategy] ?? null;
  }, [data, selectedStrategy]);

  const activeHoldings = useMemo(() => {
    if (!data) return { equity: [], mf: [] };
    const filter = <T extends { strategy: string }>(arr: T[]) =>
      selectedStrategy === "ALL"
        ? arr
        : arr.filter((r) => r.strategy === selectedStrategy);
    return {
      equity: filter(data.currentEquityHoldings),
      mf: filter(data.currentMfHoldings),
    };
  }, [data, selectedStrategy]);

  const activeTransactions = useMemo(() => {
    if (!data) return { equity: [], mf: [], cash: [] };
    // For inactive strategies, transactions are stored under the base name (e.g. "QTF+")
    const strategyMatch = isInactiveStrategy(selectedStrategy)
      ? displayStrategyName(selectedStrategy)
      : selectedStrategy;
    const filter = <T extends { strategy: string }>(arr: T[]) =>
      selectedStrategy === "ALL"
        ? arr
        : arr.filter((r) => r.strategy === strategyMatch);
    const onlyQye = <T extends { strategy: string }>(arr: T[]) =>
      arr.filter((r) => QYE_STRATEGIES.has(r.strategy));
    // const excludeInternalTransfer = (arr: CashTxRow[]) =>
    //   arr.filter((r) => !r.date.toLowerCase().includes("internal transfer"));
    return {
      equity: onlyQye(filter(data.equityTransactions)),
      mf: onlyQye(filter(data.mfTransactions)),
      cash: filter(data.cashTransactions),
    };
  }, [data, selectedStrategy]);

  const activeProfitRedeployment = useMemo(() => {
    if (!data) return [];
    if (selectedStrategy === "ALL") {
      const base = [...data.profitRedeployment];
      if ((isSarla || isSatidham) && pmsProfits !== null && pmsProfits > 0) {
        const pmsRow = { strategy: "Scheme PMS QAW", profits: pmsProfits, note: "PMS" };
        const inactiveIdx = base.findIndex(
          (r) => r.isHeader && r.strategy.toLowerCase().includes("inactive"),
        );
        if (inactiveIdx === -1) base.push(pmsRow);
        else base.splice(inactiveIdx, 0, pmsRow);
      }
      return withSectionTotals(withProfitRedeploymentOverrides(icode, base));
    }
    // Rows are always labeled "Scheme {strategy}" with no "(Inactive)"
    // marker (index.ts's toRow), but selectedStrategy carries that suffix
    // for an inactive dropdown pick (e.g. "QYE++ (Inactive)") — comparing
    // the raw strategy name against the suffixed selection always failed,
    // hiding the table entirely whenever an inactive strategy was selected
    // (same class of bug as the portfolio tab's inactive-strategy handling).
    // displayStrategyName/isInactiveStrategy strip+detect that suffix the
    // same way activeTransactions above already does.
    //
    // Satidham additionally has TWO rows sharing the identical name
    // ("Scheme QYE++" both active and inactive — her strategy was
    // deactivated then reactivated under the same name), so a name-only
    // match would return both regardless of which one was selected; the
    // "Inactive Strategies" header row's position disambiguates which side
    // of that boundary each row falls on.
    const wantsInactive = isInactiveStrategy(selectedStrategy);
    const target = displayStrategyName(selectedStrategy);
    const inactiveHeaderIdx = data.profitRedeployment.findIndex(
      (r) => r.isHeader && r.strategy.toLowerCase().includes("inactive"),
    );
    return data.profitRedeployment.filter((row, idx) => {
      if (row.isHeader || row.isTotal) return false;
      const norm = row.strategy.replace(/^Scheme\s+/i, "");
      if (norm !== target) return false;
      const rowIsInactive = inactiveHeaderIdx !== -1 && idx > inactiveHeaderIdx;
      return rowIsInactive === wantsInactive;
    });
  }, [data, selectedStrategy, icode, isSarla, isSatidham, pmsProfits]);

  const hasAnyTx =
    activeTransactions.equity.length > 0 ||
    activeTransactions.cash.length > 0 ||
    activeTransactions.mf.length > 0;

  useEffect(() => {
    if (activeTab === "transactions" && !hasAnyTx) setActiveTab("overview");
  }, [activeTab, hasAnyTx]);

  // Generated client-side (same "hidden iframe + window.print()" pattern used
  // in app/holding-summary/page.tsx) instead of fetching the backend-rendered
  // PDF, since the backend PDF pipeline (investment-summary-pdf) only reads
  // the finished .xlsx and has no access to the live PMS data this page
  // already fetches. Building the PDF here means the two PMS tables
  // (Current Account Allocation / Current Allocation) are included whenever
  // they're on screen.
  const handleDownloadPDF = () => {
    if (!data || !activeSummary) return;
    setDownloading(true);
    printInvestmentSummaryReport({
      data,
      activeSummary,
      activeHoldings,
      activeTransactions,
      activeProfitRedeployment: isSarla || isSatidham ? activeProfitRedeployment : [],
      liveAllocation,
      selectedStrategy,
      fmt,
    })
      .catch((e) => console.error(e))
      .finally(() => setDownloading(false));
  };

  if (status === "loading" || loading || liveAllocationLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-3 min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-logo-green" />
          <p className="text-card-text-secondary text-sm">
            Loading Investment Summary...
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="bg-red-100 rounded-lg p-4 text-red-600 text-sm">
          {error}
        </div>
      </DashboardLayout>
    );
  }

  if (!data || !activeSummary) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-card-text-secondary font-heading">
              Investment Summary
            </h1>
          </div>
          <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
            <CardContent className="py-12 text-center text-card-text-secondary text-sm">
              No investment summary report is available for your account yet.
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const hasAnyHoldings =
    activeHoldings.equity.length > 0 ||
    activeHoldings.mf.length > 0;

  const hasEquityTx = activeTransactions.equity.length > 0;
  const hasCashTx = activeTransactions.cash.length > 0;
  const hasMfTx = activeTransactions.mf.length > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Header — matches holding-summary layout */}
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-card-text-secondary font-heading">
                Investment Summary
                {selectedStrategy !== "ALL" && (
                  <>
                    {` — Scheme ${displayStrategyName(selectedStrategy)}`}
                    {isInactiveStrategy(selectedStrategy) && (
                      <Badge variant="secondary" className="ml-2 text-xs align-middle">Inactive</Badge>
                    )}
                  </>
                )}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {data.clientName}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-3 justify-end">
                <Button
                  onClick={handleDownloadPDF}
                  disabled={downloading}
                  className="h-11 px-4 text-sm font-medium"
                  variant="default"
                >
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
              {data.dataAsOfDate && (
                <div className="text-right">
                  <div className="text-xs text-card-text-secondary">
                    Data as of: <strong>{data.dataAsOfDate}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabs + strategy selector row */}
          <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
            <TabsList className="bg-white/60 card-shadow border-0 h-auto p-1 gap-1">
              <TabsTrigger
                value="overview"
                className="text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-logo-green data-[state=active]:text-button-text"
              >
                Overview
              </TabsTrigger>
              {hasAnyTx && (
                <TabsTrigger
                  value="transactions"
                  className="text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-logo-green data-[state=active]:text-button-text"
                >
                  Transactions
                </TabsTrigger>
              )}
            </TabsList>
            {isMultiStrategy && (
              <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-[240px] bg-white/50 border-0 card-shadow">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Total Portfolio</SelectItem>
                  {[...data.strategies].sort((a, b) => {
                    if (isInactiveStrategy(a) !== isInactiveStrategy(b)) return isInactiveStrategy(a) ? 1 : -1;
                    return a.localeCompare(b);
                  }).map((s) => (
                    <SelectItem key={s} value={s}>
                      Scheme {displayStrategyName(s)}{isInactiveStrategy(s) ? " (Inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {activeSummary.amountInvested.total === 0 &&
             activeSummary.cashInvestmentSummary.totalCashAdded === 0 &&
             activeSummary.cashInvestmentSummary.profitsAndCapitalWithdrawn === 0 &&
             activeSummary.holdingsInvestmentSummary.totalHoldingsAdded === 0 &&
             activeSummary.holdingsInvestmentSummary.totalHoldingsWithdrawn === 0 ? (
              <div className="flex items-center justify-center min-h-[200px] text-card-text-secondary text-sm">
                No investment summary data available for this account.
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <GroupCard
                title="Amount Invested"
                items={[
                  {
                    label: "Capital In",
                    value: activeSummary.cashInvestmentSummary.totalCashAdded + activeSummary.holdingsInvestmentSummary.totalHoldingsAdded,
                  },
                  {
                    label: "Capital Out",
                    value: activeSummary.cashInvestmentSummary.profitsAndCapitalWithdrawn + activeSummary.holdingsInvestmentSummary.totalHoldingsWithdrawn,
                  },
                ]}
              />
              <GroupCard
                title="Cash"
                items={[
                  { label: "Cash In", value: activeSummary.cashInvestmentSummary.totalCashAdded },
                  { label: "Cash Out", value: activeSummary.cashInvestmentSummary.profitsAndCapitalWithdrawn },
                ]}
              />
              <GroupCard
                title="Holdings"
                items={[
                  { label: "Holding Added", value: activeSummary.holdingsInvestmentSummary.totalHoldingsAdded },
                  { label: "Holding Withdrawn", value: activeSummary.holdingsInvestmentSummary.totalHoldingsWithdrawn },
                ]}
              />
            </div>
            )}

            {/* Holdings Bifurcation */}
            {activeSummary.holdingsBifurcation.some(r => r.amount > 0) && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
                  <span>Current Account Summary</span>
                </CardTitle>
                <CardContent className="space-y-6">
                  {/* Distribution chart */}
                  <AccountDistributionChart
                    rows={activeSummary.holdingsBifurcation
                      .filter((r) => r.amount > 0)
                      .map((r) => ({ label: r.type, value: r.amount, pct: r.percent }))}
                  />
                  {/* Table */}
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                          <TableHead className="py-3 text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Type
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Amount (₹)
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            %
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeSummary.holdingsBifurcation.map((row, i) => {
                          const isTotal = row.type.toLowerCase() === "total";
                          return (
                            <TableRow key={i} className="border-b border-gray-200">
                              <TableCell className={`py-3 text-sm ${isTotal ? "font-bold text-card-text" : "text-card-text"}`}>
                                {row.type}
                              </TableCell>
                              <TableCell className={`py-3 text-sm text-center tabular-nums ${isTotal ? "font-bold text-card-text" : "font-medium text-gray-600"}`}>
                                {fmt(row.amount)}
                              </TableCell>
                              <TableCell className={`py-3 text-sm text-center tabular-nums ${isTotal ? "font-bold text-card-text" : "text-gray-600"}`}>
                                {row.percent > 0 ? `${row.percent.toFixed(2)}%` : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {activeSummary.holdingsBifurcation.length > 0 && (
                          <TableRow className="border-b border-gray-200">
                            <TableCell className="py-3 text-sm font-bold text-card-text">Total</TableCell>
                            <TableCell className="py-3 text-sm text-center tabular-nums font-bold text-card-text">
                              {fmt(activeSummary.holdingsBifurcation.reduce((sum, r) => sum + r.amount, 0))}
                            </TableCell>
                            <TableCell className="py-3 text-sm text-center tabular-nums font-bold text-card-text">
                              {activeSummary.holdingsBifurcation.reduce((sum, r) => sum + r.percent, 0).toFixed(2)}%
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Current Account Allocation — Sarla/Satidham only, live Zerodha vs PMS split */}
            {liveAllocation && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
                  <span>Current Account Allocation</span>
                </CardTitle>
                <CardContent className="space-y-6">
                  <AccountDistributionChart
                    rows={liveAllocation.currentAccountAllocation
                      .filter((r) => !r.isTotal && r.amount > 0)
                      .map((r) => ({ label: r.label, value: r.amount, pct: r.percent }))}
                  />
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                          <TableHead className="py-3 text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Particulars
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Amount (₹)
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            %
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {liveAllocation.currentAccountAllocation.map((row, i) => (
                          <TableRow key={i} className="border-b border-gray-200">
                            <TableCell className={`py-3 text-sm ${row.isTotal ? "font-bold text-card-text" : "text-card-text"}`}>
                              {row.label}
                            </TableCell>
                            <TableCell className={`py-3 text-sm text-center tabular-nums ${row.isTotal ? "font-bold text-card-text" : "font-medium text-gray-600"}`}>
                              {fmt(row.amount)}
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <PercentBadge value={row.percent} bold={row.isTotal} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Current Allocation — Sarla/Satidham only, Hybrid/Debt/Equity/Cash split by Zerodha vs PMS */}
            {liveAllocation && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
                  <span>Current Allocation</span>
                </CardTitle>
                <CardContent>
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                          <TableHead className="py-3 text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Scheme
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Hybrid (₹)
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Debt (₹)
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Equity (₹)
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Cash + Liquidcase (₹)
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Total (₹)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {liveAllocation.currentAllocation.map((row, i) => {
                          const isGrandTotal = row.label === "Grand total";
                          const boldClass = isGrandTotal ? "font-bold text-card-text" : "font-medium text-gray-600";
                          const pctRow = row.total > 0
                            ? [row.hybrid, row.debt, row.equity, row.cash].map((v) => (v / row.total) * 100)
                            : [0, 0, 0, 0];
                          const amounts = [row.hybrid, row.debt, row.equity, row.cash];
                          return (
                            <TableRow key={i} className="border-b border-gray-200">
                              <TableCell className={`py-3 text-sm ${isGrandTotal ? "font-bold text-card-text" : "text-card-text"}`}>
                                {row.label}
                              </TableCell>
                              {amounts.map((amount, j) => (
                                <TableCell key={j} className="py-3 text-center">
                                  <div className={`text-sm tabular-nums ${boldClass}`}>{fmt(amount)}</div>
                                  <div className="mt-1"><PercentBadge value={pctRow[j]} /></div>
                                </TableCell>
                              ))}
                              <TableCell className="py-3 text-center">
                                <div className={`text-sm tabular-nums ${boldClass}`}>{fmt(row.total)}</div>
                                <div className="mt-1"><PercentBadge value={100} bold /></div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Profit Redeployment Summary — Sarla and Satidham only */}
            {(isSarla || isSatidham) && activeProfitRedeployment.length > 0 && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg flex items-center justify-between">
                  <span>Profit Redeployment Summary</span>
                </CardTitle>
                <CardContent>
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                          <TableHead className="py-3 text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Strategy
                          </TableHead>
                          <TableHead className="py-3 text-center text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] text-center">
                            Profits (₹)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeProfitRedeployment.map((row, i) =>
                          row.isHeader ? (
                            <TableRow key={i} className="bg-black/5 border-b border-gray-200">
                              <TableCell colSpan={1} className="py-3 text-sm font-semibold text-card-text">
                                {row.strategy}
                              </TableCell>
                              <TableCell colSpan={1} className="py-3 text-sm font-semibold text-card-text text-center">
                                Profits (₹)
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={i} className={`border-b border-gray-200 ${row.isTotal ? "bg-black/5" : ""}`}>
                              <TableCell className={`py-3 text-sm text-card-text ${row.isTotal ? "font-bold" : "font-medium"}`}>{row.strategy}</TableCell>
                              <PnlAmountCell value={row.profits} />
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
            {isInactiveStrategy(selectedStrategy) && (
              <p className="text-card-text-secondary text-sm">As the scheme is currently inactive, no data is available for the current account summary.</p>
            )}
          </TabsContent>
          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-4 space-y-4">
            {hasCashTx && <CashTransactionTable rows={activeTransactions.cash} hideStrategy={isSarla || isSatidham || isAshok} />}
            {hasEquityTx && <EquityTransactionTable rows={activeTransactions.equity} hideStrategy={isSarla || isSatidham || isAshok} />}
            {hasMfTx && <MfTransactionTable rows={activeTransactions.mf} hideStrategy={isSarla || isSatidham || isAshok} />}
            {isInactiveStrategy(selectedStrategy) && (
              <p className="text-card-text-secondary text-sm">As the scheme is currently inactive, no data is available for the current account summary.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
