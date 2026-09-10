import { NIFTY_INDEX_API_URL } from "@/lib/external-apis";

// Server-side proxy for the index-nav API — research.qodeinvest.com does not
// send CORS headers, so browser callers hit this route instead of it directly.
export async function POST(req: Request) {
  const body = await req.text();

  const upstream = await fetch(NIFTY_INDEX_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
