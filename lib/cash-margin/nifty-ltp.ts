/**
 * lib/cash-margin/nifty-ltp.ts
 * Live NIFTY 50 LTP for the Inputs panel's (§2f) Put Protection Calculation
 * block ONLY -- completely isolated from margin-requirements.ts's `niftyLtp`
 * POST field (which stays caller-supplied/manual, for Excel verification,
 * and never triggers a live fetch -- see docs/assumptions-and-changes-from-krish-logic.md
 * §14b). This fetch never feeds margin math anywhere; it's display-only for
 * this block, and its value is not used anywhere else.
 *
 * Fetches Yahoo Finance's unauthenticated chart API fresh on every call. If
 * the fetch fails, falls back to the last successfully fetched value
 * (in-memory, process-lifetime cache) instead of erroring, so a transient
 * upstream outage shows stale data rather than a broken panel.
 */

const YAHOO_NIFTY_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI";

let cached: { ltp: number; fetchedAt: Date } | null = null;

export interface NiftyLtpResult {
  ltp: number | null;
  fetchedAt: Date | null;
  /** True when this is a fallback value from a previous successful fetch, not a fresh one. */
  stale: boolean;
  fetchOk: boolean;
}

export async function fetchNiftyLtp(): Promise<NiftyLtpResult> {
  try {
    const res = await fetch(YAHOO_NIFTY_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Yahoo Finance responded ${res.status}`);
    const json = await res.json();
    const ltp = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof ltp !== "number" || !Number.isFinite(ltp)) {
      throw new Error("Unexpected Yahoo Finance response shape");
    }
    cached = { ltp, fetchedAt: new Date() };
    return { ltp, fetchedAt: cached.fetchedAt, stale: false, fetchOk: true };
  } catch (e) {
    console.warn("[cash-margin] Live NIFTY LTP fetch failed, falling back to cache:", (e as Error).message);
    if (cached) return { ltp: cached.ltp, fetchedAt: cached.fetchedAt, stale: true, fetchOk: false };
    return { ltp: null, fetchedAt: null, stale: false, fetchOk: false };
  }
}
