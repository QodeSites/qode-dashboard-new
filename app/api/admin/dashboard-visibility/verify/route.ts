import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";

const VISIBILITY_PASSWORD = process.env.DASHBOARD_VISIBILITY_PASSWORD;

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { password } = await request.json();

  if (!password || password !== VISIBILITY_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
