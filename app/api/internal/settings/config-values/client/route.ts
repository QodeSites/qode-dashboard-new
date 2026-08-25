import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchConfigValuesForClient,
  writeClientConfigValue,
} from "@/app/lib/internal-utils";

export async function GET(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const qcode = searchParams.get("qcode");
  const strategy = searchParams.get("strategy");
  if (!qcode || !strategy) {
    return NextResponse.json(
      { error: "qcode and strategy are required" },
      { status: 400 },
    );
  }
  const category =
    (searchParams.get("category") as "ratio" | "threshold" | "all") ?? "all";
  const as_of_date =
    searchParams.get("as_of_date") ?? new Date().toISOString().slice(0, 10);

  try {
    const rows = await fetchConfigValuesForClient(
      qcode,
      strategy,
      category,
      as_of_date,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const { error, session } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (
    !body.qcode ||
    !body.strategy ||
    !body.config_key ||
    !body.ratio_type ||
    !body.as_of_date
  ) {
    return NextResponse.json(
      {
        error:
          "qcode, strategy, config_key, ratio_type, and as_of_date are required",
      },
      { status: 400 },
    );
  }

  try {
    // value: null tombstones a client override -- the "remove override"
    // convention, not a DELETE. A tombstone and never-having-had-one
    // resolve identically; only the historical record differs.
    const result = await writeClientConfigValue(body.qcode, body.strategy, {
      config_key: body.config_key,
      ratio_type: body.ratio_type,
      value: body.value ?? null,
      as_of_date: body.as_of_date,
      updated_by: session?.user?.email ?? "unknown",
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
