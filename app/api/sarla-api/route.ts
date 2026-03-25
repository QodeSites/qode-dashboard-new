import { NextResponse } from "next/server";
import { PortfolioApi } from '@/app/lib/sarla-utils';
import { getPrecomputedMonthlyPnl, getPrecomputedQuarterlyPnl } from "@/app/lib/precomputed-pnl";

const QCODE_TO_ICODE: Record<string, string> = {
  "QAC00041": "QUS0007",  // Sarla
  "QAC00046": "QUS0010",  // Satidham
};

export async function GET(request: Request) {
  const response = await PortfolioApi.GET(request);
  const data = await response.json();

  const qcode = new URL(request.url).searchParams.get("qcode") || "QAC00041";
  const icode = QCODE_TO_ICODE[qcode];

  if (icode) {
    for (const scheme of Object.keys(data)) {
      if (!data[scheme]?.data) continue;
      const preMonthly = await getPrecomputedMonthlyPnl(icode, scheme);
      const preQuarterly = await getPrecomputedQuarterlyPnl(icode, scheme);
      if (preMonthly) data[scheme].data.monthlyPnl = preMonthly;
      if (preQuarterly) data[scheme].data.quarterlyPnl = preQuarterly;
    }
  }

  return NextResponse.json(data);
}
