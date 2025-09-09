"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";

interface QuarterlyPnlData {
    [year: string]: {
        percent: { q1: string; q2: string; q3: string; q4: string; total: string };
        cash: { q1: string; q2: string; q3: string; q4: string; total: string };
        yearCash: string;
    };
}

interface MonthlyPnlData {
    [year: string]: {
        months: {
            [month: string]: {
                percent: string;
                cash: string;
                capitalInOut: string;
            };
        };
        totalPercent: number;
        totalCash: number;
        totalCapitalInOut: number;
    };
}

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
}

interface HoldingsSummary {
    totalBuyValue: number;
    totalCurrentValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    holdingsCount: number;
    equityHoldings: Holding[];
    debtHoldings: Holding[];
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

interface Stats {
    amountDeposited: string;
    currentExposure: string;
    return: string;
    totalProfit: string;
    trailingReturns: {
        fiveDays?: string | null;
        tenDays?: string | null;
        fifteenDays?: string | null;
        oneMonth?: string | null;
        threeMonths?: string | null;
        sixMonths?: string | null;
        oneYear?: string | null;
        twoYears?: string | null;
        fiveYears?: string | null;
        sinceInception: string;
        MDD?: string;
        currentDD?: string;
    };
    drawdown: string;
    equityCurve: { date: string; value: number }[];
    drawdownCurve: { date: string; value: number }[];
    quarterlyPnl: {
        [year: string]: {
            percent: { q1: string; q2: string; q3: string; q4: string; total: string };
            cash: { q1: string; q2: string; q3: string; q4: string; total: string };
            yearCash: string;
        };
    };
    monthlyPnl: {
        [year: string]: {
            months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
            totalPercent: number | string;
            totalCash: number;
            totalCapitalInOut: number;
        };
    };
    cashFlows: { date: string; amount: number }[];
    strategyName?: string;
    holdings?: HoldingsSummary; // Add holdings data
}

interface Stats {
    amountDeposited: string;
    currentExposure: string;
    return: string;
    totalProfit: string;
    trailingReturns: {
        fiveDays?: string | null;
        tenDays?: string | null;
        fifteenDays?: string | null;
        oneMonth?: string | null;
        threeMonths?: string | null;
        sixMonths?: string | null;
        oneYear?: string | null;
        twoYears?: string | null;
        fiveYears?: string | null;
        sinceInception: string;
        MDD?: string;
        currentDD?: string;
    };
    drawdown: string;
    equityCurve: { date: string; value: number }[];
    drawdownCurve: { date: string; value: number }[];
    quarterlyPnl: {
        [year: string]: {
            percent: { q1: string; q2: string; q3: string; q4: string; total: string };
            cash: { q1: string; q2: string; q3: string; q4: string; total: string };
            yearCash: string;
        };
    };
    monthlyPnl: {
        [year: string]: {
            months: { [month: string]: { percent: string; cash: string; capitalInOut: string } };
            totalPercent: number | string;
            totalCash: number;
            totalCapitalInOut: number;
        };
    };
    cashFlows: { date: string; amount: number }[];
    strategyName?: string;
}

interface PmsStats {
    totalPortfolioValue: string;
    totalPnl: string;
    maxDrawdown: string;
    cumulativeReturn: string;
    equityCurve: { date: string; value: number }[];
    drawdownCurve: { date: string; value: number }[];
    quarterlyPnl: {
        [year: string]: {
            percent: { q1: string; q2: string; q3: string; q4: string; total: string };
            cash: { q1: string; q2: string; q3: string; q4: string; total: string };
            yearCash?: string;
        };
    };
    monthlyPnl: {
        [year: string]: {
            months: { [month: string]: { percent: string; cash: string; capitalInOut?: string } };
            totalPercent: number;
            totalCash: number;
            totalCapitalInOut?: number;
        };
    };
    trailingReturns: {
        fiveDays: string | null;
        tenDays: string | null;
        oneMonth: string | null;
        threeMonths: string | null;
        sixMonths: string | null;
        oneYear: string | null;
        twoYears: string | null;
        fiveYears: string | null;
        sinceInception: string;
        MDD: string;
        currentDD: string;
    };
    cashFlows: { date: string; amount: number }[];
    strategyName?: string;
}

interface Account {
    qcode: string;
    account_name: string;
    account_type: string;
    broker: string;
}

interface Metadata {
    icode: string;
    accountCount: number;
    inceptionDate: string | null;
    dataAsOfDate: string | null;
    lastUpdated: string;
    strategyName: string;
    filtersApplied: {
        accountType: string | null;
        broker: string | null;
        startDate: string | null;
        endDate: string | null;
    };
    isActive: boolean;
}

interface SarlaApiResponse {
    [strategyName: string]: {
        data: Stats | PmsStats;
        metadata: Metadata;
    };
}

const styles = StyleSheet.create({
    page: {
        flexDirection: "column",
        backgroundColor: "#FFFFFF",
        padding: 20,
        fontSize: 10,
        fontFamily: "Helvetica",
    },
    section: {
        marginBottom: 10,
    },
    header: {
        fontSize: 14,
        marginBottom: 5,
        fontWeight: "bold",
    },
    subHeader: {
        fontSize: 12,
        marginBottom: 5,
    },
    text: {
        fontSize: 10,
        marginBottom: 3,
    },
    table: {
        display: "flex",
        width: "auto",
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: "#bfbfbf",
        marginBottom: 10,
    },
    tableRow: {
        flexDirection: "row",
    },
    tableCol: {
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: "#bfbfbf",
        padding: 5,
    },
    tableHeader: {
        backgroundColor: "#f0f0f0",
        fontWeight: "bold",
    },
    positive: { color: "green" },
    negative: { color: "red" },
    note: {
        fontSize: 8,
        color: "#666",
        marginTop: 5,
    },
});

// Helper Functions (Mirrored from Original Components)
const isPmsStats = (stats: any): stats is PmsStats => {
    return stats && "cashInOut" in stats;
};

const convertPmsStatsToStats = (pmsStats: PmsStats): Stats => {
    return {
        equityCurve: pmsStats.equityCurve || [],
        drawdownCurve: pmsStats.drawdownCurve || [],
        amountDeposited: pmsStats.amountDeposited || "0",
        currentExposure: pmsStats.currentExposure || "0",
        return: pmsStats.return || "0",
        totalProfit: pmsStats.totalProfit || "0",
        trailingReturns: pmsStats.trailingReturns || {
            tenDays: "0",
            oneMonth: "0",
            threeMonths: "0",
            sixMonths: "0",
            oneYear: "0",
            twoYears: "0",
            fiveYears: "0",
            sinceInception: "0",
        },
        drawdown: pmsStats.drawdown || "0",
        holdings: pmsStats.holdings || { holdingsCount: 0, equityHoldings: [], debtHoldings: [], totalCurrentValue: 0, totalBuyValue: 0, totalPnl: 0, totalPnlPercent: 0, categoryBreakdown: {} },
        quarterlyPnl: pmsStats.quarterlyPnl || {},
        monthlyPnl: pmsStats.monthlyPnl || {},
        cashFlows: pmsStats.cashFlows || [],
    };
};

const filterEquityCurve = (curve: any[], startDate: string | null, lastUpdated: string | null) => {
    return curve; // Placeholder; implement filtering if needed
};

const getLastDate = (equityCurve: { date: string; value: number }[], lastUpdated: string | null): string | null => {
    if (equityCurve.length > 0) {
        const sortedCurve = [...equityCurve].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        return sortedCurve[0].date;
    }
    return lastUpdated || null;
};

// PDF Document Component
const PortfolioPDFDocument = ({
    isSarla,
    isSatidham,
    session,
    stats,
    metadata,
    sarlaData,
    selectedStrategy,
    viewMode,
    returnViewType,
    accounts,
    selectedAccount,
}: {
    isSarla: boolean;
    isSatidham: boolean;
    session: any;
    stats: any;
    metadata: Metadata | null;
    sarlaData: SarlaApiResponse | null;
    selectedStrategy: string | null;
    viewMode: "consolidated" | "individual";
    returnViewType: "percent" | "cash";
    accounts: Account[];
    selectedAccount: string | null;
}) => {
    const currentMetadata = (isSarla || isSatidham) && sarlaData && selectedStrategy
        ? sarlaData[selectedStrategy]?.metadata
        : metadata;

    const renderPDFCashFlowsTable = () => {
        let transactions: { date: string; amount: number }[] = [];

        if ((isSarla || isSatidham) && sarlaData && selectedStrategy) {
            transactions = sarlaData[selectedStrategy]?.data?.cashFlows || [];
        } else if (Array.isArray(stats)) {
            transactions = stats.flatMap((item: any) => item.stats.cashFlows || []);
        } else {
            transactions = stats?.cashFlows || [];
        }

        const cashFlowTotals = transactions.reduce(
            (acc, tx) => {
                const amount = Number(tx.amount);
                if (amount > 0) acc.totalIn += amount;
                else if (amount < 0) acc.totalOut += amount;
                acc.netFlow += amount;
                return acc;
            },
            { totalIn: 0, totalOut: 0, netFlow: 0 }
        );

        if (!transactions.length) {
            return (
                <View style={styles.section}>
                    <Text style={styles.subHeader}>Cash In / Out</Text>
                    <Text>No cash flow data available</Text>
                </View>
            );
        }

        return (
            <View style={styles.section}>
                <Text style={styles.subHeader}>Cash In / Out</Text>
                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text>Date</Text></View>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text>Amount (₹)</Text></View>
                        {viewMode === "individual" && <View style={[styles.tableCol, { width: "50%" }]}><Text>Account</Text></View>}
                    </View>
                    {transactions.map((tx, index) => {
                        const accountName = Array.isArray(stats)
                            ? stats.find((item: any) => item.stats.cashFlows?.includes(tx))?.metadata.account_name
                            : undefined;
                        return (
                            <View key={index} style={styles.tableRow}>
                                <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text>{dateFormatter(tx.date)}</Text></View>
                                <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}>
                                    <Text style={Number(tx.amount) > 0 ? styles.positive : styles.negative}>
                                        {formatter.format(Number(tx.amount))}
                                    </Text>
                                </View>
                                {viewMode === "individual" && <View style={[styles.tableCol, { width: "50%" }]}><Text>{accountName || "Unknown"}</Text></View>}
                            </View>
                        );
                    })}
                    <View style={styles.tableRow}>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text>Total In</Text></View>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text style={styles.positive}>{formatter.format(cashFlowTotals.totalIn)}</Text></View>
                        {viewMode === "individual" && <View style={[styles.tableCol, { width: "50%" }]} />}
                    </View>
                    <View style={styles.tableRow}>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text>Total Out</Text></View>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text style={styles.negative}>{formatter.format(cashFlowTotals.totalOut)}</Text></View>
                        {viewMode === "individual" && <View style={[styles.tableCol, { width: "50%" }]} />}
                    </View>
                    <View style={styles.tableRow}>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}><Text>Net Flow</Text></View>
                        <View style={[styles.tableCol, { width: viewMode === "individual" ? "25%" : "50%" }]}>
                            <Text style={cashFlowTotals.netFlow >= 0 ? styles.positive : styles.negative}>
                                {formatter.format(cashFlowTotals.netFlow)}
                            </Text>
                        </View>
                        {viewMode === "individual" && <View style={[styles.tableCol, { width: "50%" }]} />}
                    </View>
                </View>
                <View style={styles.note}>
                    <Text>Note:</Text>
                    <Text>• Positive numbers represent cash inflows</Text>
                    <Text>• Negative numbers represent cash outflows</Text>
                </View>
            </View>
        );
    };

    const renderPDFStockTable = (holdings: HoldingsSummary | undefined, viewMode: "consolidated" | "individual") => {
        if (!holdings || holdings.holdingsCount === 0) {
            return (
                <View style={styles.section}>
                    <Text style={styles.subHeader}>Current Stock Holdings</Text>
                    <Text>No holdings data available</Text>
                </View>
            );
        }

        const allHoldings = [...holdings.equityHoldings, ...holdings.debtHoldings];

        return (
            <View style={styles.section}>
                <Text style={styles.subHeader}>Current Stock Holdings</Text>
                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <View style={[styles.tableCol, { width: "15%" }]}><Text>Symbol</Text></View>
                        <View style={[styles.tableCol, { width: "10%" }]}><Text>Qty</Text></View>
                        <View style={[styles.tableCol, { width: "15%" }]}><Text>Avg Price</Text></View>
                        <View style={[styles.tableCol, { width: "15%" }]}><Text>LTP</Text></View>
                        <View style={[styles.tableCol, { width: "15%" }]}><Text>Current Value</Text></View>
                        <View style={[styles.tableCol, { width: "15%" }]}><Text>P&L</Text></View>
                        <View style={[styles.tableCol, { width: "15%" }]}><Text>P&L %</Text></View>
                        <View style={[styles.tableCol, { width: "15%" }]}><Text>Category</Text></View>
                    </View>
                    {allHoldings.map((holding, index) => (
                        <View key={index} style={styles.tableRow}>
                            <View style={[styles.tableCol, { width: "15%" }]}><Text>{holding.symbol} ({holding.exchange} • {holding.broker})</Text></View>
                            <View style={[styles.tableCol, { width: "10%" }]}><Text>{holding.quantity.toLocaleString()}</Text></View>
                            <View style={[styles.tableCol, { width: "15%" }]}><Text>₹{holding.avgPrice.toFixed(2)}</Text></View>
                            <View style={[styles.tableCol, { width: "15%" }]}><Text>₹{holding.ltp.toFixed(2)}</Text></View>
                            <View style={[styles.tableCol, { width: "15%" }]}><Text>{formatter.format(holding.valueAsOfToday)}</Text></View>
                            <View style={[styles.tableCol, { width: "15%" }]}><Text style={holding.pnlAmount >= 0 ? styles.positive : styles.negative}>{formatter.format(holding.pnlAmount)}</Text></View>
                            <View style={[styles.tableCol, { width: "15%" }]}><Text style={holding.percentPnl >= 0 ? styles.positive : styles.negative}>{holding.percentPnl.toFixed(2)}%</Text></View>
                            <View style={[styles.tableCol, { width: "15%" }]}><Text>{holding.debtEquity} ({holding.subCategory || 'Others'})</Text></View>
                        </View>
                    ))}
                </View>
                <View style={styles.section}>
                    <Text style={styles.subHeader}>Summary</Text>
                    <Text>Total Holdings: {holdings.holdingsCount}</Text>
                    <Text>Current Value: {formatter.format(holdings.totalCurrentValue)}</Text>
                    <Text>Buy Value: {formatter.format(holdings.totalBuyValue)}</Text>
                    <Text style={holdings.totalPnl >= 0 ? styles.positive : styles.negative}>
                        Total P&L: {formatter.format(holdings.totalPnl)} ({holdings.totalPnlPercent.toFixed(2)}%)
                    </Text>
                </View>
                {Object.keys(holdings.categoryBreakdown).length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.subHeader}>Category Breakdown</Text>
                        {Object.entries(holdings.categoryBreakdown).map(([category, data]) => (
                            <View key={category} style={styles.section}>
                                <Text>{category}</Text>
                                <Text>{data.count} holdings • {formatter.format(data.currentValue)}</Text>
                                <Text style={data.pnl >= 0 ? styles.positive : styles.negative}>P&L: {formatter.format(data.pnl)}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        );
    };

    const renderPDFStatsCards = (stats: Stats, accountType: string, broker: string | undefined, isTotalPortfolio: boolean, returnViewType: "percent" | "cash") => {
        const effectiveReturnViewType = isTotalPortfolio ? "cash" : returnViewType;
        const labels = accountType.toLowerCase() === 'managed_account' && broker?.toLowerCase() === 'jainam'
            ? {
                amountDeposited: 'Deposit Amount',
                currentExposure: 'Current Exposure',
                return: 'Return on Exposure',
                totalDividend: 'Total Dividend'
            }
            : {
                amountDeposited: 'Amount Invested',
                currentExposure: 'Current Portfolio Value',
                return: 'Returns',
                totalDividend: 'Total Dividend'
            };

        const statItems = [
            {
                name: labels.amountDeposited,
                value: `₹ ${parseFloat(stats.amountDeposited).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            },
            {
                name: labels.currentExposure,
                value: `₹ ${parseFloat(stats.currentExposure).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            },
            {
                name: labels.return,
                value: effectiveReturnViewType === "percent"
                    ? `${parseFloat(stats.return).toFixed(2)}%`
                    : `₹ ${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                change: effectiveReturnViewType === "cash"
                    ? parseFloat(stats.return) >= 0 ? `+${parseFloat(stats.return).toFixed(2)}%` : `${parseFloat(stats.return).toFixed(2)}%`
                    : parseFloat(stats.totalProfit) >= 0 ? `+₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `-₹${parseFloat(stats.totalProfit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                changeType: parseFloat(effectiveReturnViewType === "percent" ? stats.return : stats.totalProfit) >= 0 ? "positive" : "negative",
            },
        ];

        return (
            <View style={styles.section}>
                <Text style={styles.subHeader}>Portfolio Statistics</Text>
                {statItems.map((stat, index) => (
                    <View key={index} style={styles.section}>
                        <Text>{stat.name}: {stat.value}</Text>
                        {stat.change && (
                            <Text style={stat.changeType === "positive" ? styles.positive : styles.negative}>
                                Change: {stat.change}
                            </Text>
                        )}
                    </View>
                ))}
                {!isTotalPortfolio && (
                    <Text style={styles.note}>
                        Note: Returns above 1 year are annualised, returns below 1 year are absolute.
                    </Text>
                )}
            </View>
        );
    };

    const renderPDFRevenueChart = (equityCurve: { date: string; value: number }[], drawdownCurve: { date: string; value: number }[], trailingReturns: any, drawdown: string) => {
        return (
            <View style={styles.section}>
                <Text style={styles.subHeader}>Portfolio Performance & Drawdown</Text>
                <Text>Performance Data (Sample):</Text>
                {equityCurve.slice(0, 5).map((point, index) => (
                    <Text key={index}>{dateFormatter(point.date)}: {point.value.toFixed(2)}</Text>
                ))}
                <Text>Drawdown Data (Sample):</Text>
                {drawdownCurve.slice(0, 5).map((point, index) => (
                    <Text key={index}>{dateFormatter(point.date)}: {point.value.toFixed(2)}%</Text>
                ))}
                <Text>Trailing Returns:</Text>
                {Object.entries(trailingReturns).map(([key, value]) => (
                    <Text key={key}>{key}: {value}%</Text>
                ))}
                <Text>Current Drawdown: {drawdown}%</Text>
                <Text style={styles.note}>Note: Full chart not rendered in PDF. Refer to web interface for visualization.</Text>
            </View>
        );
    };

    const renderPDFPnlTable = (quarterlyPnl: QuarterlyPnlData, monthlyPnl: MonthlyPnlData, showOnlyQuarterlyCash: boolean, showPmsQawView: boolean) => {
        const displayType = showOnlyQuarterlyCash || showPmsQawView ? "cash" : "percent";
        const isPercentView = displayType === "percent" && !showOnlyQuarterlyCash && !showPmsQawView;
        const quarterlyYears = Object.keys(quarterlyPnl).sort((a, b) => parseInt(a) - parseInt(b));
        const monthlyYears = Object.keys(monthlyPnl).sort((a, b) => parseInt(a) - parseInt(b));
        const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        const formatDisplayValue = (value: string, isPercent: boolean) => {
            if (value === "-" || value === "" || value === undefined || value === null) return "-";
            const numValue = parseFloat(value);
            if (isNaN(numValue)) return "-";
            if (isPercent) {
                return numValue > 0 ? `+${numValue.toFixed(2)}%` : `${numValue.toFixed(2)}%`;
            } else {
                const absValue = Math.abs(numValue);
                const formattedValue = absValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return numValue >= 0 ? `+₹${formattedValue}` : `-₹${formattedValue}`;
            }
        };

        return (
            <View style={styles.section}>
                <Text style={styles.subHeader}>Quarterly Profit and Loss ({displayType === "percent" ? "%" : "₹"})</Text>
                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <View style={[styles.tableCol, { width: "16%" }]}><Text>Year</Text></View>
                        <View style={[styles.tableCol, { width: "16%" }]}><Text>Q1</Text></View>
                        <View style={[styles.tableCol, { width: "16%" }]}><Text>Q2</Text></View>
                        <View style={[styles.tableCol, { width: "16%" }]}><Text>Q3</Text></View>
                        <View style={[styles.tableCol, { width: "16%" }]}><Text>Q4</Text></View>
                        <View style={[styles.tableCol, { width: "20%" }]}><Text>Total</Text></View>
                    </View>
                    {quarterlyYears.map((year) => (
                        <View key={year} style={styles.tableRow}>
                            <View style={[styles.tableCol, { width: "16%" }]}><Text>{year}</Text></View>
                            {["q1", "q2", "q3", "q4", "total"].map((quarter) => {
                                const rawValue = (showOnlyQuarterlyCash || showPmsQawView || displayType === "cash")
                                    ? quarterlyPnl[year].cash[quarter as keyof typeof quarterlyPnl[string]["cash"]]
                                    : quarterlyPnl[year].percent[quarter as keyof typeof quarterlyPnl[string]["percent"]];
                                return (
                                    <View key={quarter} style={[styles.tableCol, { width: quarter === "total" ? "20%" : "16%" }]}>
                                        <Text style={parseFloat(rawValue) > 0 ? styles.positive : parseFloat(rawValue) < 0 ? styles.negative : {}}>{formatDisplayValue(rawValue, isPercentView)}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                    {quarterlyYears.length === 0 && <Text>No data available</Text>}
                </View>

                {!showOnlyQuarterlyCash && (
                    <View style={styles.section}>
                        <Text style={styles.subHeader}>Monthly Profit and Loss ({displayType === "percent" ? "%" : "₹"})</Text>
                        <View style={styles.table}>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <View style={[styles.tableCol, { width: "10%" }]}><Text>Year</Text></View>
                                {monthOrder.map((month) => (
                                    <View key={month} style={[styles.tableCol, { width: `${80 / 12}%` }]}><Text>{month.substring(0, 3)}</Text></View>
                                ))}
                                <View style={[styles.tableCol, { width: "10%" }]}><Text>Total</Text></View>
                            </View>
                            {monthlyYears.map((year) => (
                                <View key={year} style={styles.tableRow}>
                                    <View style={[styles.tableCol, { width: "10%" }]}><Text>{year}</Text></View>
                                    {monthOrder.map((month) => {
                                        const rawValue = isPercentView
                                            ? monthlyPnl[year]?.months[month]?.percent
                                            : monthlyPnl[year]?.months[month]?.cash;
                                        return (
                                            <View key={month} style={[styles.tableCol, { width: `${80 / 12}%` }]}>
                                                <Text style={parseFloat(rawValue) > 0 ? styles.positive : parseFloat(rawValue) < 0 ? styles.negative : {}}>
                                                    {formatDisplayValue(rawValue || "", isPercentView)}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    <View style={[styles.tableCol, { width: "10%" }]}>
                                        <Text style={monthlyPnl[year]?.totalCash >= 0 ? styles.positive : styles.negative}>
                                            {isPercentView
                                                ? monthlyPnl[year]?.totalPercent.toString() === "-"
                                                    ? "-%"
                                                    : monthlyPnl[year]?.totalPercent && monthlyPnl[year].totalPercent !== 0
                                                        ? monthlyPnl[year].totalPercent > 0
                                                            ? `+${monthlyPnl[year].totalPercent.toFixed(2)}%`
                                                            : `${monthlyPnl[year].totalPercent.toFixed(2)}%`
                                                        : "-"
                                                : monthlyPnl[year]?.totalCash.toString() === "-"
                                                    ? "₹-"
                                                    : monthlyPnl[year]?.totalCash && monthlyPnl[year].totalCash !== 0
                                                        ? monthlyPnl[year].totalCash >= 0
                                                            ? `+₹${Math.abs(monthlyPnl[year].totalCash).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                            : `-₹${Math.abs(monthlyPnl[year].totalCash).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                        : "-"}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                            {monthlyYears.length === 0 && <Text>No data available</Text>}
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const renderPDFSarlaContent = () => {
        if (!isSarla || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) return null;

        const strategyData = sarlaData[selectedStrategy];
        const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
        const filteredEquityCurve = filterEquityCurve(strategyData.data.equityCurve, strategyData.metadata?.filtersApplied?.startDate, strategyData.metadata?.lastUpdated);
        const lastDate = getLastDate(filteredEquityCurve, strategyData.metadata?.lastUpdated);
        const isTotalPortfolio = selectedStrategy === "Total Portfolio";
        const isActive = strategyData.metadata.isActive;

        return (
            <View style={styles.section}>
                <Text style={styles.header}>{selectedStrategy} {!isActive ? "(Inactive)" : ""}</Text>
                {renderPDFStatsCards(convertedStats, "sarla", "Sarla", isTotalPortfolio, returnViewType)}
                {renderPDFRevenueChart(filteredEquityCurve, strategyData.data.drawdownCurve, convertedStats.trailingReturns, convertedStats.drawdown)}
                {renderPDFPnlTable(convertedStats.quarterlyPnl, convertedStats.monthlyPnl, selectedStrategy === "Total Portfolio", CASH_PERCENT_STRATS_SARLA.includes(selectedStrategy))}
                {renderPDFCashFlowsTable()}
                {renderPDFStockTable(convertedStats.holdings, viewMode)}
                {!isActive && <Text style={styles.note}>Note: This strategy is inactive. Data may not be updated regularly.</Text>}
            </View>
        );
    };

    const renderPDFSatidhamContent = () => {
        if (!isSatidham || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) return null;

        const strategyData = sarlaData[selectedStrategy];
        const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
        const filteredEquityCurve = filterEquityCurve(strategyData.data.equityCurve, strategyData.metadata?.filtersApplied?.startDate, strategyData.metadata?.lastUpdated);
        const lastDate = getLastDate(filteredEquityCurve, strategyData.metadata?.lastUpdated);
        const isTotalPortfolio = selectedStrategy === "Total Portfolio";
        const isActive = strategyData.metadata.isActive;

        return (
            <View style={styles.section}>
                <Text style={styles.header}>{selectedStrategy} {!isActive ? "(Inactive)" : ""}</Text>
                {renderPDFStatsCards(convertedStats, "sarla", "Sarla", isTotalPortfolio, returnViewType)}
                {renderPDFRevenueChart(filteredEquityCurve, strategyData.data.drawdownCurve, convertedStats.trailingReturns, convertedStats.drawdown)}
                {renderPDFPnlTable(convertedStats.quarterlyPnl, convertedStats.monthlyPnl, selectedStrategy === "Total Portfolio", CASH_PERCENT_STRATS_SATIDHAM.includes(selectedStrategy))}
                {renderPDFCashFlowsTable()}
                {renderPDFStockTable(convertedStats.holdings, viewMode)}
                {!isActive && <Text style={styles.note}>Note: This strategy is inactive. Data may not be updated regularly.</Text>}
            </View>
        );
    };

    const CASH_PERCENT_STRATS_SARLA = ["Scheme A", "Scheme C", "Scheme D", "Scheme E", "Scheme F", "Scheme QAW", "Scheme B (inactive)"];
    const CASH_STRATS_SARLA = "Total Portfolio";
    const CASH_PERCENT_STRATS_SATIDHAM = ["Scheme B", "Scheme A", "Scheme A (Old)"];
    const CASH_STRATS_SATIDHAM = "Total Portfolio";

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.section}>
                    <Text style={styles.header}>{getGreeting()}, {session?.user?.name || "User"}</Text>
                    {currentMetadata && (
                        <View>
                            <Text>Inception Date: {currentMetadata.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A"}</Text>
                            <Text>Data as of: {currentMetadata.dataAsOfDate ? dateFormatter(currentMetadata.dataAsOfDate) : "N/A"}</Text>
                        </View>
                    )}
                    {currentMetadata?.strategyName && <Text style={styles.subHeader}>{currentMetadata.strategyName} {(isSarla || isSatidham) && !currentMetadata.isActive ? "(Inactive)" : ""}</Text>}
                </View>

                {(isSarla || isSatidham) ? (
                    isSarla ? renderPDFSarlaContent() : renderPDFSatidhamContent()
                ) : (
                    <View>
                        {Array.isArray(stats) ? (
                            stats.map((item, index) => {
                                const convertedStats = isPmsStats(item.stats) ? convertPmsStatsToStats(item.stats) : item.stats;
                                const filteredEquityCurve = filterEquityCurve(item.stats.equityCurve, item.metadata.filtersApplied?.startDate, item.metadata.lastUpdated);
                                return (
                                    <View key={index} style={styles.section}>
                                        <Text style={styles.header}>{item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker}) {!item.metadata.isActive ? " (Inactive)" : ""}</Text>
                                        <Text>Strategy: {item.metadata.strategyName || "Unknown Strategy"}</Text>
                                        {renderPDFStatsCards(convertedStats, item.metadata.account_type, item.metadata.broker, false, returnViewType)}
                                        {renderPDFRevenueChart(filteredEquityCurve, item.stats.drawdownCurve, convertedStats.trailingReturns, convertedStats.drawdown)}
                                        {renderPDFPnlTable(convertedStats.quarterlyPnl, convertedStats.monthlyPnl, false, false)}
                                        {renderPDFCashFlowsTable()}
                                        {renderPDFStockTable(convertedStats.holdings, viewMode)}
                                        {!item.metadata.isActive && <Text style={styles.note}>Note: This account is inactive. Data may not be updated regularly.</Text>}
                                    </View>
                                );
                            })
                        ) : (
                            <>
                                {(() => {
                                    const convertedStats = isPmsStats(stats) ? convertPmsStatsToStats(stats) : stats;
                                    const filteredEquityCurve = filterEquityCurve(stats.equityCurve, metadata?.filtersApplied.startDate, metadata?.lastUpdated);
                                    const accountType = accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown";
                                    const broker = accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown";
                                    return (
                                        <View style={styles.section}>
                                            {renderPDFStatsCards(convertedStats, accountType, broker, false, returnViewType)}
                                            {renderPDFRevenueChart(filteredEquityCurve, stats.drawdownCurve, convertedStats.trailingReturns, convertedStats.drawdown)}
                                            {renderPDFStockTable(convertedStats.holdings, viewMode)}
                                            {renderPDFPnlTable(convertedStats.quarterlyPnl, convertedStats.monthlyPnl, false, false)}
                                            {renderPDFCashFlowsTable()}
                                            {metadata && !metadata.isActive && <Text style={styles.note}>Note: This strategy is inactive. Data may not be updated regularly.</Text>}
                                        </View>
                                    );
                                })()}
                            </>
                        )}
                    </View>
                )}
            </Page>
        </Document>
    );
};
const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const dateFormatter = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
};

const getGreeting = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const hours = istTime.getUTCHours();

    if (hours >= 0 && hours < 12) {
        return "Good Morning";
    } else if (hours >= 12 && hours < 17) {
        return "Good Afternoon";
    } else {
        return "Good Evening";
    }
};
// Main Component for the PDF Download Page
export default function PortfolioPDF() {
    const { data: session, status } = useSession();
    const isSarla = session?.user?.icode === "QUS0007";
    const isSatidham = session?.user?.icode === "QUS0010";
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountCode = searchParams.get("accountCode") || "AC5";
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"consolidated" | "individual">("consolidated");
    const [stats, setStats] = useState<(Stats | PmsStats) | { stats: Stats | PmsStats; metadata: Account & { strategyName: string; isActive: boolean } }[] | null>(null);
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sarlaData, setSarlaData] = useState<SarlaApiResponse | null>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
    const [availableStrategies, setAvailableStrategies] = useState<string[]>([]);
    const [returnViewType, setReturnViewType] = useState<"percent" | "cash">("percent");
    const [pdfReady, setPdfReady] = useState(false);
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
            return;
        }

        if (status === "authenticated") {
            if (isSarla) {
                const fetchSarlaData = async () => {
                    try {
                        const res = await fetch(`/api/sarla-api?qcode=QAC00041&accountCode=${accountCode}`, { credentials: "include" });
                        if (!res.ok) {
                            const errorData = await res.json();
                            throw new Error(errorData.error || `Failed to load Sarla data for accountCode ${accountCode}`);
                        }
                        const data: SarlaApiResponse = await res.json();
                        setSarlaData(data);
                        const strategies = Object.keys(data);
                        setAvailableStrategies(strategies);
                        if (strategies.length > 0) {
                            setSelectedStrategy(strategies[0]);
                        }
                        setIsLoading(false);
                        setPdfReady(true);
                    } catch (err) {
                        setError(err instanceof Error ? err.message : `An unexpected error occurred for accountCode ${accountCode}`);
                        setIsLoading(false);
                    }
                };
                fetchSarlaData();
            } else if (isSatidham) {
                const fetchSatidhamData = async () => {
                    try {
                        const res = await fetch(`/api/sarla-api?qcode=QAC00046&accountCode=${accountCode}`, { credentials: "include" });
                        if (!res.ok) {
                            const errorData = await res.json();
                            throw new Error(errorData.error || `Failed to load Satidham data for accountCode ${accountCode}`);
                        }
                        const data: SarlaApiResponse = await res.json();
                        setSarlaData(data);
                        const strategies = Object.keys(data);
                        setAvailableStrategies(strategies);
                        if (strategies.length > 0) {
                            setSelectedStrategy(strategies[0]);
                        }
                        setIsLoading(false);
                        setPdfReady(true);
                    } catch (err) {
                        setError(err instanceof Error ? err.message : `An unexpected error occurred for accountCode ${accountCode}`);
                        setIsLoading(false);
                    }
                };
                fetchSatidhamData();
            } else {
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
                        setIsLoading(false);
                    } catch (err) {
                        setError(err instanceof Error ? err.message : "An unexpected error occurred");
                        setIsLoading(false);
                    }
                };
                fetchAccounts();
            }
        }
    }, [status, router, isSarla, isSatidham, accountCode]);

    useEffect(() => {
        if (selectedAccount && status === "authenticated" && !isSarla && !isSatidham) {
            const fetchAccountData = async () => {
                setIsLoading(true);
                setError(null);
                setPdfReady(false);
                try {
                    const selectedAccountData = accounts.find((acc) => acc.qcode === selectedAccount);
                    if (!selectedAccountData) {
                        throw new Error("Selected account not found");
                    }
                    const endpoint =
                        selectedAccountData.account_type === "pms"
                            ? `/api/pms-data?qcode=${selectedAccount}&viewMode=${viewMode}&accountCode=${accountCode}`
                            : `/api/portfolio?viewMode=${viewMode}${selectedAccount !== "all" ? `&qcode=${selectedAccount}` : ""}&accountCode=${accountCode}`;
                    const res = await fetch(endpoint, { credentials: "include" });
                    if (!res.ok) {
                        const errorData = await res.json();
                        throw new Error(errorData.error || `Failed to load data for account ${selectedAccount} with accountCode ${accountCode}`);
                    }
                    const response = await res.json();
                    let statsData: Stats | PmsStats | Array<any>;
                    let metadataData: Metadata | null = null;

                    if ('data' in response && response.data !== undefined) {
                        if (viewMode === "individual" && Array.isArray(response.data)) {
                            statsData = response.data;
                            metadataData = null;
                        } else {
                            statsData = response.data as Stats | PmsStats;
                            metadataData = response.metadata || null;
                        }
                    } else {
                        if (selectedAccountData.account_type === "pms") {
                            const pmsData = response as any;
                            if (pmsData.cashInOut && !pmsData.cashFlows) {
                                if (pmsData.cashInOut.transactions) {
                                    pmsData.cashFlows = pmsData.cashInOut.transactions.map((tx: any) => ({
                                        date: tx.date,
                                        amount: parseFloat(tx.amount)
                                    }));
                                } else {
                                    pmsData.cashFlows = [];
                                }
                            }
                            if (!pmsData.cashFlows) {
                                pmsData.cashFlows = [];
                            }
                            statsData = pmsData as PmsStats;
                            metadataData = {
                                icode: selectedAccount,
                                accountCount: 1,
                                inceptionDate: null,
                                dataAsOfDate: null,
                                lastUpdated: new Date().toISOString(),
                                strategyName: selectedAccountData.account_name || "PMS Portfolio",
                                filtersApplied: {
                                    accountType: selectedAccountData.account_type,
                                    broker: selectedAccountData.broker,
                                    startDate: null,
                                    endDate: null
                                },
                                isActive: true
                            };
                            if (pmsData.equityCurve && pmsData.equityCurve.length > 0) {
                                const sortedCurve = [...pmsData.equityCurve].sort(
                                    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                                );
                                metadataData.inceptionDate = sortedCurve[0].date;
                                metadataData.dataAsOfDate = sortedCurve[sortedCurve.length - 1].date;
                            }
                        } else {
                            if (viewMode === "individual" && Array.isArray(response)) {
                                statsData = response;
                                metadataData = null;
                            } else {
                                statsData = response as Stats;
                                metadataData = {
                                    icode: selectedAccount,
                                    accountCount: 1,
                                    inceptionDate: null,
                                    dataAsOfDate: null,
                                    lastUpdated: new Date().toISOString(),
                                    strategyName: selectedAccountData.account_name || "Portfolio",
                                    filtersApplied: {
                                        accountType: selectedAccountData.account_type,
                                        broker: selectedAccountData.broker,
                                        startDate: null,
                                        endDate: null
                                    },
                                    isActive: true
                                };
                            }
                        }
                    }
                    if (statsData) {
                        setStats(statsData);
                        setMetadata(metadataData);
                        setPdfReady(true);
                    } else {
                        throw new Error("No valid data received from API");
                    }
                    setIsLoading(false);
                } catch (err) {
                    console.error("Error in fetchAccountData:", err);
                    setError(err instanceof Error ? err.message : `An unexpected error occurred for accountCode ${accountCode}`);
                    setIsLoading(false);
                }
            };
            fetchAccountData();
        }
    }, [selectedAccount, accounts, status, viewMode, isSarla, isSatidham, accountCode]);



    const isPdfDataReady = () => {
        if (isSarla || isSatidham) {
            return pdfReady && sarlaData && selectedStrategy;
        }
        return pdfReady && stats && (viewMode === "individual" || metadata);
    };

    if (status === "loading" || isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading portfolio data...</p>
                </div>
            </div>
        );
    }


    // if (status === "loading" || isLoading) {
    //     return <div className="flex items-center justify-center h-screen">Loading...</div>;
    // }

    if (error || !session?.user) {
        return <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">{error || "Failed to load user data"}</div>;
    }

    if (!isSarla && !isSatidham && accounts.length === 0) {
        return <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">No accounts found for this user.</div>;
    }

    if ((isSarla || isSatidham) && (!sarlaData || availableStrategies.length === 0)) {
        return <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">No strategy data found for {isSarla ? "Sarla" : "Satidham"} user.</div>;
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
                    Portfolio PDF Generator
                </h1>

                {/* Status indicator */}
                <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-3 ${isPdfDataReady() ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            {isPdfDataReady() ? 'Data loaded successfully - PDF ready to generate' : 'Loading data for PDF generation...'}
                        </span>
                    </div>
                </div>

                {/* PDF Download Section */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        {isPdfDataReady() ? (
                            <PDFDownloadLink
                                document={
                                    <PortfolioPDFDocument
                                        isSarla={isSarla}
                                        isSatidham={isSatidham}
                                        session={session}
                                        stats={stats}
                                        metadata={metadata}
                                        sarlaData={sarlaData}
                                        selectedStrategy={selectedStrategy}
                                        viewMode={viewMode}
                                        returnViewType={returnViewType}
                                        accounts={accounts}
                                        selectedAccount={selectedAccount}
                                    />
                                }
                                fileName={`portfolio-report-${new Date().toISOString().split('T')[0]}.pdf`}
                                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                            >
                                {({ loading, url, error }) => {
                                    if (loading) {
                                        return (
                                            <div className="flex items-center">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                Generating PDF...
                                            </div>
                                        );
                                    }
                                    if (error) {
                                        return <span className="text-red-600">Error generating PDF</span>;
                                    }
                                    return (
                                        <div className="flex items-center">
                                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Download Portfolio PDF
                                        </div>
                                    );
                                }}
                            </PDFDownloadLink>
                        ) : (
                            <button
                                disabled
                                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-400 cursor-not-allowed"
                            >
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Preparing PDF...
                            </button>
                        )}
                    </div>

                    {/* Information Panel */}
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                    PDF Generation Notes
                                </h3>
                                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Charts and graphs are not included in the PDF version</li>
                                        <li>All statistical data and tables are rendered as formatted text</li>
                                        <li>For full visualization experience, use the main portfolio dashboard</li>
                                        <li>PDF generation may take a few seconds depending on data size</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Portfolio Summary (if data is ready) */}
                    {isPdfDataReady() && (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mt-6">
                            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                                Portfolio Summary
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                {isSarla || isSatidham ? (
                                    <>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">User Type:</span>
                                            <p className="font-medium">{isSarla ? 'Sarla' : 'Satidham'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Strategies:</span>
                                            <p className="font-medium">{availableStrategies.length}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Selected:</span>
                                            <p className="font-medium">{selectedStrategy}</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">View Mode:</span>
                                            <p className="font-medium capitalize">{viewMode}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Accounts:</span>
                                            <p className="font-medium">{accounts.length}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Return View:</span>
                                            <p className="font-medium capitalize">{returnViewType}</p>
                                        </div>
                                    </>
                                )}
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Generated:</span>
                                    <p className="font-medium">{new Date().toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}