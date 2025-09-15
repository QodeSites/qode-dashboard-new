"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { PnlTable } from "@/components/PnlTable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StockTable from "@/components/StockTable";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  holdings?: HoldingsSummary;
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

function isPmsStats(stats: Stats | PmsStats): stats is PmsStats {
  return "totalPortfolioValue" in stats;
}

function convertPmsStatsToStats(pmsStats: PmsStats): Stats {
  const amountDeposited = pmsStats.cashFlows
    .filter((flow) => flow.amount > 0)
    .reduce((sum, flow) => sum + flow.amount, 0);

  return {
    amountDeposited: amountDeposited.toFixed(2),
    currentExposure: pmsStats.totalPortfolioValue,
    return: pmsStats.cumulativeReturn,
    totalProfit: pmsStats.totalPnl,
    trailingReturns: {
      fiveDays: pmsStats.trailingReturns.fiveDays,
      tenDays: pmsStats.trailingReturns.tenDays,
      fifteenDays: pmsStats.trailingReturns.oneMonth,
      oneMonth: pmsStats.trailingReturns.oneMonth,
      threeMonths: pmsStats.trailingReturns.threeMonths,
      sixMonths: pmsStats.trailingReturns.sixMonths,
      oneYear: pmsStats.trailingReturns.oneYear,
      twoYears: pmsStats.trailingReturns.twoYears,
      fiveYears: pmsStats.trailingReturns.fiveYears,
      sinceInception: pmsStats.trailingReturns.sinceInception,
      MDD: pmsStats.trailingReturns.MDD,
      currentDD: pmsStats.trailingReturns.currentDD,
    },
    drawdown: pmsStats.maxDrawdown,
    equityCurve: pmsStats.equityCurve,
    drawdownCurve: pmsStats.drawdownCurve,
    quarterlyPnl: Object.keys(pmsStats.quarterlyPnl).reduce((acc, year) => {
      acc[year] = {
        ...pmsStats.quarterlyPnl[year],
        yearCash: pmsStats.quarterlyPnl[year].yearCash || pmsStats.quarterlyPnl[year].cash.total,
      };
      return acc;
    }, {} as Stats["quarterlyPnl"]),
    monthlyPnl: Object.keys(pmsStats.monthlyPnl).reduce((acc, year) => {
      const yearData = pmsStats.monthlyPnl[year];
      acc[year] = {
        ...yearData,
        months: Object.keys(yearData.months).reduce((monthAcc, month) => {
          monthAcc[month] = {
            ...yearData.months[month],
            capitalInOut: yearData.months[month].capitalInOut || "0",
          };
          return monthAcc;
        }, {} as { [month: string]: { percent: string; cash: string; capitalInOut: string } }),
        totalCapitalInOut: yearData.totalCapitalInOut || 0,
      };
      return acc;
    }, {} as Stats["monthlyPnl"]),
    cashFlows: pmsStats.cashFlows,
  };
}

function filterEquityCurve(equityCurve: { date: string; value: number }[], startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return equityCurve;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return equityCurve.filter((entry) => {
    const entryDate = new Date(entry.date);
    return entryDate >= start && entryDate <= end;
  });
}

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

export default function Portfolio() {
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
  const portfolioRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated") {
      if (isSarla) {
        const fetchSarlaData = async () => {
          try {
            console.log(`Fetching Sarla data with accountCode: ${accountCode}`);
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

          if ("data" in response && response.data !== undefined) {
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
                    amount: parseFloat(tx.amount),
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
                  endDate: null,
                },
                isActive: true,
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
                    endDate: null,
                  },
                  isActive: true,
                };
              }
            }
          }

          if (statsData) {
            setStats(statsData);
            setMetadata(metadataData);
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

  /** -----------------------------------------------------------
   *  PDF EXPORT (flow layout, hides inputs, avoids chart splits)
   *  -----------------------------------------------------------
   */
  const handleDownloadPdf = async () => {
    if (!portfolioRef.current) return;

    setIsGeneratingPdf(true);
    const root = portfolioRef.current;

    // Mark export mode
    root.setAttribute("data-is-pdf-export", "true");

    // Hide chrome
    const sidebar = document.querySelector(".sidebar") as HTMLElement | null;
    const contentDiv = root.querySelector(".lg\\:pl-64") as HTMLElement | null;
    const downloadButton = root.querySelector(
      "button.bg-logo-green.text-button-text.rounded-full"
    ) as HTMLElement | null;

    const originalSidebarDisplay = sidebar?.style.display ?? "";
    const originalContentClass = contentDiv?.className ?? "";
    const originalButtonDisplay = downloadButton?.style.display ?? "";

    if (sidebar) sidebar.style.display = "none";
    if (contentDiv) contentDiv.className = contentDiv.className.replace("lg:pl-64", "lg:pl-0");
    if (downloadButton) downloadButton.style.display = "none";

    try {
      // PDF setup
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();  // 297
      const pageH = pdf.internal.pageSize.getHeight(); // 210
      const margin = 10;
      const maxW = pageW - margin * 2;                 // printable width
      const maxH = pageH - margin * 2;                 // printable height

      const DPI = 150;
      const pxPerMm = DPI / 25.4;

      let cursorYmm = margin;

      const paintBg = () => {
        pdf.setFillColor("#EFECD3");
        pdf.rect(0, 0, pageW, pageH, "F");
      };

      const newPage = () => {
        pdf.addPage();
        paintBg();
        cursorYmm = margin;
      };

      // First page background
      paintBg();

      // A “block” is either a keep-whole element (charts/cards) or a generic section slice
      const blocks: HTMLElement[] = [];

      // Prefer fine-grained blocks if available, else the entire root.
      const sections = Array
      .from(root.querySelectorAll<HTMLElement>("[data-pdf-section]"))
      .filter(sec => !sec.parentElement?.closest("[data-pdf-section]"));

      if (sections.length === 0) {
        blocks.push(root);
      } else {
        // Within sections, identify keep-whole items (charts, marked nodes)
        sections.forEach((sec) => {
          const keepers = sec.querySelectorAll<HTMLElement>('[data-pdf-keep-whole], .recharts-wrapper, canvas');
          if (keepers.length === 0) {
            blocks.push(sec);
          } else {
            // Split section into chunks: nodes before keeper, each keeper, nodes after
            let lastIndex = 0;
            const children = Array.from(sec.children) as HTMLElement[];

            const flushRange = (start: number, end: number) => {
              if (end > start) {
                const wrapper = document.createElement("div");
                wrapper.style.position = "relative";
                wrapper.style.width = "100%";
                wrapper.style.boxSizing = "border-box";
                for (let i = start; i < end; i++) wrapper.appendChild(children[i].cloneNode(true));
                wrapper.setAttribute("data-pdf-chunk", "true");
                // mount temporarily to measure
                sec.appendChild(wrapper);
                blocks.push(wrapper);
              }
            };

            const keeperSet = new Set(Array.from(keepers));
            children.forEach((child, idx) => {
              const isKeeper = keeperSet.has(child) || child.querySelector(".recharts-wrapper") || child.querySelector("canvas");
              if (isKeeper) {
                flushRange(lastIndex, idx);
                // push the keeper itself
                const wrapKeeper = document.createElement("div");
                wrapKeeper.style.position = "relative";
                wrapKeeper.style.width = "100%";
                wrapKeeper.appendChild(child.cloneNode(true));
                wrapKeeper.setAttribute("data-pdf-keep-whole", "true");
                sec.appendChild(wrapKeeper);
                blocks.push(wrapKeeper);
                lastIndex = idx + 1;
              }
            });
            flushRange(lastIndex, children.length);
          }
        });
      }

      // Helper: render an element to image with html2canvas
      const renderElem = async (elem: HTMLElement) => {
        const canvas = await html2canvas(elem, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#EFECD3",
          windowWidth: Math.ceil(elem.scrollWidth || elem.clientWidth || root.clientWidth),
          windowHeight: Math.ceil(elem.scrollHeight || elem.clientHeight || 800),
          scrollX: 0,
          scrollY: -window.scrollY,
          removeContainer: true,
        });
        return canvas;
      };

      const addCanvasFlow = (srcCanvas: HTMLCanvasElement, keepWhole = false) => {
        const imgPxW = srcCanvas.width;
        const imgPxH = srcCanvas.height;

        const imgWmm = imgPxW / pxPerMm;
        const imgHmm = imgPxH / pxPerMm;

        // Fit to printable width first
        const scaleW = maxW / imgWmm;
        let renderW = imgWmm * scaleW;
        let renderH = imgHmm * scaleW;

        // If still too tall for a single page, shrink further
        if (renderH > maxH) {
          const scaleH = maxH / renderH;
          renderW *= scaleH;
          renderH *= scaleH;
        }

        // If must keep whole and not enough room on current page -> new page
        if (keepWhole && cursorYmm + renderH > pageH - margin) {
          newPage();
        }

        // If we can split and height overflows -> slice vertically
        if (!keepWhole && cursorYmm + renderH > pageH - margin) {
          // Remaining space on this page (mm)
          let remainingHmm = (pageH - margin) - cursorYmm;

          // px per mm at the current render scale
          const pxPerMmAtScale = pxPerMm / scaleW;

          let yOffsetPx = 0;

          while (yOffsetPx < imgPxH) {
            const availHmm = remainingHmm > 0 ? remainingHmm : maxH;
            const sliceHeightPx = Math.min(imgPxH - yOffsetPx, Math.floor(availHmm * pxPerMmAtScale));

            // Build a slice from the **original canvas** (no dataURL / no <img>!)
            const sliceCanvas = document.createElement("canvas");
            sliceCanvas.width = imgPxW;
            sliceCanvas.height = sliceHeightPx;
            const sctx = sliceCanvas.getContext("2d")!;
            sctx.drawImage(
              srcCanvas,
              0, yOffsetPx, imgPxW, sliceHeightPx, // src
              0, 0, imgPxW, sliceHeightPx          // dst
            );

            // Compute rendered size (mm) at the same scaleW
            const sliceWmm = imgPxW / pxPerMm * scaleW;
            const sliceHmm = sliceHeightPx / pxPerMm * scaleW;

            // Paint slice
            pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, cursorYmm, sliceWmm, sliceHmm, undefined, "FAST");
            cursorYmm += sliceHmm;
            yOffsetPx += sliceHeightPx;

            // If more slices remain, start a new page
            if (yOffsetPx < imgPxH) {
              newPage();
              remainingHmm = maxH;
            } else if (cursorYmm > pageH - margin - 1) {
              newPage();
            }
          }
          return;
        }

        // Fits current page -> add directly
        pdf.addImage(srcCanvas.toDataURL("image/png"), "PNG", margin, cursorYmm, renderW, renderH, undefined, "FAST");
        cursorYmm += renderH;

        if (cursorYmm > pageH - margin - 1) newPage();
      };

      // FLOW: iterate blocks, render, add respecting keep-whole
      for (const block of blocks) {
        const keepWhole = block.hasAttribute("data-pdf-keep-whole");
        const canvas = await renderElem(block);
        addCanvasFlow(canvas, keepWhole);


        // Cleanup temporary chunks we appended for measuring
        if (block.getAttribute("data-pdf-chunk") === "true") {
          block.remove();
        }
      }

      pdf.save("portfolio.pdf");
    } catch (e) {
      console.error("Error generating PDF:", e);
      setError("Failed to generate PDF");
    } finally {
      // Restore UI
      if (sidebar) sidebar.style.display = originalSidebarDisplay;
      if (contentDiv) contentDiv.className = originalContentClass;
      if (downloadButton) downloadButton.style.display = originalButtonDisplay;

      portfolioRef.current?.removeAttribute("data-is-pdf-export");
      setIsGeneratingPdf(false);
    }
  };

  const renderCashFlowsTable = () => {
    let transactions: { date: string; amount: number }[] = [];

    if ((isSarla || isSatidham) && sarlaData && selectedStrategy) {
      transactions = sarlaData[selectedStrategy]?.data?.cashFlows || [];
    } else if (Array.isArray(stats)) {
      transactions = stats.flatMap((item) => item.stats.cashFlows || []);
    } else {
      transactions = (stats as Stats | undefined)?.cashFlows || [];
    }

    const cashFlowTotals = transactions.reduce(
      (acc, tx) => {
        const amount = Number(tx.amount);
        if (amount > 0) {
          acc.totalIn += amount;
        } else if (amount < 0) {
          acc.totalOut += amount;
        }
        acc.netFlow += amount;
        return acc;
      },
      { totalIn: 0, totalOut: 0, netFlow: 0 }
    );

    if (!transactions.length) {
      return (
        <Card className="bg-white/50 mt-4 border-0" data-pdf-section>
          <CardHeader>
            <CardTitle className="text-sm sm:text-lg text-black">Cash In / Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-3 text-gray-900 dark:text-gray-100">
              No cash flow data available
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-white/50  mt-4 border-0 p-4" data-pdf-section>
        <CardTitle className="text-sm sm:text-lg text-black">Cash In / Out</CardTitle>
        <CardContent className="p-0 mt-4">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow className="bg-black/5 hover:bg-gray-200 border-b border-gray-200 dark:border-gray-700">
                  <TableHead className="py-1 text-left text-xs font-medium text-black uppercase tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="py-1 text-right text-xs font-medium text-black uppercase tracking-wider">
                    Amount (₹)
                  </TableHead>
                  {viewMode === "individual" && (
                    <TableHead className="py-1 text-left text-xs font-medium text-black uppercase tracking-wider">
                      Account
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction, index) => {
                  const accountName = Array.isArray(stats)
                    ? (stats as any[]).find((item) => item.stats.cashFlows?.includes(transaction))?.metadata.account_name
                    : undefined;
                  return (
                    <TableRow key={`${transaction.date}-${index}`} className="border-b border-gray-200 dark:border-gray-700">
                      <TableCell className="py-2 text-xs text-gray-700 dark:text-gray-100">
                        {dateFormatter(transaction.date)}
                      </TableCell>
                      <TableCell
                        className={`py-2 text-xs font-medium text-right ${Number(transaction.amount) > 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatter.format(Number(transaction.amount))}
                      </TableCell>
                      {viewMode === "individual" && (
                        <TableCell className="py-2 text-xs text-gray-700 dark:text-gray-100">
                          {accountName || "Unknown"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                <TableRow className="border-t border-gray-200 dark:border-gray-700 font-semibold">
                  <TableCell className="py-2 text-xs text-gray-800 dark:text-gray-100">Total In</TableCell>
                  <TableCell className="py-2 text-xs text-right text-green-800 dark:text-green-600">
                    {formatter.format(cashFlowTotals.totalIn)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="py-2 text-xs text-gray-800 dark:text-gray-100">Total Out</TableCell>
                  <TableCell className="py-2 text-xs text-right text-red-800 dark:text-red-600">
                    {formatter.format(cashFlowTotals.totalOut)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell className="py-2 text-xs text-gray-800 dark:text-gray-100">Net Flow</TableCell>
                  <TableCell
                    className={`py-2 text-xs text-right font-semibold ${cashFlowTotals.netFlow >= 0 ? "text-green-800" : "text-red-800"} dark:${cashFlowTotals.netFlow >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {formatter.format(cashFlowTotals.netFlow)}
                  </TableCell>
                  {viewMode === "individual" && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p><strong>Note:</strong></p>
              <p>• Positive numbers represent cash inflows</p>
              <p>• Negative numbers represent cash outflows</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const getLastDate = (
    equityCurve: { date: string; value: number }[],
    lastUpdated: string | null
  ): string | null => {
    if (equityCurve.length > 0) {
      const sortedCurve = [...equityCurve].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      return sortedCurve[0].date;
    }
    return lastUpdated || null;
  };

  const renderSarlaStrategyTabs = () => {
    if (!(isSarla || isSatidham) || !sarlaData || availableStrategies.length === 0) return null;

    return (
      <div className="mb-4 block sm:hidden" data-hide-in-pdf>
        <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
          <SelectTrigger className="w-full border-0 ">
            <SelectValue placeholder="Select Strategy" />
          </SelectTrigger>
          <SelectContent>
            {availableStrategies.map((strategy) => {
              const isActive = sarlaData[strategy].metadata.isActive;
              return (
                <SelectItem key={strategy} value={strategy}>
                  {strategy} {!isActive ? "(Inactive)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <p><strong>Note:</strong> Inactive strategies may have limited data updates.</p>
        </div>
      </div>
    );
  };

  const CASH_PERCENT_STRATS_SARLA = ["Scheme A", "Scheme C", "Scheme D", "Scheme E", "Scheme F", "Scheme QAW", "Scheme B (inactive)"];
  const CASH_STRATS_SARLA = "Total Portfolio";
  const CASH_PERCENT_STRATS_SATIDHAM = ["Scheme B", "Scheme A", "Scheme A (Old)"];
  const CASH_STRATS_SATIDHAM = "Total Portfolio";

  const renderSarlaContent = () => {
    if (!isSarla || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
      return null;
    }

    const isCashOnlyView = selectedStrategy === CASH_STRATS_SARLA;
    const isCashPercentView = CASH_PERCENT_STRATS_SARLA.includes(selectedStrategy);

    const strategyData = sarlaData[selectedStrategy];
    const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
    const filteredEquityCurve = filterEquityCurve(
      strategyData.data.equityCurve,
      strategyData.metadata?.filtersApplied?.startDate,
      strategyData.metadata?.lastUpdated
    );
    const lastDate = getLastDate(filteredEquityCurve, strategyData.metadata?.lastUpdated);
    const isTotalPortfolio = selectedStrategy === "Total Portfolio";
    const isActive = strategyData.metadata.isActive;

    return (
      <div className="space-y-6">
        <Button
          variant="outline"
          className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
          data-hide-in-pdf
        >
          {selectedStrategy} {!isActive ? "(Inactive)" : ""}
        </Button>
        <div data-pdf-section>
          <div data-pdf-keep-whole>
            <StatsCards
              stats={convertedStats}
              accountType="sarla"
              broker="Sarla"
              isTotalPortfolio={isTotalPortfolio}
              isActive={isActive}
              returnViewType={returnViewType}
              setReturnViewType={setReturnViewType}
            />
          </div>

          {!isTotalPortfolio && (
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full" data-pdf-keep-whole>
                <RevenueChart
                  equityCurve={filteredEquityCurve}
                  drawdownCurve={strategyData.data.drawdownCurve}
                  trailingReturns={convertedStats.trailingReturns}
                  drawdown={convertedStats.drawdown}
                  lastDate={lastDate}
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <PnlTable
              quarterlyPnl={convertedStats.quarterlyPnl}
              monthlyPnl={convertedStats.monthlyPnl}
              showOnlyQuarterlyCash={isCashOnlyView}
              showPmsQawView={isCashPercentView}
              isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}
            />
          </div>

          {renderCashFlowsTable()}

          {isSarla && !isActive && (
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSatidhamContent = () => {
    if (!isSatidham || !sarlaData || !selectedStrategy || !sarlaData[selectedStrategy]) {
      return null;
    }

    const isCashOnlyView = selectedStrategy === CASH_STRATS_SATIDHAM;
    const isCashPercentView = CASH_PERCENT_STRATS_SATIDHAM.includes(selectedStrategy);

    const strategyData = sarlaData[selectedStrategy];
    const convertedStats = isPmsStats(strategyData.data) ? convertPmsStatsToStats(strategyData.data) : strategyData.data;
    const filteredEquityCurve = filterEquityCurve(
      strategyData.data.equityCurve,
      strategyData.metadata?.filtersApplied?.startDate,
      strategyData.metadata?.lastUpdated
    );
    const lastDate = getLastDate(filteredEquityCurve, strategyData.metadata?.lastUpdated);
    const isTotalPortfolio = selectedStrategy === "Total Portfolio";
    const isActive = strategyData.metadata.isActive;

    return (
      <div className="space-y-6">
        <Button
          variant="outline"
          className={`bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${!isActive ? "opacity-70" : ""}`}
          data-hide-in-pdf
        >
          {selectedStrategy} {!isActive ? "(Inactive)" : ""}
        </Button>

        <div data-pdf-section>
          <div data-pdf-keep-whole>
            <StatsCards
              stats={convertedStats}
              accountType="sarla"
              broker="Sarla"
              isTotalPortfolio={isTotalPortfolio}
              isActive={isActive}
              returnViewType={returnViewType}
              setReturnViewType={setReturnViewType}
            />
          </div>

          {!isTotalPortfolio && (
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
              <div className="w-full mt-4" data-pdf-keep-whole>
                <RevenueChart
                  equityCurve={filteredEquityCurve}
                  drawdownCurve={strategyData.data.drawdownCurve}
                  trailingReturns={convertedStats.trailingReturns}
                  drawdown={convertedStats.drawdown}
                  lastDate={lastDate}
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <PnlTable
              quarterlyPnl={convertedStats.quarterlyPnl}
              monthlyPnl={convertedStats.monthlyPnl}
              showOnlyQuarterlyCash={isCashOnlyView}
              showPmsQawView={isCashPercentView}
              isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}
            />
          </div>

          {renderCashFlowsTable()}

          {isSatidham && !isActive && (
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              <strong>Note:</strong> This strategy is inactive. Data may not be updated regularly.
            </div>
          )}
        </div>
      </div>
    );
  };

  if (status === "loading" || isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (error || !session?.user) {
    return (
      <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
        {error || "Failed to load user data"}
      </div>
    );
  }

  if (!isSarla && !isSatidham && accounts.length === 0) {
    return (
      <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">
        No accounts found for this user.
      </div>
    );
  }

  if ((isSarla || isSatidham) && (!sarlaData || availableStrategies.length === 0)) {
    return (
      <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-900/10 dark:text-gray-100">
        No strategy data found for {isSarla ? "Sarla" : "Satidham"} user.
      </div>
    );
  }

  const currentMetadata =
    (isSarla || isSatidham) && sarlaData && selectedStrategy ? sarlaData[selectedStrategy].metadata : metadata;

  return (
    <div className="w-full max-w-none sm:p-2 space-y-6" ref={portfolioRef}>
      <div data-pdf-section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-card-text-secondary font-heading">
              {getGreeting()}, {session?.user?.name || "User"}
            </h1>
            {currentMetadata && (
              <div className="flex flex-wrap items-center gap-2 text-sm mt-2 text-card-text-secondary font-heading-bold">
                <span>
                  Inception Date:{" "}
                  <strong>{currentMetadata.inceptionDate ? dateFormatter(currentMetadata.inceptionDate) : "N/A"}</strong>
                </span>
                <span>|</span>
                <span>
                  Data as of:{" "}
                  <strong>{currentMetadata.dataAsOfDate ? dateFormatter(currentMetadata.dataAsOfDate) : "N/A"}</strong>
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4" data-hide-in-pdf>
            {(isSarla || isSatidham) && sarlaData && availableStrategies.length > 0 && (
              <div className="hidden sm:block">
                <Select value={selectedStrategy || ""} onValueChange={setSelectedStrategy}>
                  <SelectTrigger className="w-[400px] border-0  text-button-text">
                    <SelectValue placeholder="Select Strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStrategies.map((strategy) => {
                      const isActive = sarlaData[strategy].metadata.isActive;
                      return (
                        <SelectItem key={strategy} value={strategy}>
                          {strategy} {!isActive ? "(Inactive)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="bg-logo-green text-button-text px-4 py-2 rounded-full">
              {isGeneratingPdf ? "Generating PDF..." : "Download PDF"}
            </Button>
          </div>
        </div>

        {!isSarla && !isSatidham && currentMetadata?.strategyName && (
          <Button
            variant="outline"
            className={`bg-logo-green mt-4 font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full ${(isSarla || isSatidham) && !currentMetadata.isActive ? "opacity-70" : ""
              }`}
            data-hide-in-pdf
          >
            {currentMetadata.strategyName} {(isSarla || isSatidham) && !currentMetadata.isActive ? "(Inactive)" : ""}
          </Button>
        )}

        {(isSarla || isSatidham) && sarlaData && availableStrategies.length > 0 && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400" data-hide-in-pdf>
            <p>
              <strong>Note:</strong> Inactive strategies may have limited data updates.
            </p>
          </div>
        )}
      </div>

      {renderSarlaStrategyTabs()}

      {(isSarla || isSatidham) ? (
        isSarla ? (
          renderSarlaContent()
        ) : (
          renderSatidhamContent()
        )
      ) : (
        stats && (
          <div className="space-y-6" data-pdf-section>
            {Array.isArray(stats) ? (
              (stats as any[]).map((item, index) => {
                const convertedStats = isPmsStats(item.stats) ? convertPmsStatsToStats(item.stats) : item.stats;
                const filteredEquityCurve = filterEquityCurve(
                  item.stats.equityCurve,
                  item.metadata.filtersApplied?.startDate,
                  item.metadata.lastUpdated
                );
                const lastDate = getLastDate(filteredEquityCurve, item.metadata.lastUpdated);
                return (
                  <div key={index} className="space-y-6">
                    <Card className="bg-white/50   border-0" data-pdf-section>
                      <CardHeader>
                        <CardTitle className="text-card-text text-sm sm:text-sm">
                          {item.metadata.account_name} ({item.metadata.account_type.toUpperCase()} - {item.metadata.broker})
                          {(isSarla || isSatidham) && !item.metadata.isActive ? " (Inactive)" : ""}
                        </CardTitle>
                        <div className="text-sm text-card-text-secondary">
                          Strategy: <strong>{item.metadata.strategyName || "Unknown Strategy"}</strong>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div data-pdf-keep-whole>
                          <StatsCards
                            stats={convertedStats}
                            accountType="sarla"
                            broker="Sarla"
                            isTotalPortfolio={false}
                            isActive={item.metadata.isActive}
                            returnViewType={returnViewType}
                            setReturnViewType={setReturnViewType}
                          />
                        </div>

                        <div className="mt-4" data-pdf-keep-whole>
                          <RevenueChart
                            equityCurve={filteredEquityCurve}
                            drawdownCurve={item.stats.drawdownCurve}
                            trailingReturns={convertedStats.trailingReturns}
                            drawdown={convertedStats.drawdown}
                            lastDate={lastDate}
                          />
                        </div>

                        <div>
                          <PnlTable
                            quarterlyPnl={convertedStats.quarterlyPnl}
                            monthlyPnl={convertedStats.monthlyPnl}
                            isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}
                          />
                        </div>

                        {(isSarla || isSatidham) && !item.metadata.isActive && (
                          <div className="text-sm text-yellow-600 dark:text-yellow-400">
                            <strong>Note:</strong> This account is inactive. Data may not be updated regularly.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })
            ) : (
              <>
                {(() => {
                  const convertedStats = isPmsStats(stats as Stats | PmsStats) ? convertPmsStatsToStats(stats as PmsStats) : (stats as Stats);
                  const filteredEquityCurve = filterEquityCurve(
                    (stats as Stats).equityCurve,
                    metadata?.filtersApplied.startDate,
                    metadata?.lastUpdated
                  );
                  const lastDate = getLastDate(filteredEquityCurve, metadata?.lastUpdated);
                  return (
                    <div className="flex gap-4">
                      <div data-pdf-keep-whole>
                        <StatsCards
                          stats={convertedStats}
                          accountType={accounts.find((acc) => acc.qcode === selectedAccount)?.account_type || "unknown"}
                          broker={accounts.find((acc) => acc.qcode === selectedAccount)?.broker || "Unknown"}
                          isActive={metadata?.isActive ?? true}
                          returnViewType={returnViewType}
                          setReturnViewType={setReturnViewType}
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
                        <div className="w-full mt-4" data-pdf-keep-whole>
                          <RevenueChart
                            equityCurve={filteredEquityCurve}
                            drawdownCurve={(stats as Stats).drawdownCurve}
                            trailingReturns={convertedStats.trailingReturns}
                            drawdown={convertedStats.drawdown}
                            lastDate={lastDate}
                          />
                        </div>
                      </div>

                      <StockTable holdings={convertedStats.holdings} viewMode="individual" />

                      <PnlTable
                        quarterlyPnl={convertedStats.quarterlyPnl}
                        monthlyPnl={convertedStats.monthlyPnl}
                        isPdfExport={portfolioRef.current?.getAttribute("data-is-pdf-export") === "true"}
                      />
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )
      )}

      <style jsx global>{`
  /* Export mode: keep your theme; only spacing and layout helpers */
  [data-is-pdf-export="true"] {
    /* keep existing colors; do NOT force light */
    font-size: 12px !important;
    line-height: 1.45 !important;
  }

  /* Hide interactive UI in PDF (but don't alter colors) */
  [data-is-pdf-export="true"] [data-hide-in-pdf],
  [data-is-pdf-export="true"] button,
  [data-is-pdf-export="true"] input,
  [data-is-pdf-export="true"] select,
  [data-is-pdf-export="true"] textarea,
  [data-is-pdf-export="true"] [role="combobox"] {
    display: none !important;
    visibility: hidden !important;
  }

  /* Normalize cards/tables frame without changing theme colors */
  [data-is-pdf-export="true"] .card,
  [data-is-pdf-export="true"] .bg-white\\/50,
  [data-is-pdf-export="true"] .bg-white,
  [data-is-pdf-export="true"] .border,
  [data-is-pdf-export="true"] .border-0 {
    /* keep backgrounds as-is; only ensure edges and spacing look neat on paper */
    border-radius: 8px !important;
  }

  /* Typography scale (no color changes) */
  [data-is-pdf-export="true"] h1 { font-size: 18px !important; font-weight: 700 !important; }
  [data-is-pdf-export="true"] h2 { font-size: 16px !important; font-weight: 700 !important; }
  [data-is-pdf-export="true"] h3 { font-size: 14px !important; font-weight: 600 !important; }

  [data-is-pdf-export="true"] .card *,
  [data-is-pdf-export="true"] .bg-white\\/50 * {
    font-size: 12px !important;
  }

  [data-is-pdf-export="true"] table {
    border-collapse: collapse !important;
    width: 100% !important;
  }
  [data-is-pdf-export="true"] table th,
  [data-is-pdf-export="true"] table td {
    padding: 8px 10px !important;  /* a bit more breathing room */
    vertical-align: middle !important;
  }

  /* Page-friendly flow: add vertical rhythm without forcing colors */
  [data-is-pdf-export="true"] [data-pdf-section]{
    width: 100% !important;
    max-width: 100% !important;
    display: block !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    margin-bottom: 12mm !important;   /* key spacing between sections */
  }

  [data-is-pdf-export="true"] [data-pdf-keep-whole] {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    margin-bottom: 6mm !important;    /* small gap under charts/cards */
  }

  /* Prevent transforms/positioning from confusing html2canvas during export */
  [data-is-pdf-export="true"] * {
    transform: none !important;
  }
`}</style>

    </div>
  );
}
