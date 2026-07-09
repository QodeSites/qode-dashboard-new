import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/app/lib/admin-utils";

// Aggregated roll-up across the partner's book.
//
// TODO (pending product definition of "book-summary metrics"): currently
// returns clientCount + accountCount only. Richer metrics — total AUM, blended
// return/CAGR, current-month P&L, per-client rows — should be derived here by
// resolving each client's qcodes via getUserQcodes(icode) and aggregating with
// the existing portfolio-metrics utilities. Left minimal on purpose so we don't
// ship an undefined/guessed number.
export async function GET() {
  const { error, session } = await requirePartner();
  if (error) return error;

  const partnerId = parseInt(session!.user.partnerId ?? "", 10);
  if (!partnerId || Number.isNaN(partnerId)) {
    return NextResponse.json({ clientCount: 0, accountCount: 0 });
  }

  const rows = await prisma.partner_clients.findMany({
    where: { partner_id: partnerId },
    select: {
      clients: {
        select: {
          _count: { select: { pooled_account_users: true } },
        },
      },
    },
  });

  const clientCount = rows.length;
  const accountCount = rows.reduce(
    (sum, r) => sum + r.clients._count.pooled_account_users,
    0,
  );

  return NextResponse.json({ clientCount, accountCount });
}
