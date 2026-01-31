export interface RateLimitConfig {
  windowMs: number;      // Time window in ms (default: 60000 = 1 min)
  maxRequests: number;   // Max requests per window (default: 30)
  perChannel: boolean;   // Apply per channel or per user
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
}

export class RateLimiter {
  private buckets: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(private config: RateLimitConfig) {}

  check(userId: string, channelId?: string): RateLimitResult {
    const key = this.config.perChannel && channelId
      ? `${userId}:${channelId}`
      : userId;

    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.config.windowMs };
      this.buckets.set(key, bucket);
    }

    if (bucket.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(bucket.resetAt),
        retryAfterMs: bucket.resetAt - now
      };
    }

    bucket.count++;
    return {
      allowed: true,
      remaining: this.config.maxRequests - bucket.count,
      resetAt: new Date(bucket.resetAt)
    };
  }

  reset(userId: string): void {
    // Remove all buckets for user
    const keysToDelete: string[] = [];
    for (const key of this.buckets.keys()) {
      if (key.startsWith(userId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.buckets.delete(key));
  }
}
