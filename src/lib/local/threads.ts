import "server-only";

import { listLocals } from "@/lib/players/locals";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { notifyMessageReceived } from "@/lib/notifications/notify";
import { blockedBetween, blockedSet } from "@/lib/players/safety";
import { MESSAGE_MAX_LENGTH } from "./shared";

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
 * CLOSING IS FINAL. Either side can end a thread and an ended thread
 * takes no more messages, with no reopen. "Stop messaging me" has to
 * mean something, and this is v1's whole safety surface — kept small
 * enough to be airtight.
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
}

export interface ThreadMessage {
  id: string;
  body: string;
  sentAt: string;
  /** True when the viewer sent it. */
  yours: boolean;
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
    .select("id, player_session_id, player_id, card_id")
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

  if (existing?.closed_at) return { ok: false, reason: "closed" };

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

  const sent = await appendMessage(threadId, responderPlayerId, authorPlayerId, body, {
    flareCardId: flare.card_id,
  });

  return sent ? { ok: true, threadId } : { ok: false, reason: "unavailable" };
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
    .select("id, player_id, card_id")
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

  if (existing?.closed_at) return { ok: false, reason: "closed" };

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

  const sent = await appendMessage(threadId, responderPlayerId, want.player_id, body, {
    flareCardId: want.card_id,
  });

  return sent ? { ok: true, threadId } : { ok: false, reason: "unavailable" };
}

/**
 * A direct message: the conversation between two people, about nothing
 * in particular. Opened from a profile, with no first message — the
 * composer is the next screen, and a thread nobody wrote in is never
 * listed (see listThreads), so opening and leaving costs nothing.
 *
 * One per pair, whichever side opened it: the unique index orders the
 * two ids, and this looks the pair up both ways before inserting. A
 * closed one stays closed; "stop messaging me" means something.
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
  if (existing?.closed_at) return { ok: false, reason: "closed" };
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
    if (raced?.closed_at) return { ok: false, reason: "closed" };
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

  return new Map(
    (data ?? []).flatMap((row) =>
      row.flare_id ? [[row.flare_id, row.id] as const] : [],
    ),
  );
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
    closed: data.closed_at !== null,
  };
}

async function appendMessage(
  threadId: string,
  senderId: string,
  recipientId: string,
  body: string,
  context?: { flareCardId?: string },
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await admin.from("flare_messages").insert({
    thread_id: threadId,
    sender_player_id: senderId,
    body,
  });

  if (error) {
    console.error("Could not send the message", error);
    return false;
  }

  await admin.from("flare_threads").update({ last_message_at: now }).eq("id", threadId);

  await notifyMessageReceived(threadId, senderId, recipientId, body, context);

  return true;
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
  if (thread.closed) return { ok: false, reason: "closed" };

  const recipient = thread.authorId === senderId ? thread.responderId : thread.authorId;
  if (await blockedBetween(senderId, recipient)) return { ok: false, reason: "closed" };

  const sent = await appendMessage(threadId, senderId, recipient, body);
  return sent ? { ok: true } : { ok: false, reason: "unavailable" };
}

/**
 * Ends a thread, from either chair. Not an error to repeat — ending an
 * ended conversation is the outcome the caller wanted.
 */
export async function closeThread(
  threadId: string,
  viewerId: string,
): Promise<{ ok: true } | { ok: false; reason: ThreadFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const thread = await threadForViewer(threadId, viewerId);
  if (!thread) return { ok: false, reason: "not-found" };
  if (thread.closed) return { ok: true };

  const { error } = await getSupabaseAdmin()
    .from("flare_threads")
    .update({ closed_at: new Date().toISOString(), closed_by: viewerId })
    .eq("id", threadId);

  if (error) {
    console.error("Could not close the thread", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/** Every conversation the player is part of, most recent talk first. */
export async function listThreads(playerId: string): Promise<ThreadSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data: threads, error } = await admin
    .from("flare_threads")
    .select(
      "id, flare_id, want_id, author_player_id, responder_player_id, last_message_at, closed_at",
    )
    .or(`author_player_id.eq.${playerId},responder_player_id.eq.${playerId}`)
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
  const flareIds = [
    ...new Set(rows.flatMap((row) => (row.flare_id ? [row.flare_id] : []))),
  ];
  const wantIds = [
    ...new Set(rows.flatMap((row) => (row.want_id ? [row.want_id] : []))),
  ];

  const [{ data: others }, { data: flares }, { data: wants }, { data: messages }] =
    await Promise.all([
      admin.from("players").select("id, display_name").in("id", otherIds),
      admin.from("flares").select("id, card_id").in("id", flareIds),
      /* A thread on a saved want names its card the same way. */
      admin.from("player_wants").select("id, card_id").in("id", wantIds),
      /* Recent messages for previews and unread counts, one query. 50
       threads × a busy conversation still fits comfortably. */
      admin
        .from("flare_messages")
        .select("thread_id, sender_player_id, body, created_at, read_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const nameById = new Map((others ?? []).map((row) => [row.id, row.display_name]));
  const flareCard = new Map((flares ?? []).map((row) => [row.id, row.card_id]));
  const wantCard = new Map((wants ?? []).map((row) => [row.id, row.card_id]));

  const cardIds = [...new Set([...flareCard.values(), ...wantCard.values()])];
  const { data: cards } = await admin
    .from("cards")
    .select("id, exact_name, canonical_card_number")
    .in("id", cardIds);
  const cardById = new Map((cards ?? []).map((row) => [row.id, row]));

  /* Art for the row: the flare's card's base printing image. One query
     over the page's cards; a missing image is an empty thumb, not a
     missing thread. */
  const { data: art } = await admin
    .from("card_printings")
    .select("card_id, image_url")
    .in("card_id", cardIds)
    .not("image_url", "is", null);
  const artByCard = new Map<string, string>();
  for (const row of art ?? []) {
    if (!artByCard.has(row.card_id) && row.image_url) {
      artByCard.set(row.card_id, row.image_url);
    }
  }

  const preview = new Map<string, string>();
  const unread = new Map<string, number>();
  for (const message of messages ?? []) {
    if (!preview.has(message.thread_id)) {
      preview.set(message.thread_id, message.body);
    }
    if (message.sender_player_id !== playerId && message.read_at === null) {
      unread.set(message.thread_id, (unread.get(message.thread_id) ?? 0) + 1);
    }
  }

  return rows.flatMap((row) => {
    const otherId =
      row.author_player_id === playerId
        ? row.responder_player_id
        : row.author_player_id;
    const kind = row.flare_id ? "flare" : row.want_id ? "want" : "direct";
    const cardId = row.flare_id
      ? flareCard.get(row.flare_id)
      : row.want_id
        ? wantCard.get(row.want_id)
        : undefined;
    const card = cardId ? cardById.get(cardId) : undefined;
    /* A thread about a card that no longer exists has nothing to say
       for itself; a direct one needs no card. */
    if (kind !== "direct" && !card) return [];
    /* A direct thread opened and never written in: a profile's Message
       button was tapped and the person walked away. Nothing to list. */
    if (kind === "direct" && !preview.has(row.id)) return [];

    return [
      {
        threadId: row.id,
        kind,
        flareId: row.flare_id,
        wantId: row.want_id,
        cardName: card?.exact_name ?? null,
        cardNumber: card?.canonical_card_number ?? null,
        imageUrl: (cardId && artByCard.get(cardId)) || null,
        withName: nameById.get(otherId) ?? "A player",
        withPlayerId: otherId,
        role:
          row.author_player_id === playerId
            ? ("author" as const)
            : ("responder" as const),
        lastMessageAt: row.last_message_at,
        lastMessagePreview: preview.get(row.id) ?? null,
        unread: unread.get(row.id) ?? 0,
        closed: row.closed_at !== null,
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
  cardName: string | null;
  withName: string | null;
  messages: ThreadMessage[];
  /** A public place to suggest meeting, or null when neither side has a local. */
  meet: MeetSuggestion | null;
}

export async function readThread(
  threadId: string,
  viewerId: string,
): Promise<ThreadRead> {
  const empty: ThreadRead = {
    ok: false,
    closed: false,
    cardName: null,
    withName: null,
    messages: [],
    meet: null,
  };
  if (!isSupabaseConfigured()) return empty;

  const thread = await threadForViewer(threadId, viewerId);
  if (!thread) return empty;

  const admin = getSupabaseAdmin();
  const otherId = thread.authorId === viewerId ? thread.responderId : thread.authorId;

  const [{ data: messages }, { data: other }, anchor, meet] = await Promise.all([
    admin
      .from("flare_messages")
      .select("id, sender_player_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200),
    admin.from("players").select("display_name").eq("id", otherId).maybeSingle(),
    thread.flareId
      ? admin
          .from("flares")
          .select("card_id")
          .eq("id", thread.flareId)
          .maybeSingle()
          .then((result) => result.data)
      : thread.wantId
        ? admin
            .from("player_wants")
            .select("card_id")
            .eq("id", thread.wantId)
            .maybeSingle()
            .then((result) => result.data)
        : Promise.resolve(null),
    meetSuggestion(viewerId, otherId).catch(() => null),
  ]);

  const { data: card } = anchor?.card_id
    ? await admin
        .from("cards")
        .select("exact_name")
        .eq("id", anchor.card_id)
        .maybeSingle()
    : { data: null };

  /* The read receipts, and the notification reset. Failures here are
     logged, never surfaced: the messages were already read. */
  const now = new Date().toISOString();
  const { error: readError } = await admin
    .from("flare_messages")
    .update({ read_at: now })
    .eq("thread_id", threadId)
    .neq("sender_player_id", viewerId)
    .is("read_at", null);
  if (readError) console.error("Could not mark the thread read", readError);

  const { error: noticeError } = await admin
    .from("notifications")
    .delete()
    .eq("dedupe_key", `message:${threadId}:${viewerId}`);
  if (noticeError) console.error("Could not clear the message notice", noticeError);

  return {
    ok: true,
    closed: thread.closed,
    cardName: card?.exact_name ?? null,
    withName: other?.display_name ?? null,
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      body: message.body,
      sentAt: message.created_at,
      yours: message.sender_player_id === viewerId,
    })),
    meet,
  };
}

/**
 * How many messages are waiting for the player across every
 * conversation: the number on the Messages row of the Inbox.
 */
export async function unreadMessages(playerId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const admin = getSupabaseAdmin();
  const { data: threads } = await admin
    .from("flare_threads")
    .select("id")
    .or(`author_player_id.eq.${playerId},responder_player_id.eq.${playerId}`)
    .is("closed_at", null);

  const ids = (threads ?? []).map((row) => row.id);
  if (ids.length === 0) return 0;

  const { count } = await admin
    .from("flare_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", ids)
    .neq("sender_player_id", playerId)
    .is("read_at", null);

  return count ?? 0;
}
