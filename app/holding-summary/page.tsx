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
                                className="bg-[#008455] h-full flex items-center justify-center text-white text-xs font-medium"
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
                                <div className="w-4 h-4 bg-[#008455] rounded"></div>
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
                                                : holding.debtEquity.toLowerCase() === 'debt'
                                                    ? 'bg-[#DABD38] text-logo-green'
                                                    : 'bg-[#008455] text-white'
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

        // Include ALL holdings: equity, debt, AND mutual fund holdings
        const allHoldings = [
            ...(holdingsData.equityHoldings || []),
            ...(holdingsData.debtHoldings || []),
            ...(holdingsData.mutualFundHoldings || []) // Add mutual fund holdings
        ];

        return allHoldings.reduce((acc, holding) => {
            const category = holding.debtEquity.toLowerCase();
            if (category === 'equity') {
                acc.equity += holding.valueAsOfToday;
            } else if (category === 'debt') {
                acc.debt += holding.valueAsOfToday;
            } else if (category === 'hybrid') {
                acc.hybrid += holding.valueAsOfToday;
            } else {
                // Handle any other categories as hybrid
                acc.hybrid += holding.valueAsOfToday;
            }
            return acc;
        }, { equity: 0, debt: 0, hybrid: 0 });
    };

    const separateHoldings = () => {
    if (!holdingsData) return { stocks: [], mutualFunds: [] };

    const seen = new Set<string>();
    const uniqueHoldings: Holding[] = [];

    const all = [
        ...(holdingsData.equityHoldings || []),
        ...(holdingsData.debtHoldings || []),
        ...(holdingsData.mutualFundHoldings || [])
    ];

    all.forEach(holding => {
        const isStock = holding.exchange && (holding.exchange.includes('NSE') || holding.exchange.includes('BSE'));
        
        const key = isStock
            ? `${holding.symbol}-${holding.exchange}-${holding.broker}`
            : `${holding.symbol}-${holding.isin || 'no-isin'}-${holding.broker}-${holding.avgPrice.toFixed(4)}`;

        if (!seen.has(key)) {
            seen.add(key);
            uniqueHoldings.push(holding);
        }
    });

    return {
        stocks: uniqueHoldings.filter(h => h.exchange?.includes('NSE') || h.exchange?.includes('BSE')),
        mutualFunds: uniqueHoldings.filter(h => !h.exchange || (!h.exchange.includes('NSE') && !h.exchange.includes('BSE')))
    };
};

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const handleDownloadCSV = () => {
    try {
        if (!holdingsData) {
            setError('No holdings data available to export');
            return;
        }

        let csvData = [];
        const filename = `holdings_summary_${new Date().toISOString().split('T')[0]}.csv`;

        // Helper function to format currency values without symbol
        const formatCurrency = (value) => {
            if (value === null || value === undefined || value === '' || isNaN(value)) return 'N/A';
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            if (isNaN(numValue)) return 'N/A';
            return new Intl.NumberFormat('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(numValue);
        };

        // Helper function to format percentage values
        const formatPercentage = (value) => {
            if (value === null || value === undefined) return 'N/A';
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            return (numValue).toFixed(2) + '%';
        };

        // Portfolio Summary Section
        csvData.push(['Portfolio Holdings Summary', '']);
        csvData.push(['Generated On', new Date().toLocaleDateString('en-IN')]);
        if (lastUpdatedDate) {
            csvData.push(['Data As Of', formatDate(lastUpdatedDate)]);
        }
        csvData.push(['Account Name', session?.user?.name || 'N/A']);

        // Handle special accounts (Sarla/Satidham) vs regular accounts
        if (isSarla || isSatidham) {
            csvData.push(['Account Type', isSarla ? 'Sarla Account' : 'Satidham Account']);
        } else if (selectedAccount && accounts.length > 0) {
            const accountData = accounts.find(acc => acc.qcode === selectedAccount);
            csvData.push(['Account Name', accountData?.account_name || 'Unknown']);
            csvData.push(['Account Type', accountData?.account_type?.toUpperCase() || 'Unknown']);
            csvData.push(['Broker', accountData?.broker || 'Unknown']);
        }

        csvData.push(['', '']); // Empty row

        // Portfolio Statistics
        csvData.push(['Portfolio Statistics', '']);
        csvData.push(['Total Investment Value', formatCurrency(holdingsData.totalBuyValue)]);
        csvData.push(['Current Portfolio Value', formatCurrency(holdingsData.totalCurrentValue)]);
        csvData.push(['Total Profit/Loss Amount', formatCurrency(holdingsData.totalPnl)]);
        csvData.push(['Total Profit/Loss Percentage', formatPercentage(holdingsData.totalPnlPercent)]);
        csvData.push(['Total Holdings Count', holdingsData.holdingsCount || 0]);
        csvData.push(['', '']); // Empty row

        // Asset Allocation
        const assetAllocation = getAssetAllocation();
        const total = assetAllocation.equity + assetAllocation.debt + assetAllocation.hybrid;

        if (total > 0) {
            csvData.push(['Asset Allocation', '']);
            csvData.push(['Asset Type', 'Value', 'Percentage']);

            if (assetAllocation.equity > 0) {
                csvData.push(['Equity', formatCurrency(assetAllocation.equity), formatPercentage((assetAllocation.equity / total) * 100)]);
            }
            if (assetAllocation.debt > 0) {
                csvData.push(['Debt', formatCurrency(assetAllocation.debt), formatPercentage((assetAllocation.debt / total) * 100)]);
            }
            if (assetAllocation.hybrid > 0) {
                csvData.push(['Hybrid', formatCurrency(assetAllocation.hybrid), formatPercentage((assetAllocation.hybrid / total) * 100)]);
            }
            csvData.push(['', '']); // Empty row
        }

        // Category Breakdown
        if (holdingsData.categoryBreakdown && Object.keys(holdingsData.categoryBreakdown).length > 0) {
            csvData.push(['Category Breakdown', '']);
            csvData.push(['Category', 'Buy Value', 'Current Value', 'P&L', 'Holdings Count']);

            Object.entries(holdingsData.categoryBreakdown).forEach(([category, data]) => {
                csvData.push([
                    category,
                    formatCurrency(data.buyValue),
                    formatCurrency(data.currentValue),
                    formatCurrency(data.pnl),
                    data.count
                ]);
            });
            csvData.push(['', '']); // Empty row
        }

        // Broker Breakdown
        if (holdingsData.brokerBreakdown && Object.keys(holdingsData.brokerBreakdown).length > 0) {
            csvData.push(['Broker Breakdown', '']);
            csvData.push(['Broker', 'Buy Value', 'Current Value', 'P&L', 'Holdings Count']);

            Object.entries(holdingsData.brokerBreakdown).forEach(([broker, data]) => {
                csvData.push([
                    broker,
                    formatCurrency(data.buyValue),
                    formatCurrency(data.currentValue),
                    formatCurrency(data.pnl),
                    data.count
                ]);
            });
            csvData.push(['', '']); // Empty row
        }

        // Stock Holdings Detail
        const { stocks, mutualFunds } = separateHoldings();

        if (stocks && stocks.length > 0) {
            csvData.push(['Stock Holdings Detail', '']);
            csvData.push([
                'Symbol',
                'Exchange',
                'Broker',
                'Quantity',
                'Average Price (₹)',
                'Current Price (₹)',
                'Invested Amount (₹)',
                'Current Value (₹)',
                'Profit & Loss Amount (₹)',
                'Profit & Loss (%)',
                'Category',
            ]);

            stocks.forEach(holding => {
                csvData.push([
                    holding.symbol,
                    holding.exchange || 'N/A',
                    holding.broker || 'N/A',
                    holding.quantity.toLocaleString(),
                    formatCurrency(holding.avgPrice),
                    formatCurrency(holding.ltp),
                    formatCurrency(holding.buyValue),
                    formatCurrency(holding.valueAsOfToday),
                    formatCurrency(holding.pnlAmount),
                    formatPercentage(holding.percentPnl),
                    holding.debtEquity || 'N/A',
                ]);
            });

            // Stock Holdings Summary
            const stockTotals = stocks.reduce((acc, holding) => ({
                investedAmount: acc.investedAmount + holding.buyValue,
                currentValue: acc.currentValue + holding.valueAsOfToday,
                pnl: acc.pnl + holding.pnlAmount,
            }), { investedAmount: 0, currentValue: 0, pnl: 0 });

            csvData.push([
                'TOTAL STOCKS',
                '',
                '',
                '',
                '',
                '',
                formatCurrency(stockTotals.investedAmount),
                formatCurrency(stockTotals.currentValue),
                formatCurrency(stockTotals.pnl),
                formatPercentage(stockTotals.investedAmount > 0 ? (stockTotals.pnl / stockTotals.investedAmount) * 100 : 0),
                ''
            ]);
            csvData.push(['', '']); // Empty row
        }

        // Mutual Fund Holdings Detail
        if (mutualFunds && mutualFunds.length > 0) {
            csvData.push(['Mutual Fund Holdings Detail', '']);
            csvData.push([
                'Fund Name',
                'ISIN',
                'Broker',
                'Units',
                'Average Cost (₹)',
                'Current Price (₹)',
                'Invested Amount (₹)',
                'Current Value (₹)',
                'P&L Amount (₹)',
                'P&L Percentage (%)',
                'Category',
                'Sub Category'
            ]);

            mutualFunds.forEach(holding => {
                csvData.push([
                    holding.symbol,
                    holding.isin || 'N/A',
                    holding.broker || 'N/A',
                    holding.quantity.toLocaleString(),
                    formatCurrency(holding.avgPrice),  // Fixed: was holding.ltp
                    formatCurrency(holding.ltp),
                    formatCurrency(holding.buyValue),
                    formatCurrency(holding.valueAsOfToday),
                    formatCurrency(holding.pnlAmount),
                    formatPercentage(holding.percentPnl),
                    holding.debtEquity || 'N/A',
                    holding.subCategory || 'N/A'
                ]);
            });

            // Mutual Fund Holdings Summary
            const mfTotals = mutualFunds.reduce((acc, holding) => ({
                investedAmount: acc.investedAmount + holding.buyValue,
                currentValue: acc.currentValue + holding.valueAsOfToday,
                pnl: acc.pnl + holding.pnlAmount,
            }), { investedAmount: 0, currentValue: 0, pnl: 0 });

            csvData.push([
                'TOTAL MUTUAL FUNDS',
                '',
                '',
                '',
                '',
                '',
                formatCurrency(mfTotals.investedAmount),
                formatCurrency(mfTotals.currentValue),
                formatCurrency(mfTotals.pnl),
                formatPercentage(mfTotals.investedAmount > 0 ? (mfTotals.pnl / mfTotals.investedAmount) * 100 : 0),
                '',
                ''
            ]);
            csvData.push(['', '']); // Empty row
        }

        // Convert to CSV string
        const csvContent = csvData.map(row =>
            row.map(field => {
                // Handle fields that might contain commas or quotes
                if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
                    return `"${field.replace(/"/g, '""')}"`;
                }
                return field;
            }).join(',')
        ).join('\n');

        // Create and download the CSV file
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
            URL.revokeObjectURL(url); // Clean up the URL object
        }

    } catch (error) {
        console.error('Error generating CSV:', error);
        setError('Failed to generate CSV file');
    }
};

    // Dynamic Pagination PDF Download Function (fixed with proper table pagination and headers)
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

            // ⚙️ Print CSS: page structure with headers on every page
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
}

/* Page container */
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

/* Header on every page */
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

/* Table styles */
.table-container { 
  flex: 1;
}
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background-color: #02422B; color: white; padding: 10px 8px; text-align: center; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 8px; text-align: center; border-bottom: 1px solid #eee; }
tr { }
thead { display: table-header-group; }
tbody { display: table-row-group; }
tr:nth-child(even) { background-color: rgba(255,255,255,0.3); }
.positive { color: #059669; }
.negative { color: #dc2626; }
.neutral { color: #374151; }
.cash-flow-positive { color: #059669; font-weight: 600; }
.cash-flow-negative { color: #dc2626; font-weight: 600; }
.summary-row { background-color: rgba(243,244,246,0.5); font-weight: 600; }
.trailing-returns-table th:first-child, .trailing-returns-table td:first-child { text-align: left; font-weight: 500; }
.note { font-size: 10px; color: #666; margin-top: 10px; font-style: italic; padding: 0 8px 8px; }
.footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #666; }
.disclaimer { font-size: 9px; color: #999; line-height: 1.4; max-width: 75%; }
.page-number { font-family: 'Playfair Display', serif; font-size: 12px; color: #02422B; font-weight: 600; }
.chart-container { width: 100%; height: 400px; margin-bottom: 20px; margin-top: 20px;}
.right-align {
    text-align: right;
}
.left-align {
    text-align: left;
    }
.text-right { text-align: right; }
.text-left { text-align: left; }
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
.profit { color: #38a169 !important; font-weight: 700; }
.loss { color: #e53e3e !important; font-weight: 700; }
.category-badge { 
  padding: 3px 7px; 
  border-radius: 4px; 
  font-size: 9px; 
  font-weight: 700; 
  text-transform: uppercase; 
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
          <div class="date">
            Generated: ${new Date().toLocaleDateString('en-IN')}${lastUpdatedDate ? ` | Data as of: ${formatDate(lastUpdatedDate)}` : ''}
          </div>
        </div>
      </div>
    `;

            const executiveSummaryHTML = `
      <div class="section summary">
        <div class="summary-grid">
          <div class="summary-item stat-card">
            <div class="label">Total Investment</div>
            <div class="value">₹${formatNumber(holdingsData.totalBuyValue)}</div>
          </div>
          <div class="summary-item stat-card">
            <div class="label">Current Value</div>
            <div class="value">₹${formatNumber(holdingsData.totalCurrentValue)}</div>
          </div>
          <div class="summary-item stat-card">
            <div class="label">Return (%)</div>
            <div class="value ${holdingsData.totalPnlPercent >= 0 ? 'positive' : 'negative'}">
              ${formatNumber(holdingsData.totalPnlPercent)}%
            </div>
          </div>
          <div class="summary-item stat-card">
            <div class="label">Return (₹)</div>
            <div class="value ${holdingsData.totalPnl >= 0 ? 'positive' : 'negative'}">
              ${holdingsData.totalPnl >= 0 ? '' : '-'} ₹${formatNumber(Math.abs(holdingsData.totalPnl))}
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
                ${assetAllocation.equity > 0 ? `<div class="equity-bar" style="width:${((assetAllocation.equity / total) * 100).toFixed(1)}%;">Equity ${((assetAllocation.equity / total) * 100).toFixed(1)}%</div>` : ''}
                ${assetAllocation.debt > 0 ? `<div class="debt-bar"   style="width:${((assetAllocation.debt / total) * 100).toFixed(1)}%;">Debt ${((assetAllocation.debt / total) * 100).toFixed(1)}%</div>` : ''}
                ${assetAllocation.hybrid > 0 ? `<div class="hybrid-bar"   style="width:${((assetAllocation.hybrid / total) * 100).toFixed(1)}%;">Hybrid ${((assetAllocation.hybrid / total) * 100).toFixed(1)}%</div>` : ''}
                
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
                ${assetAllocation.hybrid > 0 ? `
                    <div class="legend-item">
                    <div class="legend-left">
                        <div class="legend-color hybrid"></div>
                        <div class="legend-text ">Hybrid Holdings</div>
                    </div>
                    <div class="legend-value">₹${formatNumber(assetAllocation.hybrid)}</div>
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
          <th class="text-left">${'Fund Name'}</th>
          <th class="text-right">Quantity</th>
          <th class="text-right">${'Average Cost (₹)'}</th>
          <th class="text-right">${'Latest Trade Price (₹)'}</th>
          <th class="text-right">Invested Amount (₹)</th>
          <th class="text-right">Current Value (₹)</th>
          <th class="text-right">Profit & Loss (₹)</th>
          <th class="text-right">Profit & Loss (%)</th>
          <th>Category</th>
        </tr>
      </thead>
    `;

            const rowsHTML = (arr: Holding[], isMF: boolean) => arr.map(h => `
      <tr>
        <td class="text-left">
          <div class="symbol-cell">${h.symbol}</div>
        </td>
        <td class="text-right">${h.quantity.toFixed(2)}</td>
        <td class="text-right">${formatNumber(h.avgPrice)}</td>
        <td class="text-right">${formatNumber(h.ltp)}</td>
        <td class="text-right">${formatNumber(h.buyValue)}</td>
        <td class="text-right">${formatNumber(h.valueAsOfToday)}</td>
        <td class="text-right ${h.pnlAmount >= 0 ? 'profit' : 'loss'}">${formatNumber(h.pnlAmount)}</td>
        <td class="text-right ${h.percentPnl >= 0 ? 'profit' : 'loss'}">${formatNumber(h.percentPnl)}%</td>
        <td><span class="category-badge ${h.debtEquity.toLowerCase() === 'equity' ? 'category-equity' : h.debtEquity.toLowerCase() === 'hybrid' ? 'category-hybrid':'category-debt'}">${h.debtEquity}</span></td>
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

            // Build pages
            let contentHTML = `
    <!-- Page 1: Summary -->
    <div class="page">
      ${headerHTML()}
      ${executiveSummaryHTML}
      ${allocationHTML}
      <div class="footer">

        <div class="page-number">Page 1 | Qode</div>
      </div>
    </div>
    `;

            // Add stocks pages
            if (stocks.length) {
                contentHTML += `
    <div class="page" id="stocks-page">
      ${headerHTML()}
      <div class="section-title">Stock Holdings</div>
      <div class="section allow-break">
        <div class="table-container">
          <table id="stocks-table">
            ${tableHeader(false)}
            <tbody>
              ${rowsHTML(stocks, false)}
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

            // Add mutual funds pages  
            if (mutualFunds.length) {
                const pageNum = stocks.length ? 3 : 2;
                contentHTML += `
                <div class="page" id="mf-page">
                ${headerHTML()}
                <div class="section-title">Mutual Fund Holdings</div>
                <div class="section allow-break">
                    <div class="table-container">
                    <table id="mf-table">
                        ${tableHeader(true)}
                        <tbody>
                        ${rowsHTML(mutualFunds, true)}
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;500;600&family=Inria+Serif:wght@300;400;700&display=swap" rel="stylesheet">
  <title>Portfolio Holdings Report</title>
  <style>${commonStyles}</style>
</head>
<body>
  ${contentHTML}

  <script>
    // Fixed table pagination function
    function paginateLongTable(tableId, sectionTitle, basePageNum) {
        console.log('Starting pagination for:', tableId);
        const table = document.getElementById(tableId);
        if (!table) {
            console.log('Table not found:', tableId);
            return;
        }

        const currentPage = table.closest('.page');
        if (!currentPage) {
            console.log('Page container not found for table:', tableId);
            return;
        }

        const tbody = table.querySelector('tbody');
        if (!tbody) {
            console.log('Tbody not found for table:', tableId);
            return;
        }
        
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        console.log('Total rows found:', allRows.length);
        
        if (allRows.length <= 6) {
            console.log('No pagination needed - row count is', allRows.length);
            return;
        }

        // Store original rows (excluding totals row)
        const totalRow = allRows.find(row => row.classList.contains('total-row'));
        const dataRows = allRows.filter(row => !row.classList.contains('total-row'));
        console.log('Data rows:', dataRows.length, 'Total row exists:', !!totalRow);

        const rowsPerPage = 6;
        let pageNum = basePageNum + 1;
        
        // Clear original tbody and add first page rows
        tbody.innerHTML = '';
        
        for (let i = 0; i < Math.min(rowsPerPage, dataRows.length); i++) {
            tbody.appendChild(dataRows[i].cloneNode(true));
        }
        
        // Add total row to first page if it's the last page
        if (dataRows.length <= rowsPerPage && totalRow) {
            tbody.appendChild(totalRow.cloneNode(true));
        }

        // Create continuation pages for remaining rows
        let remainingRows = dataRows.slice(rowsPerPage);
        
        while (remainingRows.length > 0) {
            console.log('Creating continuation page:', pageNum, 'with', Math.min(rowsPerPage, remainingRows.length), 'rows');
            
            // Create new page with proper header
            const newPageHTML = \`
                <div class="page">
                    <div class="header">
                        <div class="header-left">
                            <h1>\${document.querySelector('.header-left h1').textContent}</h1>
                            <p>Holdings Summary</p>
                        </div>
                        <div class="header-right">
                            <div class="date">
                                \${document.querySelector('.header-right .date').textContent}
                            </div>
                        </div>
                    </div>
                    <div class="section-title">\${sectionTitle}</div>
                    <div class="section allow-break">
                        <div class="table-container">
                            <table>
                                \${table.querySelector('thead').outerHTML}
                                <tbody></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="footer">
                        <div class="page-number">Page \${pageNum} | Qode</div>
                    </div>
                </div>
            \`;
            
            // Insert new page
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newPageHTML;
            const newPage = tempDiv.firstElementChild;
            
            // Insert after current page
            currentPage.parentNode.insertBefore(newPage, currentPage.nextSibling);
            
            // Add rows to new page
            const newTbody = newPage.querySelector('tbody');
            const pageRows = remainingRows.slice(0, rowsPerPage);
            
            pageRows.forEach(row => {
                newTbody.appendChild(row.cloneNode(true));
            });
            
            // Add total row to last page
            if (remainingRows.length <= rowsPerPage && totalRow) {
                newTbody.appendChild(totalRow.cloneNode(true));
            }
            
            remainingRows = remainingRows.slice(rowsPerPage);
            pageNum++;
        }
        
        console.log('Pagination completed for', tableId);
    }

    // Run pagination after DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, starting pagination...');
        
        // Pagination for stocks table
        if (${stocks.length} > 6) {
            console.log('Paginating stocks table...');
            setTimeout(() => paginateLongTable('stocks-table', 'Stock Holdings', 2), 100);
        }
        
        // Pagination for mutual funds table
        if (${mutualFunds.length} > 6) {
            console.log('Paginating mutual funds table...');
            const mfBasePageNum = ${stocks.length} > 0 ? 3 : 2;
            setTimeout(() => paginateLongTable('mf-table', 'Mutual Fund Holdings', mfBasePageNum), 200);
        }
        
        // Auto-print after pagination is complete
        setTimeout(() => { 
            console.log('Triggering print...');
            try { 
                window.print(); 
            } catch(e) { 
                console.error('Print error:', e); 
            } 
        }, 1000);
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
                        <div className="flex gap-2">
                            <Button
                                onClick={handleDownloadCSV}
                                className="text-sm"
                                variant="outline"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Download CSV
                            </Button>
                            <Button
                                onClick={handleDownloadPDF}
                                disabled={isGeneratingPdf}
                                className="text-sm"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
                            </Button>
                        </div>
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