import { NextResponse } from "next/server";
import {
  computeSubStrategyPerformance,
  parseOptionalDate,
} from "@/app/lib/internal-utils";
import { buildSubStrategyWorkbook } from "@/app/lib/excel-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function POST(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  let body: { start_date?: string; end_date?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body sent — fine, both fields are optional
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

  const result = await computeSubStrategyPerformance(end, start);
  const buffer = await buildSubStrategyWorkbook(result.rows, {
    start: body.start_date ?? null,
    end: body.end_date ?? null,
  }).xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="sub-strategy-performance.xlsx"',
    },
  });
}
