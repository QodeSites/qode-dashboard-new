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
                <CardTitle className="text-white p-3 mb-4 rounded-t-sm bg-logo-green text-lg font-heading-bold">
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
            <CardTitle className="text-white p-3 mb-4 rounded-t-sm bg-logo-green text-lg font-heading-bold">
                Holding Distribution
            </CardTitle>
            <CardContent>
                <div className="space-y-4">
                    <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
                        {equityPercent > 0 && (
                            <div
                                className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${equityPercent}%` }}
                            >
                                {equityPercent > 10 ? `${equityPercent.toFixed(1)}%` : ''}
                            </div>
                        )}
                        {debtPercent > 0 && (
                            <div
                                className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${debtPercent}%` }}
                            >
                                {debtPercent > 10 ? `${debtPercent.toFixed(1)}%` : ''}
                            </div>
                        )}
                        {hybridPercent > 0 && (
                            <div
                                className="bg-purple-500 h-full flex items-center justify-center text-white text-xs font-medium"
                                style={{ width: `${hybridPercent}%` }}
                            >
                                {hybridPercent > 10 ? `${hybridPercent.toFixed(1)}%` : ''}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-6">
                        {equityValue > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-blue-500 rounded"></div>
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
                                <div className="w-4 h-4 bg-green-500 rounded"></div>
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
                                <div className="w-4 h-4 bg-purple-500 rounded"></div>
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
                <CardTitle className="text-white p-3 mb-4 rounded-t-sm bg-logo-green text-lg font-heading-bold">
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
            <CardTitle className="text-white p-3 mb-4 rounded-t-sm bg-logo-green text-lg font-heading-bold">
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
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-purple-100 text-purple-800'
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

    // Dynamic Pagination PDF Download Function
    const handleDownloadPDF = async () => {
        if (!holdingsData) {
            setError('No holdings data available for PDF export');
            return;
        }

        setIsGeneratingPdf(true);

        try {
            const assetAllocation = getAssetAllocation();
            const { stocks, mutualFunds } = separateHoldings();
            const total = assetAllocation.equity + assetAllocation.debt + assetAllocation.hybrid;

            const ITEMS_PER_PAGE = 5;

            // Split holdings into pages
            const stockPages = [];
            const mutualFundPages = [];

            // Create stock pages
            if (stocks.length > 0) {
                for (let i = 0; i < stocks.length; i += ITEMS_PER_PAGE) {
                    stockPages.push(stocks.slice(i, i + ITEMS_PER_PAGE));
                }
            }

            // Create mutual fund pages
            if (mutualFunds.length > 0) {
                for (let i = 0; i < mutualFunds.length; i += ITEMS_PER_PAGE) {
                    mutualFundPages.push(mutualFunds.slice(i, i + ITEMS_PER_PAGE));
                }
            }

            const totalPages = 1 + stockPages.length + mutualFundPages.length;

            // Common styles for all pages
            const commonStyles = `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Lato', sans-serif;
            background-color: #EFECD3;
            color: #333;
            line-height: 1.5;
            font-size: 14px;
        }

        .page {
            width: 297mm; /* Landscape width */
    height: 210mm; /* Landscape height */
            padding: 5mm;
            margin: 0;
            background-color: #EFECD3;
            box-sizing: border-box;
            page-break-after: always;
            display: flex;
            flex-direction: column;
        }

        .page:last-child {
            page-break-after: auto;
        }

        /* Header styles */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20mm;
            padding-bottom: 6mm;
            border-bottom: 3px solid #2F5233;
        }

        .header-left h1 {
            font-family: 'Playfair Display', serif;
            font-size: 32px;
            font-weight: 700;
            color: #2F5233;
            margin-bottom: 8px;
        }

        .header-left p {
            font-size: 16px;
            color: #666;
            font-weight: 400;
        }

        .header-right {
            text-align: right;
        }

        .header-right .date {
            font-size: 14px;
            color: #666;
            margin-bottom: 8px;
        }

        .header-right .status {
            background-color: #2F5233;
            color: #D4AF37;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
        }

        /* Section styles */
        .section {
            background-color: #EFECD3;
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 18px;
        }

        .section-title {
            font-family: 'Playfair Display', serif;
            font-size: 20px;
            font-weight: 700;
            color: #2F5233;
            margin-bottom: 18px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 6px;
        }

        /* Executive Summary styles */
        .executive-summary {
            border-left: 6px solid #D4AF37;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
        }

        .summary-item {
            text-align: center;
            padding: 16px;
            background-color: #EFECD3;
            border-radius: 8px;
            border: 2px solid rgba(47, 82, 51, 0.1);
        }

        .summary-item .label {
            font-size: 11px;
            color: #666;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: 8px;
        }

        .summary-item .value {
            font-size: 20px;
            font-weight: 700;
            color: #2F5233;
            margin-bottom: 6px;
        }

        .summary-item .value.positive {
            color: #38a169;
        }

        .summary-item .value.negative {
            color: #e53e3e;
        }

        .summary-item .subvalue {
            font-size: 10px;
            color: #666;
        }

        /* Asset allocation */
        .allocation-section {
            background-color: #EFECD3;
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 18px;
        }

        /* Chart styles */
        .chart-container {
            margin: 18px 0;
        }

        .chart-bar {
            width: 100%;
            height: 35px;
            border-radius: 18px;
            overflow: hidden;
            display: flex;
            margin-bottom: 18px;
        }

        .equity-bar {
            background-color: #D4AF37;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 13px;
        }

        .debt-bar {
            background-color: #2F5233;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 13px;
        }

        .legend {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .legend-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background-color: #EFECD3;
            border-radius: 8px;
            border: 2px solid rgba(47, 82, 51, 0.1);
        }

        .legend-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 4px;
        }

        .legend-color.equity {
            background-color: #D4AF37;
        }

        .legend-color.debt {
            background-color: #2F5233;
        }

        .legend-text {
            font-size: 14px;
            color: #4a5568;
            font-weight: 600;
        }

        .legend-value {
            font-size: 14px;
            font-weight: 700;
            color: #2d3748;
        }

        /* Table styles */
        .table-container {
            overflow-x: auto;
            margin-top: 15px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }

        thead {
            background-color: rgba(47, 82, 51, 0.1);
        }

        th {
            padding: 12px 6px;
            text-align: left;
            font-weight: 700;
            color: #2F5233;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.4px;
            border-bottom: 2px solid #2F5233;
        }

        th.text-right {
            text-align: right;
        }

        td {
            padding: 10px 6px;
            border-bottom: 1px solid #eee;
            color: #2d3748;
        }

        td.text-right {
            text-align: right;
        }

        .symbol-cell {
            font-weight: 700;
            color: #2F5233;
            font-size: 13px;
        }

        .exchange-text {
            font-size: 10px;
            color: #718096;
            margin-top: 2px;
        }

        .profit {
            color: #38a169;
            font-weight: 700;
        }

        .loss {
            color: #e53e3e;
            font-weight: 700;
        }

        .category-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .category-equity {
            background-color: #2F5233;
            color: #D4AF37;
        }

        .category-debt {
            background-color: #D4AF37;
            color: #2F5233;
        }

        .total-row {
            background-color: rgba(47, 82, 51, 0.08);
            font-weight: 700;
            border-top: 3px solid #2F5233;
        }

        .total-row td {
            padding: 15px 6px;
            font-weight: 700;
            color: #2F5233;
            font-size: 13px;
        }

        /* Footer */
        .footer {
            margin-top: auto;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: #666;
        }

        .disclaimer {
            font-size: 9px;
            color: #999;
            line-height: 1.4;
            max-width: 75%;
        }

        .page-number {
            font-weight: 700;
        }

        @media print {
            .page {
                margin: 0;
            }
        }
    `;

            // Helper function to create holdings table HTML
            const createHoldingsTableHtml = (holdings, title, isMutualFund = false, pageNum, totalPages, isLastPage = false, allHoldings = []) => {
                const tableRows = holdings.map(holding => `
        <tr>
            <td>
                <div class="symbol-cell">${holding.symbol}</div>
                <div class="exchange-text">${isMutualFund ? (holding.isin || '') : (holding.exchange || '')}</div>
            </td>
            <td class="text-right">${holding.quantity.toLocaleString()}</td>
            <td class="text-right">₹${formatNumber(holding.avgPrice)}</td>
            <td class="text-right">₹${formatNumber(holding.ltp)}</td>
            <td class="text-right">₹${formatNumber(holding.buyValue)}</td>
            <td class="text-right">₹${formatNumber(holding.valueAsOfToday)}</td>
            <td class="text-right ${holding.pnlAmount >= 0 ? 'profit' : 'loss'}">₹${formatNumber(holding.pnlAmount)}</td>
            <td class="text-right ${holding.percentPnl >= 0 ? 'profit' : 'loss'}">${formatNumber(holding.percentPnl)}%</td>
            <td class="text-right">${total > 0 ? ((holding.valueAsOfToday / total) * 100).toFixed(2) : 0}%</td>
            <td><span class="category-badge category-${holding.debtEquity.toLowerCase()}">${holding.debtEquity}</span></td>
        </tr>`).join('');

                // Add total row only on the last page of each holding type
                const totalRow = isLastPage ? `
        <tr class="total-row">
            <td colspan="4"><strong>${isMutualFund ? 'MUTUAL FUND' : 'STOCK'} TOTAL</strong></td>
            <td class="text-right"><strong>₹${formatNumber(allHoldings.reduce((sum, h) => sum + h.buyValue, 0))}</strong></td>
            <td class="text-right"><strong>₹${formatNumber(allHoldings.reduce((sum, h) => sum + h.valueAsOfToday, 0))}</strong></td>
            <td class="text-right ${allHoldings.reduce((sum, h) => sum + h.pnlAmount, 0) >= 0 ? 'profit' : 'loss'}"><strong>₹${formatNumber(allHoldings.reduce((sum, h) => sum + h.pnlAmount, 0))}</strong></td>
            <td class="text-right ${allHoldings.reduce((sum, h) => sum + h.pnlAmount, 0) >= 0 ? 'profit' : 'loss'}"><strong>${formatNumber((allHoldings.reduce((sum, h) => sum + h.pnlAmount, 0) / allHoldings.reduce((sum, h) => sum + h.buyValue, 0)) * 100)}%</strong></td>
            <td class="text-right"><strong>${total > 0 ? ((allHoldings.reduce((sum, h) => sum + h.valueAsOfToday, 0) / total) * 100).toFixed(2) : 0}%</strong></td>
            <td></td>
        </tr>` : '';

                return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portfolio Holdings Report - ${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap" rel="stylesheet">
    <style>${commonStyles}</style>
</head>
<body>
    <div class="page">
        <!-- Header -->
        <div class="header">
            <div class="header-left">
                <h1>${title}</h1>
                <p>${isMutualFund ? 'Fund Position Analysis' : 'Equity Position Analysis'}</p>
            </div>
            <div class="header-right">
                <div class="date">${new Date().toLocaleDateString('en-IN')}</div>
                <span class="status">${isMutualFund ? 'FUNDS REPORT' : 'EQUITY REPORT'}</span>
            </div>
        </div>

        <!-- Holdings Table -->
        <div class="section" style="flex-grow: 1;">
            <div class="section-title">${title} with Performance Metrics</div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>${isMutualFund ? 'Fund Name & ISIN' : 'Symbol & Exchange'}</th>
                            <th class="text-right">Quantity</th>
                            <th class="text-right">${isMutualFund ? 'Avg NAV' : 'Avg Cost'}</th>
                            <th class="text-right">${isMutualFund ? 'Current NAV' : 'Current Price'}</th>
                            <th class="text-right">Invested Amount</th>
                            <th class="text-right">Current Value</th>
                            <th class="text-right">P&L Amount</th>
                            <th class="text-right">P&L %</th>
                            <th>Category</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                        ${totalRow}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <div class="disclaimer">
                <strong>${isMutualFund ? 'Mutual Fund Holdings:' : 'Stock Holdings:'}</strong> ${isMutualFund ? 'This section details mutual fund investments including NAV-based calculations.' : 'This section details equity positions including ETFs and individual stocks.'} 
                Performance metrics are calculated based on average cost and current market prices.
            </div>
            <div class="page-number">Page ${pageNum} of ${totalPages}</div>
        </div>
    </div>
</body>
</html>`;
            };

            // Page 1: Executive Summary and Asset Allocation
            const page1Html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portfolio Holdings Report - Page 1</title>
    <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap" rel="stylesheet">
    <style>${commonStyles}</style>
</head>
<body>
    <div class="page">
        <!-- Header -->
        <div class="header">
            <div class="header-left">
                <h1>Portfolio Holdings Report</h1>
                <p>Investment Analysis Summary</p>
            </div>
            <div class="header-right">
                <div class="date">Generated: ${new Date().toLocaleDateString('en-IN')} ${lastUpdatedDate ? `| Data as of: ${formatDate(lastUpdatedDate)}` : ''}</div>
                <span class="status">ACTIVE PORTFOLIO</span>
            </div>
        </div>

        <!-- Executive Summary -->
        <div class="section executive-summary">
            <div class="section-title">Executive Summary</div>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="label">Total Investment</div>
                    <div class="value">₹${formatNumber(holdingsData.totalBuyValue)}</div>
                    <div class="subvalue">Principal Amount</div>
                </div>
                <div class="summary-item">
                    <div class="label">Current Value</div>
                    <div class="value">₹${formatNumber(holdingsData.totalCurrentValue)}</div>
                    <div class="subvalue">Market Value</div>
                </div>
                <div class="summary-item">
                    <div class="label">Total Gain</div>
                    <div class="value ${holdingsData.totalPnl >= 0 ? 'positive' : 'negative'}">₹${formatNumber(Math.abs(holdingsData.totalPnl))}</div>
                    <div class="subvalue">Absolute Return</div>
                </div>
                <div class="summary-item">
                    <div class="label">Return %</div>
                    <div class="value ${holdingsData.totalPnlPercent >= 0 ? 'positive' : 'negative'}">${formatNumber(holdingsData.totalPnlPercent)}%</div>
                    <div class="subvalue">Overall Performance</div>
                </div>
            </div>
        </div>

        <!-- Asset Allocation -->
        <div class="allocation-section">
            <div class="section-title">Asset Allocation</div>
            <div class="chart-container">
                ${total > 0 ? `
                <div class="chart-bar">
                    ${assetAllocation.equity > 0 ? `<div class="equity-bar" style="width: ${((assetAllocation.equity / total) * 100).toFixed(1)}%;">Equity ${((assetAllocation.equity / total) * 100).toFixed(1)}%</div>` : ''}
                    ${assetAllocation.debt > 0 ? `<div class="debt-bar" style="width: ${((assetAllocation.debt / total) * 100).toFixed(1)}%;">Debt ${((assetAllocation.debt / total) * 100).toFixed(1)}%</div>` : ''}
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
                </div>` : '<div style="text-align: center; padding: 30px; color: #666;">No allocation data available</div>'}
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <div class="disclaimer">
                <strong>Report Overview:</strong> This portfolio analysis provides insights into your investment performance 
                and asset allocation across different investment vehicles.
            </div>
            <div class="page-number">Page 1 of ${totalPages}</div>
        </div>
    </div>
</body>
</html>`;

            // Create PDF with portrait orientation
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4',
            });

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            // Build all pages
            const allPages = [page1Html];
            let currentPageNum = 2;

            // Add stock pages
            stockPages.forEach((pageStocks, index) => {
                const isLastStockPage = index === stockPages.length - 1;
                const pageHtml = createHoldingsTableHtml(
                    pageStocks,
                    `Stock Holdings${stockPages.length > 1 ? ` (Page ${index + 1} of ${stockPages.length})` : ''}`,
                    false,
                    currentPageNum,
                    totalPages,
                    isLastStockPage,
                    stocks
                );
                allPages.push(pageHtml);
                currentPageNum++;
            });

            // Add mutual fund pages
            mutualFundPages.forEach((pageFunds, index) => {
                const isLastMutualFundPage = index === mutualFundPages.length - 1;
                const pageHtml = createHoldingsTableHtml(
                    pageFunds,
                    `Mutual Fund Holdings${mutualFundPages.length > 1 ? ` (Page ${index + 1} of ${mutualFundPages.length})` : ''}`,
                    true,
                    currentPageNum,
                    totalPages,
                    isLastMutualFundPage,
                    mutualFunds
                );
                allPages.push(pageHtml);
                currentPageNum++;
            });

            // Generate PDF pages
            for (let i = 0; i < allPages.length; i++) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = allPages[i];
                tempDiv.style.position = 'absolute';
                tempDiv.style.top = '-9999px';
                tempDiv.style.left = '-9999px';
                tempDiv.style.width = '210mm';
                tempDiv.style.height = 'auto';
                document.body.appendChild(tempDiv);

                await document.fonts.ready;

                const canvas = await html2canvas(tempDiv, {
                    scale: 1.3,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#EFECD3',
                    width: tempDiv.scrollWidth,
                    height: tempDiv.scrollHeight,
                });

                document.body.removeChild(tempDiv);

                const imgData = canvas.toDataURL('image/png');

                if (i > 0) {
                    pdf.addPage();
                }

                pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
            }

            pdf.save(`portfolio_holdings_report_${new Date().getTime()}.pdf`);

        } catch (error) {
            console.error('Error generating PDF:', error);
            setError('Failed to generate PDF');
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

                    {lastUpdatedDate && (
                        <div className="text-right">
                            <div className="text-sm text-gray-500 font-medium">Last Updated</div>
                            <div className="text-sm text-card-text">
                                {formatDate(lastUpdatedDate)}
                            </div>
                        </div>
                    )}
                    <div>
                        <button
                            onClick={handleDownloadPDF}
                            disabled={isGeneratingPdf}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow"
                        >
                            {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
                        </button>
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