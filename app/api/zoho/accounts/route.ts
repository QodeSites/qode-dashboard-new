// app/api/zoho/accounts/route.ts
import { NextResponse } from "next/server";
import ZohoCRMSDK from "../../../../lib/zoho-sdk";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Query parameters
  const page = parseInt(searchParams.get("page") || "1");
  const perPage = Math.min(parseInt(searchParams.get("per_page") || "200"), 200); // Max 200 per Zoho API
  const accountId = searchParams.get("id");
  const search = searchParams.get("search");
  const fields = searchParams.get("fields");

  try {
    // Initialize SDK with refresh token
    const zohoSDK = ZohoCRMSDK.getInstance();
    
    if (!process.env.ZOHO_REFRESH_TOKEN) {
      return NextResponse.json({ 
        success: false,
        error: "Authentication required. Please complete OAuth flow first.",
        redirect: "/api/zoho/zoho-auth" // Assuming you have an auth initiation route
      }, { status: 401 });
    }

    zohoSDK.initializeWithRefreshToken(process.env.ZOHO_REFRESH_TOKEN);

    let result;

    // Handle different request types
    if (accountId) {
      // Get specific account by ID
      result = await zohoSDK.getRecord("Accounts", accountId);
    } else if (search) {
      // Search accounts
      const searchCriteria = `(Account_Name:contains:${search})or(Website:contains:${search})or(Phone:contains:${search})`;
      result = await zohoSDK.searchRecords("Investors", searchCriteria);
    } else {
      // Get all accounts with pagination
      result = await zohoSDK.getRecords("Investors");
    }

    // Log the result for debugging
    console.log("Zoho API Result:", JSON.stringify(result, null, 2));
    console.log("Number of records:", result.data?.length || 0);

    // Log first record structure if available
    if (result.data && result.data.length > 0) {
      console.log("First record structure:", Object.keys(result.data[0]));
      console.log("First record sample:", JSON.stringify(result.data[0], null, 2));
    }

    // Filter fields if requested
    if (fields && result.data) {
      const requestedFields = fields.split(',').map(f => f.trim());
      result.data = result.data.map((account: any) => {
        const filteredAccount: any = {};
        requestedFields.forEach(field => {
          if (account.hasOwnProperty(field)) {
            filteredAccount[field] = account[field];
          }
        });
        return filteredAccount;
      });
    }

    return NextResponse.json({
      success: true,
      data: result.data || [],
      info: result.info || {},
      pagination: {
        page,
        per_page: perPage,
        has_more: result.info?.more_records || false,
        total_count: result.info?.count || 0
      }
    });

  } catch (error: any) {
    console.error("Failed to fetch Accounts:", error);
    
    // Handle specific Zoho API errors
    if (error.response?.status === 401) {
      return NextResponse.json({
        success: false,
        error: "Authentication failed. Token may be expired.",
        code: "AUTH_FAILED"
      }, { status: 401 });
    }

    if (error.response?.status === 403) {
      return NextResponse.json({
        success: false,
        error: "Access denied. Check your Zoho CRM permissions for Accounts module.",
        code: "ACCESS_DENIED"
      }, { status: 403 });
    }

    if (error.response?.status === 404) {
      return NextResponse.json({
        success: false,
        error: "Account not found or Accounts module not accessible.",
        code: "NOT_FOUND"
      }, { status: 404 });
    }

    return NextResponse.json({
      success: false,
      error: "Failed to fetch accounts",
      details: error.message || "Unknown error occurred",
      code: "FETCH_FAILED"
    }, { status: 500 });
  }
}

// Optional: Add POST method for creating accounts
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate required fields for account creation
    if (!body.Account_Name) {
      return NextResponse.json({
        success: false,
        error: "Account_Name is required",
        code: "VALIDATION_ERROR"
      }, { status: 400 });
    }

    // Initialize SDK
    const zohoSDK = ZohoCRMSDK.getInstance();
    
    if (!process.env.ZOHO_REFRESH_TOKEN) {
      return NextResponse.json({ 
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED"
      }, { status: 401 });
    }

    zohoSDK.initializeWithRefreshToken(process.env.ZOHO_REFRESH_TOKEN);

    // Create account record
    const result = await zohoSDK.createRecord("Accounts", body);

    return NextResponse.json({
      success: true,
      data: result.data,
      message: "Account created successfully"
    });

  } catch (error: any) {
    console.error("Failed to create Account:", error);
    
    return NextResponse.json({
      success: false,
      error: "Failed to create account",
      details: error.message || "Unknown error occurred",
      code: "CREATE_FAILED"
    }, { status: 500 });
  }
}

/*
API Documentation:

GET /api/zoho/accounts
- Fetches all accounts with pagination
- Query Parameters:
  - page: Page number (default: 1)
  - per_page: Records per page (default: 200, max: 200)
  - fields: Comma-separated list of fields to return
  
Examples:
- GET /api/zoho/accounts
- GET /api/zoho/accounts?page=2&per_page=50
- GET /api/zoho/accounts?fields=Account_Name,Phone,Website

GET /api/zoho/accounts?id=ACCOUNT_ID
- Fetches specific account by ID
- Replace ACCOUNT_ID with actual Zoho record ID

GET /api/zoho/accounts?search=SEARCH_TERM
- Searches accounts by name, website, or phone
- Replace SEARCH_TERM with search query

POST /api/zoho/accounts
- Creates new account record
- Body example:
{
  "Account_Name": "Example Corp",
  "Phone": "123-456-7890",
  "Website": "example.com",
  "Industry": "Technology",
  "Annual_Revenue": 1000000
}

Response Format:
{
  "success": true,
  "data": [...], // Array of account records
  "info": {...}, // Zoho API response info
  "pagination": {
    "page": 1,
    "per_page": 200,
    "has_more": false,
    "total_count": 150
  }
}
*/