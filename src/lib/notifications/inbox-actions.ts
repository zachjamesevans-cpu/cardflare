"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { markInboxRead } from "./inbox";

/**
 * "Mark all read", scoped to the caller's own rows.
 *
 * The player is re-derived from the session here rather than taken from
 * the form: a Server Action is a public POST endpoint, and an id in a
 * field would be an invitation to clear somebody else's inbox.
 */
export async function markInboxReadAction(): Promise<void> {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) return;

  await markInboxRead(playerId);
  revalidatePath("/inbox");
}
