import { NextResponse } from "next/server";
import { computeStrategyMonthlyReturns } from "@/app/lib/internal-utils";
import { buildStrategyMonthlyWorkbook } from "@/app/lib/excel-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  const rows = await computeStrategyMonthlyReturns();
  const buffer = await buildStrategyMonthlyWorkbook(rows).xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="strategy-monthly-returns.xlsx"',
    },
  });
}
