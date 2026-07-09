import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRunningJob, verifyInternalToken } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/cron/sync-jobs — cron_generate.sh's replacement for
 * create_job.py. Same lock check and row shape as the admin-UI's
 * /api/admin/sync/generate, just triggered_by "cron" and authenticated via
 * SYNC_INTERNAL_TOKEN instead of a session.
 */
export async function POST(req: NextRequest) {
  const authError = verifyInternalToken(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const reportDate: string = String(body.reportDate ?? "").trim();

    if (!DATE_PATTERN.test(reportDate) || isNaN(Date.parse(reportDate))) {
      return NextResponse.json(
        { error: "reportDate must be a valid date in YYYY-MM-DD format" },
        { status: 400 },
      );
    }

    const running = await getRunningJob();
    if (running) {
      return NextResponse.json(
        { error: "A job is already running", job: running },
        { status: 409 },
      );
    }

    const job = await prisma.sync_jobs.create({
      data: {
        job_type: "generate",
        status: "running",
        triggered_by: "cron",
        report_date: reportDate,
      },
    });

    return NextResponse.json({ jobId: job.id }, { status: 201 });
  } catch (err) {
    console.error("internal/sync/jobs POST error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
