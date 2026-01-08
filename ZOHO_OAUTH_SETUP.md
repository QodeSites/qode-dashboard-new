# Zoho OAuth Setup Guide

This guide will help you generate a new Zoho CRM refresh token for your application.

## Prerequisites

Before starting, ensure you have:
- A Zoho CRM account
- Admin access to Zoho API Console
- Your application running locally or deployed

## Step 1: Create Zoho OAuth Client

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Click **"Add Client"** or **"Get Started"**
3. Select **"Server-based Applications"**
4. Fill in the details:
   - **Client Name**: `Qode Dashboard` (or any name you prefer)
   - **Homepage URL**: Your application URL (e.g., `http://localhost:2030` or `https://yourdomain.com`)
   - **Authorized Redirect URIs**:
     ```
     http://localhost:2030/api/zoho/callback
     ```
     (For production, also add: `https://yourdomain.com/api/zoho/callback`)

5. Click **"Create"**
6. You'll receive:
   - **Client ID** (looks like: `1000.XXXXXXXXXXXXX`)
   - **Client Secret** (looks like: `YYYYYYYYYYYYYYYY`)

## Step 2: Configure Environment Variables

Add the following to your `.env.local` file:

```env
# Zoho OAuth Configuration
ZOHO_CLIENT_ID=1000.your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here
ZOHO_DC=com
NEXT_PUBLIC_APP_URL=http://localhost:2030

# This will be generated in Step 3
# ZOHO_REFRESH_TOKEN=
```

**Data Center (ZOHO_DC) Options:**
- `com` - United States (default)
- `eu` - Europe
- `in` - India
- `com.au` - Australia
- `jp` - Japan
- `com.cn` - China

## Step 3: Generate Refresh Token

1. Make sure your development server is running:
   ```bash
   npm run dev
   ```

2. Open your browser and visit:
   ```
   http://localhost:2030/api/zoho/auth?action=generate
   ```

3. You'll be redirected to Zoho's authorization page
4. Sign in to your Zoho account (if not already signed in)
5. Review the permissions requested
6. Click **"Accept"** to authorize the application

7. You'll be redirected back to your application with a success page showing:
   - ✅ **Refresh Token** - This is what you need!
   - 🎫 Access Token (auto-generated, you don't need to save this)

8. Click **"Copy Refresh Token"** button

9. Add it to your `.env.local` file:
   ```env
   ZOHO_REFRESH_TOKEN=1000.your_new_refresh_token_here
   ```

10. **Restart your development server** for the changes to take effect:
    ```bash
    # Stop the server (Ctrl+C)
    # Start again
    npm run dev
    ```

## Step 4: Verify Setup

1. Visit the personal details page in your application
2. Check the browser console (F12 → Console)
3. Check the terminal where Next.js is running
4. You should see:
   - "Fetching records from endpoint: /Investors..."
   - "Number of records: X"
   - "Available iQodes: [...]"

If you see data, the setup is working! ✓

## Troubleshooting

### Error: "Authentication required"
- Verify `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` are set correctly in `.env.local`
- Restart your development server after adding environment variables

### Error: "Redirect URI mismatch"
- Go back to Zoho API Console
- Edit your OAuth client
- Make sure the redirect URI exactly matches: `http://localhost:2030/api/zoho/callback`
- No trailing slashes, must use http for localhost

### Error: "No client data found for your account"
- The field name in Zoho might be different
- Check the console logs for "First record structure"
- Update the `iQode` field name in:
  - `/lib/zoho-sdk.ts` (line 134)
  - `/app/personal-details/page.tsx` (line 13 and 98)

### Error: "Token refresh failed"
- Your refresh token may have expired or been revoked
- Generate a new refresh token by following Step 3 again

### Can't access Zoho API Console page
- Make sure you're logged into Zoho CRM
- If you see a blank page, try:
  1. Clear browser cache
  2. Try in incognito/private mode
  3. Try a different browser

## Testing the Setup

### Check Configuration
Visit: `http://localhost:2030/api/zoho/auth`

This will show your current configuration status.

### View Raw API Response
Visit: `http://localhost:2030/api/zoho/accounts`

This will show the raw data from Zoho CRM.

## Security Best Practices

1. ✅ **Never commit `.env.local` to version control**
   - Add it to `.gitignore` (should already be there)

2. ✅ **Keep your tokens secure**
   - Treat refresh tokens like passwords
   - Don't share them in screenshots or logs

3. ✅ **Use different tokens for different environments**
   - Development: Local refresh token
   - Production: Separate refresh token with production redirect URI

4. ✅ **Rotate tokens periodically**
   - Regenerate refresh tokens every few months
   - Revoke old tokens in Zoho API Console

## Production Deployment

When deploying to production:

1. Create a new OAuth client in Zoho API Console (or update existing)
2. Add production redirect URI:
   ```
   https://yourdomain.com/api/zoho/callback
   ```

3. Set environment variables in your hosting platform:
   ```env
   ZOHO_CLIENT_ID=your_client_id
   ZOHO_CLIENT_SECRET=your_client_secret
   ZOHO_REFRESH_TOKEN=your_production_refresh_token
   ZOHO_DC=com
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   ```

4. Generate a new refresh token using the production URL:
   ```
   https://yourdomain.com/api/zoho/auth?action=generate
   ```

## API Endpoints Created

- `GET /api/zoho/auth` - View configuration
- `GET /api/zoho/auth?action=generate` - Initiate OAuth flow
- `GET /api/zoho/callback` - OAuth callback (used automatically)
- `GET /api/zoho/accounts` - Fetch investor records

## Need Help?

If you're still having issues:

1. Check the browser console for errors
2. Check the terminal/server logs
3. Verify all environment variables are set correctly
4. Make sure your Zoho account has access to the "Investors" module
5. Try generating a new refresh token

## Files Modified/Created

- ✅ `/app/api/zoho/auth/route.ts` - OAuth initiation
- ✅ `/app/api/zoho/callback/route.ts` - OAuth callback handler
- ✅ `/lib/zoho-sdk.ts` - Updated to use `iQode` field
- ✅ `/app/personal-details/page.tsx` - Updated to use `iQode`
- ✅ `/app/api/zoho/accounts/route.ts` - Added debugging logs

---

**Last Updated:** December 31, 2025
