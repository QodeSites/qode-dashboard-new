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
import { Download, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { MultiStrategyInvestmentData } from "@/app/lib/parse-investment-pdf";

type ApiResponse = MultiStrategyInvestmentData & {
  strategyPdfAvailability?: Record<string, boolean>;
};

const formatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmt(n: number): string {
  if (n < 0) return `-${formatter.format(Math.abs(n))}`;
  return formatter.format(n);
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 0];

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

function AmountCell({ value }: { value: number }) {
  return (
    <TableCell className="py-3 text-sm font-medium text-right tabular-nums text-gray-600">
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

function SectionCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; isBold?: boolean }[];
}) {
  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
        {title}
      </CardTitle>
      <CardContent>
        <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
          <Table className="min-w-full">
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className={`py-3 text-sm ${row.isBold ? "font-bold text-card-text" : "text-gray-600"}`}>
                    {row.label}
                  </TableCell>
                  <TableCell className={`py-3 text-sm text-right tabular-nums ${row.isBold ? "font-bold text-card-text" : "font-medium text-gray-600"}`}>
                    {fmt(row.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

type HoldingRow = { name: string; type: string; strategy: string; amount: number };

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
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
        {title}
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
                  { key: "type" as keyof HoldingRow, label: "Type", align: "left" },
                  { key: "strategy" as keyof HoldingRow, label: "Strategy", align: "left" },
                  { key: "amount" as keyof HoldingRow, label: "Amount (₹)", align: "right" },
                ] as { key: keyof HoldingRow; label: string; align: "left" | "right" }[]).map(({ key, label, align }) => (
                  <TableHead
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`py-3 text-${align} text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] cursor-pointer select-none`}
                  >
                    <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
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
                  <TableCell className="py-3 text-sm font-medium text-card-text">{row.name}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">
                    <TypeBadge value={row.type} />
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">
                    <StrategyBadge value={row.strategy} />
                  </TableCell>
                  <AmountCell value={row.amount} />
                </TableRow>
              ))}
            </TableBody>
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

type EquityTxRow = { particulars: string; date: string; strategy: string; amount: number };

function EquityTransactionTable({ rows }: { rows: EquityTxRow[] }) {
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
      const cmp = typeof aVal === "string" && typeof bVal === "string"
        ? aVal.localeCompare(bVal) : (Number(aVal) || 0) - (Number(bVal) || 0);
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

  const cols: { key: keyof EquityTxRow; label: string; align: "left" | "right" }[] = [
    { key: "particulars", label: "Particulars", align: "left" },
    { key: "date", label: "Date", align: "left" },
    { key: "strategy", label: "Strategy", align: "left" },
    { key: "amount", label: "Amount (₹)", align: "right" },
  ];

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
        Equity Transactions
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
                    <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
                      {label}<SortIcon col={key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((tx, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className="py-3 text-sm font-medium text-card-text">{tx.particulars}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 whitespace-nowrap">{tx.date}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">
                    <StrategyBadge value={tx.strategy} />
                  </TableCell>
                  <AmountCell value={tx.amount} />
                </TableRow>
              ))}
            </TableBody>
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

function CashTransactionTable({ rows }: { rows: CashTxRow[] }) {
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
      const cmp = typeof aVal === "string" && typeof bVal === "string"
        ? aVal.localeCompare(bVal) : (Number(aVal) || 0) - (Number(bVal) || 0);
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

  const cols: { key: keyof CashTxRow; label: string; align: "left" | "right" }[] = [
    { key: "date", label: "Date", align: "left" },
    { key: "transactionType", label: "Type", align: "left" },
    { key: "strategy", label: "Strategy", align: "left" },
    { key: "amount", label: "Amount (₹)", align: "right" },
  ];

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
        Cash Transactions
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
                    <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
                      {label}<SortIcon col={key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((tx, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className="py-3 text-sm text-gray-600 whitespace-nowrap">{tx.date}</TableCell>
                  <TableCell className="py-3 text-sm font-medium text-card-text">{tx.transactionType}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">
                    <StrategyBadge value={tx.strategy} />
                  </TableCell>
                  <AmountCell value={tx.amount} />
                </TableRow>
              ))}
            </TableBody>
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

type MfTxRow = { particulars: string; date: string; strategy: string; amount: number };

function MfTransactionTable({ rows }: { rows: MfTxRow[] }) {
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
      const cmp = typeof aVal === "string" && typeof bVal === "string"
        ? aVal.localeCompare(bVal) : (Number(aVal) || 0) - (Number(bVal) || 0);
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

  const cols: { key: keyof MfTxRow; label: string; align: "left" | "right" }[] = [
    { key: "particulars", label: "Particulars", align: "left" },
    { key: "date", label: "Date", align: "left" },
    { key: "strategy", label: "Strategy", align: "left" },
    { key: "amount", label: "Amount (₹)", align: "right" },
  ];

  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
        Mutual Fund Transactions
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
                    <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
                      {label}<SortIcon col={key} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((tx, i) => (
                <TableRow key={i} className="border-b border-gray-200">
                  <TableCell className="py-3 text-sm font-medium text-card-text">{tx.particulars}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 whitespace-nowrap">{tx.date}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">
                    <StrategyBadge value={tx.strategy} />
                  </TableCell>
                  <AmountCell value={tx.amount} />
                </TableRow>
              ))}
            </TableBody>
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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const icode =
    (
      session?.user as
        | {
            icode?: string;
            impersonating?: { icode?: string };
            accessType?: string;
          }
        | undefined
    )?.accessType === "admin"
      ? ((session?.user as { impersonating?: { icode?: string } })
          ?.impersonating?.icode ??
        (session?.user as { icode?: string })?.icode)
      : (session?.user as { icode?: string })?.icode;

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
      };
    }
    return data.perStrategy[selectedStrategy] ?? null;
  }, [data, selectedStrategy]);

  const activeHoldings = useMemo(() => {
    if (!data) return { equity: [], mf: [], histEquity: [], histMf: [] };
    const filter = <T extends { strategy: string }>(arr: T[]) =>
      selectedStrategy === "ALL"
        ? arr
        : arr.filter((r) => r.strategy === selectedStrategy);
    return {
      equity: filter(data.currentEquityHoldings),
      mf: filter(data.currentMfHoldings),
      histEquity: filter(data.historicalEquityHoldings),
      histMf: filter(data.historicalMfHoldings),
    };
  }, [data, selectedStrategy]);

  const activeTransactions = useMemo(() => {
    if (!data) return { equity: [], mf: [], cash: [] };
    const filter = <T extends { strategy: string }>(arr: T[]) =>
      selectedStrategy === "ALL"
        ? arr
        : arr.filter((r) => r.strategy === selectedStrategy);
    return {
      equity: filter(data.equityTransactions),
      mf: filter(data.mfTransactions),
      cash: filter(data.cashTransactions),
    };
  }, [data, selectedStrategy]);

  const activeProfitRedeployment = useMemo(() => {
    if (!data) return [];
    if (selectedStrategy === "ALL") return data.profitRedeployment;
    return data.profitRedeployment.filter(
      (r) => r.isHeader || r.strategy === selectedStrategy,
    );
  }, [data, selectedStrategy]);

  const canDownloadPdf =
    selectedStrategy === "ALL" ||
    !!data?.strategyPdfAvailability?.[selectedStrategy];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStrategy !== "ALL") {
        params.set("strategy", selectedStrategy);
      }
      const url = `/api/download-report${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        alert("Report not available for download.");
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const disposition = res.headers.get("Content-Disposition") || "";
      const nameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = nameMatch?.[1] || "Investment_Summary.pdf";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      alert("Failed to download report.");
    } finally {
      setDownloading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
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
    activeHoldings.mf.length > 0 ||
    activeHoldings.histEquity.length > 0 ||
    activeHoldings.histMf.length > 0;

  const hasEquityTx = activeTransactions.equity.length > 0;
  const hasCashTx = activeTransactions.cash.length > 0;
  const hasMfTx = activeTransactions.mf.length > 0;
  const hasAnyTx = hasEquityTx || hasCashTx || hasMfTx;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-card-text-secondary font-heading">
              {data.clientName}
              {selectedStrategy !== "ALL" && ` — ${selectedStrategy}`}
            </h1>
            <p className="text-gray-600 mt-1">
              Investment Summary &nbsp;·&nbsp; Data as of: {data.dataAsOfDate}
              {data.generatedDate && (
                <span> &nbsp;·&nbsp; Generated: {data.generatedDate}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {isMultiStrategy && (
              <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-[200px] bg-white/50 border-0 card-shadow">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Total Portfolio</SelectItem>
                  {data.strategies.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <div className="flex justify-between">
            <TabsList className="bg-white/60 card-shadow border-0 h-auto p-1 gap-1">
              <TabsTrigger
                value="overview"
                className="text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-logo-green data-[state=active]:text-button-text"
              >
                Overview
              </TabsTrigger>
              {hasAnyHoldings && (
                <TabsTrigger
                  value="holdings"
                  className="text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-logo-green data-[state=active]:text-button-text"
                >
                  Holdings
                </TabsTrigger>
              )}
              {hasAnyTx && (
                <TabsTrigger
                  value="transactions"
                  className="text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-logo-green data-[state=active]:text-button-text"
                >
                  Transactions
                </TabsTrigger>
              )}
            </TabsList>
            <Button
              onClick={handleDownload}
              disabled={downloading || !canDownloadPdf}
              title={!canDownloadPdf ? "No PDF available for this strategy" : undefined}
              className="h-9 px-4 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90"
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SectionCard
                title="Amount Invested"
                rows={[
                  { label: "Holdings", value: activeSummary.amountInvested.holdings },
                  { label: "Cash", value: activeSummary.amountInvested.cash },
                  { label: "Total", value: activeSummary.amountInvested.total, isBold: true },
                ]}
              />
              <SectionCard
                title="Cash Investment Summary"
                rows={[
                  { label: "Total Cash Added", value: activeSummary.cashInvestmentSummary.totalCashAdded },
                  { label: "Profits & Capital Withdrawn", value: activeSummary.cashInvestmentSummary.profitsAndCapitalWithdrawn },
                  { label: "Net Cash Balance", value: activeSummary.cashInvestmentSummary.netCashBalance, isBold: true },
                ]}
              />
              <SectionCard
                title="Holdings Investment Summary"
                rows={[
                  { label: "Total Holdings Added", value: activeSummary.holdingsInvestmentSummary.totalHoldingsAdded },
                  { label: "Total Holdings Withdrawn", value: activeSummary.holdingsInvestmentSummary.totalHoldingsWithdrawn },
                  { label: "Net Holding Balance", value: activeSummary.holdingsInvestmentSummary.netHoldingBalance, isBold: true },
                ]}
              />
            </div>

            {/* Current Account Summary */}
            {activeSummary.currentAccountSummary.length > 0 && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
                  Current Account Summary — Zerodha
                </CardTitle>
                <CardContent>
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                          <TableHead className="py-3 text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Particulars
                          </TableHead>
                          <TableHead className="py-3 text-right text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Amount (₹)
                          </TableHead>
                          <TableHead className="py-3 text-right text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            %
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeSummary.currentAccountSummary.map((row, i) => {
                          const isTotalRow = row.particulars.toLowerCase().includes("account value");
                          return (
                            <TableRow
                              key={i}
                              className="border-b border-gray-200"
                            >
                              <TableCell className={`py-3 text-sm ${isTotalRow ? "font-bold text-card-text" : "text-card-text"}`}>
                                {row.particulars}
                              </TableCell>
                              <TableCell className={`py-3 text-sm text-right tabular-nums ${isTotalRow ? "font-bold text-card-text" : "font-medium text-gray-600"}`}>
                                {fmt(row.amount)}
                              </TableCell>
                              <TableCell className={`py-3 text-sm text-right tabular-nums ${isTotalRow ? "font-bold text-card-text" : "text-gray-600"}`}>
                                {row.percent > 0 ? `${row.percent.toFixed(2)}%` : "—"}
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

            {/* Profit Redeployment Summary */}
            {activeProfitRedeployment.length > 0 && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
                  Profit Redeployment Summary
                </CardTitle>
                <CardContent>
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                          <TableHead className="py-3 text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE]">
                            Strategy
                          </TableHead>
                          <TableHead className="py-3 text-right text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] text-center">
                            Profits (₹)
                          </TableHead>
                          <TableHead className="py-3 text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] text-center">
                            Note
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
                              <TableCell colSpan={1} className="py-3 text-sm font-semibold text-card-text text-center">
                                Note
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={i} className="border-b border-gray-200">
                              <TableCell className="py-3 text-sm text-card-text font-medium">{row.strategy}</TableCell>
                              <PnlAmountCell value={row.profits} />
                              <TableCell className="py-3 text-sm text-gray-600 text-center">{row.note}</TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Holdings Tab */}
          {hasAnyHoldings && (
            <TabsContent value="holdings" className="mt-4 space-y-4">
              <HoldingsTable title="Current Equity Holdings" rows={activeHoldings.equity} nameCol="Stock Name" itemLabel="stock" itemLabelPlural="stocks" />
              <HoldingsTable title="Current Mutual Fund Holdings" rows={activeHoldings.mf} nameCol="Fund Name" itemLabel="mutual fund" itemLabelPlural="mutual funds" />
              <HoldingsTable title="Historical Equity Holdings" rows={activeHoldings.histEquity} nameCol="Stock Name" itemLabel="stock" itemLabelPlural="stocks" />
              <HoldingsTable title="Historical Mutual Fund Holdings" rows={activeHoldings.histMf} nameCol="Fund Name" itemLabel="mutual fund" itemLabelPlural="mutual funds" />
            </TabsContent>
          )}

          {/* Transactions Tab */}
          {hasAnyTx && (
            <TabsContent value="transactions" className="mt-4 space-y-4">
              {hasEquityTx && <EquityTransactionTable rows={activeTransactions.equity} />}
              {hasCashTx && <CashTransactionTable rows={activeTransactions.cash} />}
              {hasMfTx && <MfTransactionTable rows={activeTransactions.mf} />}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
