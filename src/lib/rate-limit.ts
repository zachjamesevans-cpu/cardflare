/**
 * Fixed-window in-memory rate limiter.
 *
 * Scoped to a single server instance, so under serverless fan-out it throttles
 * per-instance rather than globally. That is deliberate for launch: it costs
 * nothing, stops the obvious single-source flood, and the interface is narrow
 * enough to swap for a shared store (Upstash, Supabase) if abuse warrants it.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Bounds memory if a flood produces many distinct keys. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) pruneExpired(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Every key is still live: drop the oldest-resetting entries to stay bounded.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const sorted = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of sorted.slice(0, Math.ceil(MAX_TRACKED_KEYS / 2))) {
      windows.delete(key);
    }
  }
}

/** Test seam. */
export function resetRateLimits(): void {
  windows.clear();
}
