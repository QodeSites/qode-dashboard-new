"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface Client {
  icode: string;
  name: string;
  email: string;
}

export default function DashboardVisibilityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [unlocked, setUnlocked] = useState(false);
  const [entryPassword, setEntryPassword] = useState("");
  const [entryError, setEntryError] = useState("");
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [pendingToggle, setPendingToggle] = useState<{ icode: string; visible: boolean } | null>(null);
  const [actionPassword, setActionPassword] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

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

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [clientsRes, visibilityRes] = await Promise.all([
        fetch("/api/admin/clients", { credentials: "include" }),
        fetch("/api/admin/dashboard-visibility", { credentials: "include" }),
      ]);

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData.clients);
      }
      if (visibilityRes.ok) {
        const visibilityData = await visibilityRes.json();
        setVisibilityMap(visibilityData.visibility ?? {});
      }
    } catch (err) {
      console.error("Error fetching dashboard visibility data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) fetchData();
  }, [unlocked, fetchData]);

  const handleUnlock = async () => {
    setEntrySubmitting(true);
    setEntryError("");
    try {
      const res = await fetch("/api/admin/dashboard-visibility/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: entryPassword }),
      });
      if (!res.ok) {
        setEntryError("Incorrect password");
        setEntrySubmitting(false);
        return;
      }
      setUnlocked(true);
    } catch {
      setEntryError("Something went wrong");
    }
    setEntrySubmitting(false);
  };

  const handleToggleVisibility = (icode: string, visible: boolean) => {
    setPendingToggle({ icode, visible });
    setActionPassword("");
    setActionError("");
  };

  const handleConfirmVisibility = async () => {
    if (!pendingToggle) return;
    setActionSubmitting(true);
    setActionError("");

    const { icode, visible } = pendingToggle;

    try {
      const res = await fetch("/api/admin/dashboard-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ icode, dashboard_visible: visible, password: actionPassword }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          setActionError("Incorrect password");
        } else {
          setActionError("Failed to update visibility");
        }
        setActionSubmitting(false);
        return;
      }
      setVisibilityMap((prev) => ({ ...prev, [icode]: visible }));
      setPendingToggle(null);
    } catch {
      setActionError("Something went wrong");
    }
    setActionSubmitting(false);
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
    <div className="min-h-screen bg-primary-bg px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/admin")}
            className="gap-2 text-card-text-secondary hover:text-logo-green"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Admin
          </Button>
          <h1 className="text-2xl font-heading font-bold text-logo-green">
            Dashboard Visibility
          </h1>
        </div>
      </div>

      {/* Entry password gate */}
      <Dialog open={!unlocked}>
        <DialogContent
          className="sm:max-w-sm border-logo-green/20 bg-primary-bg [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-card-text font-heading text-xl">Enter Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-card-text-secondary">
              Enter the dashboard visibility password to continue.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="entry-password" className="text-card-text text-xs font-medium">Password</Label>
              <Input
                id="entry-password"
                type="password"
                value={entryPassword}
                onChange={(e) => { setEntryPassword(e.target.value); setEntryError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && entryPassword) handleUnlock(); }}
                placeholder="Enter password"
                className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                autoFocus
              />
              {entryError && (
                <p className="text-xs text-red-600 mt-1">{entryError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleUnlock}
              disabled={entrySubmitting || !entryPassword}
              className="bg-logo-green text-button-text hover:bg-logo-green/90 w-full"
            >
              {entrySubmitting ? "Verifying..." : "Unlock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {unlocked && (
        <div className="border rounded-lg overflow-hidden bg-white/50">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-card-text-secondary">Loading clients...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>ICode</TableHead>
                  <TableHead className="text-center">Dashboard Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.icode}>
                    <TableCell className="font-medium text-card-text">
                      {client.name}
                    </TableCell>
                    <TableCell className="text-card-text-secondary text-sm">
                      {client.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {client.icode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`text-xs font-medium ${(visibilityMap[client.icode] ?? true) ? "text-logo-green" : "text-card-text-secondary"}`}>
                          {(visibilityMap[client.icode] ?? true) ? "On" : "Off"}
                        </span>
                        <Switch
                          checked={visibilityMap[client.icode] ?? true}
                          onCheckedChange={(checked) => handleToggleVisibility(client.icode, checked)}
                          className="data-[state=checked]:bg-logo-green data-[state=unchecked]:bg-card-text-secondary/30"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Per-action confirm password modal */}
      <Dialog open={pendingToggle !== null} onOpenChange={(open) => { if (!open) setPendingToggle(null); }}>
        <DialogContent className="sm:max-w-sm border-logo-green/20 bg-primary-bg">
          <DialogHeader>
            <DialogTitle className="text-card-text font-heading text-xl">Confirm Visibility Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-card-text-secondary">
              Enter the password to {pendingToggle?.visible ? "enable" : "disable"} dashboard visibility for <span className="font-semibold text-card-text">{pendingToggle?.icode}</span>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="action-password" className="text-card-text text-xs font-medium">Password</Label>
              <Input
                id="action-password"
                type="password"
                value={actionPassword}
                onChange={(e) => { setActionPassword(e.target.value); setActionError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && actionPassword) handleConfirmVisibility(); }}
                placeholder="Enter password"
                className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                autoFocus
              />
              {actionError && (
                <p className="text-xs text-red-600 mt-1">{actionError}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingToggle(null)} disabled={actionSubmitting} className="border-logo-green/20 text-card-text hover:bg-logo-green/5">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmVisibility}
              disabled={actionSubmitting || !actionPassword}
              className="bg-logo-green text-button-text hover:bg-logo-green/90"
            >
              {actionSubmitting ? "Confirming..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
