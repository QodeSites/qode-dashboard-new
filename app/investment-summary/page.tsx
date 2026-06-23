"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../dashboard/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Download } from "lucide-react";
import type { InvestmentSummaryData } from "@/app/lib/parse-investment-pdf";

const formatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmt(n: number): string {
  if (n < 0) return `-${formatter.format(Math.abs(n))}`;
  return formatter.format(n);
}

function AmountCell({ value }: { value: number }) {
  return (
    <TableCell
      className={`px-4 py-2 text-right text-xs font-medium tabular-nums ${
        value < 0 ? "text-[#dc2626]" : "text-card-text"
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
  rows: { label: string; value: number; isNegative?: boolean }[];
}) {
  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm sm:text-base text-card-text">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} className="border-b border-[#e5e7eb]">
                <TableCell className="px-4 py-2 text-xs text-card-text-secondary">{row.label}</TableCell>
                <TableCell
                  className={`px-4 py-2 text-xs font-medium text-right tabular-nums ${
                    row.value < 0 ? "text-[#dc2626]" : "text-card-text"
                  }`}
                >
                  {fmt(row.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function HoldingsTable({
  title,
  rows,
  nameCol = "Name",
}: {
  title: string;
  rows: { name: string; type: string; amount: number }[];
  nameCol?: string;
}) {
  if (!rows.length) return null;
  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm sm:text-base text-card-text">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow className="bg-black/5 hover:bg-[#e5e7eb] border-b border-[#e5e7eb]">
                <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">{nameCol}</TableHead>
                <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Type</TableHead>
                <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase text-right">Amount (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} className="border-b border-[#e5e7eb]">
                  <TableCell className="px-4 py-2 text-xs text-card-text">{row.name}</TableCell>
                  <TableCell className="px-4 py-2 text-xs text-card-text-secondary">{row.type}</TableCell>
                  <AmountCell value={row.amount} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InvestmentSummaryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<InvestmentSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/investment-summary")
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
  }, [status]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/download-report");
      if (!res.ok) {
        alert("Report not available for download.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const nameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = nameMatch?.[1] || "Investment_Summary.pdf";
      a.click();
      URL.revokeObjectURL(url);
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
          <p className="text-card-text-secondary text-sm">Loading Investment Summary...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="bg-red-100 rounded-lg p-4 text-red-600 text-sm">{error}</div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-card-text">Investment Summary</h1>
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

  const hasEquityHoldings = data.currentEquityHoldings.length > 0;
  const hasMfHoldings = data.currentMfHoldings.length > 0;
  const hasHistoricalEquity = data.historicalEquityHoldings.length > 0;
  const hasHistoricalMf = data.historicalMfHoldings.length > 0;
  const hasAnyHoldings = hasEquityHoldings || hasMfHoldings || hasHistoricalEquity || hasHistoricalMf;

  const hasEquityTx = data.equityTransactions.length > 0;
  const hasCashTx = data.cashTransactions.length > 0;
  const hasMfTx = data.mfTransactions.length > 0;
  const hasAnyTx = hasEquityTx || hasCashTx || hasMfTx;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-card-text">{data.clientName}</h1>
            <p className="text-xs text-card-text-secondary mt-1">
              Investment Summary &nbsp;·&nbsp; Data as of: {data.dataAsOfDate}
              {data.generatedDate && (
                <span> &nbsp;·&nbsp; Generated: {data.generatedDate}</span>
              )}
            </p>
          </div>
          <Button
            onClick={handleDownload}
            disabled={downloading}
            className="h-9 px-4 text-sm font-medium bg-logo-green text-button-text hover:bg-logo-green/90 self-start sm:self-auto"
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
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

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SectionCard
                title="Amount Invested"
                rows={[
                  { label: "Holdings", value: data.amountInvested.holdings },
                  { label: "Cash", value: data.amountInvested.cash },
                  { label: "Total", value: data.amountInvested.total },
                ]}
              />
              <SectionCard
                title="Cash Investment Summary"
                rows={[
                  { label: "Total Cash Added", value: data.cashInvestmentSummary.totalCashAdded },
                  { label: "Profits & Capital Withdrawn", value: data.cashInvestmentSummary.profitsAndCapitalWithdrawn },
                  { label: "Net Cash Balance", value: data.cashInvestmentSummary.netCashBalance },
                ]}
              />
              <SectionCard
                title="Holdings Investment Summary"
                rows={[
                  { label: "Total Holdings Added", value: data.holdingsInvestmentSummary.totalHoldingsAdded },
                  { label: "Total Holdings Withdrawn", value: data.holdingsInvestmentSummary.totalHoldingsWithdrawn },
                  { label: "Net Holding Balance", value: data.holdingsInvestmentSummary.netHoldingBalance },
                ]}
              />
            </div>

            {/* Current Account Summary */}
            {data.currentAccountSummary.length > 0 && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-sm sm:text-base text-card-text">
                    Current Account Summary — Zerodha
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-black/5 hover:bg-[#e5e7eb] border-b border-[#e5e7eb]">
                          <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Particulars</TableHead>
                          <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase text-right">Amount (₹)</TableHead>
                          <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.currentAccountSummary.map((row, i) => (
                          <TableRow
                            key={i}
                            className={`border-b border-[#e5e7eb] ${
                              row.particulars.toLowerCase().includes("account value") ? "font-semibold" : ""
                            }`}
                          >
                            <TableCell className="px-4 py-2 text-xs text-card-text">{row.particulars}</TableCell>
                            <AmountCell value={row.amount} />
                            <TableCell className="px-4 py-2 text-xs text-right text-card-text-secondary tabular-nums">
                              {row.percent > 0 ? `${row.percent.toFixed(2)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Profit Redeployment Summary */}
            {data.profitRedeployment.length > 0 && (
              <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-sm sm:text-base text-card-text">
                    Profit Redeployment Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-black/5 hover:bg-[#e5e7eb] border-b border-[#e5e7eb]">
                          <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Strategy</TableHead>
                          <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase text-right">Profits (₹)</TableHead>
                          <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.profitRedeployment.map((row, i) =>
                          row.isHeader ? (
                            <TableRow key={i} className="bg-black/5 border-b border-[#e5e7eb]">
                              <TableCell colSpan={3} className="px-4 py-2 text-xs font-semibold text-card-text uppercase">
                                {row.strategy}
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={i} className="border-b border-[#e5e7eb]">
                              <TableCell className="px-4 py-2 text-xs text-card-text font-medium">{row.strategy}</TableCell>
                              <AmountCell value={row.profits} />
                              <TableCell className="px-4 py-2 text-xs text-card-text-secondary">{row.note}</TableCell>
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
              <HoldingsTable
                title="Current Equity Holdings"
                rows={data.currentEquityHoldings}
                nameCol="Stock Name"
              />
              <HoldingsTable
                title="Current MF Holdings"
                rows={data.currentMfHoldings}
                nameCol="Fund Name"
              />
              <HoldingsTable
                title="Historical Equity Holdings"
                rows={data.historicalEquityHoldings}
                nameCol="Stock Name"
              />
              <HoldingsTable
                title="Historical MF Holdings"
                rows={data.historicalMfHoldings}
                nameCol="Fund Name"
              />
            </TabsContent>
          )}

          {/* Transactions Tab */}
          {hasAnyTx && (
            <TabsContent value="transactions" className="mt-4 space-y-4">
              {hasEquityTx && (
                <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm sm:text-base text-card-text">Equity Transactions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table className="min-w-full">
                        <TableHeader>
                          <TableRow className="bg-black/5 hover:bg-[#e5e7eb] border-b border-[#e5e7eb]">
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Particulars</TableHead>
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Date</TableHead>
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase text-right">Amount (₹)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.equityTransactions.map((tx, i) => (
                            <TableRow key={i} className="border-b border-[#e5e7eb]">
                              <TableCell className="px-4 py-2 text-xs text-card-text">{tx.particulars}</TableCell>
                              <TableCell className="px-4 py-2 text-xs text-card-text-secondary whitespace-nowrap">{tx.date}</TableCell>
                              <AmountCell value={tx.amount} />
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {hasCashTx && (
                <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm sm:text-base text-card-text">Cash Transactions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table className="min-w-full">
                        <TableHeader>
                          <TableRow className="bg-black/5 hover:bg-[#e5e7eb] border-b border-[#e5e7eb]">
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Date</TableHead>
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Type</TableHead>
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Strategy</TableHead>
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase text-right">Amount (₹)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.cashTransactions.map((tx, i) => (
                            <TableRow key={i} className="border-b border-[#e5e7eb]">
                              <TableCell className="px-4 py-2 text-xs text-card-text-secondary whitespace-nowrap">{tx.date}</TableCell>
                              <TableCell className="px-4 py-2 text-xs text-card-text">{tx.transactionType}</TableCell>
                              <TableCell className="px-4 py-2 text-xs text-card-text-secondary">{tx.strategy}</TableCell>
                              <AmountCell value={tx.amount} />
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {hasMfTx && (
                <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm sm:text-base text-card-text">MF Transactions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table className="min-w-full">
                        <TableHeader>
                          <TableRow className="bg-black/5 hover:bg-[#e5e7eb] border-b border-[#e5e7eb]">
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Particulars</TableHead>
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase">Date</TableHead>
                            <TableHead className="px-4 py-2 text-xs font-medium text-card-text uppercase text-right">Amount (₹)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.mfTransactions.map((tx, i) => (
                            <TableRow key={i} className="border-b border-[#e5e7eb]">
                              <TableCell className="px-4 py-2 text-xs text-card-text">{tx.particulars}</TableCell>
                              <TableCell className="px-4 py-2 text-xs text-card-text-secondary whitespace-nowrap">{tx.date}</TableCell>
                              <AmountCell value={tx.amount} />
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
