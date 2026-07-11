import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment configuration
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export const config = {
  port: process.env.PORT || '3590',
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: process.env.API_KEY || 'test_api_key',
  apiSecret: process.env.API_SECRET || 'test_api_secret',
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10),
  maxRequestSize: process.env.MAX_REQUEST_SIZE || '100kb'
};
