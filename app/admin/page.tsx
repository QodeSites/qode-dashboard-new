"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminStats } from "@/components/admin/AdminStats";
import { ClientManagement } from "@/components/admin/ClientManagement";

interface Stats {
  totalClients: number;
  totalAccounts: number;
}

export default function AdminPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ totalClients: 0, totalAccounts: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [impersonateMessage, setImpersonateMessage] = useState<string | null>(null);

  // Redirect non-admin users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && session?.user?.accessType !== "admin") {
      router.push("/dashboard");
      return;
    }
  }, [status, session, router]);

  // Fetch stats
  useEffect(() => {
    if (status !== "authenticated" || session?.user?.accessType !== "admin") return;

    const fetchStats = async () => {
      try {
        const res = await fetch("/api/admin/stats", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("Error fetching admin stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [status, session]);

  const handleImpersonate = async (icode: string) => {
    try {
      const res = await fetch("/api/admin/impersonate", {
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

      // Update the session with impersonation data
      await updateSession({
        impersonating: {
          icode: clientData.icode,
          name: clientData.name,
          email: clientData.email,
        },
      });

      setImpersonateMessage(`Successfully initiated impersonation for ${clientData.icode}`);

      // Navigate to the dashboard after a brief delay to show the message
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);
    } catch (err) {
      console.error("Impersonation error:", err);
      setImpersonateMessage(
        err instanceof Error ? err.message : "Failed to impersonate"
      );
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  if (session?.user?.accessType !== "admin") {
    return null;
  }

  return (
    <div className="space-y-6 pb-8">
      <AdminHeader />

      <div>
        <h2 className="text-xl font-heading font-semibold text-card-text mb-1">
          Client Management Dashboard
        </h2>
        <p className="text-sm text-card-text-secondary mb-4">
          Monitor clients, manage multiple accounts, and view dashboards
        </p>
        <AdminStats
          totalClients={stats.totalClients}
          totalAccounts={stats.totalAccounts}
          isLoading={statsLoading}
        />
      </div>

      {impersonateMessage && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-center gap-2">
          <span className="text-sm text-amber-800">{impersonateMessage}</span>
        </div>
      )}

      <ClientManagement onImpersonate={handleImpersonate} />
    </div>
  );
}
