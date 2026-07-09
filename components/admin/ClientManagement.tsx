"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem} from "@/components/ui/dropdown-menu";
import {
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { ClientCard } from "./ClientCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Account {
  qcode: string;
  account_name: string;
  account_type: string;
  broker: string;
}

interface Client {
  icode: string;
  name: string;
  email: string;
  contactNumber: string | null;
  accounts: Account[];
  accountCount: number;
}

interface ClientManagementProps {
  onImpersonate: (icode: string) => void;
  impersonatingIcode: string | null;
}

export function ClientManagement({ onImpersonate, impersonatingIcode }: ClientManagementProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [isLoading, setIsLoading] = useState(true);
  const [exportingSet, setExportingSet] = useState<Set<string>>(new Set());
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [pendingToggle, setPendingToggle] = useState<{ icode: string; visible: boolean } | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchClients = useCallback(async (searchTerm: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);

      const [clientsRes, visibilityRes] = await Promise.all([
        fetch(`/api/admin/clients?${params}`, { credentials: "include" }),
        fetch("/api/admin/dashboard-visibility", { credentials: "include" }),
      ]);

      if (!clientsRes.ok) throw new Error("Failed to fetch clients");
      const clientsData = await clientsRes.json();
      setClients(clientsData.clients);

      if (visibilityRes.ok) {
        const visibilityData = await visibilityRes.json();
        setVisibilityMap(visibilityData.visibility ?? {});
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleToggleVisibility = (icode: string, visible: boolean) => {
    setPendingToggle({ icode, visible });
    setPassword("");
    setPasswordError("");
  };

  const handleConfirmVisibility = async () => {
    if (!pendingToggle) return;
    setIsSubmitting(true);
    setPasswordError("");

    const { icode, visible } = pendingToggle;

    try {
      const res = await fetch("/api/admin/dashboard-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ icode, dashboard_visible: visible, password }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          setPasswordError("Incorrect password");
          setIsSubmitting(false);
          return;
        }
        setPasswordError("Failed to update visibility");
        setIsSubmitting(false);
        return;
      }
      setVisibilityMap((prev) => ({ ...prev, [icode]: visible }));
      setPendingToggle(null);
    } catch {
      setPasswordError("Something went wrong");
    }
    setIsSubmitting(false);
  };

  useEffect(() => {
    fetchClients(debouncedSearch);
  }, [debouncedSearch, fetchClients]);

  const handleRefresh = () => {
    fetchClients(debouncedSearch);
  };

  // Export handler functions
  const handleDownloadCsv = async (qcode: string[], icode: string) => {
    try {
      // add to set
      setExportingSet((prev) => new Set(prev).add(icode));

      const res = await fetch("/api/export-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qcodes: qcode }),
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${qcode}-data.csv`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      // remove from set
      setExportingSet((prev) => {
        const newSet = new Set(prev);
        newSet.delete(icode);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-heading font-semibold text-card-text">
          Client Management
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="gap-2 text-card-text-secondary"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Search and view toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-card-text-secondary" />
          <Input
            type="search"
            placeholder="Search clients by name, email, or client code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/50"
            autoComplete="off"
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore
          />
        </div>
        <div className="flex items-center border rounded-lg overflow-hidden">
          <Button
            variant={viewMode === "cards" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("cards")}
            className={
              viewMode === "cards"
                ? "bg-logo-green text-button-text rounded-none"
                : "rounded-none"
            }
          >
            <Squares2X2Icon className="h-4 w-4 mr-1" />
            Cards
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className={
              viewMode === "list"
                ? "bg-logo-green text-button-text rounded-none"
                : "rounded-none"
            }
          >
            <ListBulletIcon className="h-4 w-4 mr-1" />
            List
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-card-text-secondary">Loading clients...</div>
        </div>
      )}

      {/* No results */}
      {!isLoading && clients.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-card-text-secondary">No clients found.</div>
        </div>
      )}

      {/* Cards view */}
      {!isLoading && clients.length > 0 && viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <ClientCard
              key={client.icode}
              icode={client.icode}
              name={client.name}
              email={client.email}
              accounts={client.accounts}
              accountCount={client.accountCount}
              onImpersonate={onImpersonate}
              isImpersonating={impersonatingIcode === client.icode}
              dashboardVisible={visibilityMap[client.icode] ?? true}
              onToggleVisibility={handleToggleVisibility}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {!isLoading && clients.length > 0 && viewMode === "list" && (
        <div className="border rounded-lg overflow-hidden bg-white/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>ICode</TableHead>
                <TableHead className="text-center">Accounts</TableHead>
                <TableHead className="text-center">Dashboard</TableHead>
                <TableHead className="text-center">Download</TableHead>
                <TableHead className="text-right">Action</TableHead>
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
                    {client.accountCount}
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
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          disabled={exportingSet.has(client.icode)}
                          className="h-6 w-[90px] px-2 text-xs font-medium bg-logo-green text-button-text hover:bg-logo-green/90 flex items-center justify-center"
                        >
                          {exportingSet.has(client.icode) ? (
                            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              CSV
                            </>
                          )}
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent className="w-30 bg-white border border-gray-200 shadow-md rounded-md">
                        {client.accounts.map((acc) => (
                          <DropdownMenuItem
                            className="text-sm font-bold cursor-pointer px-3 py-2 rounded-sm 
                            hover:bg-logo-green/10 focus:bg-logo-green/10 
                            hover:text-gray-700 focus:text-gray-700 text-gray-700"
                            key={acc.qcode}
                            onClick={() =>
                              handleDownloadCsv([acc.qcode], client.icode)
                            }
                          >
                            <Download className="h-2 w-2 mr-1" />
                            {acc.qcode}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-logo-green border-logo-green/30 hover:bg-logo-green/5"
                      onClick={() => onImpersonate(client.icode)}
                      disabled={impersonatingIcode !== null}
                    >
                      {impersonatingIcode === client.icode ? "Loading..." : "View Dashboard"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={pendingToggle !== null} onOpenChange={(open) => { if (!open) setPendingToggle(null); }}>
        <DialogContent className="sm:max-w-sm border-logo-green/20 bg-primary-bg">
          <DialogHeader>
            <DialogTitle className="text-card-text font-heading text-xl">Confirm Visibility Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-card-text-secondary">
              Enter the admin password to {pendingToggle?.visible ? "enable" : "disable"} dashboard visibility for <span className="font-semibold text-card-text">{pendingToggle?.icode}</span>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="visibility-password" className="text-card-text text-xs font-medium">Password</Label>
              <Input
                id="visibility-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && password) handleConfirmVisibility(); }}
                placeholder="Enter password"
                className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                autoFocus
              />
              {passwordError && (
                <p className="text-xs text-red-600 mt-1">{passwordError}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingToggle(null)} disabled={isSubmitting} className="border-logo-green/20 text-card-text hover:bg-logo-green/5">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmVisibility}
              disabled={isSubmitting || !password}
              className="bg-logo-green text-button-text hover:bg-logo-green/90"
            >
              {isSubmitting ? "Confirming..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
