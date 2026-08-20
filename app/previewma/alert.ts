"use client";

import { useEffect, useState } from "react";
import dummyData from "./dummyAlert.json";

// ─── Types matching the real API response ─────────────────────────────────

export type Severity =  "Warning" | "Action Required"|"Unavailable";
type RawSeverity =  "WARNING" | "ACTION_REQUIRED"|"UNAVAILABLE" ;

export interface AlertApiRow {
  client: string;
  qcode: string;
  strategy: string;
  tier: string;
  metricKey: string;
  metric: string;
  currentValue: number;
  healthyThreshold: number;
  warningThreshold: number;
  upsideThreshold: number | null;
  delta: number;
  severity: RawSeverity; 
  marginFetchOk: boolean;
  mastersheetDate: string;
}

export interface AlertApiResponse {
  generatedAt: string;
  count: number;
  rows: AlertApiRow[];
}

export interface DerivedAlert extends Omit<AlertApiRow, "severity"> {
  severity: Severity; 
}

export interface ThresholdRefRow {
  metric: string;
  tier: string;
  healthyThreshold: number;
  warningThreshold: number;
  upsideThreshold: number | null;
}

function mapSeverity(s: RawSeverity): Severity {
  if (s === "WARNING") return "Warning";
  if (s === "ACTION_REQUIRED") return "Action Required";
  return "Unavailable";
}

function deriveAlert(row: AlertApiRow): DerivedAlert {
  const severity = mapSeverity(row.severity);
  return { ...row, severity };
}

const ALERTS_ENDPOINT = "/api/internal/cash-margin/alerts";

export async function fetchAlerts(): Promise<{ alerts: DerivedAlert[]; generatedAt: string | null }> {
  const res = await fetch(ALERTS_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data: AlertApiResponse = await res.json();
  return { alerts: data.rows.map(deriveAlert), generatedAt: data.generatedAt };
}

export function getAlertSummary(alerts: DerivedAlert[]) {
  const warning = alerts?.filter((a) => a.severity === "Warning").length;
  const actionRequired = alerts?.filter((a) => a.severity === "Action Required").length;
  const unavailable = alerts?.filter((a) => a.severity === "Unavailable").length;
    return { totalOpen: warning + actionRequired + unavailable, warning, actionRequired, unavailable };
}

export function getThresholdReference(alerts: DerivedAlert[]): ThresholdRefRow[] {
  const map = new Map<string, ThresholdRefRow>();
  alerts.forEach((a) => {
    const key = `${a.metric}__${a.tier}`;
    if (!map.has(key)) {
      map.set(key, {
        metric: a.metric,
        tier: a.tier,
        healthyThreshold: a.healthyThreshold,
        warningThreshold: a.warningThreshold,
        upsideThreshold: a.upsideThreshold,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.metric.localeCompare(b.metric) || a.tier.localeCompare(b.tier));
}

export function fmtPct(v: number| null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(2)}%`;
}
export function fmtSignedPct(v: number| null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(2)}%`;
}
export function fmtDate(iso: string) {
    const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;

}
  
// ─── Shared hook ────────────────────────────────────────────────────────────
export function useAlerts() {
  const [alerts, setAlerts] = useState<DerivedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlerts().then((res) => {
      if (cancelled) return;
      setAlerts(res.alerts);
      setGeneratedAt(res.generatedAt);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { alerts, loading, generatedAt, summary: getAlertSummary(alerts) };
}