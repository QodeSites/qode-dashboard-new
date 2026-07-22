/**
 * lib/cash-margin/margin-api.ts
 * Live Zerodha margin fetch via the RMS server-drive margin endpoint.
 *
 * Ported from managed_accounts_analysis/server_drive.py
 * (fetch_margin, fetch_margins, get_available_from_zerodha).
 *
 * v1: single attempt per client on the display name (account_name). NO
 * fallback-by-code (that column isn't confirmed in the new schema). A failed
 * fetch returns null -> caller treats it as "unavailable", never zero.
 */

const API_BASE = "https://api.backup-rms.qodeinvest.com";
const MARGIN_URL = `${API_BASE}/margin`;
const TIMEOUT_MS = 30_000;

export interface MarginAvailable {
  /** equity.utilised.liquid_collateral -- Cash Collateral (Liquid Funds). */
  liquidCollateral: number;
  /** equity.utilised.stock_collateral -- Non-Cash Collateral (stocks). */
  stockCollateral: number;
}

function getApiKey(): string {
  return (process.env.QODE_API_KEY ?? "").trim();
}

/**
 * Parse the margin API response into the two aggregate figures we compare
 * against. The real response wraps everything in a `marginData` envelope
 * (marginData.equity.utilised.*); tolerate both the wrapped and flat shapes.
 * Returns null if the payload is missing/unusable.
 */
export function parseMarginAvailable(marginData: any): MarginAvailable | null {
  if (!marginData) return null;
  const payload = marginData.marginData ?? marginData ?? {};
  const utilised = payload?.equity?.utilised ?? {};
  return {
    liquidCollateral: Number(utilised.liquid_collateral) || 0,
    stockCollateral: Number(utilised.stock_collateral) || 0,
  };
}

/**
 * Fetch live margin for one client by display name. Returns parsed available
 * figures, or null on any failure (missing key, network error, non-200,
 * non-JSON).
 */
export async function fetchMargin(clientName: string): Promise<MarginAvailable | null> {
  const key = getApiKey();
  if (!key) {
    console.warn(`[margin] No QODE_API_KEY set -- margin fetch for "${clientName}" will fail.`);
    return null;
  }

  const url = `${MARGIN_URL}/${encodeURIComponent(clientName)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!resp.ok) {
      console.warn(`[margin] "${clientName}" fetch failed -- HTTP ${resp.status}.`);
      return null;
    }
    const body = await resp.json().catch(() => null);
    if (!body) {
      console.warn(`[margin] "${clientName}" response was not valid JSON.`);
      return null;
    }
    return parseMarginAvailable(body);
  } catch (e) {
    console.warn(`[margin] "${clientName}" request error: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch margin for many clients concurrently. Returns a Map keyed by the
 * SAME client name string passed in. A present key with a null value means
 * "fetch failed / unavailable" (distinct from a collateral of zero).
 */
export async function fetchMargins(clientNames: string[]): Promise<Map<string, MarginAvailable | null>> {
  const unique = Array.from(new Set(clientNames));
  const results = await Promise.allSettled(unique.map((name) => fetchMargin(name)));
  const map = new Map<string, MarginAvailable | null>();
  unique.forEach((name, i) => {
    const r = results[i];
    map.set(name, r.status === "fulfilled" ? r.value : null);
  });
  return map;
}
