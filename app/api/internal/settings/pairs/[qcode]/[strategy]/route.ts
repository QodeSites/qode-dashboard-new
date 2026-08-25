import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  updateClientStrategyPair,
  closeClientStrategyPair,
  deleteClientStrategyPair,
} from "@/app/lib/internal-utils";

// identifies a pair by qcode + strategy + effective_from (its natural key)

export async function PATCH(
  req: Request,
  { params }: { params: { qcode: string; strategy: string } },
) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (!body.effective_from) {
    return NextResponse.json(
      { error: "effective_from is required to identify the pair" },
      { status: 400 },
    );
  }

  try {
    // "close" is a distinct, deliberate action (real domain event) --
    // route through it explicitly rather than letting effective_to slip
    // into a routine metadata PATCH
    if (body.effective_to !== undefined) {
      const row = await closeClientStrategyPair(
        params.qcode,
        params.strategy,
        body.effective_from,
        body.effective_to,
      );
      return NextResponse.json(row);
    }
    const row = await updateClientStrategyPair(
      params.qcode,
      params.strategy,
      body.effective_from,
      {
        account_name: body.account_name,
        exposure_tag_suffix: body.exposure_tag_suffix,
        profit_tag_suffix: body.profit_tag_suffix,
      },
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { qcode: string; strategy: string } },
) {
  const { error } = await requireInternal();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const effective_from = searchParams.get("effective_from");
  const confirmed = searchParams.get("confirmed") === "true";
  if (!effective_from) {
    return NextResponse.json(
      { error: "effective_from is required to identify the pair" },
      { status: 400 },
    );
  }

  try {
    const result = await deleteClientStrategyPair(
      params.qcode,
      params.strategy,
      effective_from,
      confirmed,
    );
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
