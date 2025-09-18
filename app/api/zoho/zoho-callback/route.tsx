import { NextResponse } from "next/server";
import axios from "axios";
import path from "path";
import fs from "fs";
import ZohoCRMSDK from "../../../../lib/zoho-sdk";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No authorization code provided" }, { status: 400 });
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(
      `https://accounts.zoho.in/oauth/v2/token`,
      null,
      {
        params: {
          code,
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          redirect_uri: process.env.ZOHO_REDIRECT_URI,
          grant_type: "authorization_code",
        },
      }
    );

    const { access_token, refresh_token, expires_in, error } = tokenResponse.data;

    if (error) {
      console.error("Token response error:", error);
      return NextResponse.json({ error: `Token exchange failed: ${error}` }, { status: 400 });
    }

    console.log("OAuth tokens received successfully");
    console.log("Access Token:", access_token);
    console.log("Refresh Token:", refresh_token);

    if (!refresh_token) {
      console.warn("No refresh token received. Ensure 'access_type=offline&prompt=consent' is included in the auth URL.");
      return NextResponse.json({ error: "No refresh token received" }, { status: 400 });
    }

    // Initialize our custom SDK with the tokens
    const zohoSDK = ZohoCRMSDK.getInstance();
    zohoSDK.initializeWithTokens(access_token, refresh_token, expires_in);

    // Test the SDK with a simple API call
    try {
      const testResult = await zohoSDK.getRecords('Leads', 1, 5); // Get first 5 leads
      console.log("SDK test successful:", testResult);
    } catch (testError) {
      console.log("SDK test failed (this might be normal if no leads exist):", testError);
    }

    // Save refresh token to .env.local for future server restarts
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add refresh token
    if (envContent.includes('ZOHO_REFRESH_TOKEN=')) {
      envContent = envContent.replace(
        /ZOHO_REFRESH_TOKEN=.*/,
        `ZOHO_REFRESH_TOKEN=${refresh_token}`
      );
    } else {
      envContent += (envContent && !envContent.endsWith('\n') ? '\n' : '') + 
        `ZOHO_REFRESH_TOKEN=${refresh_token}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log("Refresh token saved to .env.local");

    // Optional: Save tokens to database here if you have one
    // await saveTokensToDatabase({ access_token, refresh_token, expires_in });

    return NextResponse.redirect(new URL("/?auth=success", request.url));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json({ 
      error: "Authentication failed", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}