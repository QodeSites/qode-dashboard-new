"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { RevenueChart } from "@/components/revenue-chart";
import { DistributorStatsSummary } from "@/components/distributor/DistributorStatsSummary";
import { DistributorPnlTable } from "@/components/distributor/DistributorPnlTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Local Stats type — mirrors what /api/distributor/portfolio returns inside
// the `data` field. Kept loose so we don't have to import the full Stats
// definition from portfolio-utils for a single render.
interface DistributorStats {
  amountDeposited: string;
  currentExposure: string;
  return: string;
  totalProfit: string;
  trailingReturns: {
    fiveDays: string;
    tenDays: string;
    fifteenDays: string;
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
  drawdown: string;
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; value: number }[];
  quarterlyPnl: any;
  monthlyPnl: any;
  cashFlows: { date: string; amount: number }[];
  strategyName: string;
}

interface DistributorResponse {
  data: DistributorStats;
  metadata: {
    strategyName: string;
    displayName: string;
    inceptionDate: string | null;
    dataAsOfDate: string | null;
    lastUpdated: string;
  };
}

const VALID_STRATEGIES = ["qye", "qaw"] as const;

// Static labels per strategy so the header is stable during loading.
const STRATEGY_LABELS: Record<string, { client: string; strategy: string }> = {
  qye: { client: "Client A", strategy: "QYE++ Strategy" },
  qaw: { client: "Client B", strategy: "QAW++ Strategy" },
};

// IST-aware greeting, mirrors the regular dashboard's `getGreeting()`.
function getGreeting(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  if (hours >= 0 && hours < 12) return "Good Morning";
  if (hours >= 12 && hours < 17) return "Good Afternoon";
  return "Good Evening";
}

// Date formatter matching the regular dashboard (DD/MM/YYYY, en-IN).
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function DistributorStrategyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const rawStrategy = String(params?.strategy ?? "");
  const isValidStrategy = (VALID_STRATEGIES as readonly string[]).includes(
    rawStrategy
  );

  const [response, setResponse] = useState<DistributorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notImplemented, setNotImplemented] = useState(false);

  // Auth gate: redirect non-distributors
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (
      status === "authenticated" &&
      session?.user?.accessType !== "distributor"
    ) {
      router.push("/");
    }
  }, [status, session, router]);

  // Fetch strategy data
  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user?.accessType !== "distributor") return;
    if (!isValidStrategy) {
      setError("Unknown strategy");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setNotImplemented(false);
      try {
        const res = await fetch(
          `/api/distributor/portfolio?strategy=${rawStrategy}`,
          { credentials: "include" }
        );
        if (res.status === 501) {
          if (!cancelled) setNotImplemented(true);
          return;
        }
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Request failed (${res.status})`);
        }
        const json = (await res.json()) as DistributorResponse;
        if (!cancelled) setResponse(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [status, session, rawStrategy, isValidStrategy]);

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  if (session?.user?.accessType !== "distributor") {
    return null;
  }

  const fallbackLabels = STRATEGY_LABELS[rawStrategy] ?? {
    client: "Client",
    strategy: `${rawStrategy.toUpperCase()}++ Strategy`,
  };
  const clientName = response?.metadata.displayName ?? fallbackLabels.client;
  const strategyLabel =
    response?.metadata.strategyName ?? fallbackLabels.strategy;

  return (
    <div className="space-y-6 pb-8">
      {/* Greeting + metadata — mirrors the regular dashboard's look */}
      <div>
        <h1 className="text-xl font-semibold text-card-text-secondary font-heading">
          {getGreeting()}, {clientName}
        </h1>
        {response?.metadata && (
          <div className="flex flex-wrap items-center gap-2 text-sm mt-2 text-card-text-secondary font-heading-bold">
            <span>
              Inception Date:{" "}
              <strong>
                {response.metadata.inceptionDate
                  ? formatDate(response.metadata.inceptionDate)
                  : "N/A"}
              </strong>
            </span>
            <span>|</span>
            <span>
              Data as of:{" "}
              <strong>
                {response.metadata.dataAsOfDate
                  ? formatDate(response.metadata.dataAsOfDate)
                  : "N/A"}
              </strong>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button
            variant="outline"
            className="bg-logo-green font-heading text-button-text text-sm sm:text-sm px-3 py-1 rounded-full cursor-default"
          >
            {strategyLabel}
          </Button>
        </div>
      </div>

      {/* States */}
      {loading && (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="text-logo-green text-xl font-heading">Loading strategy data...</div>
        </div>
      )}

      {!loading && notImplemented && (
        <Card className="bg-white">
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-heading text-logo-green mb-2">
              Coming Soon
            </h2>
            <p className="text-sm text-card-text-secondary">
              This strategy view is not yet available. Check back shortly.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && error && !notImplemented && (
        <Card className="bg-white border-red-300">
          <CardContent className="py-8">
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !notImplemented && !error && response && (
        <>
          <DistributorStatsSummary returnPercent={response.data.return} />

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-full overflow-hidden">
            <div className="flex-1 min-w-0 sm:w-5/6">
              <RevenueChart
                equityCurve={response.data.equityCurve}
                drawdownCurve={response.data.drawdownCurve}
                trailingReturns={response.data.trailingReturns}
                drawdown={response.data.drawdown}
                chart_animation={true}
                adjustBenchmarkStartDate={true}
              />
            </div>
          </div>

          <DistributorPnlTable
            quarterlyPnl={response.data.quarterlyPnl}
            monthlyPnl={response.data.monthlyPnl}
          />
        </>
      )}
    </div>
  );
}
