import "server-only";

import { playerForUser } from "@/lib/players/accounts";
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
export async function apiSession(request: Request) {
  if (!isSupabaseConfigured()) return null;

  const token = request.headers.get("x-session-token");
  if (!token) return null;

  const session = await findPlayerSession(hashSessionToken(token));
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
