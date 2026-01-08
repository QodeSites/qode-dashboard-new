// app/api/zoho/auth/route.ts
import { NextResponse } from "next/server";

/**
 * Step 1: Redirect user to Zoho authorization URL
 * This initiates the OAuth2 flow
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // If action is "generate", redirect to Zoho OAuth
  if (action === "generate") {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:2030"}/api/zoho/callback`;
    const scope = "ZohoCRM.modules.ALL,ZohoCRM.settings.ALL";
    const zohoDataCenter = process.env.ZOHO_DC || "com";

    if (!clientId) {
      return NextResponse.json(
        { error: "ZOHO_CLIENT_ID not configured in environment variables" },
        { status: 500 }
      );
    }

    // Construct the authorization URL
    const authUrl = new URL(`https://accounts.zoho.${zohoDataCenter}/oauth/v2/auth`);
    authUrl.searchParams.append("scope", scope);
    authUrl.searchParams.append("client_id", clientId);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("access_type", "offline");
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("prompt", "consent");

    // Redirect to Zoho authorization page
    return NextResponse.redirect(authUrl.toString());
  }

  // Default response - show instructions
  return NextResponse.json({
    message: "Zoho OAuth Authentication",
    instructions: [
      "To generate a new refresh token, visit: /api/zoho/auth?action=generate",
      "You will be redirected to Zoho's authorization page",
      "After authorization, you'll receive your tokens",
    ],
    required_env_vars: [
      "ZOHO_CLIENT_ID",
      "ZOHO_CLIENT_SECRET",
      "ZOHO_DC (optional, defaults to 'com')",
      "NEXT_PUBLIC_APP_URL (optional, defaults to http://localhost:2030)",
    ],
    current_config: {
      client_id: process.env.ZOHO_CLIENT_ID ? "✓ Set" : "✗ Missing",
      client_secret: process.env.ZOHO_CLIENT_SECRET ? "✓ Set" : "✗ Missing",
      data_center: process.env.ZOHO_DC || "com (default)",
      app_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:2030 (default)",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:2030"}/api/zoho/callback`,
    },
  });
}

/*
API Documentation:

GET /api/zoho/auth
- Shows configuration and instructions

GET /api/zoho/auth?action=generate
- Initiates OAuth flow
- Redirects to Zoho authorization page
- After user authorizes, Zoho redirects to /api/zoho/callback

Environment Variables Required:
- ZOHO_CLIENT_ID: Your Zoho OAuth client ID
- ZOHO_CLIENT_SECRET: Your Zoho OAuth client secret
- ZOHO_DC: Your Zoho data center (com, eu, in, com.au, jp, etc.)
- NEXT_PUBLIC_APP_URL: Your application URL (e.g., https://yourdomain.com)

Setup Instructions:
1. Go to https://api-console.zoho.com/
2. Create a new "Server-based Applications" client
3. Set redirect URI to: {YOUR_APP_URL}/api/zoho/callback
4. Copy Client ID and Client Secret to .env.local
5. Visit /api/zoho/auth?action=generate to get your refresh token
*/
