import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  updateGlobalConfigEntry,
  deleteGlobalConfigEntry,
} from "@/app/lib/internal-utils";

export async function PATCH(
  req: Request,
  { params }: { params: { key: string } },
) {
  const { error, session } = await requireInternal();
  if (error) return error;

  const body = await req.json();

  try {
    const row = await updateGlobalConfigEntry(params.key, {
      value: body.value !== undefined ? String(body.value) : undefined,
      data_type: body.data_type,
      updated_by: session?.user?.email ?? "unknown",
    });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { key: string } },
) {
  const { error } = await requireInternal();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const confirmed = searchParams.get("confirmed") === "true";

  try {
    const result = await deleteGlobalConfigEntry(params.key, confirmed);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
