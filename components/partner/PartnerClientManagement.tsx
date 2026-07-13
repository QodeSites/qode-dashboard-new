"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { ClientCard } from "@/components/admin/ClientCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
  accounts: Account[];
  accountCount: number;
}

interface PartnerClientManagementProps {
  onImpersonate: (icode: string) => void;
  impersonatingIcode: string | null;
}

export function PartnerClientManagement({ onImpersonate, impersonatingIcode }: PartnerClientManagementProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [isLoading, setIsLoading] = useState(true);

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

      const res = await fetch(`/api/partner/clients?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      const data = await res.json();
      setClients(data.clients);
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients(debouncedSearch);
  }, [debouncedSearch, fetchClients]);

  const handleRefresh = () => {
    fetchClients(debouncedSearch);
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
            placeholder="Search clients by name, email, or client code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/50"
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
              showCsvExport={false}
              showQcode={false}
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

    </div>
  );
}
