import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isTimestampValid, verifySignature, replayCache } from '../utils/security';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKey = req.header('X-API-Key');
  const timestamp = req.header('X-Timestamp');
  const signature = req.header('X-Signature');

  // 1. API Key Validation
  if (!apiKey || apiKey !== config.apiKey) {
    logger.warn(`Unauthorized request: Invalid or missing API Key from IP ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    return;
  }

  // 2. Timestamp Validation
  if (!timestamp || !isTimestampValid(timestamp, 60)) {
    logger.warn(`Unauthorized request: Stale or missing timestamp from IP ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized: Request timestamp stale or missing' });
    return;
  }

  // 3. Signature Presence
  if (!signature) {
    logger.warn(`Unauthorized request: Missing signature from IP ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized: Missing signature' });
    return;
  }

  // 4. Replay Attack Protection
  if (!replayCache.add(signature)) {
    logger.warn(`Unauthorized request: Replay attack detected for signature from IP ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized: Duplicate request signature' });
    return;
  }

  // 5. Signature Verification using timingSafeEqual
  const rawBody = (req as any).rawBody || '';
  
  const isSignatureValid = verifySignature(
    signature,
    req.method,
    req.path,
    timestamp,
    rawBody,
    config.apiSecret
  );

  if (!isSignatureValid) {
    logger.warn(`Unauthorized request: Invalid signature from IP ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized: Invalid signature' });
    return;
  }

  next();
};
export default authenticate;
