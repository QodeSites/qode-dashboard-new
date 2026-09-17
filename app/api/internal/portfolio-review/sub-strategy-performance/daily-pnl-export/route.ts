import { NextResponse } from "next/server";
import {
  computeSubStrategyDailyPnl,
  parseOptionalDate,
  type DailyPnlSelection,
} from "@/app/lib/internal-utils";
import { buildSubStrategyDailyPnlWorkbook } from "@/app/lib/excel-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: {
    selections?: DailyPnlSelection[];
    sections?: string[];
    start_date?: string;
    end_date?: string;
    account_type?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "selections and sections are required" },
      { status: 400 },
    );
  }

  if (!body.selections?.length || !body.sections?.length) {
    return NextResponse.json(
      { error: "selections and sections are required" },
      { status: 400 },
    );
  }

  const end = parseOptionalDate(body.end_date);
  if (end === null) {
    return NextResponse.json({ error: "end_date is invalid" }, { status: 400 });
  }
  const start = parseOptionalDate(body.start_date);
  if (start === null) {
    return NextResponse.json(
      { error: "start_date is invalid" },
      { status: 400 },
    );
  }
  if (
    body.account_type !== undefined &&
    body.account_type !== "managed" &&
    body.account_type !== "prop"
  ) {
    return NextResponse.json(
      { error: "account_type must be 'managed' or 'prop'" },
      { status: 400 },
    );
  }

  const rows = await computeSubStrategyDailyPnl(
    body.selections,
    body.sections,
    end,
    start,
    body.account_type === "prop" ? "prop" : "managed",
  );
  const buffer = await buildSubStrategyDailyPnlWorkbook(rows, {
    start: body.start_date ?? null,
    end: body.end_date ?? null,
  }).xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="sub-strategy-daily-pnl.xlsx"',
    },
  });
}
