import "server-only";

import { binderSessionFor } from "@/lib/lists/haves";
import { setLocalTrade } from "@/lib/lists/repository";
import {
  openFlareThread,
  openWantThread,
  type OpenThreadOptions,
} from "@/lib/local/threads";

import { askIsLive, pruneStaleNearbyNotices, type Ask } from "./live";
import { ANSWER_GONE } from "./shared";

/**
 * Answering somebody on "Wanted near you", for the app's route and the
 * website's action alike: the holder's own words (the draft, edited or
 * not), sent only now, and only while the ask still stands. A Flare
 * taken down a minute ago does not get a conversation opened on it.
 */
export async function answerNearby(
  playerId: string,
  ask: Ask,
  body: string,
  options: OpenThreadOptions,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  if (!(await askIsLive(ask))) return { ok: false, message: ANSWER_GONE };

  const outcome =
    ask.kind === "want"
      ? await openWantThread(ask.id, playerId, body, options)
      : await openFlareThread(ask.id, playerId, body, options);
  if (outcome.ok) return outcome;

  return {
    ok: false,
    message:
      outcome.reason === "not-found"
        ? ANSWER_GONE
        : outcome.reason === "closed"
          ? "You can't message this player."
          : outcome.reason === "yourself"
            ? "That one is yours."
            : outcome.reason === "empty"
              ? "Write something first."
              : outcome.reason === "rate-limited"
                ? "That is a lot of conversations at once. Give it a minute."
                : "Could not send that. Try again in a moment.",
  };
}

/**
 * "Not trading this anymore": takes one card off Trade locally, so its
 * whole section leaves "Wanted near you" and its notices leave the
 * Inbox. The honest way to say "stop showing me this" - the card is no
 * longer offered, rather than the people being hidden.
 */
export async function stopTrading(
  playerId: string,
  displayName: string,
  haveEntryId: string,
): Promise<boolean> {
  const session = await binderSessionFor(playerId, displayName, false);
  if (!session) return false;
  const saved = await setLocalTrade(haveEntryId, session.id, false);
  if (saved) await pruneStaleNearbyNotices(playerId);
  return saved;
}
