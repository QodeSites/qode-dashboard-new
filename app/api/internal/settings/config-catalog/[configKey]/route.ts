import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  updateConfigCatalogEntry,
  deleteConfigCatalogEntry,
} from "@/app/lib/internal-utils";

export async function PATCH(
  req: Request,
  { params }: { params: { configKey: string } },
) {
  const { error, session } = await requireInternal();
  if (error) return error;

  const body = await req.json();

  try {
    const row = await updateConfigCatalogEntry(params.configKey, {
      label: body.label,
      tag_suffix: body.tag_suffix,
      ltp_symbol: body.ltp_symbol,
      console_symbol: body.console_symbol,
      allowed_ratio_types: body.allowed_ratio_types,
      updated_by: session?.user?.email ?? "unknown",
    });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { configKey: string } },
) {
  const { error } = await requireInternal();
  if (error) return error;

  try {
    const result = await deleteConfigCatalogEntry(params.configKey);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
