import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/app/lib/admin-utils";

export async function GET(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  // Build where clause for clients
  const where: any = {
    pooled_account_users: { some: {} },
  };

  if (search) {
    where.OR = [
      { user_name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { icode: { contains: search, mode: "insensitive" } },
    ];
  }

  // Get total count for pagination
  const total = await prisma.clients.count({ where });

  // Fetch clients with their accounts
  const clients = await prisma.clients.findMany({
    where,
    select: {
      icode: true,
      user_name: true,
      email: true,
      contact_number: true,
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
    skip: (page - 1) * limit,
    take: limit,
  });

  // Format the response
  const formattedClients = clients.map((client) => {
    const accounts = client.pooled_account_users.map((pau) => pau.accounts);
    return {
      icode: client.icode,
      name: client.user_name,
      email: client.email,
      contactNumber: client.contact_number,
      accounts,
      accountCount: accounts.length,
    };
  });

  return NextResponse.json({
    clients: formattedClients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
