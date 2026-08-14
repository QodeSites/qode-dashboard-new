"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SelectionCheckbox } from "@/components/dashboard-visibility/selection-checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PAGE_KEYS, PAGE_LABELS, type PageKey } from "@/app/lib/page-visibility";

interface Client {
  icode: string;
  name: string;
  email: string;
}

// { [icode]: { [page]: visible } }
type VisibilityMap = Record<string, Partial<Record<PageKey, boolean>>>;

type PendingAction =
  | { scope: "single"; icode: string; page: PageKey; visible: boolean }
  | { scope: "bulk"; icodes: string[]; page: PageKey; visible: boolean };

export default function DashboardVisibilityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [unlocked, setUnlocked] = useState(false);
  const [entryPassword, setEntryPassword] = useState("");
  const [entryError, setEntryError] = useState("");
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<VisibilityMap>({});
  const [isLoading, setIsLoading] = useState(false);

  const [selectedIcodes, setSelectedIcodes] = useState<Set<string>>(new Set());
  const [bulkPage, setBulkPage] = useState<PageKey>(PAGE_KEYS[0]);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
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

  const handleToggleVisibility = (icode: string, page: PageKey, visible: boolean) => {
    setPendingAction({ scope: "single", icode, page, visible });
    setActionPassword("");
    setActionError("");
  };

  const handleBulkApply = (visible: boolean) => {
    if (selectedIcodes.size === 0) return;
    setPendingAction({ scope: "bulk", icodes: Array.from(selectedIcodes), page: bulkPage, visible });
    setActionPassword("");
    setActionError("");
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIcodes(checked ? new Set(clients.map((c) => c.icode)) : new Set());
  };

  const toggleSelectOne = (icode: string, checked: boolean) => {
    setSelectedIcodes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(icode);
      else next.delete(icode);
      return next;
    });
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionSubmitting(true);
    setActionError("");

    const { page, visible } = pendingAction;
    const icodes = pendingAction.scope === "single" ? [pendingAction.icode] : pendingAction.icodes;

    try {
      const res = await fetch("/api/admin/dashboard-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ icodes, page, dashboard_visible: visible, password: actionPassword }),
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
      setVisibilityMap((prev) => {
        const next = { ...prev };
        for (const icode of icodes) {
          next[icode] = { ...next[icode], [page]: visible };
        }
        return next;
      });
      if (pendingAction.scope === "bulk") setSelectedIcodes(new Set());
      setPendingAction(null);
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

  const allSelected = clients.length > 0 && selectedIcodes.size === clients.length;
  const someSelected = selectedIcodes.size > 0 && !allSelected;

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
        <>
          {/* Bulk action bar — appears once at least one client is selected */}
          {selectedIcodes.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-logo-green/20 bg-white/70 px-4 py-3">
              <span className="text-sm font-medium text-card-text">
                {selectedIcodes.size} selected
              </span>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-card-text-secondary">Page</Label>
                <Select value={bulkPage} onValueChange={(v) => setBulkPage(v as PageKey)}>
                  <SelectTrigger className="h-8 w-44 border-logo-green/20 bg-white text-card-text text-sm font-normal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-card-text">
                    {PAGE_KEYS.map((page) => (
                      <SelectItem key={page} value={page}>
                        {PAGE_LABELS[page]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => handleBulkApply(true)}
                className="bg-logo-green text-button-text hover:bg-logo-green/90"
              >
                Show
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkApply(false)}
                className="border-logo-green/20 text-card-text hover:bg-logo-green/5"
              >
                Hide
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIcodes(new Set())}
                className="text-card-text-secondary hover:text-logo-green ml-auto"
              >
                Clear selection
              </Button>
            </div>
          )}

          <div className="border rounded-lg overflow-x-auto bg-white/50">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-card-text-secondary">Loading clients...</div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectionCheckbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                        aria-label="Select all clients"
                      />
                    </TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>ICode</TableHead>
                    {PAGE_KEYS.map((page) => (
                      <TableHead key={page} className="text-center whitespace-nowrap">
                        {PAGE_LABELS[page]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow
                      key={client.icode}
                      data-state={selectedIcodes.has(client.icode) ? "selected" : undefined}
                      className="data-[state=selected]:bg-logo-green/10"
                    >
                      <TableCell>
                        <SelectionCheckbox
                          checked={selectedIcodes.has(client.icode)}
                          onCheckedChange={(checked) => toggleSelectOne(client.icode, checked === true)}
                          aria-label={`Select ${client.name}`}
                        />
                      </TableCell>
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
                      {PAGE_KEYS.map((page) => {
                        const visible = visibilityMap[client.icode]?.[page] ?? true;
                        return (
                          <TableCell key={page} className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className={`text-xs font-medium ${visible ? "text-logo-green" : "text-card-text-secondary"}`}>
                                {visible ? "On" : "Off"}
                              </span>
                              <Switch
                                checked={visible}
                                onCheckedChange={(checked) => handleToggleVisibility(client.icode, page, checked)}
                                className="data-[state=checked]:bg-logo-green data-[state=unchecked]:bg-card-text-secondary/30"
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      {/* Confirm password modal — shared by per-row toggles and bulk apply */}
      <Dialog open={pendingAction !== null} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <DialogContent className="sm:max-w-sm border-logo-green/20 bg-primary-bg">
          <DialogHeader>
            <DialogTitle className="text-card-text font-heading text-xl">Confirm Visibility Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-card-text-secondary">
              {pendingAction && (
                pendingAction.scope === "single" ? (
                  <>
                    Enter the password to {pendingAction.visible ? "enable" : "disable"}{" "}
                    {PAGE_LABELS[pendingAction.page]} visibility for{" "}
                    <span className="font-semibold text-card-text">{pendingAction.icode}</span>.
                  </>
                ) : (
                  <>
                    Enter the password to {pendingAction.visible ? "enable" : "disable"}{" "}
                    {PAGE_LABELS[pendingAction.page]} visibility for{" "}
                    <span className="font-semibold text-card-text">{pendingAction.icodes.length} selected clients</span>.
                  </>
                )
              )}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="action-password" className="text-card-text text-xs font-medium">Password</Label>
              <Input
                id="action-password"
                type="password"
                value={actionPassword}
                onChange={(e) => { setActionPassword(e.target.value); setActionError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && actionPassword) handleConfirmAction(); }}
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
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={actionSubmitting} className="border-logo-green/20 text-card-text hover:bg-logo-green/5">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
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
