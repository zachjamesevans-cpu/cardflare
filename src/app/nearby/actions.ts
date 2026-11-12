"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { forgetFeed } from "@/lib/feed/memo";
import { saveLocalRadius } from "@/lib/local/feed";
import { isLocalRadius } from "@/lib/local/shared";
import { playerForUser } from "@/lib/players/accounts";
import { savePostalCodeAction } from "@/lib/players/location-actions";
import type { PostalState } from "@/lib/players/location-schema";

/**
 * The two things Nearby lets a player change about itself: how far it
 * looks, and where from.
 *
 * Both are writes the rest of the site already has (the reach is the
 * column the app's `PUT /api/v1/local` sets, the ZIP is
 * `savePostalCodeAction`). What they add is the part only this page
 * needs: the Feed's list is remembered for half a minute (see
 * lib/feed/memo.ts), and an answer that changes what is near you has
 * to forget it, or the page comes back still asking the question.
 *
 * A Server Action is a public POST endpoint, so each re-establishes the
 * player from the session.
 */

async function viewerPlayerId(): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind === "anonymous") return null;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

/** Nearby's reach: 10, 25, 50 or 100 miles. */
export async function setNearbyRadiusAction(
  radius: number,
): Promise<{ ok: boolean; error?: string }> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, error: "Sign in first." };
  if (!isLocalRadius(radius)) return { ok: false, error: "Could not save that." };

  const saved = await saveLocalRadius(playerId, radius);
  if (!saved) return { ok: false, error: "Could not save that." };

  forgetFeed(playerId);
  revalidatePath("/nearby");

  return { ok: true };
}

/** The ZIP typed into Nearby's "See Flares near you" card. */
export async function saveNearbyPostalAction(
  previous: PostalState,
  formData: FormData,
): Promise<PostalState> {
  const state = await savePostalCodeAction(previous, formData);
  if (state.status !== "saved") return state;

  const playerId = await viewerPlayerId();
  if (playerId) forgetFeed(playerId);
  revalidatePath("/nearby");

  /* The shared action answers in stores ("Showing stores near ..."),
     which is not what this page shows. */
  return { status: "saved", message: "Location saved." };
}
