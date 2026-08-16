import { apiPlayer } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped } from "@/lib/players/cosmetics";
import { getEquips, wornRiveFor } from "@/lib/players/equips";
import { followPlayer, followState, unfollowPlayer } from "@/lib/players/follows";
import { notifyNewFollower } from "@/lib/notifications/notify";
import { publicProfile } from "@/lib/players/profile";
import { getPlayerSession } from "@/lib/players/session";
import { siteUrl } from "@/lib/site";

/** The signed-in PLAYER behind a request, from cookie or bearer alike. */
async function viewerPlayerId(request: Request): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind !== "anonymous") {
    return (await playerForUser(viewer.user.id))?.id ?? null;
  }
  return (await apiPlayer(request))?.playerId ?? null;
}

/**
 * A player's public face, as JSON — what the room's profile popup shows.
 *
 * Strictly the PUBLIC shape: name, picture, lifetime Embers, what they
 * are wearing, and the showcase. The spendable balance does not appear
 * here because `publicProfile` has no field to carry it in; that is the
 * founder's two-number rule enforced by the type, not by this route
 * remembering to omit it.
 *
 * Who may ask: anybody standing in a room. On the website that means a
 * signed-in account OR a guest session cookie; from the app it means a
 * bearer token — the same people who can already see this player's
 * name, badge and frame on the roster. No credentials at all gets a
 * 401, so the route is not an open directory of players.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;

  const viewer = await getViewer();
  if (
    viewer.kind === "anonymous" &&
    !(await getPlayerSession()) &&
    !(await apiPlayer(request))
  ) {
    return Response.json({ error: "Join a room first." }, { status: 401 });
  }

  const profile = await publicProfile(playerId);
  if (!profile) {
    return Response.json({ error: "No such player." }, { status: 404 });
  }

  const [worn, dressed] = await Promise.all([
    resolveEquipped(profile.equipped),
    getEquips(playerId),
  ]);
  const dressedRive = await wornRiveFor(dressed);

  /* Viewer-relative: whether YOU follow them and they follow you. Only
     a signed-in player has a side of that relationship; a guest gets
     nulls and the clients hide the button. */
  const me = await viewerPlayerId(request);
  const follow = me ? await followState(me, playerId) : null;

  return Response.json({
    follow: me && me !== playerId ? follow : null,
    playerId: profile.playerId,
    displayName: profile.displayName,
    /* Absolute, because the app has no origin to resolve "/api/..."
       against; the website resolves it against itself either way. */
    avatarUrl: profile.avatarUrl?.startsWith("/")
      ? `${siteUrl()}${profile.avatarUrl}`
      : profile.avatarUrl,
    coverUrl: profile.coverUrl?.startsWith("/")
      ? `${siteUrl()}${profile.coverUrl}`
      : profile.coverUrl,
    embersEarned: profile.embersEarned,
    /* The ring around the picture: the avatar slot, since the split. */
    frame: worn.avatarFrame,
    /* The catalogue ring, worn over the frame when both are set. */
    ring: dressed.ring,
    /* The avatar effect floating around the picture. */
    aura: dressed.aura,
    /* The dropped-in files behind them, when they are Rive ones. */
    ringRive: dressedRive.ring,
    auraRive: dressedRive.aura,
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

/**
 * Follow or unfollow, from the popup or the full profile.
 *
 * Accounts only - a guest session can look but has no identity to
 * follow FROM. The response returns the new state so the button can
 * settle without a second read.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;

  const me = await viewerPlayerId(request);
  if (!me) return Response.json({ error: "Sign in to follow." }, { status: 401 });
  if (me === playerId) {
    return Response.json({ error: "That is you." }, { status: 400 });
  }

  const body = (await readJsonPayload(request)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "follow" && action !== "unfollow") {
    return Response.json({ error: "Unrecognised follow action" }, { status: 400 });
  }

  const done =
    action === "follow"
      ? await followPlayer(me, playerId)
      : await unfollowPlayer(me, playerId);

  if (!done) {
    return Response.json({ error: "That did not go through." }, { status: 500 });
  }

  // Being followed is worth knowing about. Fire and forget: the edge is
  // already written, and the dedupe key makes a refollow free.
  if (action === "follow") {
    void notifyNewFollower(me, playerId);
  }

  return Response.json({ follow: await followState(me, playerId) });
}
