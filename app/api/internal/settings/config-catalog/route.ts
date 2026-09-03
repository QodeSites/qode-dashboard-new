import { NextResponse } from "next/server";
import { requireInternal } from "@/app/lib/admin-utils";
import {
  fetchConfigCatalog,
  createConfigCatalogEntry,
} from "@/app/lib/internal-utils";

export async function GET() {
  const { error } = await requireInternal();
  if (error) return error;

  try {
    const rows = await fetchConfigCatalog();
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const { error, session } = await requireInternal();
  if (error) return error;

  const body = await req.json();
  if (!body.config_key || !body.label) {
    return NextResponse.json(
      { error: "config_key and label are required" },
      { status: 400 },
    );
  }

  try {
    const isElevated = true;
    const row = await createConfigCatalogEntry(
      {
        config_key: body.config_key,
        parent_key: body.parent_key ?? null,
        label: body.label,
        tag_suffix: body.tag_suffix,
        ltp_symbol: body.ltp_symbol,
        console_symbol: body.console_symbol,
        allowed_ratio_types: body.allowed_ratio_types,
        updated_by: session?.user?.email ?? "unknown",
      },
      isElevated,
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
