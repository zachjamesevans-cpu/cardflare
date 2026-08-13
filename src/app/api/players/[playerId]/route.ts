import { getViewer } from "@/lib/auth/session";
import { resolveEquipped } from "@/lib/players/cosmetics";
import { publicProfile } from "@/lib/players/profile";
import { getPlayerSession } from "@/lib/players/session";

/**
 * A player's public face, as JSON — what the room's profile popup shows.
 *
 * Strictly the PUBLIC shape: name, picture, lifetime Embers, what they
 * are wearing, and the showcase. The spendable balance does not appear
 * here because `publicProfile` has no field to carry it in; that is the
 * founder's two-number rule enforced by the type, not by this route
 * remembering to omit it.
 *
 * Who may ask: anybody standing in a room. That means a signed-in
 * account OR a guest session cookie — the same people who can already
 * see this player's name, badge and frame on the roster. No session at
 * all gets a 401, so the route is not an open directory of players.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;

  const viewer = await getViewer();
  if (viewer.kind === "anonymous" && !(await getPlayerSession())) {
    return Response.json({ error: "Join a room first." }, { status: 401 });
  }

  const profile = await publicProfile(playerId);
  if (!profile) {
    return Response.json({ error: "No such player." }, { status: 404 });
  }

  const worn = await resolveEquipped(profile.equipped);

  return Response.json({
    playerId: profile.playerId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    embersEarned: profile.embersEarned,
    /* The ring around the picture: the avatar slot, since the split. */
    frame: worn.avatarFrame,
    effect: worn.effect,
    /* Per-card dressing, resolved here so the client never needs the
       null-means-default rule. */
    showcase: profile.showcase.map((entry) => ({
      id: entry.id,
      name: entry.name,
      number: entry.number,
      imageUrl: entry.imageUrl,
      frame: entry.frame ?? worn.frame,
      holo: entry.holo ?? worn.holo,
    })),
  });
}
