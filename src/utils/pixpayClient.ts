import { generateSignature } from './security';

export interface PixPayClientOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

export class PixPayClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(options: PixPayClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
  }

  /**
   * Performs an authenticated request to the pixpay-service
   */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: any = null
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';

    // Generate the signature
    const signature = generateSignature(method, path, timestamp, bodyStr, this.apiSecret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body) {
      fetchOptions.body = bodyStr;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PixPay Client request failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }
}
export default PixPayClient;
