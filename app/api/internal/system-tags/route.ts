import { NextResponse } from "next/server";
import { fetchSystemTags } from "@/app/lib/internal-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { qcode?: string; strategy?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.qcode) {
    return NextResponse.json({ error: "qcode is required" }, { status: 400 });
  }
  if (!body.strategy) {
    return NextResponse.json(
      { error: "strategy is required" },
      { status: 400 },
    );
  }

  const tags = await fetchSystemTags(body.qcode, body.strategy);
  return NextResponse.json(tags);
}
