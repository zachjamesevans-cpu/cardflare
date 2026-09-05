import "server-only";

import { checkRateLimit } from "@/lib/rate-limit";

/**
 * A route's answer when one caller is doing too much of something.
 *
 * Messaging, posting, following and claiming are all cheap to script
 * and each one lands on somebody else's phone, so every write the app
 * can make has a ceiling per account, and the unauthenticated reads
 * have one per network. Null means carry on; otherwise the 429 to
 * return, with the wait in its header so a client that cares can
 * read it.
 */
export function tooMany(key: string, limit: number, windowMs: number): Response | null {
  const rate = checkRateLimit(key, limit, windowMs);
  if (rate.allowed) return null;

  return Response.json(
    {
      error: "rate-limited",
      message: "That is a lot at once. Try again in a moment.",
    },
    { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
  );
}

const MINUTE = 60 * 1000;

/** The ceilings, in one place, so the website's actions can share them. */
export const LIMITS = {
  /** New conversations started, per account. */
  threadOpen: { limit: 10, windowMs: 60 * MINUTE },
  /** Messages sent, per account. */
  message: { limit: 60, windowMs: 10 * MINUTE },
  /** Flares posted with no room (one call may carry a deck), per account. */
  areaFlare: { limit: 30, windowMs: 10 * MINUTE },
  /** Deck lists saved, per account. */
  deckList: { limit: 20, windowMs: 10 * MINUTE },
  /** Follows and unfollows, per account. */
  follow: { limit: 30, windowMs: 10 * MINUTE },
  /** Store claims, per network. */
  claim: { limit: 5, windowMs: 60 * MINUTE },
  /** Card and player searches from the app, per network. */
  search: { limit: 120, windowMs: 5 * MINUTE },
  /** Picture uploads started, per account. */
  avatarBegin: { limit: 10, windowMs: 10 * MINUTE },
  /** Picture pieces sent, per account: a 2MB GIF is about 350. */
  avatarChunk: { limit: 2000, windowMs: 10 * MINUTE },
  /** Apple purchase syncs, per account. */
  billing: { limit: 10, windowMs: 60 * MINUTE },
} as const;
