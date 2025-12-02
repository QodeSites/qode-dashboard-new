import { NextResponse } from "next/server";

export async function GET() {
  const authUrl = `https://accounts.zoho.${process.env.ZOHO_DC}/oauth/v2/auth?scope=${process.env.ZOHO_SCOPE}&client_id=${process.env.ZOHO_CLIENT_ID}&response_type=code&redirect_uri=${process.env.ZOHO_REDIRECT_URI}&access_type=offline&prompt=consent`;
  return NextResponse.redirect(authUrl);
}