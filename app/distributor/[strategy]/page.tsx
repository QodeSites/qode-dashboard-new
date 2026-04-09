"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { StatsCards } from "@/components/stats-cards";
import { RevenueChart } from "@/components/revenue-chart";
import { PnlTable } from "@/components/PnlTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeftIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

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
  displayConfig: {
    showRupeeCards: boolean;
    pnlMode: "percent" | "both";
  };
}

const VALID_STRATEGIES = ["qye", "qaw"] as const;

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
  const [returnViewType, setReturnViewType] = useState<"percent" | "cash">(
    "percent"
  );

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

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

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

  const headerTitle = response?.metadata.displayName ?? `${rawStrategy.toUpperCase()}++ Strategy`;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-2">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/distributor")}
            className="gap-2 text-card-text-secondary hover:text-logo-green"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold text-logo-green">
                {headerTitle}
              </h1>
              <Badge className="bg-logo-green/10 text-logo-green border-logo-green/30">
                Live Returns
              </Badge>
            </div>
            {response?.metadata.dataAsOfDate && (
              <p className="text-sm text-card-text-secondary mt-1">
                Data as of {response.metadata.dataAsOfDate}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="gap-2 text-card-text-secondary hover:text-logo-green"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
          Logout
        </Button>
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
          {response.displayConfig.showRupeeCards && (
            <StatsCards
              stats={response.data}
              accountType="managed_account"
              broker="zerodha"
              returnViewType={returnViewType}
              setReturnViewType={setReturnViewType}
            />
          )}

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

          <PnlTable
            quarterlyPnl={response.data.quarterlyPnl}
            monthlyPnl={response.data.monthlyPnl}
            showPmsQawView={response.displayConfig.pnlMode === "percent"}
          />
        </>
      )}
    </div>
  );
}
