import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { requireAdmin } from "@/app/lib/admin-utils";
import { prisma } from "@/lib/prisma";
import { getRunningJob, readStagingManifest, STAGING_DIR } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const current = await getRunningJob();

    const history = await prisma.sync_jobs.findMany({
      orderBy: { started_at: "desc" },
      take: 20,
      select: {
        id: true,
        job_type: true,
        status: true,
        started_at: true,
        finished_at: true,
        triggered_by: true,
        report_date: true,
        client_filter: true,
        error_message: true,
        result_json: true,
      },
    });

    const lastCompleted =
      history.find((j) => j.status === "success" || j.status === "failed") ?? null;

    const lastGenerate =
      history.find((j) => j.job_type === "generate" && j.status !== "running") ?? null;

    // Staging state — what's currently pending review (server job OR local run)
    const manifest = await readStagingManifest();
    let stagingFileCount = 0;
    try {
      stagingFileCount = (await fs.readdir(STAGING_DIR)).filter(
        (n) => !n.startsWith(".") && n !== "manifest.json",
      ).length;
    } catch {
      /* staging dir doesn't exist yet */
    }
    const staging = {
      fileCount: stagingFileCount,
      manifest,
      // Publishable = has files + has a manifest. Server-job manifests are
      // additionally verified against sync_jobs inside the publish route.
      publishable: stagingFileCount > 0 && manifest !== null,
    };

    return NextResponse.json(
      { current, lastCompleted, lastGenerate, history, staging },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("sync/status error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
