import "server-only";

import { randomUUID } from "node:crypto";

import { printingLabel } from "@/lib/cards/schema";
import { binderSessionFor } from "@/lib/lists/haves";
import {
  listBinder,
  PRINTING_COLUMNS,
  toPrinting,
  type PrintingRow,
} from "@/lib/lists/repository";
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
  /** The printing asked for, or null for any. */
  printingId: string | null;
  printingLabel: string | null;
  /** Copies asked for, and copies still wanted. */
  quantity: number;
  remaining: number;
  /** The hunt request this card answers, when the post is in a hunt. */
  huntRequestId: string | null;
}

export interface PostDetail extends PostSocial {
  postId: string;
  author: {
    playerId: string | null;
    displayName: string;
    avatarUrl: string | null;
    frame: string | null;
    ring: string | null;
    aura: string | null;
  };
  /** The room it was posted in, when it was. */
  code: string | null;
  storeName: string | null;
  eventName: string | null;
  deckLabel: string | null;
  /** Which way the post points. */
  direction: "want" | "showcase";
  /** What they wrote with it. */
  caption: string | null;
  /** The hunt the post belongs to. */
  hunt: { id: string; name: string } | null;
  /** Copies still wanted across the cards, and whether none are. */
  remainingCopies: number;
  completed: boolean;
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
  direction: "want" | "showcase";
  caption: string | null;
  huntId: string | null;
  flares: {
    id: string;
    cardId: string;
    status: string;
    printingId: string | null;
    quantity: number;
    foundQuantity: number;
    huntRequestId: string | null;
  }[];
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
    .select(
      "id, card_id, status, event_id, player_session_id, player_id, deck_label, printing_id, quantity, found_quantity, hunt_request_id, note, intent",
    )
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
  /* An area Flare names its account directly and has no room session;
     a board Flare names the session. Read the account from whichever
     the row carries, or the post's author is "A player" with no face -
     which is what the founder saw. */
  let ownerPlayerId: string | null = first.player_id ?? null;
  if (!ownerPlayerId && ownerSessionId) {
    const { data: session } = await admin
      .from("player_sessions")
      .select("player_id")
      .eq("id", ownerSessionId)
      .maybeSingle();
    ownerPlayerId = session?.player_id ?? null;
  }

  /* The post row, when the batch has one. Older batches have none, and
     the first flare's words and way stand in. */
  const { data: post } = await admin
    .from("flare_posts")
    .select("caption, intent, hunt_id")
    .eq("id", postId)
    .maybeSingle();

  return {
    ownerSessionId,
    ownerPlayerId,
    eventId: first.event_id,
    deckLabel: first.deck_label ?? null,
    direction: (post?.intent ?? first.intent) === "showcase" ? "showcase" : "want",
    caption: post?.caption ?? first.note ?? null,
    huntId: post?.hunt_id ?? null,
    flares: rows.map((row) => ({
      id: row.id,
      cardId: row.card_id,
      status: row.status,
      printingId: row.printing_id,
      quantity: row.quantity,
      foundQuantity: row.found_quantity ?? 0,
      huntRequestId: row.hunt_request_id ?? null,
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
      aura: string | null;
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
      aura: string | null;
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
      aura: wear.get(row.id)?.aura ?? null,
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
  if ((await remainingByFlare(context)).get(flareId) === 0) {
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
  const huntName = context.huntId
    ? ((await admin.from("hunts").select("name").eq("id", context.huntId).maybeSingle())
        .data?.name ?? null)
    : null;

  const cardById = new Map((cards.data ?? []).map((row) => [row.id, row]));
  const artByCard = new Map<string, string | null>();
  for (const row of printings.data ?? []) {
    if (!artByCard.has(row.card_id)) artByCard.set(row.card_id, row.image_url);
  }
  const held = heldByCard(binder);
  const remaining = await remainingByFlare(context);
  const wantedPrintings = [
    ...new Set(shown.flatMap((flare) => (flare.printingId ? [flare.printingId] : []))),
  ];
  const printingById = new Map(
    wantedPrintings.length > 0
      ? (
          ((
            await admin
              .from("card_printings")
              .select(PRINTING_COLUMNS)
              .in("id", wantedPrintings)
          ).data ?? []) as PrintingRow[]
        ).map((row) => [row.id, toPrinting(row)] as const)
      : [],
  );

  const seen = new Set<string>();
  const postCards: PostCard[] = [];
  for (const flare of shown) {
    if (seen.has(flare.cardId)) continue;
    seen.add(flare.cardId);
    const card = cardById.get(flare.cardId);
    const answer = answers.get(flare.id);
    const printing = flare.printingId ? printingById.get(flare.printingId) : undefined;
    const name = card?.exact_name ?? "Unknown card";
    postCards.push({
      cardId: flare.cardId,
      cardName: name,
      cardNumber: card?.canonical_card_number ?? "",
      imageUrl: printing?.imageUrl ?? artByCard.get(flare.cardId) ?? null,
      flareId: flare.id,
      state: flare.status === "traded" ? "found" : answer?.offered ? "offered" : "open",
      youOffered: answer?.youOffered ?? false,
      match: matchFor({ cardId: flare.cardId, printingId: null }, held),
      printingId: flare.printingId,
      printingLabel: printing ? printingLabel(printing, name) : null,
      quantity: flare.quantity,
      remaining: remaining.get(flare.id) ?? 0,
      huntRequestId: flare.huntRequestId,
    });
  }
  const remainingCopies = postCards.reduce((sum, card) => sum + card.remaining, 0);

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
      aura: author?.aura ?? null,
    },
    code: event.data?.join_code ?? null,
    storeName: store.data?.name ?? null,
    eventName: event.data?.name ?? null,
    deckLabel: context.deckLabel,
    direction: context.direction,
    caption: context.caption,
    hunt: huntName ? { id: context.huntId as string, name: huntName } : null,
    remainingCopies,
    completed: context.direction === "want" && remainingCopies === 0,
    cards: postCards,
    yours: context.ownerPlayerId === viewerId,
    thread,
    ...counts,
  };
}

/**
 * Copies still wanted of every card in a post, from the hunt request
 * when the card is in one and from the flare's own count otherwise,
 * never above what the flare itself asked for.
 */
async function remainingByFlare(context: PostContext): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const requestIds = context.flares.flatMap((flare) =>
    flare.huntRequestId ? [flare.huntRequestId] : [],
  );
  const { data } =
    requestIds.length > 0
      ? await getSupabaseAdmin()
          .from("hunt_requests")
          .select("id, quantity_needed, quantity_found")
          .in("id", requestIds)
      : {
          data: [] as { id: string; quantity_needed: number; quantity_found: number }[],
        };
  const requestById = new Map((data ?? []).map((row) => [row.id, row]));

  for (const flare of context.flares) {
    if (flare.status !== "open") {
      out.set(flare.id, 0);
      continue;
    }
    const request = flare.huntRequestId
      ? requestById.get(flare.huntRequestId)
      : undefined;
    out.set(
      flare.id,
      request
        ? Math.max(
            0,
            Math.min(flare.quantity, request.quantity_needed - request.quantity_found),
          )
        : Math.max(0, flare.quantity - flare.foundQuantity),
    );
  }
  return out;
}

export type OfferItemsOutcome =
  | { ok: true; offered: number }
  | {
      ok: false;
      reason:
        | "not-found"
        | "own-flare"
        | "at-cap"
        | "unavailable"
        | "nothing-left"
        | "too-many";
    };

/**
 * "I have these", from a post: one offer carrying several cards.
 *
 * Every line is the room's own offer row, under the account's one room
 * identity, sharing an offer batch so the author reads it as one hand
 * raised for three cards. Each quantity is capped at what is still
 * wanted of that card AT THE MOMENT OF THE OFFER - a request answered
 * while the offer was being written is refused for that line, and the
 * caller hears which. Offering never counts as collecting: the copies
 * stay wanted until the author says they have them.
 */
export async function offerItems(
  postId: string,
  playerId: string,
  displayName: string,
  items: { flareId: string; quantity: number }[],
  message: string,
): Promise<OfferItemsOutcome & { refused?: string[] }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (items.length === 0) return { ok: false, reason: "nothing-left" };

  const context = await postContext(postId);
  if (!context) return { ok: false, reason: "not-found" };
  if (context.ownerPlayerId === playerId) return { ok: false, reason: "own-flare" };

  const session = await binderSessionFor(playerId, displayName, true);
  if (!session) return { ok: false, reason: "unavailable" };
  if (session.id === context.ownerSessionId) return { ok: false, reason: "own-flare" };

  const remaining = await remainingByFlare(context);
  const note = cleanBody(message, MAX_OFFER_MESSAGE) || null;
  const batch = randomUUID();
  const admin = getSupabaseAdmin();

  let offered = 0;
  const refused: string[] = [];
  for (const item of items) {
    const flare = context.flares.find((row) => row.id === item.flareId);
    const left = remaining.get(item.flareId) ?? 0;
    if (!flare || flare.status !== "open" || left === 0) {
      refused.push(item.flareId);
      continue;
    }
    const quantity = Math.max(1, Math.min(left, Math.round(item.quantity)));
    if (quantity > left) {
      refused.push(item.flareId);
      continue;
    }

    if (context.eventId) {
      const outcome = await offerTrade(
        item.flareId,
        context.eventId,
        session.id,
        note,
        quantity,
        batch,
      );
      if (!outcome.ok) {
        if (outcome.reason === "at-cap")
          return { ok: false, reason: "at-cap", refused };
        refused.push(item.flareId);
        continue;
      }
    } else {
      const { error } = await admin.from("flare_responses").upsert(
        {
          flare_id: item.flareId,
          responder_session_id: session.id,
          message: note,
          quantity,
          offer_batch: batch,
        },
        { onConflict: "flare_id,responder_session_id" },
      );
      if (error) {
        console.error("Could not record the offer", error);
        refused.push(item.flareId);
        continue;
      }
    }
    offered += 1;
  }

  if (offered === 0) return { ok: false, reason: "nothing-left", refused };

  const first = items.find((item) => !refused.includes(item.flareId));
  const names = context.flares.length;
  await addComment(
    postId,
    playerId,
    displayName,
    message.trim() || (offered === 1 ? "I have this." : `I have ${offered} of these.`),
    first ? { kind: "offer", flareId: first.flareId } : null,
  );
  if (first) await notifyOfferReceived(first.flareId, session.id, displayName, note);
  void names;

  return { ok: true, offered, refused };
}

/** Re-exported so the Feed's enrichment and the app route share one door. */
export { answersFor, foundInPosts, socialForPosts };
