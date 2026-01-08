// app/api/zoho/callback/route.ts
import { NextResponse } from "next/server";
import axios from "axios";

/**
 * Step 2: Handle OAuth callback from Zoho
 * Exchange authorization code for access token and refresh token
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    return NextResponse.json(
      {
        error: "OAuth Authorization Failed",
        details: error,
        description: searchParams.get("error_description"),
      },
      { status: 400 }
    );
  }

  // Check for authorization code
  if (!code) {
    return NextResponse.json(
      {
        error: "No authorization code received",
        message: "The OAuth flow was not completed successfully",
      },
      { status: 400 }
    );
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:2030"}/api/zoho/callback`;
  const zohoDataCenter = process.env.ZOHO_DC || "com";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: "Server configuration error",
        message: "ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET not configured",
      },
      { status: 500 }
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(
      `https://accounts.zoho.${zohoDataCenter}/oauth/v2/token`,
      null,
      {
        params: {
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        },
      }
    );

    const { access_token, refresh_token, expires_in, api_domain, token_type } = tokenResponse.data;

    // Return success page with tokens
    const htmlResponse = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zoho OAuth Success</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2d3748;
            margin-bottom: 20px;
        }
        .success {
            color: #38a169;
            font-size: 18px;
            margin-bottom: 20px;
        }
        .token-section {
            background: #f7fafc;
            border-left: 4px solid #4299e1;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
        }
        .token-label {
            font-weight: 600;
            color: #4a5568;
            margin-bottom: 5px;
        }
        .token-value {
            font-family: 'Courier New', monospace;
            background: #edf2f7;
            padding: 10px;
            border-radius: 4px;
            word-break: break-all;
            font-size: 14px;
            color: #2d3748;
            cursor: pointer;
            position: relative;
        }
        .token-value:hover {
            background: #e2e8f0;
        }
        .copy-button {
            background: #4299e1;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
        }
        .copy-button:hover {
            background: #3182ce;
        }
        .copy-button:active {
            background: #2c5282;
        }
        .copied {
            color: #38a169;
            font-size: 12px;
            margin-left: 10px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .copied.show {
            opacity: 1;
        }
        .warning {
            background: #fff5f5;
            border-left: 4px solid #f56565;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .info {
            background: #ebf8ff;
            border-left: 4px solid #4299e1;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        code {
            background: #edf2f7;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        .metadata {
            color: #718096;
            font-size: 14px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>✓ Zoho OAuth Authorization Successful!</h1>
        <p class="success">Your Zoho CRM connection has been authorized successfully.</p>

        <div class="warning">
            <strong>⚠️ Important Security Notice:</strong><br>
            The tokens below provide access to your Zoho CRM data. Keep them secure and never share them publicly or commit them to version control.
        </div>

        <div class="token-section">
            <div class="token-label">🔑 Refresh Token (Add this to .env.local)</div>
            <div class="token-value" id="refresh-token">${refresh_token}</div>
            <button class="copy-button" onclick="copyToken('refresh-token', 'refresh')">
                Copy Refresh Token
            </button>
            <span class="copied" id="refresh-copied">✓ Copied!</span>
        </div>

        <div class="token-section">
            <div class="token-label">🎫 Access Token (Valid for ${expires_in} seconds, auto-refreshes)</div>
            <div class="token-value" id="access-token">${access_token}</div>
            <button class="copy-button" onclick="copyToken('access-token', 'access')">
                Copy Access Token
            </button>
            <span class="copied" id="access-copied">✓ Copied!</span>
        </div>

        <div class="info">
            <strong>📝 Next Steps:</strong>
            <ol style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Copy the <strong>Refresh Token</strong> above</li>
                <li>Add it to your <code>.env.local</code> file as:<br>
                    <code>ZOHO_REFRESH_TOKEN=YOUR_REFRESH_TOKEN_HERE</code>
                </li>
                <li>Restart your development server for changes to take effect</li>
                <li>The refresh token will be used to automatically generate new access tokens</li>
            </ol>
        </div>

        <div class="metadata">
            <strong>Connection Details:</strong><br>
            • Token Type: ${token_type}<br>
            • API Domain: ${api_domain}<br>
            • Data Center: ${zohoDataCenter}<br>
            • Expires In: ${expires_in} seconds (~${Math.round(expires_in / 3600)} hour)<br>
            • Timestamp: ${new Date().toISOString()}
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 14px;">
            You can close this window and return to your application.
        </div>
    </div>

    <script>
        function copyToken(elementId, type) {
            const element = document.getElementById(elementId);
            const text = element.textContent;

            navigator.clipboard.writeText(text).then(() => {
                const copiedElement = document.getElementById(type + '-copied');
                copiedElement.classList.add('show');
                setTimeout(() => {
                    copiedElement.classList.remove('show');
                }, 2000);
            });
        }
    </script>
</body>
</html>
    `;

    return new NextResponse(htmlResponse, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error: any) {
    console.error("Token exchange failed:", error);

    const errorMessage = error.response?.data?.error || error.message || "Unknown error";
    const errorDetails = error.response?.data || {};

    return NextResponse.json(
      {
        error: "Token Exchange Failed",
        message: "Failed to exchange authorization code for tokens",
        details: errorMessage,
        zoho_error: errorDetails,
        troubleshooting: [
          "Verify ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are correct",
          "Ensure redirect URI matches what's configured in Zoho API Console",
          "Check that the authorization code hasn't expired (use it immediately)",
          "Verify your Zoho data center (ZOHO_DC) is set correctly",
        ],
      },
      { status: 500 }
    );
  }
}

/*
API Documentation:

GET /api/zoho/callback?code=AUTHORIZATION_CODE
- This endpoint is called automatically by Zoho after user authorizes
- Exchanges authorization code for access token and refresh token
- Displays tokens in a user-friendly HTML page

Error Responses:
- 400: Missing or invalid authorization code
- 500: Token exchange failed or server configuration error

Flow:
1. User visits /api/zoho/auth?action=generate
2. Gets redirected to Zoho authorization page
3. User authorizes the application
4. Zoho redirects back to this callback endpoint with a code
5. This endpoint exchanges code for tokens
6. User sees success page with refresh token to copy

Security Notes:
- Refresh token should be stored securely in .env.local
- Never commit refresh tokens to version control
- Access tokens expire but are automatically refreshed
- Refresh tokens do not expire unless revoked
*/
