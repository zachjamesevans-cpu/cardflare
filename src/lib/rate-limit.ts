import { afterResponse } from "@/lib/after-response";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limiter: decided in memory, counted in Postgres.
 *
 * It was in-memory only, scoped to one server instance, so under
 * serverless fan-out every ceiling was really "per warm function": a
 * script spread across a few cold starts got a multiple of each limit.
 *
 * Every caller (sixty-odd server actions and routes, and `tooMany`) is
 * synchronous and reads the answer on the spot, so the database cannot
 * sit in the decision without rewriting all of them. Instead the two
 * halves do what each is good at:
 *
 *   - The in-memory window answers now, exactly as before, so a single
 *     instance under a flood still stops it on the spot.
 *   - Every allowed hit is also counted in `rate_limit_hits` through
 *     `rate_limit_hit()`, after the response, through the service-role
 *     client. When the shared count says a key is over its ceiling,
 *     this instance remembers that until the window resets and refuses
 *     the key from then on.
 *
 * So the fleet-wide allowance is the limit plus at most one request per
 * instance that has not yet heard, instead of the limit TIMES the
 * instances. If the database call fails, the shared half is skipped and
 * the in-memory half carries on alone: fail open, logged - a limiter
 * that locks everybody out when Postgres hiccups is worse than one that
 * is briefly per-instance again.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
/** Keys the shared count has put over their ceiling, until resetAt. */
const sharedBlocks = new Map<string, number>();

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
  const blockedUntil = sharedBlocks.get(key);
  if (blockedUntil !== undefined) {
    if (blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)),
      };
    }
    sharedBlocks.delete(key);
  }

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) pruneExpired(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    countShared(key, limit, windowMs);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  countShared(key, limit, windowMs);
  return { allowed: true, retryAfterSeconds: 0 };
}

/* -------------------------------------------------------------------- */
/* The shared half                                                       */
/* -------------------------------------------------------------------- */

let sharedEnabled = true;
let lastFailureLogAt = 0;

function countShared(key: string, limit: number, windowMs: number): void {
  try {
    if (!sharedEnabled || !isSupabaseConfigured()) return;
  } catch {
    /* Never let the shared half throw into the caller's decision. */
    return;
  }

  afterResponse(async () => {
    try {
      const { data, error } = await getSupabaseAdmin().rpc("rate_limit_hit", {
        p_key: key,
        p_window_ms: windowMs,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.hits > limit) {
        if (sharedBlocks.size >= MAX_TRACKED_KEYS) sharedBlocks.clear();
        sharedBlocks.set(key, Date.parse(row.resets_at));
      }
    } catch (error) {
      /* Fail open. Logged at most once a minute per instance, so a
         database outage does not also become a log flood. */
      const now = Date.now();
      if (now - lastFailureLogAt > 60_000) {
        lastFailureLogAt = now;
        console.warn("Shared rate limit unavailable; limiting per instance", error);
      }
    }
  });
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
  sharedBlocks.clear();
}

/** Test seam: whether the shared half is consulted at all. */
export function setSharedRateLimits(enabled: boolean): void {
  sharedEnabled = enabled;
}
