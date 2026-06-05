import { NextResponse } from "next/server";
import { authorizeBifurcatedRequest } from "@/app/lib/bifurcated-auth";
import { getEngineForQcode } from "@/app/lib/bifurcated-portfolio-utils";

export async function GET(req: Request) {
  const auth = await authorizeBifurcatedRequest(req);
  if (!auth.ok) return auth.response;

  const engine = getEngineForQcode(auth.client.qcode);
  if (!engine) {
    return NextResponse.json(
      { error: "Engine not found for qcode" },
      { status: 500 }
    );
  }

  return engine.handleGET(req);
}
