import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { requireAdmin } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import {
  getRunningJob,
  readStagingManifest,
  STAGING_DIR,
  LIVE_DIR,
  BACKUP_DIR,
} from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { error, session } = await requireAdmin();
    if (error) return error;

    const running = await getRunningJob();
    if (running) {
      return NextResponse.json(
        { error: "A job is already running", job: running },
        { status: 409 },
      );
    }

    // ── Staging content checks ────────────────────────────────────────
    let entries: string[];
    try {
      entries = (await fs.readdir(STAGING_DIR)).filter(
        (n) => !n.startsWith(".") && n !== "manifest.json",
      );
    } catch {
      entries = [];
    }
    if (entries.length === 0) {
      return NextResponse.json({ error: "Staging directory is empty" }, { status: 400 });
    }

    // Staleness check via manifest.json, written by whichever pipeline
    // produced the staging set:
    //  - server job (run_sync.sh):  job_id = <sync_jobs id> — must match the
    //    latest successful generate job, so a failed re-run can never publish
    //    last week's leftovers.
    //  - local manual run (run_local_reports.ps1): job_id = null — allowed,
    //    the admin generated it deliberately and reviews it in staging first.
    const manifest = await readStagingManifest();
    if (!manifest) {
      return NextResponse.json(
        {
          error:
            "Staging has no manifest.json — regenerate before publishing (unverifiable staging sets can't go live)",
        },
        { status: 409 },
      );
    }

    if (manifest.job_id !== null) {
      const lastGenerate = await prisma.sync_jobs.findFirst({
        where: { job_type: "generate" },
        orderBy: { started_at: "desc" },
      });
      if (!lastGenerate || lastGenerate.status !== "success") {
        return NextResponse.json(
          { error: "Last generation did not succeed — run Generate & Validate first" },
          { status: 400 },
        );
      }
      if (manifest.job_id !== lastGenerate.id) {
        return NextResponse.json(
          {
            error:
              "Staging files don't match the last successful generation — re-run Generate first",
          },
          { status: 409 },
        );
      }
    }

    const job = await prisma.sync_jobs.create({
      data: {
        job_type: "publish",
        status: "running",
        triggered_by: session!.user?.email ?? "admin",
        report_date: manifest.report_date ?? null,
      },
    });

    try {
      // ── Copy-then-swap: staging is KEPT so the admin view (which reads
      // staging) stays intact and both dirs end up identical after publish.
      // 1. Copy staging → temp dir beside live
      const tempDir = LIVE_DIR + "_publishing";
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.cp(STAGING_DIR, tempDir, { recursive: true });

      // 2. Near-atomic swap: live → backup, temp → live
      await fs.rm(BACKUP_DIR, { recursive: true, force: true });
      try {
        await fs.rename(LIVE_DIR, BACKUP_DIR);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // first publish: no live dir yet
      }
      await fs.rename(tempDir, LIVE_DIR);

      await prisma.sync_jobs.update({
        where: { id: job.id },
        data: {
          status: "success",
          finished_at: new Date(),
          result_json: {
            publishedFiles: entries.length,
            fromGenerateJob: manifest.job_id,
            reportDate: manifest.report_date ?? null,
          },
        },
      });

      return NextResponse.json({ published: true, fileCount: entries.length });
    } catch (swapErr) {
      await prisma.sync_jobs.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finished_at: new Date(),
          error_message: `Publish failed: ${swapErr instanceof Error ? swapErr.message : swapErr}`,
        },
      });
      throw swapErr;
    }
  } catch (err) {
    console.error("sync/publish error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
