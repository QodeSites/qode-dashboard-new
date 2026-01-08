import axios from 'axios';

interface ZohoTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

class ZohoCRMSDK {
  private static instance: ZohoCRMSDK;
  private tokens: ZohoTokens | null = null;
  private clientId: string;
  private clientSecret: string;
  private baseURL: string;

  private constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID!;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET!;
    this.baseURL = `https://www.zohoapis.${process.env.ZOHO_DC || 'com'}/crm/v8`;
  }

  public static getInstance(): ZohoCRMSDK {
    if (!ZohoCRMSDK.instance) {
      ZohoCRMSDK.instance = new ZohoCRMSDK();
    }
    return ZohoCRMSDK.instance;
  }

  public initializeWithTokens(accessToken: string, refreshToken: string, expiresIn: number = 3600) {
    this.tokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + expiresIn * 1000 - 60000,
    };
  }

  public initializeWithRefreshToken(refreshToken: string) {
    this.tokens = {
      access_token: '',
      refresh_token: refreshToken,
      expires_at: 0,
    };
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(
        `https://accounts.zoho.${process.env.ZOHO_DC || 'com'}/oauth/v2/token`,
        null,
        {
          params: {
            refresh_token: this.tokens.refresh_token,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'refresh_token',
          },
        }
      );

      const { access_token, expires_in } = response.data;
      this.tokens = {
        ...this.tokens,
        access_token,
        expires_at: Date.now() + expires_in * 1000 - 60000,
      };
      console.log('Access token refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      throw new Error('Token refresh failed');
    }
  }

  private async getValidAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('SDK not initialized with tokens');
    }

    if (!this.tokens.access_token || Date.now() >= this.tokens.expires_at) {
      await this.refreshAccessToken();
    }

    return this.tokens.access_token;
  }

  private async makeAPIRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, data?: any) {
    const accessToken = await this.getValidAccessToken();
    console.log(`Making API request to ${this.baseURL}${endpoint} with method ${method}`);
    console.log('Using Access Token:', accessToken);

    let url = `${this.baseURL}${endpoint}`;
    const headers = {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.message || 'Unknown error'}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  public async createRecord(moduleAPIName: string, recordData: any) {
    const endpoint = `/${moduleAPIName}`;
    const payload = {
      data: [recordData],
    };
    return await this.makeAPIRequest('POST', endpoint, payload);
  }

  public async getRecords(moduleAPIName: string, page: number = 1, perPage: number = 200, fields: string[] = [
  'id',
  'iQode',                                // iQode (Dashboard ICode)
  'Name',                                 // Investor Name (First Name)
  'Last_name',                            // Last name
  'Email',                                // Email
  'Phone',                                // Phone
  'Full_Address',                         // Full Address (Multi Line Small)
  'Strategy_Invested_In',                 // Strategy Invested In (Single Line)
  'Broker',                               // Broker (Single Line)
  'Mobile_No_Linked_to_Zerodha',          // Mobile No. Linked to Broker (Phone)
  'Email_Linked_to_Zerodha',              // Email Linked to Broker (Email)
  'Performance_Fee',                      // Performance Fees (Single Line)
  'Fixed_Fee',                            // Fixed Fee (Single Line)
  'Old_Fee_Structure',                    // Old Fee Structure (Single Line)
  'Hurdle_Rat',                           // Hurdle Rate (Single Line)
  'GST_as_Applicable',                    // GST as Applicable (Single Line)
  'Current_AUM',                          // Current AUM (Currency)
  'Invested_Amount'                       // Invested Amount (Currency)
]) {
    const endpoint = `/${moduleAPIName}?page=${page}&per_page=${perPage}&fields=${encodeURIComponent(fields.join(','))}`;
    console.log('Fetching records from endpoint:', endpoint);
    return await this.makeAPIRequest('GET', endpoint);
  }

  public async getRecord(moduleAPIName: string, recordId: string, fields: string[] = []) {
    let endpoint = `/${moduleAPIName}/${recordId}`;
    if (fields.length > 0) {
      endpoint += `?fields=${encodeURIComponent(fields.join(','))}`;
    }
    return await this.makeAPIRequest('GET', endpoint);
  }

  public async updateRecord(moduleAPIName: string, recordId: string, recordData: any) {
    const endpoint = `/${moduleAPIName}/${recordId}`;
    const payload = {
      data: [recordData],
    };
    return await this.makeAPIRequest('PUT', endpoint, payload);
  }

  public async deleteRecord(moduleAPIName: string, recordId: string) {
    const endpoint = `/${moduleAPIName}/${recordId}`;
    return await this.makeAPIRequest('DELETE', endpoint);
  }

  public async searchRecords(moduleAPIName: string, criteria: string, fields: string[] = ['id']) {
    const endpoint = `/${moduleAPIName}/search?criteria=${encodeURIComponent(criteria)}&fields=${encodeURIComponent(fields.join(','))}`;
    return await this.makeAPIRequest('GET', endpoint);
  }

  public getTokens(): ZohoTokens | null {
    return this.tokens;
  }
}

export default ZohoCRMSDK;