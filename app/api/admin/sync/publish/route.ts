import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-utils";
import { publishStagingToLive, PublishError } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const result = await publishStagingToLive(session!.user?.email ?? "admin");
    return NextResponse.json({ published: true, fileCount: result.publishedFiles });
  } catch (err) {
    if (err instanceof PublishError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("sync/publish error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
