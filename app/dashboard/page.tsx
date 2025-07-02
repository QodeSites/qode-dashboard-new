"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { TrailingReturnsTable } from "@/components/trailing-returns-table";
import { PnlTable } from "@/components/PnlTable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DashboardLayout } from "@/app/dashboard/layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Interfaces for stats
interface Stats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: {
    tenDays: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
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
      totalPercent: number;
      totalCash: number;
      totalCapitalInOut: number;
    };
  };
  cashInOut: { transactions: { date: string; amount: string }[]; total: number };
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
    tenDays: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    fiveYears: string;
    sinceInception: string;
    MDD: string;
    currentDD: string;
  };
  cashInOut: { transactions: { date: string; amount: string }[]; total: number };
}

// Interface for account data
interface Account {
  qcode: string;
  account_name: string;
  account_type: string;
  broker: string;
}

// Indian currency formatter
const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Date formatter for DD-MM-YYYY
const dateFormatter = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export default function AccountsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | PmsStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      // Fetch all accounts for the user
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
            setSelectedAccount(data[0].qcode); // Select the first account by default
          }
          setIsLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An unexpected error occurred");
          setIsLoading(false);
        }
      };

      fetchAccounts();
    }
  }, [status, router]);

  console.log("Accounts:", accounts);

  useEffect(() => {
    if (selectedAccount && status === "authenticated") {
      // Fetch data for the selected account
      const fetchAccountData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const selectedAccountData = accounts.find((acc) => acc.qcode === selectedAccount);
          if (!selectedAccountData) {
            throw new Error("Selected account not found");
          }

          const endpoint = selectedAccountData.account_type === "pms" ? `/api/pms-data?qcode=${selectedAccount}` : "/api/dashboard/stats";
          const res = await fetch(endpoint, { credentials: "include" });
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || `Failed to load data for account ${selectedAccount}`);
          }
          const data = await res.json();

          // Set stats directly from API response
          setStats(data as Stats | PmsStats);
          setIsLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An unexpected error occurred");
          setIsLoading(false);
        }
      };

      fetchAccountData();
    }
  }, [selectedAccount, accounts, status]);

  const renderCashInOutTable = () => {
    if (!stats?.cashInOut?.transactions?.length) {
      return (
        <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
          <CardHeader>
            <CardTitle className="text-card-text">Cash In/Out (₹)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-3 px-4 text-gray-900 dark:text-gray-100">
              No cash in/out data available
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
        <CardHeader>
          <CardTitle className="text-card-text">Cash In/Out (₹)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-none border-b border-gray-200 dark:border-gray-700">
                <TableHead className="text-left text-gray-900 dark:text-gray-100">Date</TableHead>
                <TableHead className="text-right text-gray-900 dark:text-gray-100">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.cashInOut.transactions.map((transaction, index) => (
                <TableRow key={index} className="border-b border-gray-200 dark:border-gray-700">
                  <TableCell className="text-left text-gray-900 dark:text-gray-100">
                    {dateFormatter(transaction.date)}
                  </TableCell>
                  <TableCell className="text-right text-gray-900 dark:text-gray-100">
                    {formatter.format(parseFloat(transaction.amount))}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-b border-gray-200 dark:border-gray-700">
                <TableCell className="text-left font-semibold text-gray-900 dark:text-gray-100">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatter.format(stats.cashInOut.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  if (status === "loading" || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">Loading...</div>
      </DashboardLayout>
    );
  }

  if (error || !session?.user) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
          {error || "Failed to load user data"}
        </div>
      </DashboardLayout>
    );
  }

  if (accounts.length === 0) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">
          No accounts found for this user.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="sm:p-2 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-card-text font-heading-bold">
              Welcome, {session?.user?.name || "User"}
            </h1>
            <p className="mt-2 text-card-text-secondary">
              Select an account to view its performance details.
            </p>
          </div>
        </div>

        <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
          <CardHeader>
            <CardTitle className="text-card-text text-md">Select Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedAccount || ""}
              onValueChange={setSelectedAccount}
            >
              <SelectTrigger className="w-full max-w-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-gray-500 dark:focus:ring-gray-400">
                <SelectValue placeholder="Select an account" className="text-gray-900 dark:text-gray-100" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                {accounts.map((account) => (
                  <SelectItem
                    key={account.qcode}
                    value={account.qcode}
                    className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700"
                  >
                    {account.account_name} ({account.account_type.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {stats && (
          <div className="space-y-6">
            <StatsCards
              stats={
                stats.totalPortfolioValue
                  ? {
                    amountDeposited: stats.totalPortfolioValue,
                    currentExposure: stats.totalPortfolioValue,
                    return: stats.cumulativeReturn,
                    totalProfit: stats.totalPnl,
                    trailingReturns: {
                      tenDays: (stats as PmsStats).trailingReturns.tenDays,
                      oneMonth: (stats as PmsStats).trailingReturns.oneMonth,
                      threeMonths: (stats as PmsStats).trailingReturns.threeMonths,
                      sixMonths: (stats as PmsStats).trailingReturns.sixMonths,
                      oneYear: (stats as PmsStats).trailingReturns.oneYear,
                      twoYears: (stats as PmsStats).trailingReturns.twoYears,
                      fiveYears: (stats as PmsStats).trailingReturns.fiveYears,
                      sinceInception: (stats as PmsStats).trailingReturns.sinceInception,
                    },
                    drawdown: stats.maxDrawdown,
                    equityCurve: stats.equityCurve,
                    drawdownCurve: stats.drawdownCurve,
                    quarterlyPnl: stats.quarterlyPnl,
                    monthlyPnl: stats.monthlyPnl,
                    cashInOut: stats.cashInOut,
                  }
                  : stats
              }
              accountType={
                accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"
              }
              broker={accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"}
            />
            <TrailingReturnsTable
              trailingReturns={
                stats.totalPortfolioValue
                  ? {
                    tenDays: (stats as PmsStats).trailingReturns.tenDays,
                    oneMonth: (stats as PmsStats).trailingReturns.oneMonth,
                    threeMonths: (stats as PmsStats).trailingReturns.threeMonths,
                    sixMonths: (stats as PmsStats).trailingReturns.sixMonths,
                    oneYear: (stats as PmsStats).trailingReturns.oneYear,
                    twoYears: (stats as PmsStats).trailingReturns.twoYears,
                    fiveYears: (stats as PmsStats).trailingReturns.fiveYears,
                    sinceInception: (stats as PmsStats).trailingReturns.sinceInception,
                  }
                  : (stats as Stats).trailingReturns
              }
              drawdown={stats.maxDrawdown || stats.drawdown}
              equityCurve={stats.equityCurve} // Add equityCurve prop
            />
            <RevenueChart equityCurve={stats.equityCurve} drawdownCurve={stats.drawdownCurve} />

            <PnlTable quarterlyPnl={stats.quarterlyPnl} monthlyPnl={stats.monthlyPnl} />
            {renderCashInOutTable()}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}