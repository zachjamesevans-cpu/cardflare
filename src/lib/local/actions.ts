"use server";

import { pointFromCoords } from "@/lib/geo/zip";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { postAreaFlare, withdrawAreaFlare, type AreaFlareInput } from "./area";
import { localFeed, saveLocalRadius, type LocalFeed } from "./feed";
import { isLocalRadius } from "./shared";
import {
  closeThread,
  openFlareThread,
  readThread,
  sendThreadMessage,
  type ThreadMessage,
} from "./threads";

/**
 * The website's writes for Local. Thin: each re-establishes the player
 * from the session — a Server Action is a public POST endpoint — and
 * hands the rest to the same lib the app's API uses, so the two
 * platforms cannot drift on the rules.
 */

async function viewerPlayerId(): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind === "anonymous") return null;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

export type LocalActionResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      /**
       * What kind of refusal, when the caller can do something specific
       * about it. Named rather than sniffed out of the message: a screen
       * that decides what to render by searching the copy for the word
       * "ZIP" breaks the first time somebody rewrites the sentence.
       */
      reason?: "sign-in" | "no-postal-code" | "already-posted";
    };

/** Null when signed out or the coordinates were nonsense. */
export type LocalFeedResult = LocalFeed | null;

const SIGN_IN = "Sign in to use Local.";
const GENERIC = "Something went wrong. Please try again in a moment.";

export async function setLocalRadiusAction(radius: number): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };
  if (!isLocalRadius(radius)) return { ok: false, message: GENERIC };

  const saved = await saveLocalRadius(playerId, radius);
  return saved ? { ok: true } : { ok: false, message: GENERIC };
}

export async function openThreadAction(
  flareId: string,
  body: string,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };

  const outcome = await openFlareThread(flareId, playerId, body);
  if (outcome.ok) return outcome;

  const message =
    outcome.reason === "no-account"
      ? "This player posted as a guest, so there is nowhere to send a message."
      : outcome.reason === "yourself"
        ? "That one is yours."
        : outcome.reason === "closed"
          ? "This conversation was ended."
          : GENERIC;
  return { ok: false, message };
}

export async function sendMessageAction(
  threadId: string,
  body: string,
): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };

  const outcome = await sendThreadMessage(threadId, playerId, body);
  if (outcome.ok) return { ok: true };
  return {
    ok: false,
    message: outcome.reason === "closed" ? "This conversation was ended." : GENERIC,
  };
}

export async function closeThreadAction(threadId: string): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };

  const outcome = await closeThread(threadId, playerId);
  return outcome.ok ? { ok: true } : { ok: false, message: GENERIC };
}

export interface ThreadReadResult {
  ok: boolean;
  closed: boolean;
  cardName: string | null;
  withName: string | null;
  messages: ThreadMessage[];
}

/** One conversation, read fresh — reading is what marks it read. */
export async function readThreadAction(threadId: string): Promise<ThreadReadResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) {
    return { ok: false, closed: false, cardName: null, withName: null, messages: [] };
  }

  return readThread(threadId, playerId);
}

/**
 * The Local list, measured from where the browser says the player is.
 *
 * The website's answer to "enable location access": the browser's own
 * permission prompt, granted, hands coordinates that ride this ONE
 * action call and are never written anywhere — the same promise the
 * app's device path makes. The ZIP field stays beside it for everybody
 * who would rather type five digits than grant a prompt.
 */
export async function localFeedAtAction(
  latitude: number,
  longitude: number,
): Promise<LocalFeedResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return null;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return localFeed(playerId, { latitude, longitude });
}

/**
 * Posting a Flare to your area rather than to a board.
 *
 * The ZIP refusal is deliberately its own message: it is not an error, it
 * is the one missing thing, and Local already knows how to ask for five
 * digits. Anything that says "something went wrong" here sends somebody
 * looking for a bug instead of a field.
 */
export async function postAreaFlareAction(
  input: AreaFlareInput,
  /* The browser's coordinate, when Local is being read from one. Rides
     this call, anchors the Flare to a ZIP, and is never written. */
  at?: { latitude: number; longitude: number } | null,
): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };

  const result = await postAreaFlare(
    playerId,
    input,
    pointFromCoords(at?.latitude, at?.longitude),
  );
  if (result.ok) return { ok: true };

  if (result.reason === "no-postal-code") {
    return {
      ok: false,
      reason: "no-postal-code",
      message: "Tell us roughly where you are and the card goes up.",
    };
  }
  if (result.reason === "already-posted") {
    return { ok: false, reason: "already-posted", message: "That card is already up." };
  }

  return { ok: false, message: GENERIC };
}

/** Taking your own area Flare down. */
export async function withdrawAreaFlareAction(
  flareId: string,
): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };

  return (await withdrawAreaFlare(playerId, flareId))
    ? { ok: true }
    : { ok: false, message: GENERIC };
}
