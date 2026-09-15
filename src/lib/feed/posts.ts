import "server-only";

import { binderSessionFor } from "@/lib/lists/haves";
import { listBinder } from "@/lib/lists/repository";
import { offerTrade } from "@/lib/matching/repository";
import { heldByCard, MAX_OFFER_MESSAGE, matchFor } from "@/lib/matching/schema";
import { notifyOfferReceived, notifyPostComment } from "@/lib/notifications/notify";
import { avatarWearFor } from "@/lib/players/equips";
import { avatarPathFor, avatarSrc } from "@/lib/players/profile-image";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  answersFor,
  foundInPosts,
  socialForPosts,
  type PostSocial,
} from "./post-queries";
import { POST_COMMENT_MAX, type CardState, type PostComment } from "./post-schema";

/**
 * A Flare post as something people can answer under, not just walk to.
 *
 * The founder: "Flare posts in the Feed should behave more like an
 * Instagram-style post, but still stay focused on trading." So: a heart,
 * a short thread, and the one action that matters, "I have this" on a
 * particular card. Nothing else - no likes on comments, no replies to
 * replies, no posting from the Feed. The thread is about one hunt.
 *
 * "I have this" is the room's offer, made from the Feed. It writes the
 * same `flare_responses` row the room writes, so the author sees the
 * hand raised where they always have and can confirm the trade with the
 * responder named; it then says so in the thread as an OFFER line. One
 * offer system, two doors.
 */

export { POST_COMMENT_MAX, type CardState, type PostComment } from "./post-schema";

/** One card of the post, as the app's post screen draws it. */
export interface PostCard {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  flareId: string;
  state: CardState;
  youOffered: boolean;
  match: "exact" | "other-printing" | null;
}

export interface PostDetail extends PostSocial {
  postId: string;
  author: {
    playerId: string | null;
    displayName: string;
    avatarUrl: string | null;
    frame: string | null;
    ring: string | null;
  };
  /** The room it was posted in, when it was. */
  code: string | null;
  storeName: string | null;
  eventName: string | null;
  deckLabel: string | null;
  cards: PostCard[];
  /** The viewer's own post. Likes and comments still work; offers do not. */
  yours: boolean;
  thread: PostComment[];
}

interface PostContext {
  ownerSessionId: string | null;
  ownerPlayerId: string | null;
  eventId: string | null;
  deckLabel: string | null;
  flares: { id: string; cardId: string; status: string }[];
}

/**
 * The post behind an id, or null for an id that names nothing.
 *
 * Every write below starts here: a like on a post that does not exist
 * is a row nobody can ever read, and a comment is worse, because the
 * author it would notify is nobody.
 */
async function postContext(postId: string): Promise<PostContext | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("flares")
    .select("id, card_id, status, event_id, player_session_id, deck_label")
    .eq("posted_batch", postId)
    .order("created_at")
    .limit(60);

  if (error) {
    console.error("Could not read the post", error);
    return null;
  }

  const rows = data ?? [];
  const first = rows[0];
  if (!first) return null;

  const ownerSessionId = first.player_session_id;
  let ownerPlayerId: string | null = null;
  if (ownerSessionId) {
    const { data: session } = await admin
      .from("player_sessions")
      .select("player_id")
      .eq("id", ownerSessionId)
      .maybeSingle();
    ownerPlayerId = session?.player_id ?? null;
  }

  return {
    ownerSessionId,
    ownerPlayerId,
    eventId: first.event_id,
    deckLabel: first.deck_label ?? null,
    flares: rows.map((row) => ({
      id: row.id,
      cardId: row.card_id,
      status: row.status,
    })),
  };
}

/** A heart. Already-liked is a no-op, not an error. */
export async function likePost(postId: string, playerId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (!(await postContext(postId))) return false;

  const { error } = await getSupabaseAdmin()
    .from("flare_post_likes")
    .upsert(
      { post_id: postId, player_id: playerId },
      { onConflict: "post_id,player_id" },
    );

  if (error) {
    console.error("Could not like the post", error);
    return false;
  }
  return true;
}

export async function unlikePost(postId: string, playerId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("flare_post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not unlike the post", error);
    return false;
  }
  return true;
}

/** Names, faces and dressing for the people in a thread. */
async function facesFor(playerIds: string[]): Promise<
  Map<
    string,
    {
      displayName: string;
      avatarUrl: string | null;
      frame: string | null;
      ring: string | null;
    }
  >
> {
  const out = new Map<
    string,
    {
      displayName: string;
      avatarUrl: string | null;
      frame: string | null;
      ring: string | null;
    }
  >();
  const ids = [...new Set(playerIds)];
  if (ids.length === 0) return out;

  const [{ data }, wear] = await Promise.all([
    getSupabaseAdmin()
      .from("players")
      .select(
        "id, display_name, avatar_url, avatar_animated, tier, equipped_avatar_frame",
      )
      .in("id", ids),
    avatarWearFor(ids),
  ]);

  for (const row of data ?? []) {
    out.set(row.id, {
      displayName: row.display_name,
      avatarUrl: avatarSrc(avatarPathFor(row)),
      frame: row.equipped_avatar_frame,
      ring: wear.get(row.id)?.ring ?? null,
    });
  }
  return out;
}

/** The thread under a post, oldest first, the way a conversation reads. */
export async function listComments(postId: string): Promise<PostComment[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("flare_post_comments")
    .select("id, created_at, player_id, flare_id, kind, body")
    .eq("post_id", postId)
    .order("created_at")
    .limit(200);

  if (error) {
    console.error("Could not read the thread", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const flareIds = rows.flatMap((row) => (row.flare_id ? [row.flare_id] : []));
  const [faces, named] = await Promise.all([
    facesFor(rows.map((row) => row.player_id)),
    flareIds.length > 0
      ? admin.from("flares").select("id, card_id").in("id", flareIds)
      : Promise.resolve({ data: [] as { id: string; card_id: string }[] }),
  ]);
  const cardIds = (named.data ?? []).map((row) => row.card_id);
  const { data: cards } =
    cardIds.length > 0
      ? await admin.from("cards").select("id, exact_name").in("id", cardIds)
      : { data: [] as { id: string; exact_name: string }[] };
  const cardByFlare = new Map(
    (named.data ?? []).map((row) => [
      row.id,
      (cards ?? []).find((card) => card.id === row.card_id)?.exact_name ?? null,
    ]),
  );

  return rows.map((row) => {
    const face = faces.get(row.player_id);
    return {
      id: row.id,
      createdAt: row.created_at,
      playerId: row.player_id,
      displayName: face?.displayName ?? "A player",
      avatarUrl: face?.avatarUrl ?? null,
      frame: face?.frame ?? null,
      ring: face?.ring ?? null,
      kind: row.kind,
      body: row.body,
      cardName: row.flare_id ? (cardByFlare.get(row.flare_id) ?? null) : null,
    };
  });
}

/** The same hygiene a Flare note gets: one line of ordinary characters. */
function cleanBody(body: string, max: number): string {
  return body.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * A comment under a post. The author hears about it once per commenter
 * per post - the same rule messages use - and never about their own.
 */
export async function addComment(
  postId: string,
  playerId: string,
  displayName: string,
  body: string,
  answer: { kind: "offer"; flareId: string } | null = null,
): Promise<PostComment | null> {
  if (!isSupabaseConfigured()) return null;

  const clean = cleanBody(body, POST_COMMENT_MAX);
  if (clean.length === 0) return null;

  const context = await postContext(postId);
  if (!context) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("flare_post_comments")
    .insert({
      post_id: postId,
      player_id: playerId,
      body: clean,
      kind: answer ? "offer" : "comment",
      flare_id: answer?.flareId ?? null,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("Could not add the comment", error);
    return null;
  }

  /* An offer already tells the author through the room's own notice;
     a second buzz for the same tap would be noise. */
  if (!answer && context.ownerPlayerId && context.ownerPlayerId !== playerId) {
    await notifyPostComment(
      postId,
      context.ownerPlayerId,
      playerId,
      displayName,
      clean,
    );
  }

  const [comment] = await listComments(postId).then((thread) =>
    thread.filter((row) => row.id === data.id),
  );
  return comment ?? null;
}

export type FeedOfferOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" | "own-flare" | "at-cap" | "unavailable" };

/**
 * "I have this", from the Feed.
 *
 * Raises a hand on the Flare exactly as the room does - through
 * `offerTrade`, with its own-Flare and cap checks - under the account's
 * one room identity, minted here if they have never joined anything.
 * Then the thread gets an OFFER line carrying the note, and the card
 * reads OFFERED to everyone on the next load.
 */
export async function offerFromFeed(
  postId: string,
  flareId: string,
  playerId: string,
  displayName: string,
  note: string,
): Promise<FeedOfferOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const context = await postContext(postId);
  const flare = context?.flares.find((row) => row.id === flareId);
  if (!context || !flare || flare.status !== "open") {
    return { ok: false, reason: "not-found" };
  }

  const session = await binderSessionFor(playerId, displayName, true);
  if (!session) return { ok: false, reason: "unavailable" };
  if (session.id === context.ownerSessionId) return { ok: false, reason: "own-flare" };

  const message = cleanBody(note, MAX_OFFER_MESSAGE) || null;

  if (context.eventId) {
    const outcome = await offerTrade(flareId, context.eventId, session.id, message, 1);
    if (!outcome.ok) return outcome;
  } else {
    /* A Flare with no room: the hand still goes up on the Flare, so
       the author's "who offered" reads the same everywhere. */
    const { error } = await getSupabaseAdmin()
      .from("flare_responses")
      .upsert(
        { flare_id: flareId, responder_session_id: session.id, message, quantity: 1 },
        { onConflict: "flare_id,responder_session_id" },
      );
    if (error) {
      console.error("Could not record the offer", error);
      return { ok: false, reason: "unavailable" };
    }
  }

  await addComment(postId, playerId, displayName, note.trim() || "I have this.", {
    kind: "offer",
    flareId,
  });
  await notifyOfferReceived(flareId, session.id, displayName, message);

  return { ok: true };
}

/**
 * The whole post, for the app's post screen: the author, every card
 * with its state, the counts and the thread. The website draws the same
 * from the Feed item plus `listComments`.
 */
export async function postDetail(
  postId: string,
  viewerId: string,
): Promise<PostDetail | null> {
  if (!isSupabaseConfigured()) return null;

  const context = await postContext(postId);
  if (!context) return null;

  const admin = getSupabaseAdmin();
  const viewerSessions = await sessionsForPlayers([viewerId]);
  const viewerSessionIds = new Set(viewerSessions.keys());
  const [ownSession] = [...viewerSessionIds];

  const shown = context.flares.filter((flare) => flare.status !== "cancelled");
  const cardIds = [...new Set(shown.map((flare) => flare.cardId))];

  const [cards, printings, answers, social, thread, faces, binder, event] =
    await Promise.all([
      admin
        .from("cards")
        .select("id, exact_name, canonical_card_number")
        .in("id", cardIds),
      admin.from("card_printings").select("card_id, image_url").in("card_id", cardIds),
      answersFor(
        shown.map((flare) => flare.id),
        viewerSessionIds,
      ),
      socialForPosts([postId], viewerId),
      listComments(postId),
      context.ownerPlayerId ? facesFor([context.ownerPlayerId]) : new Map(),
      ownSession ? listBinder(ownSession) : Promise.resolve([]),
      context.eventId
        ? admin
            .from("events")
            .select("name, join_code, store_id")
            .eq("id", context.eventId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const store = event.data?.store_id
    ? await admin
        .from("stores")
        .select("name")
        .eq("id", event.data.store_id)
        .maybeSingle()
    : { data: null };

  const cardById = new Map((cards.data ?? []).map((row) => [row.id, row]));
  const artByCard = new Map<string, string | null>();
  for (const row of printings.data ?? []) {
    if (!artByCard.has(row.card_id)) artByCard.set(row.card_id, row.image_url);
  }
  const held = heldByCard(binder);

  const seen = new Set<string>();
  const postCards: PostCard[] = [];
  for (const flare of shown) {
    if (seen.has(flare.cardId)) continue;
    seen.add(flare.cardId);
    const card = cardById.get(flare.cardId);
    const answer = answers.get(flare.id);
    postCards.push({
      cardId: flare.cardId,
      cardName: card?.exact_name ?? "Unknown card",
      cardNumber: card?.canonical_card_number ?? "",
      imageUrl: artByCard.get(flare.cardId) ?? null,
      flareId: flare.id,
      state: flare.status === "traded" ? "found" : answer?.offered ? "offered" : "open",
      youOffered: answer?.youOffered ?? false,
      match: matchFor({ cardId: flare.cardId, printingId: null }, held),
    });
  }

  const author = context.ownerPlayerId ? faces.get(context.ownerPlayerId) : undefined;
  const counts = social.get(postId) ?? { likes: 0, comments: 0, liked: false };

  return {
    postId,
    author: {
      playerId: context.ownerPlayerId,
      displayName: author?.displayName ?? "A player",
      avatarUrl: author?.avatarUrl ?? null,
      frame: author?.frame ?? null,
      ring: author?.ring ?? null,
    },
    code: event.data?.join_code ?? null,
    storeName: store.data?.name ?? null,
    eventName: event.data?.name ?? null,
    deckLabel: context.deckLabel,
    cards: postCards,
    yours: context.ownerPlayerId === viewerId,
    thread,
    ...counts,
  };
}

/** Re-exported so the Feed's enrichment and the app route share one door. */
export { answersFor, foundInPosts, socialForPosts };
