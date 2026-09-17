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

  let body: {
    selections?: GroupedSelection[];
    rebase_from?: string;
    rebase_to?: string;
  };
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

  // Both optional — omitting either preserves each line's own
  // inception-to-latest range (unchanged default behavior).
  let rebaseFrom: Date | undefined;
  let rebaseTo: Date | undefined;
  if (body.rebase_from) {
    rebaseFrom = new Date(body.rebase_from);
    if (isNaN(rebaseFrom.getTime())) {
      return NextResponse.json(
        { error: "Invalid rebase_from date" },
        { status: 400 },
      );
    }
  }
  if (body.rebase_to) {
    rebaseTo = new Date(body.rebase_to);
    if (isNaN(rebaseTo.getTime())) {
      return NextResponse.json(
        { error: "Invalid rebase_to date" },
        { status: 400 },
      );
    }
  }
  if ((rebaseFrom && !rebaseTo) || (!rebaseFrom && rebaseTo)) {
    return NextResponse.json(
      { error: "rebase_from and rebase_to must be provided together" },
      { status: 400 },
    );
  }
  if (rebaseFrom && rebaseTo && rebaseFrom.getTime() > rebaseTo.getTime()) {
    return NextResponse.json(
      { error: "rebase_from must be before rebase_to" },
      { status: 400 },
    );
  }

  const data = await computeCompare(flat, rebaseFrom, rebaseTo);
  return NextResponse.json(data);
}
