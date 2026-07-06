import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAdmin } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { getRunningJob, STAGING_DIR, LIVE_DIR, BACKUP_DIR } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Clock tolerance for the staleness check (file mtimes vs job window)
const MTIME_TOLERANCE_MS = 2 * 60 * 1000;

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

    // Staleness check: staging must have been produced by lastGenerate.
    // Every report file's mtime must fall inside that job's run window.
    const windowStart = lastGenerate.started_at.getTime() - MTIME_TOLERANCE_MS;
    const windowEnd =
      (lastGenerate.finished_at?.getTime() ?? Date.now()) + MTIME_TOLERANCE_MS;

    let newestMtime = 0;
    for (const name of entries) {
      const st = await fs.stat(path.join(STAGING_DIR, name));
      if (st.mtimeMs > newestMtime) newestMtime = st.mtimeMs;
    }
    if (newestMtime < windowStart || newestMtime > windowEnd) {
      return NextResponse.json(
        {
          error:
            "Staging files don't match the last successful generation — re-run Generate first",
        },
        { status: 409 },
      );
    }

    const job = await prisma.sync_jobs.create({
      data: {
        job_type: "publish",
        status: "running",
        triggered_by: session!.user?.email ?? "admin",
        report_date: lastGenerate.report_date,
      },
    });

    try {
      // Atomic swap: backup current live, promote staging
      await fs.rm(BACKUP_DIR, { recursive: true, force: true });
      try {
        await fs.rename(LIVE_DIR, BACKUP_DIR);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // first publish: no live dir yet
      }
      await fs.rename(STAGING_DIR, LIVE_DIR);

      await prisma.sync_jobs.update({
        where: { id: job.id },
        data: {
          status: "success",
          finished_at: new Date(),
          result_json: { publishedFiles: entries.length, fromGenerateJob: lastGenerate.id },
        },
      });

      return NextResponse.json({ published: true, fileCount: entries.length });
    } catch (swapErr) {
      await prisma.sync_jobs.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finished_at: new Date(),
          error_message: `Swap failed: ${swapErr instanceof Error ? swapErr.message : swapErr}`,
        },
      });
      throw swapErr;
    }
  } catch (err) {
    console.error("sync/publish error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
