import "server-only";

import { listLocals } from "@/lib/players/locals";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { notifyMessageReceived } from "@/lib/notifications/notify";
import { blockedBetween, blockedSet, blockState } from "@/lib/players/safety";
import { latestThreadTrade, type ThreadTrade } from "@/lib/trades/thread-trades";
import { conversationIdFor, pairThreadId } from "./pairs";
import { MESSAGE_MAX_LENGTH } from "./shared";
import { avatarSrc } from "@/lib/players/profile-image";
import type { FlareMessageRow } from "@/lib/supabase/types";

/**
 * Conversations between two accounts.
 *
 * They began tied to one Flare — every thread started from a card
 * somebody publicly asked for, so every conversation had a subject.
 * The founder's revision (2026-10-01): "I should be able to go on
 * someone's profile and message them directly about anything." So a
 * thread may now have no anchor at all: a direct message, one per
 * pair of people, opened from a profile. Same table, same rules.
 *
 * ACCOUNTS ON BOTH ENDS. The author is resolved from the Flare's
 * session the moment the first message arrives and denormalised onto
 * the thread, so the conversation outlives the 30-day session that
 * posted the Flare. A guest's Flare shows in Local but cannot be
 * messaged — the server refuses here, whatever a client renders.
 *
 * NOTHING ENDS A CONVERSATION BUT A BLOCK. Threads used to be
 * endable by either side, and an ended thread took no more messages,
 * ever. The founder, unable to write to somebody from her profile:
 * "Messages should act more like instagram DM's. I can't even message
 * her again because it says the convo is closed." So a conversation is
 * always open, the way a DM is, and "stop messaging me" is the block,
 * which closes every door in both directions (`blockedBetween`). The
 * `closed_at` column stays for history; nothing reads it as a refusal.
 */

export type ThreadFailure =
  | "unavailable"
  | "not-found"
  | "no-account"
  | "yourself"
  | "closed"
  | "not-yours"
  | "empty";

export interface ThreadSummary {
  threadId: string;
  /** What it is about: a posted Flare, a saved want, or the two people. */
  kind: "flare" | "want" | "direct";
  /** The posted Flare it is about, or null. */
  flareId: string | null;
  /** The saved want a nearby match opened it on, or null. */
  wantId: string | null;
  /** The card, or null for a direct message. */
  cardName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  /** The person on the other end, as Local shows them. */
  withName: string;
  withPlayerId: string;
  /** Which side of the table the viewer sits on. */
  role: "author" | "responder";
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unread: number;
  closed: boolean;
  /** Their face, for the row: site-relative, or null for the initials face. */
  withAvatarUrl: string | null;
  /** The last message was the viewer's, so the row says "You: ". */
  lastFromYou: boolean;
}

export interface ThreadMessage {
  id: string;
  body: string;
  sentAt: string;
  /** True when the viewer sent it. */
  yours: boolean;
  /** The card this message offered or asked about, drawn as a bubble above it. */
  card: {
    cardId: string;
    name: string;
    number: string;
    imageUrl: string | null;
  } | null;
  /**
   * Every card it carries, in order (an offer on a trade binder carries
   * several); `card` is the first, for the builds that read only it.
   */
  cards: { cardId: string; name: string; number: string; imageUrl: string | null }[];
}

function trimmedBody(raw: string): string | null {
  const body = raw.trim();
  if (body.length === 0 || body.length > MESSAGE_MAX_LENGTH) return null;
  return body;
}

/** The account behind a room session, when the session belongs to one. */
async function accountBehindSession(sessionId: string | null): Promise<string | null> {
  if (!sessionId) return null;

  const { data } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("player_id")
    .eq("id", sessionId)
    .maybeSingle();

  return data?.player_id ?? null;
}

/**
 * Opens (or reuses) the thread for a Flare and sends the first message.
 *
 * Answering the same Flare twice is the same conversation — the unique
 * index makes the second open a reuse, and a racing double-tap lands as
 * two messages in one thread rather than two threads.
 */
export async function openFlareThread(
  flareId: string,
  responderPlayerId: string,
  rawBody: string,
): Promise<{ ok: true; threadId: string } | { ok: false; reason: ThreadFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const body = trimmedBody(rawBody);
  if (!body) return { ok: false, reason: "empty" };

  const admin = getSupabaseAdmin();

  const { data: flare } = await admin
    .from("flares")
    .select("id, player_session_id, player_id, card_id, printing_id")
    .eq("id", flareId)
    .maybeSingle();

  if (!flare) return { ok: false, reason: "not-found" };

  /*
   * Who to write to, from either shape of Flare.
   *
   * An area Flare names its account outright — it could not have been
   * posted without one. A board Flare names the session it was posted
   * under, and the account behind that session may not exist at all: a
   * guest's Flare is honestly posted and honestly unanswerable, which is
   * what "no-account" tells the caller.
   */
  const authorPlayerId =
    flare.player_id ?? (await accountBehindSession(flare.player_session_id));
  if (!authorPlayerId) return { ok: false, reason: "no-account" };
  if (authorPlayerId === responderPlayerId) return { ok: false, reason: "yourself" };
  /* A block reads as a closed door, in both directions and without
     saying which side closed it. */
  if (await blockedBetween(authorPlayerId, responderPlayerId)) {
    return { ok: false, reason: "closed" };
  }

  const { data: existing } = await admin
    .from("flare_threads")
    .select("id, closed_at")
    .eq("flare_id", flareId)
    .eq("responder_player_id", responderPlayerId)
    .maybeSingle();

  let threadId = existing?.id ?? null;

  if (!threadId) {
    const { data: made, error } = await admin
      .from("flare_threads")
      .insert({
        flare_id: flareId,
        author_player_id: authorPlayerId,
        responder_player_id: responderPlayerId,
      })
      .select("id")
      .maybeSingle();

    if (error && error.code === "23505") {
      /* The double-tap race: the other insert won; use its thread. */
      const { data: raced } = await admin
        .from("flare_threads")
        .select("id")
        .eq("flare_id", flareId)
        .eq("responder_player_id", responderPlayerId)
        .maybeSingle();
      threadId = raced?.id ?? null;
    } else {
      threadId = made?.id ?? null;
    }
  }

  if (!threadId) return { ok: false, reason: "unavailable" };

  /* The anchor says "already talking about this card"; the message goes
     to the pair's one conversation, carrying the card. */
  const conversation = await pairThreadId(authorPlayerId, responderPlayerId);
  if (!conversation) return { ok: false, reason: "unavailable" };

  const sent = await appendMessage(
    conversation,
    responderPlayerId,
    authorPlayerId,
    body,
    {
      flareCardId: flare.card_id,
      flarePrintingId: flare.printing_id,
    },
  );

  return sent
    ? { ok: true, threadId: conversation }
    : { ok: false, reason: "unavailable" };
}

/**
 * "I have this", outside a room: opens (or reuses) the thread on a
 * saved want and sends the first message.
 *
 * Nearby matching's door. A want is a private note on the wanter's own
 * list, so the thread is the FIRST the wanter hears of the match; the
 * holder chose to be found by opening it. Same shape as a Flare's
 * thread from here on: one conversation per pair, either side can end
 * it, the message notice rings the wanter.
 */
export async function openWantThread(
  wantId: string,
  responderPlayerId: string,
  rawBody: string,
): Promise<{ ok: true; threadId: string } | { ok: false; reason: ThreadFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const body = trimmedBody(rawBody);
  if (!body) return { ok: false, reason: "empty" };

  const admin = getSupabaseAdmin();

  const { data: want } = await admin
    .from("player_wants")
    .select("id, player_id, card_id, printing_id")
    .eq("id", wantId)
    .maybeSingle();

  if (!want) return { ok: false, reason: "not-found" };
  if (want.player_id === responderPlayerId) return { ok: false, reason: "yourself" };
  if (await blockedBetween(want.player_id, responderPlayerId)) {
    return { ok: false, reason: "closed" };
  }

  const { data: existing } = await admin
    .from("flare_threads")
    .select("id, closed_at")
    .eq("want_id", wantId)
    .eq("responder_player_id", responderPlayerId)
    .maybeSingle();

  let threadId = existing?.id ?? null;

  if (!threadId) {
    const { data: made, error } = await admin
      .from("flare_threads")
      .insert({
        want_id: wantId,
        author_player_id: want.player_id,
        responder_player_id: responderPlayerId,
      })
      .select("id")
      .maybeSingle();

    if (error && error.code === "23505") {
      const { data: raced } = await admin
        .from("flare_threads")
        .select("id")
        .eq("want_id", wantId)
        .eq("responder_player_id", responderPlayerId)
        .maybeSingle();
      threadId = raced?.id ?? null;
    } else {
      threadId = made?.id ?? null;
    }
  }

  if (!threadId) return { ok: false, reason: "unavailable" };

  const conversation = await pairThreadId(want.player_id, responderPlayerId);
  if (!conversation) return { ok: false, reason: "unavailable" };

  const sent = await appendMessage(
    conversation,
    responderPlayerId,
    want.player_id,
    body,
    {
      flareCardId: want.card_id,
      flarePrintingId: want.printing_id,
    },
  );

  return sent
    ? { ok: true, threadId: conversation }
    : { ok: false, reason: "unavailable" };
}

/**
 * A direct message: the conversation between two people, about nothing
 * in particular. Opened from a profile, with no first message — the
 * composer is the next screen, and a thread nobody wrote in is never
 * listed (see listThreads), so opening and leaving costs nothing.
 *
 * One per pair, whichever side opened it: the unique index orders the
 * two ids, and this looks the pair up both ways before inserting. Only
 * a block refuses it.
 */
export async function openDirectThread(
  fromPlayerId: string,
  toPlayerId: string,
): Promise<{ ok: true; threadId: string } | { ok: false; reason: ThreadFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (fromPlayerId === toPlayerId) return { ok: false, reason: "yourself" };
  if (await blockedBetween(fromPlayerId, toPlayerId)) {
    return { ok: false, reason: "closed" };
  }

  const admin = getSupabaseAdmin();

  const { data: other } = await admin
    .from("players")
    .select("id")
    .eq("id", toPlayerId)
    .maybeSingle();
  if (!other) return { ok: false, reason: "not-found" };

  const find = () =>
    admin
      .from("flare_threads")
      .select("id, closed_at")
      .is("flare_id", null)
      .is("want_id", null)
      .or(
        `and(author_player_id.eq.${fromPlayerId},responder_player_id.eq.${toPlayerId}),and(author_player_id.eq.${toPlayerId},responder_player_id.eq.${fromPlayerId})`,
      )
      .maybeSingle();

  const { data: existing } = await find();
  if (existing) return { ok: true, threadId: existing.id };

  /* The person written to sits in the author's chair, so the role reads
     the same way it does on a Flare: the one who was approached. */
  const { data: made, error } = await admin
    .from("flare_threads")
    .insert({ author_player_id: toPlayerId, responder_player_id: fromPlayerId })
    .select("id")
    .maybeSingle();

  if (error && error.code === "23505") {
    const { data: raced } = await find();
    return raced
      ? { ok: true, threadId: raced.id }
      : { ok: false, reason: "unavailable" };
  }

  return made ? { ok: true, threadId: made.id } : { ok: false, reason: "unavailable" };
}

/**
 * The threads one person already has open on a set of Flares, keyed by
 * Flare. "Wanted from you" uses it so a second tap on the same card
 * opens the conversation instead of sending "I have this" twice.
 */
export async function threadsOnFlaresFor(
  responderPlayerId: string,
  flareIds: string[],
): Promise<Map<string, string>> {
  if (!isSupabaseConfigured() || flareIds.length === 0) return new Map();

  const { data } = await getSupabaseAdmin()
    .from("flare_threads")
    .select("id, flare_id")
    .eq("responder_player_id", responderPlayerId)
    .in("flare_id", flareIds);

  /* Each anchor opens the pair's one conversation. */
  const pairs = new Map<string, string>();
  for (const row of data ?? []) {
    if (!row.flare_id) continue;
    const conversation = await conversationIdFor(row.id);
    if (conversation) pairs.set(row.flare_id, conversation);
  }
  return pairs;
}

/** The two ends of a thread, or null when the viewer is neither. */
async function threadForViewer(
  threadId: string,
  viewerId: string,
): Promise<{
  id: string;
  flareId: string | null;
  wantId: string | null;
  authorId: string;
  responderId: string;
  closed: boolean;
} | null> {
  const { data } = await getSupabaseAdmin()
    .from("flare_threads")
    .select("id, flare_id, want_id, author_player_id, responder_player_id, closed_at")
    .eq("id", threadId)
    .maybeSingle();

  if (!data) return null;
  if (data.author_player_id !== viewerId && data.responder_player_id !== viewerId) {
    /* Not yours reads as not found, so ids cannot be probed. */
    return null;
  }

  return {
    id: data.id,
    flareId: data.flare_id,
    wantId: data.want_id,
    authorId: data.author_player_id,
    responderId: data.responder_player_id,
    /* Nothing ends a conversation now; the field stays for older builds. */
    closed: false,
  };
}

async function appendMessage(
  threadId: string,
  senderId: string,
  recipientId: string,
  body: string,
  context?: {
    flareCardId?: string;
    /** The Flare's or want's printing; null when any printing will do. */
    flarePrintingId?: string | null;
    cardIds?: string[];
    /** One per card in cardIds, same order; null = any printing. */
    printingIds?: (string | null)[];
  },
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  /* Every card the message carries; the first is also `card_id`, which
     is all the builds before many-card messages read. */
  const cardIds =
    context?.cardIds && context.cardIds.length > 0
      ? context.cardIds
      : context?.flareCardId
        ? [context.flareCardId]
        : [];
  /* The art each card was offered in, so the chat draws the alt art the
     binder or the Flare showed rather than the plainest printing. */
  const printingIds =
    context?.cardIds && context.cardIds.length > 0
      ? cardIds.map((_, index) => context.printingIds?.[index] ?? null)
      : context?.flareCardId
        ? [context?.flarePrintingId ?? null]
        : [];

  const { error } = await admin.from("flare_messages").insert({
    thread_id: threadId,
    sender_player_id: senderId,
    body,
    card_id: cardIds[0] ?? null,
    card_ids: cardIds,
    printing_ids: printingIds,
  });

  if (error) {
    console.error("Could not send the message", error);
    return false;
  }

  await admin.from("flare_threads").update({ last_message_at: now }).eq("id", threadId);

  await notifyMessageReceived(threadId, senderId, recipientId, body, {
    flareCardId: cardIds[0],
  });

  return true;
}

/**
 * A message carrying cards, into the pair's one conversation: an offer
 * on somebody's trade binder (`src/lib/binder/offers.ts`). The caller
 * has checked the block and the cards; this only writes and rings.
 */
export async function sendCardsMessage(
  senderId: string,
  recipientId: string,
  body: string,
  cardIds: string[],
  printingIds: (string | null)[] = [],
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const conversation = await pairThreadId(recipientId, senderId);
  if (!conversation) return null;
  const sent = await appendMessage(conversation, senderId, recipientId, body, {
    cardIds,
    printingIds,
  });
  return sent ? conversation : null;
}

export async function sendThreadMessage(
  threadId: string,
  senderId: string,
  rawBody: string,
): Promise<{ ok: true } | { ok: false; reason: ThreadFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const body = trimmedBody(rawBody);
  if (!body) return { ok: false, reason: "empty" };

  const thread = await threadForViewer(threadId, senderId);
  if (!thread) return { ok: false, reason: "not-found" };

  const recipient = thread.authorId === senderId ? thread.responderId : thread.authorId;
  if (await blockedBetween(senderId, recipient)) return { ok: false, reason: "closed" };

  /* An anchor id from an old link writes to the pair's conversation. */
  const conversation = (await conversationIdFor(threadId)) ?? threadId;
  const sent = await appendMessage(conversation, senderId, recipient, body);
  return sent ? { ok: true } : { ok: false, reason: "unavailable" };
}

/**
 * What "End conversation" used to do, kept answering for the builds
 * still on phones that show the button. It ends nothing any more (see
 * the note at the top of this file): the thread is the viewer's, and
 * the answer is the same "ok" the button expects, so an old build does
 * not show an error for a door that no longer exists.
 */
export async function closeThread(
  threadId: string,
  viewerId: string,
): Promise<{ ok: true } | { ok: false; reason: ThreadFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const thread = await threadForViewer(threadId, viewerId);
  if (!thread) return { ok: false, reason: "not-found" };
  return { ok: true };
}

/**
 * Every conversation the player is part of, most recent talk first:
 * one row per person, the way Instagram's Messages reads. Only the
 * pair's own conversation is listed; a thread on a Flare or a want is
 * an anchor that holds no messages of its own (see `./pairs`).
 */
export async function listThreads(playerId: string): Promise<ThreadSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data: threads, error } = await admin
    .from("flare_threads")
    .select("id, author_player_id, responder_player_id, last_message_at")
    .or(`author_player_id.eq.${playerId},responder_player_id.eq.${playerId}`)
    .is("flare_id", null)
    .is("want_id", null)
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Could not list the threads", error);
    return [];
  }

  /* A blocked person's conversation is not listed, either way round. */
  const blocked = await blockedSet(playerId);
  const rows = (threads ?? []).filter(
    (row) =>
      !blocked.has(row.author_player_id) && !blocked.has(row.responder_player_id),
  );
  if (rows.length === 0) return [];

  const threadIds = rows.map((row) => row.id);
  const otherIds = [
    ...new Set(
      rows.map((row) =>
        row.author_player_id === playerId
          ? row.responder_player_id
          : row.author_player_id,
      ),
    ),
  ];

  const [{ data: others }, { data: messages }] = await Promise.all([
    admin.from("players").select("id, display_name, avatar_url").in("id", otherIds),
    /* Recent messages for previews and unread counts, one query. 50
       conversations x a busy one still fits comfortably. */
    admin
      .from("flare_messages")
      .select("thread_id, sender_player_id, body, created_at, read_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const otherById = new Map((others ?? []).map((row) => [row.id, row]));

  const latest = new Map<string, { body: string; fromYou: boolean }>();
  const unread = new Map<string, number>();
  for (const message of messages ?? []) {
    if (!latest.has(message.thread_id)) {
      latest.set(message.thread_id, {
        body: message.body,
        fromYou: message.sender_player_id === playerId,
      });
    }
    if (message.sender_player_id !== playerId && message.read_at === null) {
      unread.set(message.thread_id, (unread.get(message.thread_id) ?? 0) + 1);
    }
  }

  return rows.flatMap((row) => {
    /* Opened and never written in: a profile's Message button was
       tapped and the person walked away. Nothing to list. */
    const last = latest.get(row.id);
    if (!last) return [];

    const otherId =
      row.author_player_id === playerId
        ? row.responder_player_id
        : row.author_player_id;
    const other = otherById.get(otherId);

    return [
      {
        threadId: row.id,
        kind: "direct" as const,
        flareId: null,
        wantId: null,
        cardName: null,
        cardNumber: null,
        imageUrl: null,
        withName: other?.display_name ?? "A player",
        withPlayerId: otherId,
        withAvatarUrl: avatarSrc(other?.avatar_url),
        role:
          row.author_player_id === playerId
            ? ("author" as const)
            : ("responder" as const),
        lastMessageAt: row.last_message_at,
        lastMessagePreview: last.body,
        lastFromYou: last.fromYou,
        unread: unread.get(row.id) ?? 0,
        closed: false,
      },
    ];
  });
}

/**
 * One thread's messages, oldest first — and reading is what marks them
 * read: the other side's unread messages get their timestamp, and the
 * inbox notice for this thread is cleared so the NEXT message can ring
 * again.
 */
/**
 * Somewhere public to meet, suggested rather than asked for.
 *
 * CardFlare's mission is the in-person trade at a store or a card
 * event, and never at anybody's home. So a thread carries one store to
 * suggest: a local you BOTH go to when there is one, otherwise one of
 * the viewer's own, with the next night on its calendar. Nothing here
 * is an address; a store is a name and a code, as everywhere else.
 */
export interface MeetSuggestion {
  storeName: string;
  joinCode: string;
  nextEventName: string | null;
  nextEventAt: string | null;
  timeZone: string;
  /** True when the store is one both people have saved. */
  shared: boolean;
}

async function meetSuggestion(
  viewerId: string,
  otherId: string,
): Promise<MeetSuggestion | null> {
  const [mine, theirs] = await Promise.all([listLocals(viewerId), listLocals(otherId)]);
  if (mine.length === 0) return null;

  const theirIds = new Set(theirs.map((local) => local.storeId));
  const shared = mine.filter((local) => theirIds.has(local.storeId));
  const pool = shared.length > 0 ? shared : mine;

  /* The one with a night coming soonest wins; a store with nothing on
     the calendar still beats no suggestion at all. */
  const pick = [...pool].sort((a, b) => {
    if (a.nextEventAt && b.nextEventAt) return a.nextEventAt < b.nextEventAt ? -1 : 1;
    if (a.nextEventAt) return -1;
    if (b.nextEventAt) return 1;
    return 0;
  })[0];
  if (!pick) return null;

  return {
    storeName: pick.name,
    joinCode: pick.joinCode,
    nextEventName: pick.nextEventName,
    nextEventAt: pick.nextEventAt,
    timeZone: pick.timeZone,
    shared: shared.length > 0,
  };
}

export interface ThreadRead {
  ok: boolean;
  closed: boolean;
  /**
   * Either has blocked the other: nothing can be sent, and the screen
   * says so in place of the composer. Which side blocked is not said.
   * The blocker keeps the history; the person blocked does not.
   */
  blocked: boolean;
  /** What it is about: a posted Flare, a saved want, or the two people. */
  kind: "flare" | "want" | "direct";
  /**
   * The conversation actually read: the pair's one chat, which may not
   * be the id asked for when an old link held an anchor's id.
   */
  threadId: string | null;
  cardName: string | null;
  withName: string | null;
  withPlayerId: string | null;
  /** Their face for the header, or null for the initials face. */
  withAvatarUrl: string | null;
  /** Their @handle, under the name in the header, Instagram-style. */
  withHandle: string | null;
  messages: ThreadMessage[];
  /** A public place to suggest meeting, or null when neither side has a local. */
  meet: MeetSuggestion | null;
  /**
   * The newest "We traded" said in this conversation, as the viewer
   * sees it, or null. See `src/lib/trades/thread-trades.ts`.
   */
  trade: ThreadTrade | null;
}

/** The columns of a message `readThread` draws from. */
type ThreadMessageRow = Pick<
  FlareMessageRow,
  | "id"
  | "sender_player_id"
  | "body"
  | "created_at"
  | "card_id"
  | "card_ids"
  | "printing_ids"
>;

export async function readThread(
  threadId: string,
  viewerId: string,
): Promise<ThreadRead> {
  const empty: ThreadRead = {
    ok: false,
    closed: false,
    blocked: false,
    kind: "direct",
    threadId: null,
    cardName: null,
    withName: null,
    withPlayerId: null,
    withAvatarUrl: null,
    withHandle: null,
    messages: [],
    meet: null,
    trade: null,
  };
  if (!isSupabaseConfigured()) return empty;

  /* Checked on the id asked for, so an anchor cannot be probed into
     somebody else's conversation; then read as the pair's one chat. */
  const asked = await threadForViewer(threadId, viewerId);
  if (!asked) return empty;
  const conversationId = (await conversationIdFor(threadId)) ?? threadId;

  const admin = getSupabaseAdmin();
  const otherId = asked.authorId === viewerId ? asked.responderId : asked.authorId;

  const block = await blockState(viewerId, otherId);
  const blocked = block.blocked || block.blockedBy;
  /* Blocked BY them: the conversation is closed to you, history and
     all. The blocker still reads what was said. */
  const hideHistory = block.blockedBy && !block.blocked;

  const [{ data: messages }, { data: other }, meet, trade] = await Promise.all([
    hideHistory
      ? Promise.resolve({ data: [] as ThreadMessageRow[] })
      : admin
          .from("flare_messages")
          .select(
            "id, sender_player_id, body, created_at, card_id, card_ids, printing_ids",
          )
          .eq("thread_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(200),
    admin
      .from("players")
      .select("display_name, avatar_url, handle")
      .eq("id", otherId)
      .maybeSingle(),
    blocked ? null : meetSuggestion(viewerId, otherId).catch(() => null),
    hideHistory ? null : latestThreadTrade(conversationId, viewerId).catch(() => null),
  ]);

  /* The newest 200, drawn oldest first. */
  const ordered = [...(messages ?? [])].reverse();

  /* The cards messages were about, one query each for facts and art. */
  const carried = (message: { card_id: string | null; card_ids: string[] | null }) =>
    message.card_ids && message.card_ids.length > 0
      ? message.card_ids
      : message.card_id
        ? [message.card_id]
        : [];
  const cardIds = [...new Set(ordered.flatMap(carried))];
  const printingOf = (
    message: { card_ids: string[] | null; printing_ids: (string | null)[] | null },
    index: number,
  ): string | null =>
    message.card_ids && message.card_ids.length > 0
      ? (message.printing_ids?.[index] ?? null)
      : (message.printing_ids?.[0] ?? null);
  const printingIds = [
    ...new Set(
      ordered.flatMap((message) =>
        carried(message).flatMap((_, index) => {
          const printing = printingOf(message, index);
          return printing ? [printing] : [];
        }),
      ),
    ),
  ];
  const artByPrinting = new Map<string, string>();
  if (printingIds.length > 0) {
    const { data: printings } = await admin
      .from("card_printings")
      .select("id, image_url")
      .in("id", printingIds)
      .not("image_url", "is", null);
    for (const row of printings ?? []) {
      if (row.image_url) artByPrinting.set(row.id, row.image_url);
    }
  }
  const cardById = new Map<
    string,
    { name: string; number: string; imageUrl: string | null }
  >();
  if (cardIds.length > 0) {
    const [{ data: cards }, { data: art }] = await Promise.all([
      admin
        .from("cards")
        .select("id, exact_name, canonical_card_number")
        .in("id", cardIds),
      admin
        .from("card_printings")
        .select("card_id, image_url")
        .in("card_id", cardIds)
        .not("image_url", "is", null),
    ]);
    const artByCard = new Map<string, string>();
    for (const row of art ?? []) {
      if (!artByCard.has(row.card_id) && row.image_url) {
        artByCard.set(row.card_id, row.image_url);
      }
    }
    for (const card of cards ?? []) {
      cardById.set(card.id, {
        name: card.exact_name,
        number: card.canonical_card_number,
        imageUrl: artByCard.get(card.id) ?? null,
      });
    }
  }

  /* The read receipts, and the notification reset. Failures here are
     logged, never surfaced: the messages were already read. A notice
     rung on an old anchor id belongs to this chat too. */
  const now = new Date().toISOString();
  const { error: readError } = await admin
    .from("flare_messages")
    .update({ read_at: now })
    .eq("thread_id", conversationId)
    .neq("sender_player_id", viewerId)
    .is("read_at", null);
  if (readError) console.error("Could not mark the thread read", readError);

  const noticeKeys = [...new Set([conversationId, threadId])].map(
    (id) => `message:${id}:${viewerId}`,
  );
  const { error: noticeError } = await admin
    .from("notifications")
    .delete()
    .in("dedupe_key", noticeKeys);
  if (noticeError) console.error("Could not clear the message notice", noticeError);

  return {
    ok: true,
    closed: false,
    blocked,
    kind: "direct",
    threadId: conversationId,
    cardName: null,
    withName: other?.display_name ?? null,
    withPlayerId: otherId,
    withAvatarUrl: avatarSrc(other?.avatar_url),
    withHandle: other?.handle ?? null,
    messages: ordered.map((message) => {
      const cards = carried(message).flatMap((cardId, index) => {
        const card = cardById.get(cardId);
        if (!card) return [];
        const printing = printingOf(message, index);
        const imageUrl = (printing && artByPrinting.get(printing)) || card.imageUrl;
        return [{ cardId, ...card, imageUrl }];
      });
      return {
        id: message.id,
        body: message.body,
        sentAt: message.created_at,
        yours: message.sender_player_id === viewerId,
        card: cards[0] ?? null,
        cards,
      };
    }),
    meet,
    trade,
  };
}

/**
 * How many messages are waiting for the player across every
 * conversation: the number on the Messages row of the Inbox.
 */
export async function unreadMessages(playerId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const admin = getSupabaseAdmin();
  const [{ data: threads }, blocked] = await Promise.all([
    admin
      .from("flare_threads")
      .select("id, author_player_id, responder_player_id")
      .or(`author_player_id.eq.${playerId},responder_player_id.eq.${playerId}`),
    blockedSet(playerId),
  ]);

  /* Not a conversation with somebody blocked either way: Messages does
     not list it, so its unread would be a dot nothing could clear. */
  const ids = (threads ?? [])
    .filter(
      (row) =>
        !blocked.has(row.author_player_id) && !blocked.has(row.responder_player_id),
    )
    .map((row) => row.id);
  if (ids.length === 0) return 0;

  const { count } = await admin
    .from("flare_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", ids)
    .neq("sender_player_id", playerId)
    .is("read_at", null);

  return count ?? 0;
}
