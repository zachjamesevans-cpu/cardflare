import "server-only";

import { playerForUser } from "@/lib/players/accounts";
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
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
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
    };
  } catch (error) {
    console.error("Could not authenticate the API request", error);
    return null;
  }
}

/** The one shape every unauthenticated response takes. */
export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
