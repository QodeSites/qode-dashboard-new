import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyInternalToken } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the row small — the last 50KB of the log is enough for debugging
// (mirrors the old update_job.py LOG_TAIL_BYTES).
const LOG_TAIL_BYTES = 50_000;

const VALID_STATUSES = new Set(["running", "success", "failed"]);

/**
 * PATCH /api/cron/sync-jobs/:id — replacement for update_job.py. Called
 * by run_sync.sh for every job regardless of trigger (cron or admin-UI),
 * since psycopg2 could never parse Prisma's DATABASE_URL directly.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = verifyInternalToken(req);
  if (authError) return authError;

  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const status = String(body.status ?? "");
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` },
        { status: 400 },
      );
    }

    let resultJson: Prisma.InputJsonValue | undefined;
    if (body.resultJson !== undefined && body.resultJson !== null) {
      // Already parsed JSON from the request body — no re-parse needed,
      // but guard against non-object payloads corrupting the column.
      if (typeof body.resultJson !== "object") {
        return NextResponse.json({ error: "resultJson must be an object" }, { status: 400 });
      }
      resultJson = body.resultJson;
    }

    let logOutput: string | undefined;
    if (typeof body.logOutput === "string" && body.logOutput.length > 0) {
      logOutput = body.logOutput.slice(-LOG_TAIL_BYTES);
    }

    const errorMessage: string | null =
      typeof body.errorMessage === "string" && body.errorMessage.trim() !== ""
        ? body.errorMessage
        : null;

    const result = await prisma.sync_jobs.updateMany({
      where: { id: jobId },
      data: {
        status,
        finished_at: new Date(),
        error_message: errorMessage,
        ...(resultJson !== undefined ? { result_json: resultJson } : {}),
        ...(logOutput !== undefined ? { log_output: logOutput } : {}),
      },
    });

    if (result.count !== 1) {
      return NextResponse.json({ error: `No sync_jobs row with id=${jobId}` }, { status: 404 });
    }

    return NextResponse.json({ updated: true });
  } catch (err) {
    console.error("internal/sync/jobs PATCH error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
