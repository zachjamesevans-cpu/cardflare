"use server";

import { revalidatePath } from "next/cache";

import { setAutoPost } from "@/lib/events/auto-post";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";

/** The one switch behind joining a room: post my Flares to it, or not. */
export async function setAutoPostAction(
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return { ok: false, error: "Sign in first." };

  const player = await playerForUser(viewer.user.id);
  if (!player) return { ok: false, error: "Sign in first." };

  const result = await setAutoPost(player.id, on);
  if (!result.ok) return { ok: false, error: "Could not save that." };

  revalidatePath("/profile/settings");
  return { ok: true };
}
