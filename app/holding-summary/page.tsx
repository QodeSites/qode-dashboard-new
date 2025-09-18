"use client";

import React, { useEffect, useState } from 'react';
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from '../dashboard/layout';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

            if (data && typeof data === 'object') {
                const firstStrategy = Object.keys(data)[0];
                if (firstStrategy && data[firstStrategy]?.data?.holdings) {
                    const holdings = data[firstStrategy].data.holdings;
                    setHoldingsData(holdings);
                    
                    const allHoldings = [...(holdings.equityHoldings || []), ...(holdings.debtHoldings || [])];
                    if (allHoldings.length > 0 && allHoldings[0]?.date) {
                        setLastUpdatedDate(new Date(allHoldings[0].date));
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

        const allHoldings = [...holdingsData.equityHoldings, ...holdingsData.debtHoldings];

        const stocks = allHoldings.filter(holding =>
            holding.exchange && (holding.exchange.includes('NSE') || holding.exchange.includes('BSE'))
        );

        const mutualFunds = allHoldings.filter(holding =>
            !holding.exchange || (!holding.exchange.includes('NSE') && !holding.exchange.includes('BSE'))
        );

        return { stocks, mutualFunds };
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