import { NextResponse } from "next/server";
import {
  computeCompare,
  type CompareSelection,
} from "@/app/lib/internal-utils";
import { requireInternal } from "@/app/lib/admin-utils";

interface GroupedSelection {
  qcode: string;
  system_tags: string[];
}

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { selections?: GroupedSelection[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.selections || body.selections.length === 0) {
    return NextResponse.json(
      { error: "selections is required" },
      { status: 400 },
    );
  }

  // one qcode can list multiple tags — flatten to the flat shape computeCompare expects
  const flat: CompareSelection[] = body.selections.flatMap((s) =>
    (s.system_tags ?? []).map((tag) => ({ qcode: s.qcode, system_tag: tag })),
  );

  if (flat.length === 0) {
    return NextResponse.json(
      { error: "each selection needs at least one system_tag" },
      { status: 400 },
    );
  }

  const data = await computeCompare(flat);
  return NextResponse.json(data);
}
