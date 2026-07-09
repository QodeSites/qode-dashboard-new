import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import { requireAdmin } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { getRunningJob, SCRIPTS_BASE_DIR, STAGING_DIR } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  try {
    const { error, session } = await requireAdmin();
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const reportDate: string = String(body.reportDate ?? "").trim();

    // Strict format check — this value is passed to a shell command
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
        triggered_by: session!.user?.email ?? "admin",
        report_date: reportDate,
      },
    });

    const script = path.join(SCRIPTS_BASE_DIR, "run_sync.sh");
    const command = `bash "${script}" "${reportDate}" "${job.id}" "${STAGING_DIR}"`;

    const child = exec(command, {
      env: { ...process.env, SYNC_JOB_ID: String(job.id) },
    });
    // Detach: the HTTP request returns immediately; the script updates
    // the sync_jobs row itself when it finishes (via notify_job.py calling
    // back into /api/internal/sync/jobs/:id).
    child.unref();

    child.on("error", async (spawnErr) => {
      console.error("sync/generate spawn error:", spawnErr);
      await prisma.sync_jobs
        .update({
          where: { id: job.id },
          data: {
            status: "failed",
            finished_at: new Date(),
            error_message: `Failed to start script: ${spawnErr.message}`,
          },
        })
        .catch(() => {});
    });

    return NextResponse.json({ jobId: job.id, status: "running" }, { status: 202 });
  } catch (err) {
    console.error("sync/generate error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
