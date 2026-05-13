/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * v1 only. On Vercel serverless every cold start resets the buckets, so
 * this is best-treated as defence-in-depth against accidental floods
 * (buggy clients, retry storms) rather than a true DoS shield. For a real
 * deployment the recommendation is to swap this in for Upstash Redis or
 * Vercel KV — same interface, different storage.
 *
 * Limits are expressed as "max N requests per window seconds". The default
 * keying is by IP + route; callers can supply a more granular key
 * (`"user:${id}"`, `"ip:${ip}:signin"`, etc.) when a route has its own
 * threat profile.
 */

export type RateLimitConfig = {
  max: number;
  windowSec: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSec * 1000;
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: config.max - 1, resetAt: now + windowMs };
  }
  if (existing.count >= config.max) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return {
    allowed: true,
    remaining: config.max - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Best-effort caller IP extraction. Vercel sets `x-forwarded-for` with the
 * client IP as the first hop. Falls back to a constant when we can't tell
 * — better than throwing, and at worst means "every anonymous request
 * shares one bucket".
 */
export function callerIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "0.0.0.0";
}

export const RATE_LIMITS = {
  /** Sign-in attempts per IP. Tight — five tries per minute. */
  signIn: { max: 5, windowSec: 60 },
  /** All write endpoints (POST / PATCH / DELETE) per user. */
  apiWrite: { max: 60, windowSec: 60 },
  /** Backup downloads — heavy, one per minute is plenty. */
  backup: { max: 3, windowSec: 60 },
} as const;

/** Test seam — wipe in-memory state between specs. */
export function __resetForTests(): void {
  buckets.clear();
}
