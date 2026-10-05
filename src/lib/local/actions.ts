"use server";

import { pointFromCoords } from "@/lib/geo/zip";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { canStartHunt } from "@/lib/players/hunts";
import { postAreaFlares, withdrawAreaFlare, type AreaFlareInput } from "./area";
import { localFeed, saveLocalRadius, type LocalFeed } from "./feed";
import { isLocalRadius } from "./shared";
import {
  closeThread,
  openDirectThread,
  openFlareThread,
  openWantThread,
  readThread,
  sendThreadMessage,
  type ThreadRead,
} from "./threads";
import { tradeFailureMessage } from "@/lib/trades/thread-trade-copy";
import {
  answerThreadTrade,
  proposeThreadTrade,
  type ProposeInput,
} from "@/lib/trades/thread-trades";
import { LIMITS } from "@/lib/api/throttle";
import { checkRateLimit } from "@/lib/rate-limit";
import { LOCAL_ENABLED } from "@/lib/local/enabled";

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
      reason?: "sign-in" | "already-posted" | "not-migrated";
    };

/** Null when signed out or the coordinates were nonsense. */
export type LocalFeedResult = LocalFeed | null;

const SIGN_IN = LOCAL_ENABLED ? "Sign in to use Local." : "Sign in first.";
const TOO_MANY = "That is a lot at once. Try again in a moment.";
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
  return openAnyThread({ flareId }, body);
}

/** "I have this" on a nearby match: the thread opens on the saved want. */
export async function openWantThreadAction(
  wantId: string,
  body: string,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  return openAnyThread({ wantId }, body);
}

/**
 * "Message" on a profile: opens (or finds) the direct conversation with
 * that person. Nothing is sent; the thread view is where the first
 * line gets written.
 */
export async function openDirectThreadAction(
  playerId: string,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  return openAnyThread({ playerId }, "");
}

async function openAnyThread(
  on: { flareId: string } | { wantId: string } | { playerId: string },
  body: string,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };
  if (
    !checkRateLimit(
      `thread-open:${playerId}`,
      LIMITS.threadOpen.limit,
      LIMITS.threadOpen.windowMs,
    ).allowed
  ) {
    return { ok: false, message: TOO_MANY };
  }

  const outcome =
    "flareId" in on
      ? await openFlareThread(on.flareId, playerId, body)
      : "wantId" in on
        ? await openWantThread(on.wantId, playerId, body)
        : await openDirectThread(playerId, on.playerId);
  if (outcome.ok) return outcome;

  const message =
    outcome.reason === "no-account"
      ? "This player posted as a guest, so there is nowhere to send a message."
      : outcome.reason === "yourself"
        ? "playerId" in on
          ? "That is you."
          : "That one is yours."
        : outcome.reason === "closed"
          ? "You can't message this player."
          : GENERIC;
  return { ok: false, message };
}

export async function sendMessageAction(
  threadId: string,
  body: string,
): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };
  if (
    !checkRateLimit(
      `message:${playerId}`,
      LIMITS.message.limit,
      LIMITS.message.windowMs,
    ).allowed
  ) {
    return { ok: false, message: TOO_MANY };
  }

  const outcome = await sendThreadMessage(threadId, playerId, body);
  if (outcome.ok) return { ok: true };
  return {
    ok: false,
    message: outcome.reason === "closed" ? "You can't message this player." : GENERIC,
  };
}

export async function closeThreadAction(threadId: string): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };

  const outcome = await closeThread(threadId, playerId);
  return outcome.ok ? { ok: true } : { ok: false, message: GENERIC };
}

export type ThreadReadResult = ThreadRead;

/** One conversation, read fresh — reading is what marks it read. */
export async function readThreadAction(threadId: string): Promise<ThreadReadResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) {
    return {
      ok: false,
      closed: false,
      kind: "direct",
      threadId: null,
      cardName: null,
      withName: null,
      withPlayerId: null,
      withAvatarUrl: null,
      messages: [],
      meet: null,
      trade: null,
    };
  }

  return readThread(threadId, playerId);
}

/** "We traded": one side's word, waiting on the other's. */
export async function proposeTradeAction(
  threadId: string,
  input: ProposeInput,
): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };
  if (
    !checkRateLimit(`trade:${playerId}`, LIMITS.message.limit, LIMITS.message.windowMs)
      .allowed
  ) {
    return { ok: false, message: TOO_MANY };
  }

  const outcome = await proposeThreadTrade(threadId, playerId, input);
  return outcome.ok
    ? { ok: true }
    : { ok: false, message: tradeFailureMessage(outcome.reason) };
}

/** The other side's answer: yes pays both, no takes the claim back. */
export async function answerTradeAction(
  tradeId: string,
  yes: boolean,
): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };

  const outcome = await answerThreadTrade(tradeId, playerId, yes);
  return outcome.ok
    ? { ok: true }
    : { ok: false, message: tradeFailureMessage(outcome.reason) };
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
 * Posting a Flare with no board: to your friends in the Feed, and to
 * your area when Local is on. Nothing is asked first; a ZIP rides along
 * when the profile has one.
 */
export async function postAreaFlareAction(
  /* One card or a whole list. A list goes up as ONE post — see
     postAreaFlares — so building a deck here does not scroll thirty
     separate items past everybody nearby. */
  input: AreaFlareInput | AreaFlareInput[],
  /* The browser's coordinate, when Local is being read from one. Rides
     this call, anchors the Flare to a ZIP, and is never written. */
  at?: { latitude: number; longitude: number } | null,
  /** What to call the group, when several cards go up together. */
  deckLabel?: string | null,
): Promise<LocalActionResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: SIGN_IN };
  if (
    !checkRateLimit(
      `area-flare:${playerId}`,
      LIMITS.areaFlare.limit,
      LIMITS.areaFlare.windowMs,
    ).allowed
  ) {
    return { ok: false, message: TOO_MANY };
  }

  /*
   * THE LIMIT IS CHECKED WHERE A HUNT IS STARTED, not where one is read.
   *
   * The founder: "free users can do two flare groups... pro players get
   * 50 of these." Naming a group is the only way to start a hunt, so
   * this is the only door it has to guard - and adding to one they
   * already keep is never refused, because the limit is on how many sets
   * somebody keeps, not on how many cards go in them.
   */
  if (deckLabel?.trim()) {
    const room = await canStartHunt(playerId, deckLabel);
    if (!room.allowed) {
      return {
        ok: false,
        message: `You are keeping ${room.kept} hunts, which is the limit on your plan. Rename this one to match a hunt you already have, or finish one first.`,
      };
    }
  }

  const result = await postAreaFlares(
    playerId,
    Array.isArray(input) ? input : [input],
    pointFromCoords(at?.latitude, at?.longitude),
    deckLabel ?? null,
  );
  if (result.ok) return { ok: true };

  if (result.reason === "already-posted") {
    return { ok: false, reason: "already-posted", message: "That card is already up." };
  }
  if (result.reason === "not-migrated") {
    return {
      ok: false,
      reason: "not-migrated",
      message:
        "Posting from Local isn't switched on yet — the database migration has not been applied.",
    };
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
