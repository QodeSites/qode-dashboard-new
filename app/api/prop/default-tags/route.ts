import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET - Fetch default tags for a qcode
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const qcode = searchParams.get("qcode");

    if (!qcode) {
      return NextResponse.json({ error: "qcode is required" }, { status: 400 });
    }

    // Verify user has access to this qcode
    const account = await prisma.accounts.findFirst({
      where: {
        qcode,
        OR: [
          { pooled_account_users: { some: { icode: session.user.icode } } },
          { pooled_account_allocations: { some: { icode: session.user.icode } } },
        ],
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 });
    }

    // Fetch default tags
    const defaultTags = await prisma.prop_account_default_tags.findUnique({
      where: { qcode },
    });

    if (!defaultTags) {
      return NextResponse.json({ 
        hasDefaults: false,
        defaultTags: null 
      });
    }

    return NextResponse.json({
      hasDefaults: true,
      defaultTags: {
        depositTag: defaultTags.deposit_tag,
        navTag: defaultTags.nav_tag,
        cashflowTag: defaultTags.cashflow_tag,
      },
    });
  } catch (error) {
    console.error("Error fetching default tags:", error);
    return NextResponse.json({ error: "Failed to fetch default tags" }, { status: 500 });
  }
}

// POST - Save/Update default tags
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { qcode, depositTag, navTag, cashflowTag } = body;

    if (!qcode || !depositTag || !navTag) {
      return NextResponse.json(
        { error: "qcode, depositTag, and navTag are required" },
        { status: 400 }
      );
    }

    // Verify user has access to this qcode
    const account = await prisma.accounts.findFirst({
      where: {
        qcode: qcode,
        OR: [
          { pooled_account_users: { some: { icode: session.user.icode } } },
          { pooled_account_allocations: { some: { icode: session.user.icode } } },
        ],
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 });
    }

    // Upsert default tags
    const defaultTags = await prisma.prop_account_default_tags.upsert({
      where: { qcode: qcode },
      update: {
        deposit_tag: depositTag,
        nav_tag: navTag,
        cashflow_tag: cashflowTag || null,
      },
      create: {
        qcode,
        deposit_tag: depositTag,
        nav_tag: navTag,
        cashflow_tag: cashflowTag || null,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Default tags saved successfully",
      defaultTags: {
        depositTag: defaultTags.deposit_tag,
        navTag: defaultTags.nav_tag,
        cashflowTag: defaultTags.cashflow_tag,
      },
    });
  } catch (error) {
    console.error("Error saving default tags:", error);
    return NextResponse.json({ error: "Failed to save default tags" }, { status: 500 });
  }
}

// DELETE - Remove default tags
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.icode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const qcode = searchParams.get("qcode");

    if (!qcode) {
      return NextResponse.json({ error: "qcode is required" }, { status: 400 });
    }

    // Verify user has access to this qcode
    const account = await prisma.accounts.findFirst({
      where: {
        qcode: qcode,
        OR: [
          { pooled_account_users: { some: { icode: session.user.icode } } },
          { pooled_account_allocations: { some: { icode: session.user.icode } } },
        ],
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 });
    }

    // Delete default tags
    await prisma.prop_account_default_tags.delete({
      where: { qcode: qcode },
    });

    return NextResponse.json({
      success: true,
      message: "Default tags removed successfully",
    });
  } catch (error) {
    console.error("Error deleting default tags:", error);
    return NextResponse.json({ error: "Failed to delete default tags" }, { status: 500 });
  }
}