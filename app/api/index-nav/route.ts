import { NIFTY_INDEX_API_URL } from "@/lib/external-apis";

// Server-side proxy for the index-nav API — research.qodeinvest.com does not
// send CORS headers, so browser callers hit this route instead of it directly.
//
// research.qodeinvest.com is slow/occasionally flaky, and different clients
// request overlapping-but-different date ranges for the same index (e.g. one
// client's inception is 2021, another's is 2020) — a naive exact-range cache
// would treat those as unrelated and refetch overlapping data every time.
//
// NIFTY NAV is an end-of-day series: once a date's value is published it
// never changes. So instead of caching raw responses per exact range, we
// cache the actual per-date series per index. A request is only "uncovered"
// for the slice of its range outside what we've already fetched — e.g. after
// fetching 2021-2022, a later request for 2020-2021 only needs upstream data
// for 2020-2021, not a refetch of 2021-2022 too. We always fetch the union
// of the request and the existing cached window in one call, so the cached
// window only ever grows and we never need to stitch together gaps.
interface IndexPoint {
  date: string;
  nav: number;
}

interface IndexCacheEntry {
  points: Map<string, number>; // date (YYYY-MM-DD) -> nav
  minDate: string;
  maxDate: string;
  fetchedAt: number;
}

// Refetch at least once a day even when the range is already covered, so a
// newly-published EOD point (or a late revision) for "today" gets picked up.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const UPSTREAM_TIMEOUT_MS = 10 * 1000; // 10 seconds

const indexCache = new Map<string, IndexCacheEntry>();

function isCovered(entry: IndexCacheEntry | undefined, start: string, end: string): boolean {
  if (!entry) return false;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return false;
  return start >= entry.minDate && end <= entry.maxDate;
}

async function fetchUpstream(
  startDate: string,
  endDate: string,
  indices: string[],
  signal: AbortSignal
): Promise<Record<string, IndexPoint[]>> {
  const upstream = await fetch(NIFTY_INDEX_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, indices }),
    signal,
  });
  if (!upstream.ok) {
    throw new Error(`Upstream responded with ${upstream.status}`);
  }
  const json = await upstream.json();
  return json?.data?.data ?? {};
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  const startDate = payload?.startDate;
  const endDate = payload?.endDate;
  const indices: string[] = Array.isArray(payload?.indices) ? payload.indices : [];

  if (!startDate || !endDate || indices.length === 0) {
    return new Response(JSON.stringify({ error: "startDate, endDate and indices are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const uncoveredIndices = indices.filter((idx) => !isCovered(indexCache.get(idx), startDate, endDate));

    if (uncoveredIndices.length > 0) {
      // Fetch each uncovered index for the union of [requested range] and
      // [existing cached window], so the window only ever grows.
      await Promise.all(
        uncoveredIndices.map(async (idx) => {
          const existing = indexCache.get(idx);
          const fetchStart = existing && existing.minDate < startDate ? existing.minDate : startDate;
          const fetchEnd = existing && existing.maxDate > endDate ? existing.maxDate : endDate;

          const upstreamData = await fetchUpstream(fetchStart, fetchEnd, [idx], controller.signal);
          const points = upstreamData[idx] ?? [];

          const entry: IndexCacheEntry = existing ?? {
            points: new Map(),
            minDate: fetchStart,
            maxDate: fetchEnd,
            fetchedAt: 0,
          };
          for (const p of points) entry.points.set(p.date, p.nav);
          entry.minDate = fetchStart;
          entry.maxDate = fetchEnd;
          entry.fetchedAt = Date.now();
          indexCache.set(idx, entry);
        })
      );
    }

    const responseData: Record<string, IndexPoint[]> = {};
    for (const idx of indices) {
      const entry = indexCache.get(idx);
      const points: IndexPoint[] = [];
      if (entry) {
        for (const [date, nav] of entry.points) {
          if (date >= startDate && date <= endDate) points.push({ date, nav });
        }
        points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      }
      responseData[idx] = points;
    }

    return new Response(JSON.stringify({ data: { data: responseData } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return new Response(
      JSON.stringify({
        error: isTimeout ? "Upstream index-nav request timed out" : "Failed to reach index-nav upstream",
      }),
      { status: 504, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}
