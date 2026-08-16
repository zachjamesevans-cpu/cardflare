import "server-only";

import type { PlayerSessionRow } from "@/lib/supabase/types";
import { linkSessionToPlayer, sessionForPlayer } from "./accounts";
import {
  addSessionToken,
  createPlayerSession,
  mergePlayerSessions,
  renamePlayerSession,
} from "./repository";
import { createSessionToken, hashSessionToken } from "./session";

/**
 * The room identity a signed-in player joins with.
 *
 * A session is a DEVICE; an account is a PERSON. Before this, each client
 * resolved its own session from its own token and joined with it, so the
 * founder signing in on the mobile site and again in the app arrived as two
 * people: two rows in `event_participants`, two sections on the board, his
 * name twice — and, less visibly, two binders that never matched each other.
 *
 * So a signed-in player has exactly one session, enforced by a partial unique
 * index, and a second device adopts it instead of minting a rival. Adopting is
 * additive: `player_session_tokens` lets one session answer to several tokens,
 * so the device that was already in the room keeps the token it has.
 *
 * Guests never reach this. Their session is their whole identity and it stays
 * exactly as it was.
 */

export interface RoomIdentity {
  session: PlayerSessionRow;
  /**
   * A token this device must start sending, or null when the one it already
   * has still resolves. Set as the cookie by the website and returned to the
   * app, the same way a brand new session's token is.
   */
  freshToken: string | null;
  /** True only when this call created the session, so a failed join can undo it. */
  created: boolean;
  /**
   * True when the account was already in play elsewhere and this device picked
   * that identity up. The one thing worth telling the player about: they asked
   * to join and got their existing seat back.
   */
  resumed: boolean;
}

/**
 * Resolves — or creates — the account's single room identity for a device.
 *
 * `deviceSession` is whatever this client's own token resolved to, which may
 * be nothing (a fresh app install), the account's identity already (the
 * ordinary case), or a separate session of its own (a guest who has just
 * signed in, or the duplicate this exists to end).
 *
 * That last case is a merge rather than an abandonment. The device's binder,
 * Flares and offers are real work, and dropping them to end a duplicate would
 * be a worse bug than the duplicate.
 */
export async function accountRoomIdentity(
  playerId: string,
  displayName: string,
  deviceSession: PlayerSessionRow | null,
): Promise<RoomIdentity> {
  const existing = await sessionForPlayer(playerId);

  /* Already the account's identity: the ordinary path, and nothing to do. */
  if (existing && deviceSession && existing.id === deviceSession.id) {
    return { session: existing, freshToken: null, created: false, resumed: false };
  }

  if (existing) {
    if (deviceSession) {
      /*
       * Two identities for one person, being folded into one. On success the
       * device's own token has become an alias for the survivor, so nothing
       * further has to reach the cookie or the app.
       *
       * A failed merge is not a reason to fail the join: the device keeps the
       * session it has, which is exactly today's behaviour, duplicate and all.
       */
      const merged = await mergePlayerSessions(deviceSession.id, existing.id);
      if (!merged) {
        return {
          session: deviceSession,
          freshToken: null,
          created: false,
          resumed: false,
        };
      }

      return { session: existing, freshToken: null, created: false, resumed: true };
    }

    /*
     * A device with no identity of its own — a fresh install, or a browser
     * whose cookie expired. It is handed a token for the session the account
     * already has. Additive, so whoever else holds one is undisturbed.
     */
    const token = createSessionToken();
    await addSessionToken(existing.id, hashSessionToken(token));

    return { session: existing, freshToken: token, created: false, resumed: true };
  }

  /* The account's first room. Its session is whatever this device brought. */
  if (deviceSession) {
    await linkSessionToPlayer(deviceSession.id, playerId);
    return {
      session: { ...deviceSession, player_id: playerId },
      freshToken: null,
      created: false,
      resumed: false,
    };
  }

  const token = createSessionToken();
  const session = await createPlayerSession(displayName, hashSessionToken(token));
  await linkSessionToPlayer(session.id, playerId);

  return {
    session: { ...session, player_id: playerId },
    freshToken: token,
    created: true,
    resumed: false,
  };
}

/**
 * Puts the account's name on its session, in place.
 *
 * A name belongs to the account and is changed in profile settings; rooms
 * render the session's copy, so it is written through rather than joined at
 * read time. Renamed and never replaced — the binder, the Flares and every
 * membership hang off the session id.
 */
export async function nameSessionAfterAccount(
  session: PlayerSessionRow,
  displayName: string,
): Promise<PlayerSessionRow> {
  if (session.display_name === displayName) return session;

  await renamePlayerSession(session.id, displayName);
  return { ...session, display_name: displayName };
}
