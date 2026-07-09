"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

interface PartnerClient {
  icode: string;
  name: string;
  email: string;
  accountCount: number;
}

interface BookSummary {
  clientCount: number;
  accountCount: number;
}

export default function PartnerPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

  const [clients, setClients] = useState<PartnerClient[]>([]);
  const [summary, setSummary] = useState<BookSummary>({
    clientCount: 0,
    accountCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [impersonatingIcode, setImpersonatingIcode] = useState<string | null>(
    null,
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPartner = session?.user?.accessType === "partner";

  // Redirect non-partner users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && !isPartner) {
      router.push("/");
    }
  }, [status, isPartner, router]);

  // Prefetch dashboard so the route change after impersonation is faster.
  useEffect(() => {
    if (status === "authenticated" && isPartner) {
      router.prefetch("/dashboard");
    }
  }, [status, isPartner, router]);

  // Fetch the book summary once.
  useEffect(() => {
    if (status !== "authenticated" || !isPartner) return;
    fetch("/api/partner/book-summary", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary(d))
      .catch(() => {});
  }, [status, isPartner]);

  // Fetch clients (debounced on search).
  const fetchClients = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/partner/clients?search=${encodeURIComponent(q)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load clients");
      const data = await res.json();
      setClients(data.clients ?? []);
    } catch (err) {
      console.error("Error fetching partner clients:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !isPartner) return;
    const t = setTimeout(() => fetchClients(search), 300);
    return () => clearTimeout(t);
  }, [search, status, isPartner, fetchClients]);

  const waitForImpersonationSession = async (icode: string, timeoutMs = 3500) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const current = await res.json();
        if (current?.user?.impersonating?.icode === icode) return true;
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
          throw new Error(
            "Session update timed out while switching client context",
          );
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

  const handleLogout = async () => {
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  if (status === "loading" || !isPartner) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {isTransitioning && (
        <div className="fixed inset-0 z-50 bg-primary-bg flex items-center justify-center">
          <div className="text-logo-green text-2xl font-heading">Loading...</div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading text-logo-green">
            Partner Dashboard
          </h1>
          <p className="text-sm text-card-text-secondary mt-1">
            {session?.user?.name} — {session?.user?.email}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="gap-2 text-card-text-secondary hover:text-logo-green"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          Logout
        </Button>
      </div>

      {/* Book summary (TODO: richer metrics once defined) */}
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="bg-white rounded-lg p-4 card-shadow">
          <p className="text-sm text-card-text-secondary">Clients</p>
          <p className="text-2xl font-heading text-logo-green">
            {summary.clientCount}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 card-shadow">
          <p className="text-sm text-card-text-secondary">Accounts</p>
          <p className="text-2xl font-heading text-logo-green">
            {summary.accountCount}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3">
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative sm:max-w-md">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-card-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name, email, or client code…"
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-logo-green/20 bg-white text-sm text-card-text focus:outline-none focus:border-logo-green/50"
        />
      </div>

      {/* Client list */}
      <div className="bg-white rounded-lg card-shadow overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-card-text-secondary">Loading clients…</div>
        ) : clients.length === 0 ? (
          <div className="p-6 text-sm text-card-text-secondary">
            No clients in your book.
          </div>
        ) : (
          <ul className="divide-y divide-logo-green/10">
            {clients.map((client) => (
              <li
                key={client.icode}
                className="flex items-center justify-between px-4 py-3 gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-text truncate">
                    {client.name}
                  </p>
                  <p className="text-xs text-card-text-secondary truncate">
                    {client.icode} · {client.email} · {client.accountCount}{" "}
                    account{client.accountCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleImpersonate(client.icode)}
                  disabled={isTransitioning}
                  className="shrink-0"
                >
                  {impersonatingIcode === client.icode
                    ? "Opening…"
                    : "View Dashboard"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
