"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from '../dashboard/layout';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import * as XLSX from "xlsx-js-style";

interface Holding {
    symbol: string;
    exchange: string;
    quantity: number;
    avgPrice: number;
    ltp: number;
    buyValue: number;
    valueAsOfToday: number;
    pnlAmount: number;
    percentPnl: number;
    broker: string;
    debtEquity: string;
    subCategory: string;
    date: Date;
    type?: 'equity' | 'mutual_fund';
    isin?: string;
    strategy?: string;
}

interface HoldingsSummary {
    totalBuyValue: number;
    totalCurrentValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    holdingsCount: number;
    equityHoldings: Holding[];
    debtHoldings: Holding[];
    mutualFundHoldings?: Holding[];
    categoryBreakdown: {
        [category: string]: {
            buyValue: number;
            currentValue: number;
            pnl: number;
            count: number;
        };
    };
    brokerBreakdown: {
        [broker: string]: {
            buyValue: number;
            currentValue: number;
            pnl: number;
            count: number;
        };
    };
}

interface Account {
    qcode: string;
    account_name: string;
    account_type: string;
    broker: string;
}

const formatter = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return 'N/A';

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();

    return `${day}/${month}/${year}`;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 0];

function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
}

const AssetAllocationChart = ({ equityValue, debtValue, hybridValue }: {
    equityValue: number;
    debtValue: number;
    hybridValue: number;
}) => {
    const total = equityValue + debtValue + hybridValue;

    if (total === 0) {
        return (
            <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-2xl font-semibold text-card-text-secondary font-heading">
                    Holdings Distribution
                </CardTitle>
                <CardContent>
                    <div className="text-center py-4 text-gray-500">No allocation data available</div>
                </CardContent>
            </Card>
        );
    }

    const equityPercent = (equityValue / total) * 100;
    const debtPercent = (debtValue / total) * 100;
    const hybridPercent = (hybridValue / total) * 100;

    return (
        <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
            <CardTitle className="text-black p-3 mb-4 rounded-t-sm  text-lg ">
                Holdings Distribution
            </CardTitle>
            <CardContent>
                <div className="space-y-4">
                    <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
                        {equityPercent > 0 && (
                            <div
                                className="bg-logo-green h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${equityPercent}%` }}
                            >
                                {equityPercent > 10 ? `${equityPercent.toFixed(2)}%` : ''}
                            </div>
                        )}
                        {debtPercent > 0 && (
                            <div
                                className="bg-[#DABD38] h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${debtPercent}%` }}
                            >
                                {debtPercent > 10 ? `${debtPercent.toFixed(2)}%` : ''}
                            </div>
                        )}
                        {hybridPercent > 0 && (
                            <div
                                className="bg-[#008455] h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${hybridPercent}%` }}
                            >
                                {hybridPercent > 10 ? `${hybridPercent.toFixed(2)}%` : ''}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-6">
                        {equityValue > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-logo-green rounded"></div>
                                <div className="text-sm">
                                    <span className="font-medium text-card-text">Equity</span>
                                    <div className="text-sm text-gray-600">
                                        {formatter.format(equityValue)}
                                    </div>
                                </div>
                            </div>
                        )}
                        {debtValue > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-[#DABD38] rounded"></div>
                                <div className="text-sm">
                                    <span className="font-medium text-card-text">Debt</span>
                                    <div className="text-sm text-gray-600">
                                        {formatter.format(debtValue)}
                                    </div>
                                </div>
                            </div>
                        )}
                        {hybridValue > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-[#008455] rounded"></div>
                                <div className="text-sm">
                                    <span className="font-medium text-card-text">Hybrid</span>
                                    <div className="text-sm text-gray-600">
                                        {formatter.format(hybridValue)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const HoldingsTable = ({
    title,
    holdings,
    showTotals = true,
    isMutualFund = false,
    showStrategy = false,
}: {
    title: string;
    holdings: Holding[];
    showTotals?: boolean;
    isMutualFund?: boolean;
    showStrategy?: boolean;
}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [sortKey, setSortKey] = useState<keyof Holding | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        setCurrentPage(1);
    }, [holdings]);

    const handleSort = (key: keyof Holding) => {
        if (sortKey === key) {
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else {
                setSortKey(null);
                setSortDirection('asc');
            }
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const sortedHoldings = useMemo(() => {
        if (!sortKey) return holdings;
        return [...holdings].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            let cmp = 0;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                cmp = aVal.localeCompare(bVal);
            } else {
                cmp = (Number(aVal) || 0) - (Number(bVal) || 0);
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [holdings, sortKey, sortDirection]);

    const effectivePageSize = pageSize === 0 ? sortedHoldings.length : pageSize;
    const totalPages = Math.max(1, Math.ceil(sortedHoldings.length / (effectivePageSize || 1)));
    const safePage = Math.min(currentPage, totalPages);

    const paginatedHoldings = useMemo(() => {
        if (pageSize === 0 || sortedHoldings.length === 0) return sortedHoldings;
        const start = (safePage - 1) * effectivePageSize;
        return sortedHoldings.slice(start, start + effectivePageSize);
    }, [sortedHoldings, safePage, effectivePageSize, pageSize]);

    const startEntry = holdings.length === 0 ? 0 : (safePage - 1) * effectivePageSize + 1;
    const endEntry = Math.min(safePage * effectivePageSize, holdings.length);

    const handlePageSizeChange = (value: string) => {
        setPageSize(Number(value));
        setCurrentPage(1);
    };

    if (!holdings || holdings.length === 0) {
        return (
            <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
                    {title}
                </CardTitle>
                <CardContent>
                    <div className="text-center py-8 text-gray-500">No holdings data available</div>
                </CardContent>
            </Card>
        );
    }

    const totals = holdings.reduce((acc, holding) => ({
        investedAmount: acc.investedAmount + holding.buyValue,
        currentValue: acc.currentValue + holding.valueAsOfToday,
        pnl: acc.pnl + holding.pnlAmount,
    }), { investedAmount: 0, currentValue: 0, pnl: 0 });

    return (
        <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
            <CardTitle className="text-black p-3 mb-4 rounded-t-sm text-lg">
                {title}
            </CardTitle>
            <CardContent>
                {/* Top bar: count + page size selector */}
                <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-card-text-secondary">
                        {holdings.length} {isMutualFund ? 'mutual fund' : 'stock'}{holdings.length !== 1 ? 's' : ''} total
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-card-text-secondary">Show</span>
                        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                            <SelectTrigger className="w-[72px] h-8 text-sm bg-transparent text-card-text border border-black/10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                    <SelectItem key={size} value={String(size)} className="text-sm">
                                        {size === 0 ? 'All' : String(size)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-sm text-card-text-secondary">entries</span>
                    </div>
                </div>

                {/* Scrollable table area */}
                <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <Table className="min-w-full">
                        <TableHeader className="sticky top-0 z-10">
                            <TableRow className="bg-[#E9E8DE] hover:bg-[#E9E8DE] border-b border-gray-200">
                                {([
                                    { key: 'symbol' as keyof Holding, label: 'Symbol', align: 'left' },
                                    { key: 'quantity' as keyof Holding, label: 'Quantity', align: 'right' },
                                    { key: 'avgPrice' as keyof Holding, label: 'Average Cost (₹)', align: 'right' },
                                    { key: 'ltp' as keyof Holding, label: 'Last Traded Price (₹)', align: 'right' },
                                    { key: 'buyValue' as keyof Holding, label: 'Invested Amount (₹)', align: 'right' },
                                    { key: 'valueAsOfToday' as keyof Holding, label: 'Current Value (₹)', align: 'right' },
                                    { key: 'pnlAmount' as keyof Holding, label: 'Profit & Loss (₹)', align: 'right' },
                                    { key: 'percentPnl' as keyof Holding, label: 'Profit & Loss (%)', align: 'right' },
                                    { key: 'debtEquity' as keyof Holding, label: 'Category', align: 'left' },
                                    ...(showStrategy ? [{ key: 'strategy' as keyof Holding, label: 'Strategy', align: 'left' as const }] : []),
                                ]).map(({ key, label, align }) => (
                                    <TableHead
                                        key={key}
                                        className={`py-3 text-${align} text-sm font-medium text-card-text tracking-wider bg-[#E9E8DE] cursor-pointer select-none`}
                                        onClick={() => handleSort(key)}
                                    >
                                        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                                            {label}
                                            {sortKey === key ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                                            ) : (
                                                <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
                                            )}
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedHoldings.map((holding, index) => (
                                <TableRow key={`${holding.symbol}-${holding.exchange}-${index}`} className="border-b border-gray-200">
                                    <TableCell className="py-3 text-sm">
                                        <div>
                                            <div className="font-medium text-card-text">{holding.symbol}</div>
                                            <div className="text-gray-500 text-xs">
                                                {isMutualFund ? holding.broker : (holding.exchange && holding.exchange !== 'NaN' ? `${holding.exchange} • ${holding.broker}` : holding.broker)}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-right text-gray-600">
                                        {holding.quantity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-right text-gray-600">
                                        {formatter.format(holding.avgPrice)}
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-right text-gray-600">
                                        {formatter.format(holding.ltp)}
                                    </TableCell>
                                    <TableCell className="py-3 text-sm font-medium text-right text-gray-600">
                                        {formatter.format(holding.buyValue)}
                                    </TableCell>
                                    <TableCell className="py-3 text-sm font-medium text-right text-gray-600">
                                        {formatter.format(holding.valueAsOfToday)}
                                    </TableCell>
                                    <TableCell
                                        className={`py-3 text-sm font-medium text-right ${holding.pnlAmount >= 0 ? "text-green-600" : "text-red-600"}`}
                                    >
                                        {formatter.format(holding.pnlAmount)}
                                    </TableCell>
                                    <TableCell
                                        className={`py-3 text-sm font-medium text-right ${holding.percentPnl >= 0 ? "text-green-600" : "text-red-600"}`}
                                    >
                                        {holding.percentPnl.toFixed(2)}%
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-gray-600">
                                        <div className="flex items-center space-x-1">
                                            <span className={`px-2 py-1 rounded text-xs ${holding.debtEquity.toLowerCase() === 'equity'
                                                ? 'bg-logo-green text-[#DABD38]'
                                                : holding.debtEquity.toLowerCase() === 'debt'
                                                    ? 'bg-[#DABD38] text-logo-green'
                                                    : 'bg-[#008455] text-white'
                                                }`}>
                                                {holding.debtEquity}
                                            </span>
                                        </div>
                                    </TableCell>
                                    {showStrategy && (
                                        <TableCell className="py-3 text-sm text-gray-600">
                                            {holding.strategy ? (
                                                <span className="px-2 py-1 rounded text-xs bg-logo-green/10 text-logo-green font-medium">
                                                    {holding.strategy}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                        {/* Totals row — sticky bottom, always visible, always reflects ALL holdings */}
                        {showTotals && (
                            <tfoot className="sticky bottom-0 z-10 bg-[#f7f5e8]">
                                <TableRow className="border-t border-gray-200 font-semibold">
                                    <TableCell colSpan={4} className="py-3 text-sm font-bold text-card-text">
                                        Total
                                    </TableCell>
                                    <TableCell className="py-3 text-sm font-bold text-right text-card-text">
                                        {formatter.format(totals.investedAmount)}
                                    </TableCell>
                                    <TableCell className="py-3 text-sm font-bold text-right text-card-text">
                                        {formatter.format(totals.currentValue)}
                                    </TableCell>
                                    <TableCell
                                        className={`py-3 text-sm font-bold text-right ${totals.pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                                    >
                                        {formatter.format(totals.pnl)}
                                    </TableCell>
                                    <TableCell
                                        className={`py-3 text-sm font-bold text-right ${totals.pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                                    >
                                        {totals.investedAmount > 0 ? `${(totals.pnl / totals.investedAmount * 100).toFixed(2)}%` : '0.00%'}
                                    </TableCell>
                                    <TableCell></TableCell>
                                    {showStrategy && <TableCell></TableCell>}
                                </TableRow>
                            </tfoot>
                        )}
                    </Table>
                </div>

                {/* Bottom bar: showing info + pagination controls */}
                {holdings.length > 0 && pageSize !== 0 && (
                    <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                        <div className="text-sm text-card-text-secondary">
                            Showing {startEntry} to {endEntry} of {holdings.length} entries
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={safePage <= 1}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-card-text-secondary hover:text-card-text disabled:opacity-40 disabled:cursor-default cursor-pointer rounded-md hover:bg-black/5 transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Prev
                                </button>
                                {getPageNumbers(safePage, totalPages).map((pageNum, idx) => (
                                    pageNum === '...' ? (
                                        <span key={idx} className="w-8 text-center text-card-text-secondary">...</span>
                                    ) : (
                                        <button
                                            key={idx}
                                            onClick={() => setCurrentPage(pageNum as number)}
                                            className={`w-8 h-8 text-sm rounded-md cursor-pointer transition-colors ${
                                                pageNum === safePage
                                                    ? 'bg-logo-green text-white font-medium'
                                                    : 'text-card-text-secondary hover:bg-black/5 hover:text-card-text'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    )
                                ))}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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

                {holdings.length > 0 && pageSize === 0 && (
                    <div className="mt-3 text-sm text-card-text-secondary">
                        Showing all {holdings.length} entries
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const HoldingsSummaryPage = () => {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountCode = searchParams.get("accountCode") || "AC5";

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
    const [holdingsData, setHoldingsData] = useState<HoldingsSummary | null>(null);
    const [lastUpdatedDate, setLastUpdatedDate] = useState<Date | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [availableStrategies, setAvailableStrategies] = useState<string[]>([]);
    const [selectedStrategy, setSelectedStrategy] = useState<string>("ALL");


    const isSarla = session?.user?.icode === "QUS0007";
    const isSatidham = session?.user?.icode === "QUS0010";
    const isArwani = session?.user?.icode === "QUS00085";
    const isAshwin = session?.user?.icode === "QUS00097";
    const isDinesh = session?.user?.icode === "QUS00072";

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
            return;
        }

        if (status !== "authenticated") return;

        if (isArwani) {
            fetchArwaniHoldings();
        } else if (isAshwin) {
            fetchAshwinHoldings();
        } else if (isDinesh) {
            fetchDineshHoldings();
        } else if (isSarla || isSatidham) {
            fetchHoldingsForSpecialAccounts();
        } else {
            fetchAccounts();
        }
    }, [status, router, isSarla, isSatidham, isArwani, isAshwin, isDinesh, accountCode]);

    useEffect(() => {
        if (selectedAccount && !isSarla && !isSatidham && !isArwani && !isAshwin && !isDinesh) {
            fetchHoldingsData();
        }
    }, [selectedAccount, isSarla, isSatidham, isArwani, isAshwin, isDinesh]);

    const fetchAccounts = async () => {
        try {
            const res = await fetch("/api/accounts", { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load accounts");
            }
            const data: Account[] = await res.json();
            setAccounts(data);
            if (data.length > 0) {
                setSelectedAccount(data[0].qcode);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchArwaniHoldings = async () => {
        try {
            const res = await fetch(`/api/arwani-holdings-api`, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load Arwani holdings");
            }
            const data: {
                holdingsSummary: HoldingsSummary;
                availableStrategies: string[];
                dataAsOfDate: string | null;
            } = await res.json();

            setHoldingsData(data.holdingsSummary);
            setAvailableStrategies(data.availableStrategies || []);
            if (data.dataAsOfDate) {
                const d = new Date(data.dataAsOfDate);
                if (!isNaN(d.getTime())) setLastUpdatedDate(d);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAshwinHoldings = async () => {
        try {
            const res = await fetch(`/api/ashwin-holdings-api`, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load Ashwin holdings");
            }
            const data: {
                holdingsSummary: HoldingsSummary;
                availableStrategies: string[];
                dataAsOfDate: string | null;
            } = await res.json();

            setHoldingsData(data.holdingsSummary);
            setAvailableStrategies(data.availableStrategies || []);
            if (data.dataAsOfDate) {
                const d = new Date(data.dataAsOfDate);
                if (!isNaN(d.getTime())) setLastUpdatedDate(d);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDineshHoldings = async () => {
        try {
            const res = await fetch(`/api/dinesh-holdings-api`, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load Dinesh holdings");
            }
            const data: {
                holdingsSummary: HoldingsSummary;
                availableStrategies: string[];
                dataAsOfDate: string | null;
            } = await res.json();

            setHoldingsData(data.holdingsSummary);
            setAvailableStrategies(data.availableStrategies || []);
            if (data.dataAsOfDate) {
                const d = new Date(data.dataAsOfDate);
                if (!isNaN(d.getTime())) setLastUpdatedDate(d);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHoldingsForSpecialAccounts = async () => {
        try {
            const qcode = isSarla ? "QAC00041" : "QAC00046";
            const res = await fetch(`/api/sarla-api?qcode=${qcode}&accountCode=${accountCode}`, {
                credentials: "include"
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load holdings data");
            }

            const data = await res.json();

            if (data && typeof data === 'object') {
                let targetStrategy: string | undefined;

                if (isSarla) {
                    targetStrategy = "Scheme B";
                } else {
                    targetStrategy = Object.keys(data)[0];
                }

                if (targetStrategy && data[targetStrategy]?.data?.holdingsSummary) {
                    const holdingsSummary = data[targetStrategy].data.holdingsSummary;
                    setHoldingsData(holdingsSummary);

                    const allHoldings = [
                        ...(holdingsSummary.equityHoldings || []),
                        ...(holdingsSummary.debtHoldings || []),
                        ...(holdingsSummary.mutualFundHoldings || [])
                    ];

                    if (allHoldings.length > 0 && allHoldings[0]?.date) {
                        setLastUpdatedDate(new Date(allHoldings[0].date));
                    }
                } else {
                    // Fallback: try to find any strategy with holdings data
                    for (const [, strategyData] of Object.entries(data)) {
                        const sd = strategyData as { data?: { holdingsSummary?: HoldingsSummary } };
                        if (sd?.data?.holdingsSummary) {
                            setHoldingsData(sd.data.holdingsSummary);
                            break;
                        }
                    }
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchHoldingsData = async () => {
        if (!selectedAccount) return;

        setIsLoading(true);
        try {
            const selectedAccountData = accounts.find((acc) => acc.qcode === selectedAccount);
            if (!selectedAccountData) {
                throw new Error("Selected account not found");
            }

            const endpoint = selectedAccountData.account_type === "pms"
                ? `/api/pms-data?qcode=${selectedAccount}&viewMode=consolidated&accountCode=${accountCode}`
                : `/api/portfolio?viewMode=consolidated&qcode=${selectedAccount}&accountCode=${accountCode}`;

            const res = await fetch(endpoint, { credentials: "include" });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to load holdings data");
            }

            const response = await res.json();

            let holdings = null;
            if (response.data?.holdings) {
                holdings = response.data.holdings;
            } else if (response.holdings) {
                holdings = response.holdings;
            }

            if (holdings) {
                setHoldingsData(holdings);

                const allHoldings = [
                    ...(holdings.equityHoldings || []),
                    ...(holdings.debtHoldings || []),
                    ...(holdings.mutualFundHoldings || [])
                ];

                if (allHoldings.length > 0) {
                    const validDates = allHoldings
                        .map((h: Holding) => h.date)
                        .filter((date: Date | null) => date != null)
                        .map((date: Date | string) => new Date(date))
                        .filter((date: Date) => !isNaN(date.getTime()));

                    if (validDates.length > 0) {
                        const lastUpdated = new Date(Math.max(...validDates.map((d: Date) => d.getTime())));
                        setLastUpdatedDate(lastUpdated);
                    }
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load holdings data");
        } finally {
            setIsLoading(false);
        }
    };

    const getAssetAllocation = () => {
        if (!holdingsData) return { equity: 0, debt: 0, hybrid: 0 };

        const { stocks, mutualFunds } = separateHoldings();
        let equity = 0;
        let debt = 0;
        let hybrid = 0;

        stocks.forEach(holding => {
            const category = holding.debtEquity?.toLowerCase() || 'equity';
            const val = holding.valueAsOfToday || 0;
            if (category === 'equity') {
                equity += val;
            } else if (category === 'debt') {
                debt += val;
            } else {
                hybrid += val;
            }
        });

        mutualFunds.forEach(holding => {
            const category = holding.debtEquity?.toLowerCase() || 'hybrid';
            const val = holding.valueAsOfToday || 0;
            if (category === 'equity') {
                equity += val;
            } else if (category === 'debt') {
                debt += val;
            } else {
                hybrid += val;
            }
        });

        return { equity, debt, hybrid };
    };

    const separateHoldings = () => {
        if (!holdingsData) return { stocks: [], mutualFunds: [] };

        const seen = new Set<string>();
        const uniqueHoldings: Holding[] = [];

        const all = [
            ...(holdingsData.equityHoldings || []),
            ...(holdingsData.debtHoldings || []),
            ...(holdingsData.mutualFundHoldings || [])
        ].filter(h => selectedStrategy === "ALL" || h.strategy === selectedStrategy);

        all.forEach(holding => {
            const isMutualFund = holding.type === 'mutual_fund';
            const strategyPart = holding.strategy ? `-${holding.strategy}` : '';

            const key = isMutualFund
                ? `${holding.symbol}-${holding.isin || 'no-isin'}-${holding.broker}-${holding.avgPrice.toFixed(4)}${strategyPart}`
                : `${holding.symbol}-${holding.exchange}-${holding.broker}${strategyPart}`;

            if (!seen.has(key)) {
                seen.add(key);
                uniqueHoldings.push(holding);
            }
        });

        const sortAlpha = (a: Holding, b: Holding) => a.symbol.localeCompare(b.symbol);
        return {
            stocks: uniqueHoldings.filter(h => h.type !== 'mutual_fund').sort(sortAlpha),
            mutualFunds: uniqueHoldings.filter(h => h.type === 'mutual_fund').sort(sortAlpha)
        };
    };

    const getFilteredSummary = () => {
        if (!holdingsData) {
            return { totalBuyValue: 0, totalCurrentValue: 0, totalPnl: 0, totalPnlPercent: 0, holdingsCount: 0 };
        }
        if (selectedStrategy === "ALL") {
            return {
                totalBuyValue: holdingsData.totalBuyValue,
                totalCurrentValue: holdingsData.totalCurrentValue,
                totalPnl: holdingsData.totalPnl,
                totalPnlPercent: holdingsData.totalPnlPercent,
                holdingsCount: holdingsData.holdingsCount,
            };
        }
        const { stocks, mutualFunds } = separateHoldings();
        const rows = [...stocks, ...mutualFunds];
        const totalBuyValue = rows.reduce((s, h) => s + h.buyValue, 0);
        const totalCurrentValue = rows.reduce((s, h) => s + h.valueAsOfToday, 0);
        const totalPnl = rows.reduce((s, h) => s + h.pnlAmount, 0);
        return {
            totalBuyValue,
            totalCurrentValue,
            totalPnl,
            totalPnlPercent: totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0,
            holdingsCount: rows.length,
        };
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatCurrency = (value: number | string | null | undefined): string => {
        if (value === null || value === undefined || value === '') return 'N/A';
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) return 'N/A';
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(numValue);
    };

    const formatPercentage = (value: number | string | null | undefined): string => {
        if (value === null || value === undefined) return 'N/A';
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        return (numValue).toFixed(2) + '%';
    };

    const handleDownloadCSV = () => {
        try {
            if (!holdingsData) {
                setError('No holdings data available to export');
                return;
            }

            const csvData: (string | number)[][] = [];
            const clientName = session?.user?.name?.replace(/\s+/g, '_') || 'client';
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `${clientName}_holding_summary_${dateStr}.csv`;

            csvData.push(['Portfolio Holdings Summary', '']);
            csvData.push(['Generated On', formatDate(new Date())]);
            if (lastUpdatedDate) {
                csvData.push(['Data As Of', formatDate(lastUpdatedDate)]);
            }
            csvData.push(['Account Name', session?.user?.name || 'N/A']);

            if (isSarla || isSatidham) {
                csvData.push(['Account Type', 'MANAGED_ACCOUNT']);
            } else if (selectedAccount && accounts.length > 0) {
                const accountData = accounts.find(acc => acc.qcode === selectedAccount);
                csvData.push(['Account Name', accountData?.account_name || 'Unknown']);
                csvData.push(['Account Type', accountData?.account_type?.toUpperCase() || 'Unknown']);
                csvData.push(['Broker', accountData?.broker || 'Unknown']);
            }

            csvData.push(['', '']);

            const summary = getFilteredSummary();
            csvData.push(['Portfolio Statistics', '']);
            if (selectedStrategy !== "ALL") {
                csvData.push(['Strategy Filter', selectedStrategy]);
            }
            csvData.push(['Total Investment Value (₹)', formatCurrency(summary.totalBuyValue)]);
            csvData.push(['Current Portfolio Value (₹)', formatCurrency(summary.totalCurrentValue)]);
            csvData.push(['Total Profit/Loss Amount (₹)', formatCurrency(summary.totalPnl)]);
            csvData.push(['Total Profit/Loss Percentage', formatPercentage(summary.totalPnlPercent)]);
            csvData.push(['Total Holdings Count', summary.holdingsCount || 0]);
            csvData.push(['', '']);

            const assetAllocation = getAssetAllocation();
            const total = assetAllocation.equity + assetAllocation.debt + assetAllocation.hybrid;

            if (total > 0) {
                csvData.push(['Asset Allocation', '']);
                csvData.push(['Asset Type', 'Value (₹)', 'Percentage']);

                if (assetAllocation.equity > 0) {
                    csvData.push(['Equity', formatCurrency(assetAllocation.equity), formatPercentage((assetAllocation.equity / total) * 100)]);
                }
                if (assetAllocation.debt > 0) {
                    csvData.push(['Debt', formatCurrency(assetAllocation.debt), formatPercentage((assetAllocation.debt / total) * 100)]);
                }
                if (assetAllocation.hybrid > 0) {
                    csvData.push(['Hybrid', formatCurrency(assetAllocation.hybrid), formatPercentage((assetAllocation.hybrid / total) * 100)]);
                }
                csvData.push(['', '']);
            }

            if (holdingsData.categoryBreakdown && Object.keys(holdingsData.categoryBreakdown).length > 0) {
                csvData.push(['Category Breakdown', '']);
                csvData.push(['Category', 'Buy Value (₹)', 'Current Value (₹)', 'P&L (₹)', 'Holdings Count']);

                Object.entries(holdingsData.categoryBreakdown).forEach(([category, data]) => {
                    csvData.push([
                        category,
                        formatCurrency(data.buyValue),
                        formatCurrency(data.currentValue),
                        formatCurrency(data.pnl),
                        data.count
                    ]);
                });
                csvData.push(['', '']);
            }

            if (holdingsData.brokerBreakdown && Object.keys(holdingsData.brokerBreakdown).length > 0) {
                csvData.push(['Broker Breakdown', '']);
                csvData.push(['Broker', 'Buy Value (₹)', 'Current Value (₹)', 'P&L (₹)', 'Holdings Count']);

                Object.entries(holdingsData.brokerBreakdown).forEach(([broker, data]) => {
                    csvData.push([
                        broker,
                        formatCurrency(data.buyValue),
                        formatCurrency(data.currentValue),
                        formatCurrency(data.pnl),
                        data.count
                    ]);
                });
                csvData.push(['', '']);
            }

            const { stocks, mutualFunds } = separateHoldings();

            const hasStrategy = availableStrategies.length > 0;

            if (stocks && stocks.length > 0) {
                csvData.push(['Stock Holdings Detail', '']);
                csvData.push([
                    'Symbol', 'Exchange', 'Broker', 'Quantity',
                    'Average Price (₹)', 'Current Price (₹)',
                    'Invested Amount (₹)', 'Current Value (₹)',
                    'Profit & Loss Amount (₹)', 'Profit & Loss (%)', 'Category',
                    ...(hasStrategy ? ['Strategy'] : []),
                ]);

                stocks.forEach(holding => {
                    csvData.push([
                        holding.symbol, holding.exchange || 'N/A', holding.broker || 'N/A',
                        holding.quantity.toLocaleString(),
                        formatCurrency(holding.avgPrice), formatCurrency(holding.ltp),
                        formatCurrency(holding.buyValue), formatCurrency(holding.valueAsOfToday),
                        formatCurrency(holding.pnlAmount), formatPercentage(holding.percentPnl),
                        holding.debtEquity || 'N/A',
                        ...(hasStrategy ? [holding.strategy || 'N/A'] : []),
                    ]);
                });

                const stockTotals = stocks.reduce((acc, holding) => ({
                    investedAmount: acc.investedAmount + holding.buyValue,
                    currentValue: acc.currentValue + holding.valueAsOfToday,
                    pnl: acc.pnl + holding.pnlAmount,
                }), { investedAmount: 0, currentValue: 0, pnl: 0 });

                csvData.push([
                    'TOTAL STOCKS', '', '', '', '', '',
                    formatCurrency(stockTotals.investedAmount),
                    formatCurrency(stockTotals.currentValue),
                    formatCurrency(stockTotals.pnl),
                    formatPercentage(stockTotals.investedAmount > 0 ? (stockTotals.pnl / stockTotals.investedAmount) * 100 : 0),
                    '',
                    ...(hasStrategy ? [''] : []),
                ]);
                csvData.push(['', '']);
            }

            if (mutualFunds && mutualFunds.length > 0) {
                csvData.push(['Mutual Fund Holdings Detail', '']);
                csvData.push([
                    'Fund Name', 'ISIN', 'Broker', 'Units',
                    'Average Cost (₹)', 'Current Price (₹)',
                    'Invested Amount (₹)', 'Current Value (₹)',
                    'P&L Amount (₹)', 'P&L Percentage (%)',
                    'Category', 'Sub Category',
                    ...(hasStrategy ? ['Strategy'] : []),
                ]);

                mutualFunds.forEach(holding => {
                    csvData.push([
                        holding.symbol, holding.isin || 'N/A', holding.broker || 'N/A',
                        holding.quantity.toLocaleString(),
                        formatCurrency(holding.avgPrice), formatCurrency(holding.ltp),
                        formatCurrency(holding.buyValue), formatCurrency(holding.valueAsOfToday),
                        formatCurrency(holding.pnlAmount), formatPercentage(holding.percentPnl),
                        holding.debtEquity || 'N/A', holding.subCategory || 'N/A',
                        ...(hasStrategy ? [holding.strategy || 'N/A'] : []),
                    ]);
                });

                const mfTotals = mutualFunds.reduce((acc, holding) => ({
                    investedAmount: acc.investedAmount + holding.buyValue,
                    currentValue: acc.currentValue + holding.valueAsOfToday,
                    pnl: acc.pnl + holding.pnlAmount,
                }), { investedAmount: 0, currentValue: 0, pnl: 0 });

                csvData.push([
                    'TOTAL MUTUAL FUNDS', '', '', '', '', '',
                    formatCurrency(mfTotals.investedAmount),
                    formatCurrency(mfTotals.currentValue),
                    formatCurrency(mfTotals.pnl),
                    formatPercentage(mfTotals.investedAmount > 0 ? (mfTotals.pnl / mfTotals.investedAmount) * 100 : 0),
                    '', '',
                    ...(hasStrategy ? [''] : []),
                ]);
                csvData.push(['', '']);
            }

            const csvContent = csvData.map(row =>
                row.map(field => {
                    if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
                        return `"${field.replace(/"/g, '""')}"`;
                    }
                    return field;
                }).join(',')
            ).join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');

            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }

        } catch (error) {
            console.error('Error generating CSV:', error);
            setError('Failed to generate CSV file');
        }
    };

    const handleDownloadExcel = () => {
        if (!holdingsData) {
            setError('No holdings data available to download');
            return;
        }

        try {
            const assetAllocation = getAssetAllocation();
            const { stocks, mutualFunds } = separateHoldings();
            const total = assetAllocation.equity + assetAllocation.debt + assetAllocation.hybrid;

            const wsData: (string | number)[][] = [];
            const headerRowIndices: number[] = [];
            const subHeaderRowIndices: number[] = [];

            wsData.push(["", "Qode"]);
            wsData.push([]);

            headerRowIndices.push(wsData.length);
            wsData.push(["", 'Portfolio Holdings Summary']);
            wsData.push(["", 'Generated on:', formatDate(new Date())]);
            if (lastUpdatedDate) {
                wsData.push(["", 'Data as of:', formatDate(lastUpdatedDate)]);
            }
            wsData.push(["", 'Account:', session?.user?.name || 'N/A']);
            wsData.push([]);

            const summary = getFilteredSummary();
            const hasStrategy = availableStrategies.length > 0;
            headerRowIndices.push(wsData.length);
            wsData.push(["", 'Portfolio Statistics']);
            if (selectedStrategy !== "ALL") {
                wsData.push(["", 'Strategy Filter', selectedStrategy]);
            }
            wsData.push(["", 'Total Buy Value (₹)', parseFloat(String(summary.totalBuyValue)) || 0]);
            wsData.push(["", 'Total Current Value (₹)', parseFloat(String(summary.totalCurrentValue)) || 0]);
            wsData.push(["", 'Total P&L (₹)', parseFloat(String(summary.totalPnl)) || 0]);
            wsData.push(["", 'Total P&L (%)', parseFloat(String(summary.totalPnlPercent)) || 0]);
            wsData.push(["", 'Total Holdings Count', parseFloat(String(summary.holdingsCount)) || 0]);
            wsData.push([]);

            headerRowIndices.push(wsData.length);
            wsData.push(["", 'Asset Allocation']);
            subHeaderRowIndices.push(wsData.length);
            wsData.push(["", 'Type', 'Value (₹)', 'Percentage (%)']);
            wsData.push(["", 'Equity', parseFloat(String(assetAllocation.equity)) || 0, total > 0 ? (assetAllocation.equity / total) * 100 : 0]);
            wsData.push(["", 'Debt', parseFloat(String(assetAllocation.debt)) || 0, total > 0 ? (assetAllocation.debt / total) * 100 : 0]);
            wsData.push(["", 'Hybrid', parseFloat(String(assetAllocation.hybrid)) || 0, total > 0 ? (assetAllocation.hybrid / total) * 100 : 0]);
            wsData.push(["", 'Total', total, 100]);
            wsData.push([]);

            headerRowIndices.push(wsData.length);
            wsData.push(["", 'Broker Breakdown']);
            subHeaderRowIndices.push(wsData.length);
            wsData.push(["", 'Broker', 'Buy Value (₹)', 'Current Value (₹)', 'P&L (₹)', 'Holdings Count']);
            Object.entries(holdingsData.brokerBreakdown || {}).forEach(([broker, data]) => {
                wsData.push([
                    "", broker,
                    parseFloat(String(data.buyValue)) || 0,
                    parseFloat(String(data.currentValue)) || 0,
                    parseFloat(String(data.pnl)) || 0,
                    parseFloat(String(data.count)) || 0
                ]);
            });
            wsData.push([]);

            headerRowIndices.push(wsData.length);
            wsData.push(["", 'Stock Holdings Detail']);
            subHeaderRowIndices.push(wsData.length);
            wsData.push([
                "", 'Symbol', 'Exchange', 'Quantity', 'Avg Price (₹)', 'LTP (₹)',
                'Buy Value (₹)', 'Current Value (₹)', 'P&L Amount (₹)', 'P&L (%)', 'Broker', 'Category',
                ...(hasStrategy ? ['Strategy'] : []),
            ]);
            stocks.forEach(holding => {
                wsData.push([
                    "", holding.symbol, holding.exchange,
                    parseFloat(String(holding.quantity)) || 0,
                    parseFloat(String(holding.avgPrice)) || 0,
                    parseFloat(String(holding.ltp)) || 0,
                    parseFloat(String(holding.buyValue)) || 0,
                    parseFloat(String(holding.valueAsOfToday)) || 0,
                    parseFloat(String(holding.pnlAmount)) || 0,
                    parseFloat(String(holding.percentPnl)) || 0,
                    holding.broker, holding.debtEquity,
                    ...(hasStrategy ? [holding.strategy || 'N/A'] : []),
                ]);
            });
            wsData.push([]);

            headerRowIndices.push(wsData.length);
            wsData.push(["", 'Mutual Fund Holdings Detail']);
            subHeaderRowIndices.push(wsData.length);
            wsData.push([
                "", 'Symbol', 'ISIN', 'Quantity', 'Avg Price (₹)', 'LTP (₹)',
                'Buy Value (₹)', 'Current Value (₹)', 'P&L Amount (₹)', 'P&L (%)', 'Broker', 'Category',
                ...(hasStrategy ? ['Strategy'] : []),
            ]);
            mutualFunds.forEach(holding => {
                wsData.push([
                    "", holding.symbol, holding.isin || 'N/A',
                    parseFloat(String(holding.quantity)) || 0,
                    parseFloat(String(holding.avgPrice)) || 0,
                    parseFloat(String(holding.ltp)) || 0,
                    parseFloat(String(holding.buyValue)) || 0,
                    parseFloat(String(holding.valueAsOfToday)) || 0,
                    parseFloat(String(holding.pnlAmount)) || 0,
                    parseFloat(String(holding.percentPnl)) || 0,
                    holding.broker, holding.debtEquity,
                    ...(hasStrategy ? [holding.strategy || 'N/A'] : []),
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

            const maxCols = Math.max(...wsData.map(row => row.length));
            const colWidths: { wch: number }[] = [];

            for (let C = 0; C < maxCols; C++) {
                if (C === 0) {
                    colWidths.push({ wch: 2 });
                    continue;
                }

                let maxWidth = 10;
                for (let R = 0; R < wsData.length; R++) {
                    const cellValue = wsData[R][C];
                    if (cellValue != null) {
                        const cellLength = String(cellValue).length;
                        maxWidth = Math.max(maxWidth, cellLength);
                    }
                }
                colWidths.push({ wch: Math.min(maxWidth + 2, 50) });
            }
            ws['!cols'] = colWidths;

            const tableBorder = {
                top: { style: "thin", color: { rgb: "000000" } },
                bottom: { style: "thin", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } }
            };

            const headerStyle = {
                fill: { patternType: "solid", fgColor: { rgb: "02422B" } },
                font: { name: "Aptos Narrow", color: { rgb: "FFFFFF" }, bold: true, sz: 11 },
                alignment: { horizontal: "center", vertical: "center" },
                border: tableBorder
            };

            const subHeaderStyle = {
                fill: { patternType: "solid", fgColor: { rgb: "DABD38" } },
                font: { name: "Aptos Narrow", color: { rgb: "02422B" }, bold: true, sz: 11 },
                alignment: { horizontal: "center", vertical: "center" },
                border: tableBorder
            };

            const textStyle = {
                font: { name: "Aptos Narrow", sz: 11 },
                alignment: { horizontal: "left", vertical: "center" },
                border: tableBorder
            };

            const numberStyle = {
                font: { name: "Aptos Narrow", sz: 11 },
                alignment: { horizontal: "right", vertical: "center" },
                numFmt: "#,##,##0.00",
                border: tableBorder
            };

            const titleStyle = {
                font: { name: "Playfair Display", bold: true, sz: 32, color: { rgb: "02422B" } },
                alignment: { horizontal: "left", vertical: "center" }
            };

            const isTableRow = (rowIdx: number) => {
                if (rowIdx <= 1) return false;
                const rowData = wsData[rowIdx];
                if (!rowData) return false;
                for (let i = 1; i < rowData.length; i++) {
                    if (rowData[i] !== undefined && rowData[i] !== null && rowData[i] !== '') {
                        return true;
                    }
                }
                return false;
            };

            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[cellAddress]) continue;

                    const cellValue = ws[cellAddress].v;

                    if (cellValue === null || cellValue === undefined || cellValue === '') {
                        continue;
                    }

                    if (R === 0) {
                        ws[cellAddress].s = titleStyle;
                        continue;
                    }

                    if (R >= 1 && R <= 1) {
                        continue;
                    }

                    if (typeof ws[cellAddress].v === 'number') {
                        ws[cellAddress].t = 'n';
                        ws[cellAddress].z = '#,##,##0.00';
                    } else if (typeof ws[cellAddress].v === 'string') {
                        const trimmed = ws[cellAddress].v.trim();
                        const num = parseFloat(trimmed);
                        if (!isNaN(num) && trimmed === String(num)) {
                            ws[cellAddress].v = num;
                            ws[cellAddress].t = 'n';
                            ws[cellAddress].z = '#,##,##0.00';
                        } else {
                            ws[cellAddress].t = 's';
                        }
                    }

                    if (isTableRow(R)) {
                        if (C === 0) {
                            continue;
                        } else if (headerRowIndices.includes(R)) {
                            ws[cellAddress].s = headerStyle;
                        } else if (subHeaderRowIndices.includes(R)) {
                            ws[cellAddress].s = subHeaderStyle;
                        } else {
                            if (C === 1) {
                                ws[cellAddress].s = textStyle;
                            } else if (ws[cellAddress].t === 'n') {
                                ws[cellAddress].s = numberStyle;
                            } else {
                                ws[cellAddress].s = {
                                    ...textStyle,
                                    alignment: { horizontal: "right", vertical: "center" }
                                };
                            }
                        }
                    } else {
                        ws[cellAddress].s = textStyle;
                    }
                }
            }

            const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

            const getTableWidth = (startRow: number) => {
                let maxCol = 1;
                for (let r = startRow; r < Math.min(startRow + 15, wsData.length); r++) {
                    if (wsData[r]) {
                        for (let c = 1; c < wsData[r].length; c++) {
                            if (wsData[r][c] !== undefined && wsData[r][c] !== null && wsData[r][c] !== '') {
                                maxCol = Math.max(maxCol, c);
                            }
                        }
                    }
                    if (wsData[r] && wsData[r].every((cell: string | number, idx: number) => idx === 0 || !cell)) {
                        break;
                    }
                }
                return maxCol;
            };

            headerRowIndices.forEach(rowIdx => {
                const tableWidth = getTableWidth(rowIdx);
                if (tableWidth > 1) {
                    merges.push({
                        s: { r: rowIdx, c: 1 },
                        e: { r: rowIdx, c: tableWidth }
                    });
                }
            });

            if (merges.length > 0) {
                ws['!merges'] = merges;
            }

            (ws as Record<string, unknown>)['!views'] = [{ showGridLines: false }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Holdings Summary");

            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `Holdings_Summary_${session?.user?.name || 'User'}_${timestamp}.xlsx`;

            XLSX.writeFile(wb, filename);

        } catch (error) {
            console.error('Error generating Excel:', error);
            setError('Failed to generate Excel file');
        }
    };

    const handleDownloadPDF = async () => {
        if (!holdingsData) {
            setError('No holdings data available to print');
            return;
        }

        setIsGeneratingPdf(true);
        try {
            const assetAllocation = getAssetAllocation();
            const { stocks, mutualFunds } = separateHoldings();
            const summary = getFilteredSummary();
            const hasStrategy = availableStrategies.length > 0;
            const total = assetAllocation.equity + assetAllocation.debt + assetAllocation.hybrid;

            const fmtNum = (num: number) =>
                num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const commonStyles = `
* { box-sizing: border-box; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }

@page {
  size: A4 landscape;
  margin: 0mm;
  padding: 5mm;
}

html, body {
  background: #EFECD3 !important;
  font-family: 'Plus Jakarta Sans', sans-serif;
  color: #333;
  line-height: 1.5;
  font-size: 12px;
}

.page {
  width: 297mm;
  height: 210mm;
  padding: 5mm;
  margin: 0;
  background-color: #EFECD3;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 180mm;
  max-height: 200mm;
  overflow: hidden;
}

.page:last-child {
  page-break-after: auto;
}

h1, h2, h3 { margin: 0; }

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6mm;
  padding-bottom: 3mm;
  border-bottom: 3px solid #2F5233;
  background: transparent !important;
  flex-shrink: 0;
}

.header-left h1 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 28px;
  font-weight: 700;
  color: #2F5233;
  margin-bottom: 6px;
}
.header-left p {
  font-size: 14px;
  color: #666;
}
.header-right {
  text-align: right;
}
.header-right .date {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.section {
  margin-bottom: 6mm;
  flex: 1;
}

.section.summary {
  margin-bottom: 3mm;
  flex: 0 0 auto;
}

.section.allocation {
  flex: 1;
  min-height: 0;
}

.section-header {
  color: #02422B;
  padding: 12px 0;
  font-family: 'Playfair Display', serif;
  font-size: 16px;
  font-weight: 600;
}
.section-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 18px;
  font-weight: 700;
  color: #2F5233;
  margin-bottom: 6mm;
  border-bottom: 2px solid #ddd;
  padding-bottom: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.stat-card { background: #EFECD3; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #DABD38; }
.stat-card h3 { font-size: 11px; color: #666; margin-bottom: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
.stat-card .value { font-family: 'Inria Serif'; font-size: 18px; font-weight: 500; color: #02422B; }

.summary-item .value.positive { color: #2F5233; }
.summary-item .value.negative { color: #e53e3e; }

.chart-bar {
  display: flex;
  height: 32px;
  border-radius: 16px;
  overflow: hidden;
  margin: 10px 0 12px;
  background: #f2f5f3 !important;
}
.equity-bar, .debt-bar, .hybrid-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
}
.debt-bar{ color : "#02422B"; }
.equity-bar { background: #02422B !important; }
.debt-bar { background: #DABD38 !important; }
.hybrid-bar { background: #008455 !important; }

.legend {
  display: flex;
  gap: 8px;
  flex-direction: column;
}
.legend-item {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  border: 2px solid rgba(47,82,51,.1);
  border-radius: 8px;
  background: #EFECD3 !important;
}
.legend-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}
.legend-color.equity { background: #02422B !important; }
.legend-color.debt   { background: #DABD38 !important; }
.legend-color.hybrid   { background: #008455 !important; }
.legend-text {
  font-size: 13px;
  color: #4a5568;
  font-weight: 600;
}
.legend-value {
  font-size: 13px;
  font-weight: 700;
  color: #2d3748;
}

.table-container {
  flex: 1;
}
table { width: 100%; border-collapse: collapse; font-size: 13px; border-radius: 8px; overflow: hidden; }
th { background-color: #02422B; color: white; padding: 10px 8px; text-align: center; font-weight: 600; font-size: 10px; letter-spacing: 0.5px; }
td { padding: 8px; text-align: center; border-bottom: 1px solid #eee; font-weight: 400; }
thead { display: table-header-group; }
tbody { display: table-row-group; }
tr:nth-child(even) { background-color: rgba(255,255,255,0.3); }
.positive { color: #059669; }
.negative { color: #dc2626; }
.neutral { color: #374151; }
.summary-row { background-color: rgba(243,244,246,0.5); font-weight: 600; }
.footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #666; }
.page-number { font-family: 'Playfair Display', serif; font-size: 12px; color: #02422B; font-weight: 600; }
.right-align { text-align: right; }
.left-align { text-align: left; }
.text-right { text-align: right; }
.text-left { text-align: left; }
.symbol-cell {
  font-weight: 600;
  color: #2F5233;
  font-size: 14px;
}
.exchange-text {
  font-size: 10px;
  color: #718096;
  margin-top: 2px;
}
.text-gray { color: #4B5563; }
.value-col { font-weight: 500; }
.profit { color: #38a169 !important; }
.loss { color: #e53e3e !important; }
.total-row .profit, .total-row .loss { font-weight: 700; }
.category-badge {
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
}
.category-equity {
  background: #2F5233 !important;
  color: #D4AF37 !important;
}
.category-debt   {
  background: #D4AF37 !important;
  color: #2F5233 !important;
}
.category-hybrid   {
  background: #008455 !important;
  color: #FFFFFF !important;
}

@media print {
  html, body { -webkit-print-color-adjust: exact !important; }
}
`;

            const headerHTML = () => `
      <div class="header">
        <div class="header-left">
          <h1>${session?.user?.name || ''}</h1>
          <p>Holdings Summary</p>
        </div>
        <div class="header-right">
          <div class="date">Generated: ${formatDate(new Date())}</div>
          ${lastUpdatedDate ? `<div class="date">Data as of: ${formatDate(lastUpdatedDate)}</div>` : ''}
        </div>
      </div>
    `;

            const executiveSummaryHTML = `
      <div class="section summary">
        ${selectedStrategy !== "ALL" ? `<div style="font-size:12px;color:#666;margin-bottom:6px;">Strategy: <strong>${selectedStrategy}</strong></div>` : ''}
        <div class="summary-grid">
          <div class="summary-item stat-card">
            <div class="label">Total Investment</div>
            <div class="value">₹ ${fmtNum(summary.totalBuyValue)}</div>
          </div>
          <div class="summary-item stat-card">
            <div class="label">Current Value</div>
            <div class="value">₹ ${fmtNum(summary.totalCurrentValue)}</div>
          </div>
          <div class="summary-item stat-card">
            <div class="label">Return (₹)</div>
            <div class="value ${summary.totalPnl >= 0 ? 'positive' : 'negative'}">
              ${summary.totalPnl >= 0 ? '' : '-'}₹ ${fmtNum(Math.abs(summary.totalPnl))}
            </div>
          </div>
          <div class="summary-item stat-card">
            <div class="label">Return (%)</div>
            <div class="value ${summary.totalPnlPercent >= 0 ? 'positive' : 'negative'}">
              ${fmtNum(summary.totalPnlPercent)}%
            </div>
          </div>
        </div>
      </div>
    `;

            const allocationHTML = `
        <div class="section allocation">
            <div class="section-header">Holding Distribution</div>
            ${total > 0
                    ? `
                <div class="chart-bar">
                ${assetAllocation.equity > 0 ? `<div class="equity-bar" style="width:${((assetAllocation.equity / total) * 100).toFixed(2)}%;">Equity&nbsp;&nbsp;${((assetAllocation.equity / total) * 100).toFixed(2)}%</div>` : ''}
                ${assetAllocation.debt > 0 ? `<div class="debt-bar"   style="width:${((assetAllocation.debt / total) * 100).toFixed(2)}%;">Debt&nbsp;&nbsp;${((assetAllocation.debt / total) * 100).toFixed(2)}%</div>` : ''}
                ${assetAllocation.hybrid > 0 ? `<div class="hybrid-bar"   style="width:${((assetAllocation.hybrid / total) * 100).toFixed(2)}%;">Hybrid&nbsp;&nbsp;${((assetAllocation.hybrid / total) * 100).toFixed(2)}%</div>` : ''}
                </div>
                <div class="legend">
                ${assetAllocation.equity > 0 ? `
                    <div class="legend-item">
                    <div class="legend-left">
                        <div class="legend-color equity"></div>
                        <div class="legend-text">Equity Holdings</div>
                    </div>
                    <div class="legend-value">₹${fmtNum(assetAllocation.equity)}</div>
                    </div>` : ''}
                ${assetAllocation.debt > 0 ? `
                    <div class="legend-item">
                    <div class="legend-left">
                        <div class="legend-color debt"></div>
                        <div class="legend-text">Debt Holdings</div>
                    </div>
                    <div class="legend-value">₹${fmtNum(assetAllocation.debt)}</div>
                    </div>` : ''}
                ${assetAllocation.hybrid > 0 ? `
                    <div class="legend-item">
                    <div class="legend-left">
                        <div class="legend-color hybrid"></div>
                        <div class="legend-text">Hybrid Holdings</div>
                    </div>
                    <div class="legend-value">₹${fmtNum(assetAllocation.hybrid)}</div>
                    </div>` : ''}
                </div>
            `
                    : `<div style="text-align:center;padding:20px;color:#666;">No allocation data available</div>`
                }
        </div>
        `;

            const tableHeader = () => `
      <thead>
        <tr>
          <th class="text-left">Symbol</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">Average Cost (₹)</th>
          <th class="text-right">Last Traded Price (₹)</th>
          <th class="text-right">Invested Amount (₹)</th>
          <th class="text-right">Current Value (₹)</th>
          <th class="text-right">Profit & Loss (₹)</th>
          <th class="text-right">Profit & Loss (%)</th>
          <th>Category</th>
          ${hasStrategy ? '<th>Strategy</th>' : ''}
        </tr>
      </thead>
    `;

            const rowsHTML = (arr: Holding[]) => arr.map(h => `
      <tr>
        <td class="text-left">
          <div class="symbol-cell">${h.symbol}</div>
        </td>
        <td class="text-right text-gray">${fmtNum(h.quantity)}</td>
        <td class="text-right text-gray">${fmtNum(h.avgPrice)}</td>
        <td class="text-right text-gray">${fmtNum(h.ltp)}</td>
        <td class="text-right text-gray value-col">${fmtNum(h.buyValue)}</td>
        <td class="text-right text-gray value-col">${fmtNum(h.valueAsOfToday)}</td>
        <td class="text-right value-col ${h.pnlAmount >= 0 ? 'profit' : 'loss'}">${fmtNum(h.pnlAmount)}</td>
        <td class="text-right value-col ${h.percentPnl >= 0 ? 'profit' : 'loss'}">${fmtNum(h.percentPnl)}%</td>
        <td><span class="category-badge ${h.debtEquity.toLowerCase() === 'equity' ? 'category-equity' : h.debtEquity.toLowerCase() === 'hybrid' ? 'category-hybrid' : 'category-debt'}">${h.debtEquity}</span></td>
        ${hasStrategy ? `<td>${h.strategy || '—'}</td>` : ''}
      </tr>
    `).join('');

            const totalsRowHTML = (arr: Holding[]) => {
                if (!arr.length) return '';
                const invested = arr.reduce((s, h) => s + h.buyValue, 0);
                const current = arr.reduce((s, h) => s + h.valueAsOfToday, 0);
                const pnl = arr.reduce((s, h) => s + h.pnlAmount, 0);
                const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
                const pnlCls = pnl >= 0 ? 'profit' : 'loss';
                return `
        <tr class="total-row">
          <td colspan="4"><strong>Total</strong></td>
          <td class="text-right"><strong>${fmtNum(invested)}</strong></td>
          <td class="text-right"><strong>${fmtNum(current)}</strong></td>
          <td class="text-right ${pnlCls}"><strong>${fmtNum(pnl)}</strong></td>
          <td class="text-right ${pnlCls}"><strong>${fmtNum(pnlPct)}%</strong></td>
          <td></td>
          ${hasStrategy ? '<td></td>' : ''}
        </tr>
      `;
            };

            let contentHTML = `
    <div class="page">
      ${headerHTML()}
      ${executiveSummaryHTML}
      ${allocationHTML}
      <div class="footer">
        <div class="page-number">Page 1 | Qode</div>
      </div>
    </div>
    `;

            if (stocks.length) {
                contentHTML += `
    <div class="page" id="stocks-page">
      ${headerHTML()}
      <div class="section-title">Stock Holdings</div>
      <div class="section allow-break">
        <div class="table-container">
          <table id="stocks-table">
            ${tableHeader()}
            <tbody>
              ${rowsHTML(stocks)}
              ${totalsRowHTML(stocks)}
            </tbody>
          </table>
        </div>
      </div>
      <div class="footer">
        <div class="page-number">Page 2 | Qode</div>
      </div>
    </div>
      `;
            }

            if (mutualFunds.length) {
                const pageNum = stocks.length ? 3 : 2;
                contentHTML += `
                <div class="page" id="mf-page">
                ${headerHTML()}
                <div class="section-title">Mutual Fund Holdings</div>
                <div class="section allow-break">
                    <div class="table-container">
                    <table id="mf-table">
                        ${tableHeader()}
                        <tbody>
                        ${rowsHTML(mutualFunds)}
                        ${totalsRowHTML(mutualFunds)}
                        </tbody>
                    </table>
                    </div>
                </div>
                <div class="footer">
                    <div class="page-number">Page ${pageNum} | Qode</div>
                </div>
                </div>
            `;
            }

            const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Portfolio Holdings Report</title>
  <style>
@font-face {
  font-family: 'Plus Jakarta Sans';
  font-style: normal;
  font-weight: 200 800;
  font-display: swap;
  src: url(/fonts/plus-jakarta-sans-latin.woff2) format('woff2');
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url(/fonts/playfair-display-latin.woff2) format('woff2');
}
@font-face {
  font-family: 'Inria Serif';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(/fonts/inria-serif-latin.woff2) format('woff2');
}
${commonStyles}
  </style>
</head>
<body>
  ${contentHTML}

  <script>
    function paginateLongTable(tableId, sectionTitle, basePageNum) {
        var table = document.getElementById(tableId);
        if (!table) return basePageNum;

        var currentPage = table.closest('.page');
        if (!currentPage) return basePageNum;

        var tbody = table.querySelector('tbody');
        if (!tbody) return basePageNum;

        var allRows = Array.from(tbody.querySelectorAll('tr'));
        if (allRows.length <= 6) return basePageNum;

        var totalRow = allRows.find(function(row) { return row.classList.contains('total-row'); });
        var dataRows = allRows.filter(function(row) { return !row.classList.contains('total-row'); });

        var rowsPerPage = 6;
        var pageNum = basePageNum + 1;

        tbody.innerHTML = '';

        for (var i = 0; i < Math.min(rowsPerPage, dataRows.length); i++) {
            tbody.appendChild(dataRows[i].cloneNode(true));
        }

        if (dataRows.length <= rowsPerPage && totalRow) {
            tbody.appendChild(totalRow.cloneNode(true));
        }

        var remainingRows = dataRows.slice(rowsPerPage);

        while (remainingRows.length > 0) {
            var newPageHTML = '<div class="page">'
                + '<div class="header">'
                + '<div class="header-left">'
                + '<h1>' + document.querySelector('.header-left h1').textContent + '</h1>'
                + '<p>Holdings Summary</p>'
                + '</div>'
                + '<div class="header-right">'
                + '<div class="date">'
                + document.querySelector('.header-right .date').textContent
                + '</div>'
                + '</div>'
                + '</div>'
                + '<div class="section-title">' + sectionTitle + '</div>'
                + '<div class="section allow-break">'
                + '<div class="table-container">'
                + '<table>'
                + table.querySelector('thead').outerHTML
                + '<tbody></tbody>'
                + '</table>'
                + '</div>'
                + '</div>'
                + '<div class="footer">'
                + '<div class="page-number">Page ' + pageNum + ' | Qode</div>'
                + '</div>'
                + '</div>';

            var tempDiv = document.createElement('div');
            tempDiv.innerHTML = newPageHTML;
            var newPage = tempDiv.firstElementChild;

            currentPage.parentNode.insertBefore(newPage, currentPage.nextSibling);
            currentPage = newPage;

            var newTbody = newPage.querySelector('tbody');
            var pageRows = remainingRows.slice(0, rowsPerPage);

            pageRows.forEach(function(row) {
                newTbody.appendChild(row.cloneNode(true));
            });

            if (remainingRows.length <= rowsPerPage && totalRow) {
                newTbody.appendChild(totalRow.cloneNode(true));
            }

            remainingRows = remainingRows.slice(rowsPerPage);
            pageNum++;
        }

        return pageNum - 1;
    }

    function runPagination() {
        var lastStockPage = 2;
        if (${stocks.length} > 6) {
            lastStockPage = paginateLongTable('stocks-table', 'Stock Holdings', 2);
        }

        var mfPage = document.getElementById('mf-page');
        if (mfPage) {
            var mfPageNum = lastStockPage + 1;
            var mfFooter = mfPage.querySelector('.footer .page-number');
            if (mfFooter) {
                mfFooter.textContent = 'Page ' + mfPageNum + ' | Qode';
            }
            if (${mutualFunds.length} > 6) {
                paginateLongTable('mf-table', 'Mutual Fund Holdings', mfPageNum);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        runPagination();
    });
  </script>
</body>
</html>
`;

            // Use a hidden iframe instead of a popup window
            const existingFrame = document.getElementById('pdf-print-frame') as HTMLIFrameElement;
            if (existingFrame) existingFrame.remove();

            const iframe = document.createElement('iframe');
            iframe.id = 'pdf-print-frame';
            iframe.style.position = 'fixed';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            iframe.style.left = '-9999px';
            document.body.appendChild(iframe);

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc || !iframe.contentWindow) {
                setError('Failed to create print frame');
                setIsGeneratingPdf(false);
                iframe.remove();
                return;
            }

            const iframeWin = iframe.contentWindow;

            const cleanup = () => {
                iframe.remove();
                setIsGeneratingPdf(false);
            };

            iframeDoc.open();
            iframeDoc.write(fullHTML);
            iframeDoc.close();

            // Fonts are self-hosted @font-face — wait for them to load, then print
            iframeDoc.fonts.ready.then(() => {
                try {
                    iframeWin.print();
                } catch (e) {
                    console.error('Print error:', e);
                }
                cleanup();
            });
        } catch (e) {
            console.error(e);
            setError('Failed to open print preview');
            setIsGeneratingPdf(false);
        }
    };


    if (status === "loading" || isLoading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="text-lg text-card-text">Loading holdings data...</div>
                </div>
            </DashboardLayout>
        );
    }

    if (error || !session?.user) {
        return (
            <DashboardLayout>
                <div className="p-6 text-center bg-red-100 rounded-lg text-red-600">
                    {error || "Failed to load user data"}
                </div>
            </DashboardLayout>
        );
    }

    const assetAllocation = getAssetAllocation();
    const { stocks, mutualFunds } = separateHoldings();

    // When a specific strategy is selected, recompute totals from the filtered rows
    // shown in the tables. When "ALL", fall back to the server's aggregated summary.
    const filteredTotals = (() => {
        if (!holdingsData) return null;
        if (selectedStrategy === "ALL") {
            return {
                totalBuyValue: holdingsData.totalBuyValue,
                totalCurrentValue: holdingsData.totalCurrentValue,
                totalPnl: holdingsData.totalPnl,
                totalPnlPercent: holdingsData.totalPnlPercent,
                holdingsCount: holdingsData.holdingsCount,
            };
        }
        const rows = [...stocks, ...mutualFunds];
        const totalBuyValue = rows.reduce((s, h) => s + h.buyValue, 0);
        const totalCurrentValue = rows.reduce((s, h) => s + h.valueAsOfToday, 0);
        const totalPnl = rows.reduce((s, h) => s + h.pnlAmount, 0);
        return {
            totalBuyValue,
            totalCurrentValue,
            totalPnl,
            totalPnlPercent: totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0,
            holdingsCount: rows.length,
        };
    })();

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold text-card-text-secondary font-heading">Holdings Summary</h1>
                        <p className="text-gray-600 dark:text-gray-400">Overview of your current portfolio holdings</p>
                    </div>


                    <div className="flex flex-col gap-2">
                        <div className="flex gap-3">
                            <Button
                                onClick={handleDownloadPDF}
                                disabled={isGeneratingPdf}
                                className="h-11 px-4 text-sm font-medium"
                                variant="default"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                PDF
                            </Button>
                            <Button
                                onClick={handleDownloadExcel}
                                disabled={isGeneratingPdf}
                                className="h-11 px-4 text-sm font-medium"
                                variant="default"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Excel
                            </Button>
                        </div>
                        {lastUpdatedDate && (
                            <div className="text-right">
                                <div className="text-xs text-card-text-secondary">
                                    Data as of: <strong>{formatDate(lastUpdatedDate)}</strong>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {availableStrategies.length > 0 && (
                    <div className="flex justify-end">
                        <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                            <SelectTrigger className="w-[240px] bg-white/50 border-0 card-shadow">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Total Portfolio</SelectItem>
                                {availableStrategies.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {holdingsData && filteredTotals && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 overflow-visible font-heading">
                        <div className="bg-white/50 backdrop-blur-sm card-shadow border-0 rounded-md overflow-visible">
                            <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-sans font-normal text-card-text">Invested Value</div>
                                </div>
                                <div className="mt-4" />
                                <div className="flex items-baseline justify-between">
                                    <div className="flex items-baseline text-3xl font-[500] text-card-text-secondary font-heading">
                                        ₹ {formatter.format(filteredTotals.totalBuyValue)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/50 backdrop-blur-sm card-shadow border-0 rounded-md overflow-visible">
                            <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-sans font-normal text-card-text">Current Value</div>
                                </div>
                                <div className="mt-4" />
                                <div className="flex items-baseline justify-between">
                                    <div className="flex items-baseline text-3xl font-[500] text-card-text-secondary font-heading">
                                        ₹ {formatter.format(filteredTotals.totalCurrentValue)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/50 backdrop-blur-sm card-shadow border-0 rounded-md overflow-visible">
                            <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-sans font-normal text-card-text">Unrealized Profit & Loss</div>
                                </div>
                                <div className="mt-4" />
                                <div className="flex items-baseline justify-between">
                                    <div className={`flex items-baseline text-3xl font-[500] font-heading ${filteredTotals.totalPnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        ₹ {formatter.format(filteredTotals.totalPnl)}
                                        <span className={`text-base ml-2 ${filteredTotals.totalPnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            ({filteredTotals.totalPnlPercent.toFixed(2)}%)
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <AssetAllocationChart
                    equityValue={assetAllocation.equity}
                    debtValue={assetAllocation.debt}
                    hybridValue={assetAllocation.hybrid}
                />

                <HoldingsTable
                    title="Stock Holdings"
                    holdings={stocks}
                    showTotals={true}
                    isMutualFund={false}
                    showStrategy={availableStrategies.length > 0}
                />

                <HoldingsTable
                    title="Mutual Fund Holdings"
                    holdings={mutualFunds}
                    showTotals={true}
                    isMutualFund={true}
                    showStrategy={availableStrategies.length > 0}
                />
            </div>
        </DashboardLayout>
    );
};

export default HoldingsSummaryPage;
