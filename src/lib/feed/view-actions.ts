"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";

import { setFeedView } from "./view-settings";

/**
 * Setting the Feed view from the website.
 *
 * A Server Action is a public POST, so the viewer is resolved here
 * rather than trusted from the caller, and `setFeedView` narrows the
 * value again before it is written - a view nothing can draw is stored
 * as the original rather than as an unreadable Feed.
 */
export async function setFeedViewAction(
  view: string,
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return { ok: false, error: "Sign in first." };

  const player = await playerForUser(viewer.user.id);
  if (!player) return { ok: false, error: "Sign in first." };

  const result = await setFeedView(player.id, view);
  if (!result.ok) return { ok: false, error: "Could not save that view." };

  /* The Feed reads it server-side, so it has to be re-rendered. */
  revalidatePath("/feed");
  revalidatePath("/profile/settings");

  return { ok: true };
}
