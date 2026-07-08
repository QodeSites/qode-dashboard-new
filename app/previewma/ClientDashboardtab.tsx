"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

import {
  fetchClients,
  fetchClientDashboard,
  ApiError,
  type ClientListItem,
  type ClientDashboardResponse,
} from "./api";
import { SearchableSelect } from "./Searchableselect";
import { ClientDetail } from "./ClientDetails";

// A tag name is treated as "Individual" if it ends in one or more digits
// (e.g. BNPsar2, NLONG14, SLONG21) — these are per-leg/sub-account tags.
// Everything else (LONG, PSAR, Qode Total Portfolio, Bond Stock Holdings, ...)
// is an "Aggregate" tag. This mirrors how the real tag names are structured;
// there is no separate endpoint for "all possible tags", so this list only
// ever contains tag names actually seen in a loaded client dashboard.
export function classifyTags(tagNames: string[]): { aggregate: string[]; individual: string[] } {
  const aggregate: string[] = [];
  const individual: string[] = [];
  for (const name of tagNames) {
    if (/\d+$/.test(name)) {
      individual.push(name);
    } else {
      aggregate.push(name);
    }
  }
  return { aggregate: aggregate.sort(), individual: individual.sort() };
}

interface ClientDashboardsTabProps {
  riskFreeRate: number;
  onTagsLoaded?: (tagNames: string[]) => void;
  onClientsLoaded?: (count: number) => void;
  fetchTrigger?: number;
  selectedTagFilter: string[];
  onTagFilterDefault?: (profitTag: string) => void;
}

export function ClientDashboardsTab({
  riskFreeRate,
  onTagsLoaded,
  onClientsLoaded,
  fetchTrigger = 0,
  selectedTagFilter,
  onTagFilterDefault,
}: ClientDashboardsTabProps) {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [selectedQcode, setSelectedQcode] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>("");   // empty = latest

  const [dashboardData, setDashboardData] = useState<ClientDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Load the client list once on mount.
  useEffect(() => {
    let cancelled = false;
    setClientsLoading(true);
    setClientsError(null);

    fetchClients()
      .then((list) => {
        if (cancelled) return;
        setClients(list);
        onClientsLoaded?.(list.length);
        if (list.length > 0) {
          setSelectedQcode(list[0].qcode);
          const real = list[0].strategies.filter((s) => s.strategy !== "combined");
          if (real.length === 1) {
            setSelectedStrategy(real[0].strategy);
          } else {
            const combined = list[0].strategies.find((s) => s.strategy === "combined");
            setSelectedStrategy(combined ? "combined" : list[0].strategies[0]?.strategy || null);
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setClientsError(err instanceof ApiError ? err.message : "Failed to load client list.");
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the dashboard payload whenever the selected client or strategy changes.
  useEffect(() => {
    if (!selectedQcode || !selectedStrategy) return;
    let cancelled = false;
    setDashboardLoading(true);
    setDashboardError(null);

    fetchClientDashboard(selectedQcode, selectedStrategy, riskFreeRate, asOf || undefined)
      .then((data) => {
        if (cancelled) return;
        setDashboardData(data);
        onTagsLoaded?.(Object.keys(data.tags));
        onTagFilterDefault?.(data.profit_tag);
      })
      .catch((err) => {
        if (cancelled) return;
        setDashboardError(err instanceof ApiError ? err.message : "Failed to load client dashboard.");
        setDashboardData(null);
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQcode, selectedStrategy, fetchTrigger, asOf]);

  const selectedClient = clients.find((c) => c.qcode === selectedQcode);

  const clientOptions = clients.map((c) => ({
    value: c.qcode,
    label: c.account_name,
    sublabel: c.qcode,
  }));

  // A client with only one real strategy (+ the synthetic "combined") should
  // not show "combined" as an option — just show and auto-select the real one.
  const realStrategies = (selectedClient?.strategies || []).filter(
    (s) => s.strategy !== "combined"
  );
  const isSingleStrategy = realStrategies.length === 1;

  const strategyOptions = isSingleStrategy
    ? realStrategies.map((s) => ({ value: s.strategy, label: s.strategy }))
    : (selectedClient?.strategies || []).map((s) => ({
        value: s.strategy,
        label: s.strategy === "combined" ? "Combined (all strategies)" : s.strategy,
      }));

  function handleClientChange(qcode: string) {
    setSelectedQcode(qcode);
    const client = clients.find((c) => c.qcode === qcode);
    const real = (client?.strategies || []).filter((s) => s.strategy !== "combined");
    if (real.length === 1) {
      // Only one real strategy — auto-select it, skip combined
      setSelectedStrategy(real[0].strategy);
    } else {
      // Multiple strategies — default to combined
      const combined = client?.strategies.find((s) => s.strategy === "combined");
      setSelectedStrategy(combined ? "combined" : client?.strategies[0]?.strategy || null);
    }
  }

  if (clientsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-card-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading clients…
      </div>
    );
  }

  if (clientsError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Couldn&apos;t load the client list.</p>
          <p className="text-red-600/80 mt-0.5">{clientsError}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-3xl">
        <SearchableSelect
          label="Client"
          placeholder="Select a client"
          options={clientOptions}
          value={selectedQcode}
          onChange={handleClientChange}
        />
        <SearchableSelect
          label="Strategy"
          placeholder="Select a strategy"
          options={strategyOptions}
          value={selectedStrategy}
          onChange={setSelectedStrategy}
          disabled={!selectedClient}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-card-text-secondary">
            As of Date
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-full rounded-lg border border-logo-green/20 bg-white px-3 py-2.5 text-sm text-card-text focus:outline-none focus:border-logo-green/40"
          />
          {asOf && (
            <button
              type="button"
              onClick={() => setAsOf("")}
              className="text-xs text-card-text-secondary hover:text-logo-green text-left"
            >
              ✕ Clear (use latest)
            </button>
          )}
        </div>
      </div>

      {dashboardLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-card-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading client dashboard…
        </div>
      )}

      {!dashboardLoading && dashboardError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Couldn&apos;t load this client&apos;s dashboard.</p>
            <p className="text-red-600/80 mt-0.5">{dashboardError}</p>
          </div>
        </div>
      )}

      {!dashboardLoading && !dashboardError && dashboardData && (
        <ClientDetail data={dashboardData} tagFilter={selectedTagFilter} />
      )}
    </div>
  );
}