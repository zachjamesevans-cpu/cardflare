import "server-only";

import { playerForUser } from "@/lib/players/accounts";
import { sessionInEventForPlayer } from "@/lib/events/participants";
import { findPlayerSession, touchPlayerSession } from "@/lib/players/repository";
import { hashSessionToken } from "@/lib/players/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Authentication for the JSON API the native app talks to.
 *
 * The website authenticates with cookies; a native client holds tokens.
 * The app signs into the same Supabase project the site uses and sends its
 * access token as `Authorization: Bearer <jwt>` — one account system, two
 * clients, and this module is the seam between them.
 *
 * The token is verified server-side on every request (`auth.getUser`
 * checks the signature and expiry against the project); nothing is trusted
 * from its payload directly. An authenticated *user* is then only an API
 * *player* if a players row exists — operators use the website.
 */

export interface ApiPlayer {
  playerId: string;
  userId: string;
  displayName: string;
  /** The unique one, so the app can show `@handle` without a second call. */
  handle: string;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1];
  }

  /*
   * Fallback for networks that strip the Authorization header. The app
   * already moved every payload into `x-cf-payload` because request
   * bodies vanish on some networks (the founder's, for one); the same
   * middleboxes are known to eat Authorization while custom x-* headers
   * pass. Same token, same server-side verification - only the envelope
   * differs, exactly like the payload header.
   */
  return request.headers.get("x-cf-access-token");
}

/** The signed-in player behind this request, or null. Never throws. */
export async function apiPlayer(request: Request): Promise<ApiPlayer | null> {
  if (!isSupabaseConfigured()) return null;

  const token = bearerToken(request);
  if (!token) return null;

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;

    const player = await playerForUser(data.user.id);
    if (!player) return null;

    return {
      playerId: player.id,
      userId: data.user.id,
      displayName: player.display_name,
      handle: player.handle,
    };
  } catch (error) {
    console.error("Could not authenticate the API request", error);
    return null;
  }
}

/**
 * The guest identity, app-held: the same random token the website keeps
 * in its httpOnly cookie, sent by a native client as `X-Session-Token`.
 * Same storage, same hashing, same renewal — only the envelope differs,
 * so a room joined in the app is the same membership the website sees.
 */
export async function apiSession(request: Request, eventId?: string) {
  if (!isSupabaseConfigured()) return null;

  const token = request.headers.get("x-session-token");
  if (token) {
    const session = await findPlayerSession(hashSessionToken(token));
    if (session) {
      await touchPlayerSession(session);
      return session;
    }
  }

  /*
   * NO TOKEN, BUT A ROOM AND AN ACCOUNT: the seat is looked up instead.
   *
   * The founder: "if i join a room on my computer... if i open that same
   * room in app, it should skip the whole join thing... if im in a room
   * it should just be persistent across platforms."
   *
   * A room identity is a session, and a client could only ever find one
   * by holding its token - the browser its cookie, the app its stored
   * token, neither knowing the other's. So the app opened a join screen
   * for a room the person was already standing in, and tapping Join was
   * what finally went looking for the seat.
   *
   * Signing in is what ties them together: joining while signed in
   * stamps the account onto the session, so the seat can be found by
   * account. Only ever the caller's OWN - the bearer token says who is
   * asking, and the lookup is keyed on that id.
   *
   * Reached only when the token misses, so the ordinary request pays
   * nothing for it. A STALE token falls through here too, which is the
   * other way a signed-in phone used to lose a room it was still in.
   */
  if (!eventId) return null;

  const account = await apiPlayer(request);
  if (!account) return null;

  const session = await sessionInEventForPlayer(account.playerId, eventId);
  if (!session) return null;

  await touchPlayerSession(session);
  return session;
}

/** The one shape every unauthenticated response takes. */
export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
