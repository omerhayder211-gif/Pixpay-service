import * as crypto from 'crypto';

export function generateSignature(
  method: string,
  path: string,
  timestamp: string,
  body: string,
  secret: string
): string {
  const message = `${method.toUpperCase()}${path}${timestamp}${body}`;
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
}

export function verifySignature(
  signature: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
  secret: string
): boolean {
  try {
    const expectedSignature = generateSignature(method, path, timestamp, body, secret);
    
    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'utf-8');
    
    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    return false;
  }
}

export function isTimestampValid(timestampStr: string, windowSeconds: number = 60): boolean {
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return false;
  }
  
  const now = Date.now();
  const drift = Math.abs(now - timestamp);
  return drift <= windowSeconds * 1000;
}

export class ReplayCache {
  private signatures = new Map<string, number>(); // signature -> expiry timestamp
  private cleanupInterval: NodeJS.Timeout;

  constructor(private windowSeconds: number = 60) {
    this.cleanupInterval = setInterval(() => this.prune(), 60000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  add(signature: string): boolean {
    const now = Date.now();
    this.prune();

    if (this.signatures.has(signature)) {
      return false;
    }

    this.signatures.set(signature, now + this.windowSeconds * 1000);
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [sig, expiry] of this.signatures.entries()) {
      if (now > expiry) {
        this.signatures.delete(sig);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

export const replayCache = new ReplayCache(60);

export function generateSecureSecret(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
