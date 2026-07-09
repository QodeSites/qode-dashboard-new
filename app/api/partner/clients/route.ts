import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/app/lib/admin-utils";

// Returns ONLY the clients in the authenticated partner's book.
//
// Restricted-data policy (TODO: confirm exact field set with product):
// currently exposes name, icode, email, and a basic account summary. PII such
// as contact_number / PAN / aadhar is intentionally NOT selected. Adjust the
// `select` below once the restricted field set is finalized.
export async function GET(request: Request) {
  const { error, session } = await requirePartner();
  if (error) return error;

  const partnerId = parseInt(session!.user.partnerId ?? "", 10);
  if (!partnerId || Number.isNaN(partnerId)) {
    return NextResponse.json({ clients: [] });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();

  const rows = await prisma.partner_clients.findMany({
    where: {
      partner_id: partnerId,
      ...(search
        ? {
            clients: {
              OR: [
                { user_name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { icode: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    select: {
      clients: {
        select: {
          icode: true,
          user_name: true,
          email: true,
          pooled_account_users: {
            select: {
              accounts: {
                select: {
                  qcode: true,
                  account_name: true,
                  account_type: true,
                  broker: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const clients = rows
    .map((row) => {
      const c = row.clients;
      const accounts = c.pooled_account_users.map((pau) => pau.accounts);
      return {
        icode: c.icode,
        name: c.user_name,
        email: c.email,
        accounts,
        accountCount: accounts.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ clients });
}
