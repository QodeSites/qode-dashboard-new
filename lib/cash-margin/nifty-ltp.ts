/**
 * lib/cash-margin/nifty-ltp.ts
 * Live NIFTY 50 spot price (LTP), used by margin-requirements.ts to derive
 * NIFTY_LOT_SIZE = niftyLtp / PUT_PROTECTION_AVG_PRICE_PER_QTY at request
 * time, instead of the previously-hardcoded 65 (see
 * docs/assumptions-and-changes-from-krish-logic.md §14b).
 *
 * Source: Yahoo Finance's unauthenticated chart API for symbol ^NSEI. This
 * is an unofficial endpoint (no key/auth, no SLA) -- failures are expected
 * occasionally, so callers must treat a null return as "fall back to the
 * last-known-good hardcoded constant", never as a hard error.
 *
 * Fetches live on every call -- no polling/TTL. The last successful value is
 * kept in memory only as an unreachable-Yahoo fallback, never served in
 * place of a fresh fetch that succeeded.
 */

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=1d";
const FETCH_TIMEOUT_MS = 5000;

let lastGood: number | null = null;

interface YahooChartResponse {
  chart?: {
    result?: Array<{ meta?: { regularMarketPrice?: number } }>;
    error?: unknown;
  };
}

async function fetchFromYahoo(): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(YAHOO_CHART_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Always attempts a live fetch. Returns the fresh NIFTY 50 LTP on success,
 * or the last successful value if Yahoo is unreachable this time (null if
 * there has never been a successful fetch yet).
 */
export async function getNiftyLtp(): Promise<number | null> {
  const price = await fetchFromYahoo();
  if (price !== null) {
    lastGood = price;
    return price;
  }
  return lastGood;
}
