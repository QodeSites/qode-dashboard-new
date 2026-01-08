"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../dashboard/layout";
import { FeesTable } from "@/components/FeesTable";
import { normalizeToStats } from "@/app/lib/dashboard-utils";
import type { SarlaApiResponse, Stats } from "@/app/lib/dashboard-types";

export default function QuarterlyFeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [fees, setFees] = useState<Stats["fees"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User type detection - only Sarla users
  const isSarla = session?.user?.icode === "QUS0007";

  // Authentication check
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
  }, [status, router]);

  // Fetch fees data
  useEffect(() => {
    if (status !== "authenticated") return;

    const fetchFeesData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Only fetch for Sarla users
        if (isSarla) {
          const qcode = "QAC00041";
          const res = await fetch(`/api/sarla-api?qcode=${qcode}&accountCode=AC5`, {
            credentials: "include",
          });

          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || "Failed to load fees data");
          }

          const data: SarlaApiResponse = await res.json();

          // Extract fees from "Total Portfolio" strategy
          const totalPortfolioData = data["Total Portfolio"];
          if (totalPortfolioData?.data) {
            // Normalize the data to get the fees structure
            const normalized = normalizeToStats(totalPortfolioData.data);

            // Check if fees exist in the normalized data
            if (normalized.fees && Object.keys(normalized.fees).length > 0) {
              setFees(normalized.fees);
            } else {
              setError("No fees data available");
            }
          } else {
            setError("Total Portfolio data not found");
          }
        } else {
          setError("Quarterly fees are only available for Sarla users");
        }
      } catch (err: any) {
        setError(err?.message || "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeesData();
  }, [status, router, isSarla]);

  // Loading state
  if (status === "loading" || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-card-text-secondary">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error || !session?.user) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center bg-red-100 rounded-lg text-red-600 dark:bg-red-900/10 dark:text-red-400">
          {error || "Failed to load user data"}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-card-text-secondary font-heading">
            Fee Schedule
          </h1>
          <p className="text-sm text-card-text-secondary/70">
            View your quarterly fee breakdown
          </p>
        </div>

        {/* Fees Table */}
        {fees ? (
          <FeesTable fees={fees} />
        ) : (
          <div className="p-6 text-center bg-gray-100 rounded-lg text-gray-900 dark:bg-gray-800 dark:text-gray-100">
            No quarterly fees data available
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
