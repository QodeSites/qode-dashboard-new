import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function round(v: number | null | undefined, d: number): number | null {
  if (v == null || !isFinite(v) || isNaN(v)) return null;
  return parseFloat(v.toFixed(d));
}

export function isActive(until: string | null, today: string): boolean {
  return !until || until >= today;
}

// Display-only formatter: "YYYY-MM-DD" -> "DD-MM-YYYY". Only for fields
// rendered as plain text on the frontend (e.g. TagMetrics.start_date/
// end_date, BenchmarkMetrics.start_date/end_date, client-dashboard's
// data_as_of) — never for a `series[].date`/`inception_date`/`effective_to`
// value, since those are still re-parsed with `new Date(...)`, sorted
// lexicographically, or used in Excel `formatDate()` elsewhere and must stay
// ISO for that to keep working.
export function toDisplayDate(iso: string): string {
  if (!iso) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export const MS = 1000 * 60 * 60 * 24;

export function mean(a: number[]): number {
  return a.length > 0 ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

export function parseOptionalDate(input?: string): Date | null | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
