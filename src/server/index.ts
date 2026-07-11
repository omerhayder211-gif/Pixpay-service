import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../config';
import { logger } from '../utils/logger';
import router from '../routes';
import { errorHandler } from '../middleware/error.middleware';
import { rateLimiter } from '../middleware/rateLimiter';
import { pixpayService } from '../utils/instances';

const app = express();

// Apply security headers
app.use(helmet());

// Configure CORS to restrict public access to Olympus origin
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, postman, or curl) if not configured,
      // but if origin matches configured origin, allow it.
      if (!origin || origin === config.allowedOrigin) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);

// Apply rate limiting
app.use(rateLimiter);

// Configure JSON parsing with payload size limits and raw body hook for signature verification
app.use(
  express.json({
    limit: config.maxRequestSize,
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString('utf-8');
    },
  })
);

// Secure request logging middleware (never log secrets, keys, signatures, or auth headers)
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`IP: ${req.ip} | Method: ${req.method} | Path: ${req.path} | Status: ${res.statusCode} | Latency: ${duration}ms`);
  });
  
  next();
});

// Routes
app.use(router);

// Error handling middleware
app.use(errorHandler);

const server = app.listen(config.port, async () => {
  logger.info(`pixpay-service started on port ${config.port} in ${config.nodeEnv} mode`);

  // Validate Telegram configuration
  if (!config.telegramBotToken || !config.telegramChatId) {
    logger.warn('[Startup] WARNING: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing from configuration. Telegram alerts will be disabled.');
  } else {
    logger.info('[Startup] Telegram notification credentials detected successfully.');
  }

  try {
    await pixpayService.initialize();
    logger.info('PixPay service initialized successfully');
  } catch (err) {
    logger.error('Failed to initialize PixPay service:', err);
  }
});

export default server;
