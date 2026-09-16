"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import {
  addHuntRequests,
  createHunt,
  markHuntCard,
  setFlareFound,
  setRequestFound,
  updateHunt,
  type RequestInput,
} from "@/lib/players/hunts";

/**
 * The website's side of a hunt: every write re-derives the player from
 * the session, never from the form, and repaints the two pages a hunt
 * is drawn on. The app reaches the same library through /api/v1/hunts.
 */

type Outcome = { ok: true } | { ok: false; error: string };

const SIGN_IN = "Sign in first.";

async function viewerPlayerId(): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return viewer.playerId;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

function repaint(playerId: string, huntId?: string) {
  revalidatePath("/profile");
  revalidatePath(`/p/${playerId}`);
  revalidatePath("/feed");
  if (huntId) revalidatePath(`/hunts/${huntId}`);
}

/** The old tick: every copy in hand, or none. Kept for its callers. */
export async function tickHuntCard(flareId: string, found: boolean): Promise<Outcome> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, error: SIGN_IN };

  const result = await markHuntCard(playerId, flareId, found);
  if (!result.ok) {
    if (result.reason === "traded") {
      return { ok: false, error: "That card was closed by a trade." };
    }
    if (result.reason === "not-yours") {
      return { ok: false, error: "That card is not on one of your hunts." };
    }
    return { ok: false, error: "Could not update that card." };
  }
  repaint(playerId);
  return { ok: true };
}

/** Copies in hand for one request. Clamped and owner-only on the server. */
export async function setRequestFoundAction(
  requestId: string,
  found: number,
): Promise<Outcome & { found?: number; needed?: number }> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, error: SIGN_IN };
  const result = await setRequestFound(playerId, requestId, found);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "not-yours"
          ? "That card is not on one of your hunts."
          : "Could not update that card.",
    };
  }
  repaint(playerId);
  return { ok: true, found: result.found, needed: result.needed };
}

/** Copies in hand for a posted card, by its Flare, from the Feed. */
export async function setFlareFoundAction(
  flareId: string,
  found: number,
): Promise<Outcome & { found?: number; needed?: number }> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, error: SIGN_IN };
  const result = await setFlareFound(playerId, flareId, found);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "not-yours"
          ? "That card is not yours."
          : "Could not update that card.",
    };
  }
  repaint(playerId);
  return { ok: true, found: result.found, needed: result.needed };
}

export async function createHuntAction(input: {
  name: string;
  description?: string | null;
  visibility?: "public" | "private";
}): Promise<Outcome & { huntId?: string }> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, error: SIGN_IN };
  const result = await createHunt(playerId, input);
  if (!result.ok) {
    if (result.reason === "limit") {
      return {
        ok: false,
        error: `You are keeping ${result.kept} hunts, which is the limit on your plan. Finish one first, or add these cards to one you already have.`,
      };
    }
    if (result.reason === "name") return { ok: false, error: "Give the hunt a name." };
    return { ok: false, error: "Could not start the hunt." };
  }
  repaint(playerId, result.huntId);
  return { ok: true, huntId: result.huntId };
}

export async function updateHuntAction(
  huntId: string,
  patch: {
    name?: string;
    description?: string | null;
    visibility?: "public" | "private";
  },
): Promise<Outcome> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, error: SIGN_IN };
  const result = await updateHunt(playerId, huntId, patch);
  if (!result.ok) {
    if (result.reason === "name") return { ok: false, error: "Give the hunt a name." };
    if (result.reason === "not-yours")
      return { ok: false, error: "That hunt is not yours." };
    return { ok: false, error: "Could not update the hunt." };
  }
  repaint(playerId, huntId);
  return { ok: true };
}

/** Cards onto a hunt from its own page: copies add to a card already there. */
export async function addHuntCardsAction(
  huntId: string,
  items: RequestInput[],
): Promise<Outcome> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, error: SIGN_IN };
  if (items.length === 0) return { ok: false, error: "Pick a card first." };
  const result = await addHuntRequests(playerId, huntId, items, "add");
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "not-yours"
          ? "That hunt is not yours."
          : "Could not add those cards.",
    };
  }
  repaint(playerId, huntId);
  return { ok: true };
}
