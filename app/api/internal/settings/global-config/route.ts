import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchGlobalConfig,
  createGlobalConfigEntry,
} from "@/app/lib/internal-utils";

export async function GET(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") ?? undefined;

  try {
    const rows = await fetchGlobalConfig(key);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const { error, session } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (!body.key || body.value === undefined) {
    return NextResponse.json(
      { error: "key and value are required" },
      { status: 400 },
    );
  }

  try {
    const row = await createGlobalConfigEntry({
      key: body.key,
      value: String(body.value),
      data_type: body.data_type,
      updated_by: session?.user?.email ?? "unknown",
    });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
