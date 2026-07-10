import { NextRequest, NextResponse } from "next/server";
import { publishStagingToLive, PublishError, verifyInternalToken } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/sync-jobs/publish — cron's equivalent of the admin UI's
 * Publish button. Called by cron_generate.sh right after a successful
 * generate, so the weekly cron run reaches live clients without a human
 * clicking Publish. Same swap logic, manifest checks, and job-row audit
 * trail as the admin route, just authenticated via SYNC_INTERNAL_TOKEN
 * instead of a session (triggered_by = "cron"). The admin-UI generate flow
 * is untouched -- it still stops at staging until someone clicks Publish.
 */
export async function POST(req: NextRequest) {
  const authError = verifyInternalToken(req);
  if (authError) return authError;

  try {
    const result = await publishStagingToLive("cron");
    return NextResponse.json({ published: true, fileCount: result.publishedFiles });
  } catch (err) {
    if (err instanceof PublishError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("cron/sync-jobs/publish error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
