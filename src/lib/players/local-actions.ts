"use server";

import { revalidatePath } from "next/cache";

import { getViewer, type Viewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { hasLocal, removeLocal, saveLocal } from "@/lib/players/locals";

/**
 * Following a store on purpose.
 *
 * A local used to be saved only by joining a room signed in. The
 * founder: "make a way and flow for stores to setup their store account
 * ... so players can follow the store. if a player is in a room for
 * that store, the store is linked in there for them to quickly follow
 * that store's page and stay updated." Same row, same list, same Feed
 * item - the only new thing is a button that writes it.
 *
 * The player is re-derived from the cookie on every call, never taken
 * from the client. The same rule as the room page: a player viewer
 * carries its id, and an admin or owner who also holds a player row is
 * a player for this purpose.
 */
async function playerIdFor(viewer: Viewer): Promise<string | null> {
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return viewer.playerId;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a follow shows: the store's page, the Feed, the locals list, the room. */
function revalidateLocals(storeId: string, code?: string): void {
  revalidatePath(`/s/${storeId}`);
  revalidatePath("/feed");
  revalidatePath("/profile/settings");
  if (code) revalidatePath(`/e/${code}`);
}

export async function followStoreAction(
  storeId: string,
  /** The room the button sits in, when it does, so it repaints too. */
  code?: string,
): Promise<{ following: boolean }> {
  if (!UUID.test(storeId)) return { following: false };

  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { following: false };

  await saveLocal(playerId, storeId);
  revalidateLocals(storeId, code);

  return { following: await hasLocal(playerId, storeId) };
}

export async function unfollowStoreAction(
  storeId: string,
  code?: string,
): Promise<{ following: boolean }> {
  if (!UUID.test(storeId)) return { following: false };

  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { following: false };

  await removeLocal(playerId, storeId);
  revalidateLocals(storeId, code);

  return { following: await hasLocal(playerId, storeId) };
}
