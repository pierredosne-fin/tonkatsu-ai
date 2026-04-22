import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

// Shared bucket store: key → { count, resetAt }
const httpBuckets = new Map<string, Bucket>();
const socketBuckets = new Map<string, Bucket>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

function getBucket(store: Map<string, Bucket>, key: string, windowMs: number): Bucket {
  const now = Date.now();
  let bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }
  return bucket;
}

/** Express middleware: rate-limits by IP. Attaches X-RateLimit-* headers. */
export function createRateLimiter(maxRequests = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS) {
  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const bucket = getBucket(httpBuckets, key, windowMs);
    bucket.count++;

    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetEpoch = Math.floor(bucket.resetAt / 1000);

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetEpoch));

    if (bucket.count > maxRequests) {
      const retryAfter = Math.ceil((bucket.resetAt - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
      return;
    }

    next();
  };
}

/**
 * Check rate limit for a socket event. Returns true if allowed, false if exceeded.
 * The caller is responsible for emitting the appropriate error.
 */
export function checkSocketRateLimit(
  socketId: string,
  maxRequests = 30,
  windowMs = DEFAULT_WINDOW_MS,
): boolean {
  const bucket = getBucket(socketBuckets, socketId, windowMs);
  bucket.count++;
  return bucket.count <= maxRequests;
}
