"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { markHuntCard } from "@/lib/players/hunts";

/**
 * Ticking a card off a hunt, from the website.
 *
 * The founder: "needs to be a simply way in hunts to mark off if you've
 * already found that card. think of it as a checklist... you can check
 * them off yourself as you collect the cards."
 *
 * A Server Action is a public POST endpoint, so the viewer is resolved
 * here rather than trusted from the caller, and `markHuntCard` checks
 * ownership again against the row itself. Neither check is redundant:
 * this one says who is asking, that one says whose card it is.
 */
export async function tickHuntCard(
  flareId: string,
  found: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  /* Every signed-in kind carries a user; only an anonymous one does not.
     A store or admin account with a player row may tick their own list
     like anybody else. */
  if (viewer.kind === "anonymous") return { ok: false, error: "Sign in first." };

  const player = await playerForUser(viewer.user.id);
  if (!player) return { ok: false, error: "Sign in first." };

  const result = await markHuntCard(player.id, flareId, found);

  if (!result.ok) {
    if (result.reason === "traded") {
      return { ok: false, error: "That card was closed by a trade." };
    }
    if (result.reason === "not-yours") {
      return { ok: false, error: "That card is not on one of your hunts." };
    }
    return { ok: false, error: "Could not update that card." };
  }

  /* The panel is on both of these, and a tick moves the counts on it. */
  revalidatePath("/profile");
  revalidatePath(`/p/${player.id}`);

  return { ok: true };
}
