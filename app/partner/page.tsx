"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PartnerHeader } from "@/components/partner/PartnerHeader";
import { AdminStats } from "@/components/admin/AdminStats";
import { PartnerClientManagement } from "@/components/partner/PartnerClientManagement";

interface AumAccount {
  qcode: string;
  name: string;
  aum: number;
}
interface Stats {
  totalClients: number;
  totalAccounts: number;
  totalAumManaged: number;
  aumAccounts: AumAccount[];
}

export default function PartnerPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalAccounts: 0,
    totalAumManaged: 0,
    aumAccounts: [],
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [impersonatingIcode, setImpersonatingIcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const isPartner = session?.user?.accessType === "partner";

  // Redirect non-partner users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && !isPartner) {
      router.push("/");
      return;
    }
  }, [status, isPartner, router]);

  // Fetch stats
  useEffect(() => {
    if (status !== "authenticated" || !isPartner) return;

    const fetchStats = async () => {
      try {
        const res = await fetch("/api/partner/stats", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("Error fetching partner stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [status, isPartner]);

  // Prefetch dashboard so route change after impersonation is faster.
  useEffect(() => {
    if (status === "authenticated" && isPartner) {
      router.prefetch("/dashboard");
    }
  }, [status, isPartner, router]);

  const waitForImpersonationSession = async (icode: string, timeoutMs = 3500) => {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const res = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });

      if (res.ok) {
        const currentSession = await res.json();
        if (currentSession?.user?.impersonating?.icode === icode) {
          return true;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return false;
  };

  const handleImpersonate = async (icode: string) => {
    if (isTransitioning) return;

    setImpersonatingIcode(icode);
    setIsTransitioning(true);
    setError(null);

    try {
      const res = await fetch("/api/partner/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ icode }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Impersonation failed");
      }

      const clientData = await res.json();

      const updatedSession = await updateSession({
        impersonating: {
          icode: clientData.icode,
          name: clientData.name,
          email: clientData.email,
        },
      });

      const updatedImmediately =
        updatedSession?.user?.impersonating?.icode === clientData.icode;

      if (!updatedImmediately) {
        const confirmed = await waitForImpersonationSession(clientData.icode);
        if (!confirmed) {
          throw new Error("Session update timed out while switching client context");
        }
      }

      router.replace("/dashboard");
    } catch (err) {
      console.error("Impersonation error:", err);
      setError(err instanceof Error ? err.message : "Failed to impersonate");
      setImpersonatingIcode(null);
      setIsTransitioning(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  if (!isPartner) {
    return null;
  }

  return (
    <div className="space-y-6 pb-8">
      {isTransitioning && (
        <div className="fixed inset-0 z-50 bg-primary-bg flex items-center justify-center">
          <div className="text-center px-4">
            <div className="text-logo-green text-2xl font-heading">Loading...</div>
          </div>
        </div>
      )}
      <PartnerHeader />

      <div>
        <AdminStats
          totalClients={stats.totalClients}
          totalAccounts={stats.totalAccounts}
          totalAumManaged={stats.totalAumManaged}
          accountAums={stats.aumAccounts}
          isLoading={statsLoading}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3">
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      <PartnerClientManagement
        onImpersonate={handleImpersonate}
        impersonatingIcode={impersonatingIcode}
      />
    </div>
  );
}
