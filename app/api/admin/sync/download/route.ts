import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAdmin } from "@/app/lib/admin-utils";
import { FILE_RULES, getUploadDir } from "@/app/lib/sync-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".yaml": "application/x-yaml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file")?.trim() ?? "";

    // Same whitelist as upload — the filename never touches the filesystem
    // unless it's a known key, so path traversal is impossible.
    const rule = FILE_RULES[filename];
    if (!rule) {
      return NextResponse.json(
        { error: `Unknown file: '${filename}'`, accepted: Object.keys(FILE_RULES) },
        { status: 400 },
      );
    }

    const fullPath = path.join(getUploadDir(rule.destination), filename);

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(fullPath);
    } catch {
      return NextResponse.json(
        { error: `${filename} does not exist on the server yet` },
        { status: 404 },
      );
    }

    const ext = path.extname(filename).toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("sync/download error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
