import { NextResponse } from "next/server";
import { computeClientMonthlyReturns } from "@/app/lib/internal-utils";
import { buildClientMonthlyWorkbook } from "@/app/lib/excel-utils";
import { requireInternal } from "@/app/lib/admin-utils";

export async function GET(req: Request) {
  const { error } = await requireInternal();
  if (error) return error;

  const accountTypeParam = new URL(req.url).searchParams.get("account_type");
  if (
    accountTypeParam !== null &&
    accountTypeParam !== "managed" &&
    accountTypeParam !== "prop"
  ) {
    return NextResponse.json(
      { error: "account_type must be 'managed' or 'prop'" },
      { status: 400 },
    );
  }

  const rows = await computeClientMonthlyReturns(
    accountTypeParam === "prop" ? "prop" : "managed",
  );
  const buffer = await buildClientMonthlyWorkbook(rows).xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="client-monthly-returns.xlsx"',
    },
  });
}
