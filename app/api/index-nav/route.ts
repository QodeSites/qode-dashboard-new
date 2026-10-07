import { NIFTY_INDEX_API_URL } from "@/lib/external-apis";

// Server-side proxy for the index-nav API — research.qodeinvest.com does not
// send CORS headers, so browser callers hit this route instead of it directly.
export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 10 * 1000;

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
    const upstream = await fetch(NIFTY_INDEX_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, indices }),
      cache: "no-store",
      signal: controller.signal,
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
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
