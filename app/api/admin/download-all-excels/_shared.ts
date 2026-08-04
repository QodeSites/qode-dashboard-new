import { prisma } from "@/lib/prisma";
import type { ExcelExportClient } from "@/app/lib/excel-export-utils";

/** Fetch the client list the admin export operates on. Optionally filter by icode. */
export async function fetchAdminExportClients(icodeFilter: string | null): Promise<ExcelExportClient[]> {
  const where: Record<string, unknown> = { pooled_account_users: { some: {} } };
  if (icodeFilter) where.icode = icodeFilter;

  const rows = await prisma.clients.findMany({
    where,
    select: {
      icode: true,
      user_name: true,
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
    orderBy: { user_name: "asc" },
  });

  return rows.map((c) => ({
    icode: c.icode,
    user_name: c.user_name,
    accounts: c.pooled_account_users.map((pau) => pau.accounts),
  }));
}
