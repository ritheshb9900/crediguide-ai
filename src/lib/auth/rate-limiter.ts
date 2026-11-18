import { IRateLimiter, RateLimitResult } from "./types";

/**
 * Custom error thrown when a production environment attempts to run without
 * a configured shared distributed rate-limiting store.
 */
export class RateLimiterConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimiterConfigurationError";
  }
}

interface MemoryBucket {
  tokens: number;
  lastRefill: number;
  resetTime: number;
}

/**
 * @deprecated [DEVELOPMENT ONLY — SINGLE PROCESS ONLY]
 *
 * In-memory sliding-window token bucket rate limiter.
 * This class is strictly designed for local development and offline unit testing.
 *
 * CRITICAL LIMITATION:
 * In-memory state is NOT synchronized across multi-process clusters, Docker containers,
 * or serverless instances. It MUST NEVER be used in production environments.
 */
export class DevelopmentMemoryRateLimiter implements IRateLimiter {
  readonly providerName = "DevelopmentMemoryRateLimiter";
  private buckets = new Map<string, MemoryBucket>();

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetTime) {
      bucket = {
        tokens: limit - 1,
        lastRefill: now,
        resetTime: now + windowMs,
      };
      this.buckets.set(key, bucket);

      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTime: new Date(bucket.resetTime),
      };
    }

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        limit,
        remaining: bucket.tokens,
        resetTime: new Date(bucket.resetTime),
      };
    }

    // Rate limit exceeded
    const retryAfterSeconds = Math.ceil((bucket.resetTime - now) / 1000);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetTime: new Date(bucket.resetTime),
      retryAfterSeconds: Math.max(retryAfterSeconds, 1),
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  /**
   * Clears all in-memory buckets (useful for test suite isolation).
   */
  clearAll(): void {
    this.buckets.clear();
  }
}

let cachedRateLimiter: IRateLimiter | null = null;

/**
 * Checks whether an approved shared store (e.g. Redis / Valkey / external DB store)
 * is configured for multi-instance production execution.
 */
export function isSharedStoreConfigured(): boolean {
  // Check for presence of an external store connection string
  const redisUrl = process.env.REDIS_URL;
  const rateLimitStore = process.env.RATE_LIMIT_STORE;
  return Boolean((redisUrl && redisUrl.trim() !== "") || (rateLimitStore && rateLimitStore.trim() === "SHARED"));
}

/**
 * Returns the active rate limiter.
 *
 * SECURITY POLICY:
 * 1. In Development (`NODE_ENV !== "production"`): Defaults to `DevelopmentMemoryRateLimiter`.
 * 2. In Production (`NODE_ENV === "production"`):
 *    - MUST have a configured shared store.
 *    - If unconfigured, FAILS CLOSED by throwing `RateLimiterConfigurationError`.
 *    - NEVER silently falls back to an in-memory rate limiter in production.
 */
export function getRateLimiter(): IRateLimiter {
  if (cachedRateLimiter) {
    return cachedRateLimiter;
  }

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (!isSharedStoreConfigured()) {
      throw new RateLimiterConfigurationError(
        "CRITICAL SECURITY CONFIGURATION ERROR: No shared rate limiter store is configured in production. " +
        "In-memory rate limiting is forbidden in multi-replica production environments. " +
        "Authentication requests must fail closed."
      );
    }

    // Shared store adapter placeholder (will connect when shared store package is approved and configured)
    throw new RateLimiterConfigurationError(
      "Production shared rate limiter adapter is pending external store initialization."
    );
  }

  // Local development mode
  cachedRateLimiter = new DevelopmentMemoryRateLimiter();
  return cachedRateLimiter;
}

/**
 * Resets the cached rate limiter instance (useful for test suites).
 */
export function resetRateLimiterInstance(instance?: IRateLimiter): void {
  cachedRateLimiter = instance ?? null;
}
