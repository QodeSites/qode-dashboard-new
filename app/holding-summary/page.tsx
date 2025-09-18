"use client";

import React, { useEffect, useState } from 'react';
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from '../dashboard/layout';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
    type: 'equity' | 'mutual_fund';
    isin?: string; // For mutual funds
}

interface HoldingsSummary {
    totalBuyValue: number;
    totalCurrentValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    holdingsCount: number;
    equityHoldings: Holding[];
    debtHoldings: Holding[];
    mutualFundHoldings: Holding[];
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
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return 'N/A';

    return dateObj.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const AssetAllocationChart = ({ equityValue, debtValue, hybridValue }: {
    equityValue: number;
    debtValue: number;
    hybridValue: number;
}) => {
    const total = equityValue + debtValue + hybridValue;

    if (total === 0) {
        return (
            <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm  text-lg font-heading-bold">
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
            <CardTitle className="text-black p-3 mb-4 rounded-t-sm  text-lg font-heading-bold">
                Holding Distribution
            </CardTitle>
            <CardContent>
                <div className="space-y-4">
                    <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
                        {equityPercent > 0 && (
                            <div
                                className="bg-logo-green h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${equityPercent}%` }}
                            >
                                {equityPercent > 10 ? `${equityPercent.toFixed(1)}%` : ''}
                            </div>
                        )}
                        {debtPercent > 0 && (
                            <div
                                className="bg-[#DABD38] h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${debtPercent}%` }}
                            >
                                {debtPercent > 10 ? `${debtPercent.toFixed(1)}%` : ''}
                            </div>
                        )}
                        {hybridPercent > 0 && (
                            <div
                                className="bg-[#FCF9EB] h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${hybridPercent}%` }}
                            >
                                {hybridPercent > 10 ? `${hybridPercent.toFixed(1)}%` : ''}
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
                                        {formatter.format(equityValue)} <sub className='font-bold'>({equityPercent.toFixed(1)}%)</sub>
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
                                        {formatter.format(debtValue)} <sub className='font-bold'>({debtPercent.toFixed(1)}%)</sub>
                                    </div>
                                </div>
                            </div>
                        )}
                        {hybridValue > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-[#FCF9EB] rounded"></div>
                                <div className="text-sm">
                                    <span className="font-medium text-card-text">Hybrid</span>
                                    <div className="text-xs text-gray-600">
                                        {formatter.format(hybridValue)} ({hybridPercent.toFixed(1)}%)
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
    isMutualFund = false
}: {
    title: string;
    holdings: Holding[];
    showTotals?: boolean;
    isMutualFund?: boolean;
}) => {
    if (!holdings || holdings.length === 0) {
        return (
            <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardTitle className="text-black p-3 mb-4 rounded-t-sm  text-lg font-heading-bold">
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
            <CardTitle className="text-black p-3 mb-4 rounded-t-sm  text-lg font-heading-bold">
                {title}
            </CardTitle>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table className="min-w-full">
                        <TableHeader>
                            <TableRow className="bg-black/5 hover:bg-gray-200 border-b border-gray-200">
                                <TableHead className="py-3 text-left text-xs font-medium text-card-text tracking-wider">
                                    Symbol
                                </TableHead>
                                <TableHead className="py-3 text-right text-xs font-medium text-card-text tracking-wider">
                                    Quantity
                                </TableHead>
                                <TableHead className="py-3 text-right text-xs font-medium text-card-text tracking-wider">
                                    Average Cost (₹)
                                </TableHead>
                                <TableHead className="py-3 text-right text-xs font-medium text-card-text tracking-wider">
                                    Last Traded Price (₹)
                                </TableHead>
                                <TableHead className="py-3 text-right text-xs font-medium text-card-text tracking-wider">
                                    Invested Amount (₹)
                                </TableHead>
                                <TableHead className="py-3 text-right text-xs font-medium text-card-text tracking-wider">
                                    Current Value (₹)
                                </TableHead>
                                <TableHead className="py-3 text-right text-xs font-medium text-card-text tracking-wider">
                                    Profit & Loss (₹)
                                </TableHead>
                                <TableHead className="py-3 text-right text-xs font-medium text-card-text tracking-wider">
                                    Profit & Loss (%)
                                </TableHead>
                                <TableHead className="py-3 text-left text-xs font-medium text-card-text tracking-wider">
                                    Category
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {holdings.map((holding, index) => (
                                <TableRow key={`${holding.symbol}-${holding.exchange}-${index}`} className="border-b border-gray-200">
                                    <TableCell className="py-3 text-sm">
                                        <div>
                                            <div className="font-medium text-card-text">{holding.symbol}</div>
                                            <div className="text-gray-500 text-xs">
                                                {isMutualFund ? holding.broker : `${holding.exchange} • ${holding.broker}`}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-right text-gray-600">
                                        {holding.quantity.toLocaleString()}
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
                                        {formatter.format(holding.percentPnl)}%
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-gray-600">
                                        <div className="flex items-center space-x-1">
                                            <span className={`px-2 py-1 rounded text-xs ${holding.debtEquity.toLowerCase() === 'equity'
                                                ? 'bg-logo-green text-[#DABD38]'
                                                : 'bg-[#DABD38] text-logo-green'
                                                }`}>
                                                {holding.debtEquity}
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {showTotals && (
                                <TableRow className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
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
                                    <TableCell></TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
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


    const isSarla = session?.user?.icode === "QUS0007";
    const isSatidham = session?.user?.icode === "QUS0010";

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
            return;
        }

        if (status === "authenticated" && !isSarla && !isSatidham) {
            fetchAccounts();
        } else if (isSarla || isSatidham) {
            fetchHoldingsForSpecialAccounts();
        }
    }, [status, router, isSarla, isSatidham, accountCode]);

    useEffect(() => {
        if (selectedAccount && !isSarla && !isSatidham) {
            fetchHoldingsData();
        }
    }, [selectedAccount, isSarla, isSatidham]);

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
            console.log('Full API response:', data);
 
            if (data && typeof data === 'object') {
                let targetStrategy;
 
                if (isSarla) {
                    // For Sarla, specifically look for "Scheme B"
                    targetStrategy = "Scheme B";
                } else {
                    // For Satidham, use the first available strategy or specify the target strategy
                    targetStrategy = Object.keys(data)[0];
                }
 
                console.log('Target strategy:', targetStrategy);
 
                if (targetStrategy && data[targetStrategy]?.data?.holdingsSummary) {
                    const holdingsSummary = data[targetStrategy].data.holdingsSummary;
                    console.log('Holdings summary found:', holdingsSummary);
                    setHoldingsData(holdingsSummary);
 
                    // Get the latest date from holdings
                    const allHoldings = [
                        ...(holdingsSummary.equityHoldings || []),
                        ...(holdingsSummary.debtHoldings || []),
                        ...(holdingsSummary.mutualFundHoldings || [])
                    ];
 
                    if (allHoldings.length > 0 && allHoldings[0]?.date) {
                        setLastUpdatedDate(new Date(allHoldings[0].date));
                    }
                } else {
                    console.warn(`No holdings data found for strategy: ${targetStrategy}`);
                    console.log('Available strategies:', Object.keys(data));
 
                    // Fallback: try to find any strategy with holdings data
                    for (const [strategyName, strategyData] of Object.entries(data)) {
                        if (strategyData?.data?.holdingsSummary) {
                            console.log(`Found holdings in strategy: ${strategyName}`);
                            setHoldingsData(strategyData.data.holdingsSummary);
                            break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching holdings:', err);
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

                const allHoldings = [...(holdings.equityHoldings || []), ...(holdings.debtHoldings || [])];
                if (allHoldings.length > 0 && allHoldings[0]?.date) {
                    const lastUpdated = new Date(allHoldings[0].date);
                    setLastUpdatedDate(lastUpdated);
                    console.log("Holdings last updated on:", lastUpdated);
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

        const allHoldings = [...holdingsData.equityHoldings, ...holdingsData.debtHoldings];

        return allHoldings.reduce((acc, holding) => {
            const category = holding.debtEquity.toLowerCase();
            if (category === 'equity') {
                acc.equity += holding.valueAsOfToday;
            } else if (category === 'debt') {
                acc.debt += holding.valueAsOfToday;
            } else {
                acc.hybrid += holding.valueAsOfToday;
            }
            return acc;
        }, { equity: 0, debt: 0, hybrid: 0 });
    };

    const separateHoldings = () => {
        if (!holdingsData) return { stocks: [], mutualFunds: [] };

        // Create a Map to deduplicate holdings by symbol+exchange
        const uniqueHoldings = new Map();

        // Add equity holdings
        holdingsData.equityHoldings?.forEach(holding => {
            const key = `${holding.symbol}-${holding.exchange}`;
            uniqueHoldings.set(key, holding);
        });

        // Add debt holdings (will overwrite if same key exists)
        holdingsData.debtHoldings?.forEach(holding => {
            const key = `${holding.symbol}-${holding.exchange}`;
            uniqueHoldings.set(key, holding);
        });

        // Add mutual fund holdings
        holdingsData.mutualFundHoldings?.forEach(holding => {
            const key = `${holding.symbol}-${holding.isin || holding.exchange}`;
            uniqueHoldings.set(key, holding);
        });

        // Convert back to array
        const allUniqueHoldings = Array.from(uniqueHoldings.values());

        // Separate stocks and mutual funds
        const stocks = allUniqueHoldings.filter(holding =>
            holding.exchange && (holding.exchange.includes('NSE') || holding.exchange.includes('BSE'))
        );

        const mutualFunds = allUniqueHoldings.filter(holding =>
            !holding.exchange || (!holding.exchange.includes('NSE') && !holding.exchange.includes('BSE'))
        );

        return { stocks, mutualFunds };
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Dynamic Pagination PDF Download Function (updated)
    const handleDownloadPDF = async () => {
        if (!holdingsData) {
            setError('No holdings data available to print');
            return;
        }

        setIsGeneratingPdf(true);
        try {
            const assetAllocation = getAssetAllocation();
            const { stocks, mutualFunds } = separateHoldings();
            const total = assetAllocation.equity + assetAllocation.debt + assetAllocation.hybrid;

            const formatNumber = (num: number) =>
                num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // ⚙️ Print CSS: tables flow across pages, footer fixed at bottom on every page
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
  font-family: 'Lato', sans-serif;
  color: #333;
  line-height: 1.5;
  font-size: 12px;
  counter-reset: page;
}

/* reserve space so footer doesn't overlap flowing content */
body { padding-bottom: 18mm; }

h1, h2, h3 { margin: 0; }

.header {
  display:flex; justify-content:space-between; align-items:flex-start;
  margin-bottom:10mm; padding-bottom:4mm; border-bottom:3px solid #2F5233;
  background: transparent !important;
}
.header-left h1 { font-family:'Playfair Display', Georgia, serif; font-size:28px; font-weight:700; color:#2F5233; margin-bottom:6px; }
.header-left p { font-size:14px; color:#666; }
.header-right { text-align:right; }
.header-right .date { font-size:12px; color:#666; margin-bottom:8px; }

.section { margin-bottom:10mm; }
.section-header { color:#02422B; padding:12px 0; font-family:'Playfair Display', serif; font-size:16px; font-weight:600; }
.section-title { font-family:'Playfair Display', Georgia, serif; font-size:18px; font-weight:700; color:#2F5233; margin-bottom:6mm; border-bottom:2px solid #ddd; padding-bottom:4px; }

.summary-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
.summary-item { background:#EFECD3; border-radius:8px; padding:20px; border-left:4px solid #DABD38; }
.summary-item .label { font-size:10px; color:#666; font-weight:600; letter-spacing:0.5px; margin-bottom:6px; text-transform:uppercase; }
.summary-item .value { font-size:18px; font-weight:700; color:#2F5233; }
.summary-item .value.positive { color:#2F5233; }
.summary-item .value.negative { color:#e53e3e; }

.chart-bar { display:flex; height:32px; border-radius:16px; overflow:hidden; margin:10px 0 12px; background:#f2f5f3 !important; }
.equity-bar, .debt-bar { display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:12px; }
.equity-bar { background:#02422B !important; }
.debt-bar { background:#DABD38 !important; }

.legend { display:flex; gap:8px; flex-direction:column; }
.legend-item { display:flex; justify-content:space-between; padding:10px; border:2px solid rgba(47,82,51,.1); border-radius:8px; background:#EFECD3 !important; }
.legend-left { display:flex; align-items:center; gap:8px; }
.legend-color { width:14px; height:14px; border-radius:4px; }
.legend-color.equity { background:#02422B !important; }
.legend-color.debt   { background:#DABD38 !important; }
.legend-text { font-size:13px; color:#4a5568; font-weight:600; }
.legend-value { font-size:13px; font-weight:700; color:#2d3748; }

/* ✅ Let tables flow across pages; avoid breaking inside a row */
.table-container { page-break-inside: auto; }
table { width:100%; border-collapse:collapse; font-size:12px; page-break-inside:auto; }
thead { background:rgba(47,82,51,.1) !important; display: table-header-group; }
tfoot { display: table-row-group; }
tr { page-break-inside: avoid; page-break-after: auto; }
th { text-align:left; padding:10px 6px; font-weight:700; color:#2F5233; text-transform:uppercase; font-size:10px; letter-spacing:.4px; border-bottom:2px solid #2F5233; }
td { padding:9px 6px; border-bottom:1px solid #eee; color:#2d3748; vertical-align:top; }
.text-right { text-align:right; }
.symbol-cell { font-weight:700; color:#2F5233; font-size:13px; }
.exchange-text { font-size:10px; color:#718096; margin-top:2px; }
.profit { color:#38a169 !important; font-weight:700; }
.loss { color:#e53e3e !important; font-weight:700; }
.category-badge { padding:3px 7px; border-radius:4px; font-size:9px; font-weight:700; text-transform:uppercase; }
.category-equity { background:#2F5233 !important; color:#D4AF37 !important; }
.category-debt   { background:#D4AF37 !important; color:#2F5233 !important; }
.total-row { background:rgba(47,82,51,.1) !important; font-weight:700; border-top:3px solid #2F5233; }
.total-row td { padding:12px 6px; font-weight:700; color:#2F5233; font-size:13px; }

/* 📌 Footer repeated on every printed page */
.footer-fixed {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 14mm;
  display:flex; justify-content:space-between; align-items:center;
  padding: 4mm 6mm 0 6mm;
  border-top:1px solid #ddd;
  font-size:10px; color:#666;
  background: #EFECD3 !important;
}
.footer-fixed .page-number::after { content: counter(page); font-family: 'Playfair Display', serif; font-weight:600; color:#02422B; }

.break { page-break-before: always; }
@media print { html, body { -webkit-print-color-adjust: exact !important; } }
`;

            const headerHTML = () => `
      <div class="header">
        <div class="header-left">
          <h1>${session?.user?.name || ''}</h1>
          <p>Holdings Summary</p>
        </div>
        <div class="header-right">
          <div class="date">
            Generated: ${new Date().toLocaleDateString('en-IN')}${lastUpdatedDate ? ` | Data as of: ${formatDate(lastUpdatedDate)}` : ''}
          </div>
        </div>
      </div>
    `;

            const executiveSummaryHTML = `
      <div class="section">
        <div class="summary-grid">
          <div class="summary-item">
            <div class="label">Total Investment</div>
            <div class="value">₹${formatNumber(holdingsData.totalBuyValue)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Current Value</div>
            <div class="value">₹${formatNumber(holdingsData.totalCurrentValue)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Return (%)</div>
            <div class="value ${holdingsData.totalPnlPercent >= 0 ? 'positive' : 'negative'}">
              ${formatNumber(holdingsData.totalPnlPercent)}%
            </div>
          </div>
          <div class="summary-item">
            <div class="label">Return (₹)</div>
            <div class="value ${holdingsData.totalPnl >= 0 ? 'positive' : 'negative'}">
              ${holdingsData.totalPnl >= 0 ? '' : '-'} ₹${formatNumber(Math.abs(holdingsData.totalPnl))}
            </div>
          </div>
        </div>
      </div>
    `;

            const allocationHTML = `
      <div class="section">
        <div class="section-header">Holding Distribution</div>
        ${total > 0
                    ? `
            <div class="chart-bar">
              ${assetAllocation.equity > 0 ? `<div class="equity-bar" style="width:${((assetAllocation.equity / total) * 100).toFixed(1)}%;">Equity ${((assetAllocation.equity / total) * 100).toFixed(1)}%</div>` : ''}
              ${assetAllocation.debt > 0 ? `<div class="debt-bar"   style="width:${((assetAllocation.debt / total) * 100).toFixed(1)}%;">Debt ${((assetAllocation.debt / total) * 100).toFixed(1)}%</div>` : ''}
            </div>
            <div class="legend">
              ${assetAllocation.equity > 0 ? `
                <div class="legend-item">
                  <div class="legend-left">
                    <div class="legend-color equity"></div>
                    <div class="legend-text">Equity Holdings</div>
                  </div>
                  <div class="legend-value">₹${formatNumber(assetAllocation.equity)}</div>
                </div>` : ''}
              ${assetAllocation.debt > 0 ? `
                <div class="legend-item">
                  <div class="legend-left">
                    <div class="legend-color debt"></div>
                    <div class="legend-text">Debt Holdings</div>
                  </div>
                  <div class="legend-value">₹${formatNumber(assetAllocation.debt)}</div>
                </div>` : ''}
            </div>
          `
                    : `<div style="text-align:center;padding:20px;color:#666;">No allocation data available</div>`
                }
      </div>
    `;

            const tableHeader = (isMF: boolean) => `
      <thead>
        <tr>
          <th>${isMF ? 'Fund Name & ISIN' : 'Symbol & Exchange'}</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">${isMF ? 'Avg NAV' : 'Avg Cost (₹)'}</th>
          <th class="text-right">${isMF ? 'Current NAV' : 'Current Price (₹)'}</th>
          <th class="text-right">Invested Amount (₹)</th>
          <th class="text-right">Current Value (₹)</th>
          <th class="text-right">Profit & Loss Amount (₹)</th>
          <th class="text-right">Profit & Loss %</th>
          <th>Category</th>
        </tr>
      </thead>
    `;

            const rowsHTML = (arr: Holding[], isMF: boolean) => arr.map(h => `
      <tr>
        <td>
          <div class="symbol-cell">${h.symbol}</div>
          <div class="exchange-text">${isMF ? (h.isin || '') : (h.exchange || '')}</div>
        </td>
        <td class="text-right">${h.quantity.toLocaleString()}</td>
        <td class="text-right">${formatNumber(h.avgPrice)}</td>
        <td class="text-right">${formatNumber(h.ltp)}</td>
        <td class="text-right">${formatNumber(h.buyValue)}</td>
        <td class="text-right">${formatNumber(h.valueAsOfToday)}</td>
        <td class="text-right ${h.pnlAmount >= 0 ? 'profit' : 'loss'}">${formatNumber(h.pnlAmount)}</td>
        <td class="text-right ${h.percentPnl >= 0 ? 'profit' : 'loss'}">${formatNumber(h.percentPnl)}%</td>
        <td><span class="category-badge ${h.debtEquity.toLowerCase() === 'equity' ? 'category-equity' : 'category-debt'}">${h.debtEquity}</span></td>
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
          <td class="text-right"><strong>${formatNumber(invested)}</strong></td>
          <td class="text-right"><strong>${formatNumber(current)}</strong></td>
          <td class="text-right ${pnlCls}"><strong>${formatNumber(pnl)}</strong></td>
          <td class="text-right ${pnlCls}"><strong>${formatNumber(pnlPct)}%</strong></td>
          <td></td>
        </tr>
      `;
            };

            // 🔻 We no longer wrap each “page” — content flows and the fixed footer repeats per page
            const contentHTML = `
      ${headerHTML()}
      <div class="section">
        ${executiveSummaryHTML}
      </div>
      <div class="section">
        ${allocationHTML}
      </div>

      ${stocks.length ? `
        <div class="section break">
          <div class="section-title">Stock Holdings</div>
          <div class="table-container">
            <table>
              ${tableHeader(false)}
              <tbody>
                ${rowsHTML(stocks, false)}
                ${totalsRowHTML(stocks)}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${mutualFunds.length ? `
        <div class="section break">
          <div class="section-title">Mutual Fund Holdings</div>
          <div class="table-container">
            <table>
              ${tableHeader(true)}
              <tbody>
                ${rowsHTML(mutualFunds, true)}
                ${totalsRowHTML(mutualFunds)}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;

            const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&family=Playfair+Display:wght@400;700;900&display=swap" rel="stylesheet">
  <title>Portfolio Holdings Report</title>
  <style>${commonStyles}</style>
</head>
<body>
  ${contentHTML}

  <!-- 📌 fixed footer (repeats on every printed page) -->
  <div class="footer-fixed">
    <div class="disclaimer">
      This report is for information only. Values are based on available prices and may differ from statement values.
    </div>
    <div class="page-number">Page </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.focus();
        window.print();
        window.close();
      }, 150);
    });
  </script>
</body>
</html>
`;

            const w = window.open("", "_blank", "width=1200,height=900");
            if (w) {
                w.document.open();
                w.document.write(fullHTML);
                w.document.close();
            }
        } catch (e) {
            console.error(e);
            setError('Failed to open print preview');
        } finally {
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

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-semibold text-card-text-secondary font-heading">Holdings Summary</h1>
                        <p className="text-gray-600 dark:text-gray-400">Overview of your current portfolio holdings</p>
                    </div>


                    <div className="flex flex-col">
                        <Button
                            onClick={handleDownloadPDF}
                            disabled={isGeneratingPdf}
                            className="text-sm w-full max-w-4xl ml-auto mt-2"
                        >
                            {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
                        </Button>
                        {lastUpdatedDate && (
                            <div className="text-right">
                                <div className="text-sm text-gray-500 font-medium">
                                    Last Updated : {formatDate(lastUpdatedDate)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {holdingsData && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 overflow-visible font-heading">
                        <div className="bg-white/50 backdrop-blur-sm card-shadow border-0 rounded-md overflow-visible">
                            <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-normal text-card-text">Investments Value</div>
                                </div>
                                <div className="mt-4" />
                                <div className="flex items-baseline justify-between">
                                    <div className="flex items-baseline text-3xl font-[500] text-card-text-secondary font-heading">
                                        {formatter.format(holdingsData.totalBuyValue)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/50 backdrop-blur-sm card-shadow border-0 rounded-md overflow-visible">
                            <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-normal text-card-text">Current Value</div>
                                </div>
                                <div className="mt-4" />
                                <div className="flex items-baseline justify-between">
                                    <div className="flex items-baseline text-3xl font-[500] text-card-text-secondary font-heading">
                                        {formatter.format(holdingsData.totalCurrentValue)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/50 backdrop-blur-sm card-shadow border-0 rounded-md overflow-visible">
                            <div className="pt-2 px-5 pb-2 relative flex flex-col h-24">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-normal text-card-text">Profit & Loss</div>
                                </div>
                                <div className="mt-4" />
                                <div className="flex items-baseline justify-between">
                                    <div className={`flex items-baseline text-3xl font-[500] font-heading ${holdingsData.totalPnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {formatter.format(holdingsData.totalPnl)}
                                        <sub className={`text-sm mt-1 ${holdingsData.totalPnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            ({formatter.format(holdingsData.totalPnlPercent)}%)
                                        </sub>
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
                />

                <HoldingsTable
                    title="Mutual Fund Holdings"
                    holdings={mutualFunds}
                    showTotals={true}
                    isMutualFund={true}
                />
            </div>
        </DashboardLayout>
    );
};

export default HoldingsSummaryPage;