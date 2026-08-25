import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchClientStrategyPairs,
  createClientStrategyPair,
} from "@/app/lib/internal-utils";

export async function GET(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const qcode = searchParams.get("qcode") ?? undefined;
  const strategy = searchParams.get("strategy") ?? undefined;
  const as_of_date = searchParams.get("as_of_date") ?? undefined;

  try {
    const rows = await fetchClientStrategyPairs({
      qcode,
      strategy,
      as_of_date,
    });
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (
    !body.qcode ||
    !body.account_name ||
    !body.strategy ||
    !body.exposure_tag_suffix ||
    !body.profit_tag_suffix ||
    !body.effective_from
  ) {
    return NextResponse.json(
      {
        error:
          "qcode, account_name, strategy, exposure_tag_suffix, profit_tag_suffix, and effective_from are required",
      },
      { status: 400 },
    );
  }

  try {
    const row = await createClientStrategyPair({
      qcode: body.qcode,
      account_name: body.account_name,
      strategy: body.strategy,
      exposure_tag_suffix: body.exposure_tag_suffix,
      profit_tag_suffix: body.profit_tag_suffix,
      effective_from: body.effective_from,
    });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
