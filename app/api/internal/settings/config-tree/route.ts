import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchResolvedConfigTree,
  previewResolvedConfigTree,
} from "@/app/lib/internal-utils";

export async function GET(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const strategy = searchParams.get("strategy");
  if (!strategy) {
    return NextResponse.json(
      { error: "strategy is required" },
      { status: 400 },
    );
  }
  const qcode = searchParams.get("qcode") ?? "";
  const ratio_type =
    (searchParams.get("ratio_type") as "ideal" | "model") ?? "ideal";
  const as_of_date = searchParams.get("as_of_date") ?? undefined;

  try {
    const tree = await fetchResolvedConfigTree(
      strategy,
      qcode,
      ratio_type,
      as_of_date,
    );
    return NextResponse.json(tree);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (!body.strategy || !body.ratio_type || !body.overrides) {
    return NextResponse.json(
      { error: "strategy, ratio_type, and overrides are required" },
      { status: 400 },
    );
  }

  try {
    const tree = await previewResolvedConfigTree({
      strategy: body.strategy,
      qcode: body.qcode,
      ratio_type: body.ratio_type,
      overrides: body.overrides,
    });
    return NextResponse.json(tree);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
