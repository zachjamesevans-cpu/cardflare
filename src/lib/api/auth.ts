import "server-only";

import { playerForUser } from "@/lib/players/accounts";
import { sessionInEventForPlayer } from "@/lib/events/participants";
import { findPlayerSession, touchPlayerSession } from "@/lib/players/repository";
import { hashSessionToken } from "@/lib/players/session";
import type { StoreRole } from "@/lib/supabase/types";
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

/*
 * REMEMBERED PER TOKEN, briefly.
 *
 * Verifying a bearer token is a round trip to the auth server, and the
 * player row behind it is another to the database, and the app's
 * screens asked for both on every request, some of them twice in one
 * response (a profile peek verified the same token at the top and
 * again for the follow state). A warm function serves many requests
 * from the same phone in a row, so the answer is kept for two minutes
 * per token. A token that expires or is signed out of stays good here
 * for at most that long, which is well inside the hour the token
 * itself is valid for. Capped, so a burst of tokens cannot grow it.
 */
const AUTH_TTL_MS = 2 * 60 * 1000;
const AUTH_CAP = 500;
const remembered = new Map<string, { player: ApiPlayer; at: number }>();

function rememberedPlayer(token: string): ApiPlayer | null {
  const hit = remembered.get(token);
  if (!hit) return null;
  if (Date.now() - hit.at > AUTH_TTL_MS) {
    remembered.delete(token);
    return null;
  }
  return hit.player;
}

function rememberPlayer(token: string, player: ApiPlayer): void {
  if (remembered.size >= AUTH_CAP) {
    const oldest = remembered.keys().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }
  remembered.set(token, { player, at: Date.now() });
}

/** Forget a token's answer, when the player behind it changes. */
export function forgetApiPlayer(request: Request): void {
  const token = bearerToken(request);
  if (token) remembered.delete(token);
}

/** Forget every token: for tests, which fake a different player per case. */
export function resetApiPlayerMemory(): void {
  remembered.clear();
}

/** The signed-in player behind this request, or null. Never throws. */
export async function apiPlayer(request: Request): Promise<ApiPlayer | null> {
  if (!isSupabaseConfigured()) return null;

  const token = bearerToken(request);
  if (!token) return null;

  const known = rememberedPlayer(token);
  if (known) return known;

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;

    const player = await playerForUser(data.user.id);
    if (!player) return null;

    const answer = {
      playerId: player.id,
      userId: data.user.id,
      displayName: player.display_name,
      handle: player.handle,
    };
    rememberPlayer(token, answer);
    return answer;
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

/** A store this account belongs to, and as what. */
export interface ApiStaffStore {
  storeId: string;
  role: StoreRole;
}

/**
 * The stores an account may run from the app: every membership, with
 * its role. An owner runs everything; an organizer (role "staff", the
 * TO badge) runs the event hub and the timers. Empty for a player who
 * staffs nowhere, which is nearly everybody.
 */
export async function apiStaffStores(userId: string): Promise<ApiStaffStore[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("store_members")
    .select("store_id, role")
    .eq("user_id", userId);
  if (error) {
    console.error("Could not read the account's store memberships", error);
    return [];
  }
  return (data ?? []).map((row) => ({ storeId: row.store_id, role: row.role }));
}

/** The role this account holds at one store, or null for none. */
export async function apiStoreRole(
  userId: string,
  storeId: string,
): Promise<StoreRole | null> {
  const stores = await apiStaffStores(userId);
  return stores.find((store) => store.storeId === storeId)?.role ?? null;
}
