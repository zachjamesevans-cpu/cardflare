import "server-only";

import { createPlayerSession } from "@/lib/players/repository";
import { linkSessionToPlayer, sessionForPlayer } from "@/lib/players/accounts";
import { createSessionToken, hashSessionToken } from "@/lib/players/session";
import type { PlayerSessionRow } from "@/lib/supabase/types";

import { listBinder, type ListEntry } from "./repository";

/**
 * The Have list outside a room.
 *
 * A Have list has always been keyed on the room session, and an
 * account has exactly one session (one_room_identity_per_account), so
 * the account's list IS that session's binder. The one gap is a player
 * who has never joined anything and so has no session yet: they get
 * one here, linked to the account, which the next room join adopts
 * rather than minting a rival (see accountRoomIdentity).
 */
export async function binderSessionFor(
  playerId: string,
  displayName: string,
  create: boolean,
): Promise<PlayerSessionRow | null> {
  const existing = await sessionForPlayer(playerId);
  if (existing || !create) return existing;

  const session = await createPlayerSession(
    displayName,
    hashSessionToken(createSessionToken()),
  );
  await linkSessionToPlayer(session.id, playerId);
  return { ...session, player_id: playerId };
}

/** The account's Have list, or empty for an account with no session yet. */
export async function listHaves(playerId: string): Promise<ListEntry[]> {
  const session = await sessionForPlayer(playerId);
  return session ? listBinder(session.id) : [];
}
