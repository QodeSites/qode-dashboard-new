import { prisma } from "@/lib/prisma";
import type { ExcelExportClient } from "@/app/lib/excel-export-utils";

/**
 * Fetch the client list the admin export operates on.
 * - icodeFilter: a single icode (existing single-client download).
 * - icodesFilter: an explicit batch of icodes (used to chunk the "download all" job
 *   into several requests so no single request runs long enough to hit a proxy timeout).
 */
export async function fetchAdminExportClients(
  icodeFilter: string | null,
  icodesFilter?: string[]
): Promise<ExcelExportClient[]> {
  const where: Record<string, unknown> = { pooled_account_users: { some: {} } };
  if (icodeFilter) where.icode = icodeFilter;
  else if (icodesFilter && icodesFilter.length > 0) where.icode = { in: icodesFilter };

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

/** Ordered, lightweight list of icodes the export covers — used by the UI to plan batches. */
export async function fetchAdminExportIcodes(): Promise<string[]> {
  const rows = await prisma.clients.findMany({
    where: { pooled_account_users: { some: {} } },
    select: { icode: true },
    orderBy: { user_name: "asc" },
  });
  return rows.map((c) => c.icode);
}
