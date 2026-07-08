import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAdmin } from "@/app/lib/admin-utils";
import {
  FILE_RULES,
  MAX_UPLOAD_BYTES,
  getRunningJob,
  getUploadDir,
  validateUploadContent,
} from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BACKUPS_PER_FILE = 20;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function backupExisting(dir: string, filename: string): Promise<string | null> {
  const target = path.join(dir, filename);
  try {
    await fs.access(target);
  } catch {
    return null; // nothing to back up
  }

  const backupsDir = path.join(dir, "_backups");
  await fs.mkdir(backupsDir, { recursive: true });
  const backupName = `${filename}.${timestamp()}`;
  await fs.copyFile(target, path.join(backupsDir, backupName));

  // Prune old backups, keep the newest MAX_BACKUPS_PER_FILE
  const all = (await fs.readdir(backupsDir))
    .filter((n) => n.startsWith(filename + "."))
    .sort()
    .reverse();
  for (const stale of all.slice(MAX_BACKUPS_PER_FILE)) {
    await fs.rm(path.join(backupsDir, stale), { force: true });
  }

  return backupName;
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const running = await getRunningJob();
    if (running) {
      return NextResponse.json(
        { error: "A job is currently running — uploads are locked", job: running },
        { status: 409 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Filename comes from the whitelist, never from the client's path
    const filename = file.name;
    const rule = FILE_RULES[filename];
    if (!rule) {
      return NextResponse.json(
        {
          error: `File '${filename}' is not an accepted config/input file`,
          accepted: Object.keys(FILE_RULES),
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const validation = validateUploadContent(filename, buffer);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Validation failed for ${filename}`, details: validation.error },
        { status: 400 },
      );
    }

    const dir = getUploadDir(rule.destination);
    await fs.mkdir(dir, { recursive: true });

    const backedUpTo = await backupExisting(dir, filename);
    await fs.writeFile(path.join(dir, filename), buffer);

    return NextResponse.json({
      filename,
      destination: rule.destination,
      uploadedAt: new Date().toISOString(),
      backedUpTo,
    });
  } catch (err) {
    console.error("sync/upload error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * GET — returns upload state for each whitelisted file (exists + last modified),
 * so the admin page can show "Last: 04 Jul" per file.
 */
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const files = await Promise.all(
      Object.entries(FILE_RULES).map(async ([filename, rule]) => {
        const full = path.join(getUploadDir(rule.destination), filename);
        try {
          const st = await fs.stat(full);
          return { filename, destination: rule.destination, exists: true, modifiedAt: st.mtime };
        } catch {
          return { filename, destination: rule.destination, exists: false, modifiedAt: null };
        }
      }),
    );

    return NextResponse.json(
      { files },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("sync/upload GET error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
