import { NextResponse } from "next/server";
import { computeSubStrategyPerformance } from "@/app/lib/internal-utils";
import { buildSubStrategyWorkbook } from "@/app/lib/excel-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const rows = await computeSubStrategyPerformance();
  const buffer = await buildSubStrategyWorkbook(rows).xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="sub-strategy-performance.xlsx"',
    },
  });
}
