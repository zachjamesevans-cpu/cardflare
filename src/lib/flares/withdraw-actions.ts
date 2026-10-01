"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { playerForUser } from "@/lib/players/accounts";
import { getPlayerSession } from "@/lib/players/session";
import { restoreFlares, withdrawFlares, withdrawRoomFlare } from "./withdraw";

/**
 * The website's doors to taking a Flare down and putting it back.
 *
 * Each returns the ids it touched, which is what the undo toast holds
 * for its minute. The player is re-derived from the session, never
 * from the form.
 */

export type TakeDownResult =
  { ok: true; flareIds: string[] } | { ok: false; message: string };

async function viewerPlayerId(): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return viewer.playerId;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

/** The caller is a player in this room, by session and participation. */
async function requirePlayerInRoom(
  code: string,
): Promise<{ playerSessionId: string } | null> {
  const session = await getPlayerSession();
  if (!session) return null;
  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") return null;
  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return null;
  return { playerSessionId: session.id };
}

function repaint(): void {
  revalidatePath("/feed");
  revalidatePath("/flare");
  revalidatePath("/profile");
}

/** "Take down" on your own post, from the Feed or your profile. */
export async function takeDownPostAction(postId: string): Promise<TakeDownResult> {
  const playerId = await viewerPlayerId();
  if (!playerId) return { ok: false, message: "Sign in first." };

  const result = await withdrawFlares(playerId, { postId });
  if (!result.ok) return { ok: false, message: "Could not take that down." };

  repaint();
  return { ok: true, flareIds: result.flareIds };
}

/** "Take down" on one card of a room board, under the room identity. */
export async function takeDownRoomFlareAction(
  code: string,
  flareId: string,
): Promise<TakeDownResult> {
  const room = await requirePlayerInRoom(code);
  if (!room) return { ok: false, message: "Join the room first." };

  const result = await withdrawRoomFlare(flareId, room.playerSessionId);
  if (!result.ok) return { ok: false, message: "Could not take that down." };

  revalidatePath(`/e/${code}`);
  repaint();
  return { ok: true, flareIds: result.flareIds };
}

/** The undo. Works for a signed-in player and for a guest in a room. */
export async function restoreFlaresAction(
  flareIds: string[],
  code?: string,
): Promise<{ ok: boolean; restored: number }> {
  const playerId = await viewerPlayerId();
  const room = code ? await requirePlayerInRoom(code) : null;

  const result = await restoreFlares(playerId, room?.playerSessionId ?? null, flareIds);

  if (code) revalidatePath(`/e/${code}`);
  repaint();
  return result;
}
