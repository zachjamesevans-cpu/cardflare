import "server-only";

import { sendEmail } from "@/lib/email/client";
import { collectionAvailability } from "@/lib/players/collection";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";

/**
 * The notification backbone: record first, deliver second.
 *
 * Every noteworthy event lands as a `notifications` row for a *player* —
 * accounts only, because a guest session has no address and no device.
 * Delivery then fans out over whatever the player has: email today, the
 * app's push tokens once it exists. The row is the record either way, so
 * the future app reads the same table as its inbox.
 *
 * Everything here is fire-and-forget from the caller's point of view:
 * an offer that was written must never fail because a notification could
 * not be delivered, so nothing throws and every failure is a log line.
 */

/** The one place a session becomes a notifiable person, or doesn't. */
async function notifiablePlayerForSession(
  sessionId: string,
): Promise<{ playerId: string; email: string | null } | null> {
  const admin = getSupabaseAdmin();

  const { data: session } = await admin
    .from("player_sessions")
    .select("player_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session?.player_id) return null;

  const { data: player } = await admin
    .from("players")
    .select("id, user_id")
    .eq("id", session.player_id)
    .maybeSingle();

  if (!player) return null;

  const { data: user } = await admin.auth.admin.getUserById(player.user_id);

  return { playerId: player.id, email: user?.user?.email ?? null };
}

/** The Flare's card name and its room's join code, for the message. */
async function flareContext(flareId: string): Promise<{
  ownerSessionId: string;
  cardName: string;
  code: string;
  intent: "want" | "showcase";
} | null> {
  const admin = getSupabaseAdmin();

  const { data: flare } = await admin
    .from("flares")
    .select("player_session_id, card_id, event_id, intent")
    .eq("id", flareId)
    .maybeSingle();

  if (!flare) return null;

  const [{ data: card }, { data: event }] = await Promise.all([
    admin.from("cards").select("exact_name").eq("id", flare.card_id).maybeSingle(),
    admin.from("events").select("join_code").eq("id", flare.event_id).maybeSingle(),
  ]);

  if (!event?.join_code) return null;

  return {
    ownerSessionId: flare.player_session_id,
    cardName: card?.exact_name ?? "your card",
    code: event.join_code,
    intent: flare.intent,
  };
}

/**
 * Records one notification, exactly once per underlying event.
 *
 * Returns false when the dedupe key already exists — the caller then skips
 * delivery too, because a re-offer updating its message must update the
 * room, not ping the phone again.
 */
async function record(entry: {
  playerId: string;
  kind:
    | "offer-received"
    | "trade-confirmed"
    | "early-board"
    | "board-open"
    | "new-follower"
    | "room-flare";
  title: string;
  body: string | null;
  url: string;
  dedupeKey: string;
}): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .insert({
      player_id: entry.playerId,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      url: entry.url,
      dedupe_key: entry.dedupeKey,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505 is the dedupe doing its job; anything else is a real failure.
    if (error.code !== "23505") {
      console.error("Could not record the notification", error);
    }
    return null;
  }

  return data?.id ?? null;
}

/**
 * Push delivery through Expo's push service — the app track's payoff.
 *
 * Sent to every device the player's account has registered. Expo fans
 * out to Apple and Google; a ticket answering "DeviceNotRegistered"
 * means the app was deleted from that phone, and the token is pruned so
 * it is never paid for again. Fire-and-forget like email: the recorded
 * notification is the truth, delivery is best-effort.
 */
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

async function deliverByPush(
  playerId: string,
  title: string,
  body: string | null,
  path: string,
): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: devices, error } = await admin
    .from("player_devices")
    .select("id, push_token")
    .eq("player_id", playerId);

  if (error || !devices || devices.length === 0) return;

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        devices.map((device) => ({
          to: device.push_token,
          title,
          body: body ?? undefined,
          sound: "default",
          data: { url: path },
        })),
      ),
      signal: AbortSignal.timeout(8_000),
    });

    const result = (await response.json().catch(() => null)) as {
      data?: { status: string; details?: { error?: string } }[];
    } | null;

    const dead = devices.filter(
      (_, index) => result?.data?.[index]?.details?.error === "DeviceNotRegistered",
    );

    if (dead.length > 0) {
      await admin
        .from("player_devices")
        .delete()
        .in(
          "id",
          dead.map((device) => device.id),
        );
    }
  } catch (caught) {
    console.error("Could not reach the push service", caught);
  }
}

/** Email delivery: plain and short, with the room one tap away. */
async function deliverByEmail(
  notificationId: string,
  to: string,
  title: string,
  body: string | null,
  path: string,
): Promise<void> {
  const link = `${siteUrl()}${path}`;

  const text = [title, body, `Open the room: ${link}`].filter(Boolean).join("\n\n");

  const html = `
    <div style="font-family: sans-serif; line-height: 1.6; color: #1a1a1a;">
      <p style="font-size: 16px; font-weight: bold;">${title}</p>
      ${body ? `<p>${body}</p>` : ""}
      <p><a href="${link}">Open the room</a> for the latest board.</p>
      <p style="font-size: 12px; color: #777;">
        CardFlare tells you when something needs you in a room. You got this
        because you posted or offered while signed in.
      </p>
    </div>
  `;

  const sent = await sendEmail({ to, subject: title, html, text });

  if (sent.status === "sent") {
    await getSupabaseAdmin()
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", notificationId);
  }
}

/**
 * Somebody raised a hand on your Flare.
 *
 * The single most important notification in the product: the moment the
 * loop closes is exactly when the requester has wandered off to a match.
 * Guests are unreachable by design — their room page keeps polling — and
 * the offer itself succeeded before this was ever called.
 */
export async function notifyOfferReceived(
  flareId: string,
  responderSessionId: string,
  responderName: string,
  message: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const context = await flareContext(flareId);
    if (!context) return;

    const recipient = await notifiablePlayerForSession(context.ownerSessionId);
    if (!recipient) return;

    /*
     * The wording follows the card, not the button. On a Flare the
     * responder HAS what the owner needs; on a showcase the owner has
     * it and the responder WANTS it. One sentence for each, because
     * "Kaito has your Perona" sent to the person holding Perona reads
     * as nonsense.
     */
    const title =
      context.intent === "showcase"
        ? `${responderName} wants your ${context.cardName}`
        : `${responderName} has your ${context.cardName}`;
    const body = message
      ? `They said: “${message}”`
      : context.intent === "showcase"
        ? "They asked about your showcase. Go find them in the room."
        : "They offered to trade. Go find them in the room.";
    const path = `/e/${context.code}`;

    const id = await record({
      playerId: recipient.playerId,
      kind: "offer-received",
      title,
      body,
      url: path,
      dedupeKey: `offer:${flareId}:${responderSessionId}`,
    });

    if (id) {
      await deliverByPush(recipient.playerId, title, body, path);
      if (recipient.email) {
        await deliverByEmail(id, recipient.email, title, body, path);
      }
    }
  } catch (error) {
    console.error("Could not notify the Flare's owner", error);
  }
}

/**
 * "Wednesday's board is open, and you own cards these players want."
 *
 * The digest that gets binders into cars. Fired lazily, the way
 * everything here works: the first Flares landing on an early board
 * trigger it, and the dedupe key (one per player per event) makes every
 * later trigger free. Sent to players who saved this store as a local,
 * excluding anyone already on the board - they know. Guests are
 * unreachable by design, as everywhere.
 *
 * Never throws, never blocks a post: the Flare that triggered this
 * already succeeded, and a digest is worth nothing if it costs a post.
 */
export async function notifyEarlyBoardFlares(eventId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = getSupabaseAdmin();

    const { data: event } = await admin
      .from("events")
      .select("id, name, join_code, starts_at, store_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!event?.join_code) return;

    const [{ data: store }, { data: flares }, { data: savers }, { data: inRoom }] =
      await Promise.all([
        admin.from("stores").select("name").eq("id", event.store_id).maybeSingle(),
        admin
          .from("flares")
          .select("card_id")
          .eq("event_id", eventId)
          .eq("status", "open"),
        admin.from("player_locals").select("player_id").eq("store_id", event.store_id),
        admin
          .from("event_participants")
          .select("player_session_id")
          .eq("event_id", eventId),
      ]);

    const cardIds = [...new Set((flares ?? []).map((row) => row.card_id))];
    if (cardIds.length === 0) return;

    // Players already on the board need no invitation to it.
    const sessionIds = (inRoom ?? []).map((row) => row.player_session_id);
    const joinedPlayers = new Set<string>();
    if (sessionIds.length > 0) {
      const { data: sessions } = await admin
        .from("player_sessions")
        .select("player_id")
        .in("id", sessionIds);
      for (const row of sessions ?? []) {
        if (row.player_id) joinedPlayers.add(row.player_id);
      }
    }

    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(event.starts_at));
    const storeName = store?.name ?? "your local store";
    const title = `The ${event.name} board is open at ${storeName}`;
    const path = `/e/${event.join_code}`;

    for (const saver of savers ?? []) {
      if (joinedPlayers.has(saver.player_id)) continue;

      const matches = await collectionAvailability(saver.player_id, cardIds);
      const body =
        matches.size > 0
          ? `${cardIds.length} ${cardIds.length === 1 ? "card is" : "cards are"} already wanted for ${day}, and you own ${matches.size} of them. Bring the binder.`
          : `${cardIds.length} ${cardIds.length === 1 ? "card is" : "cards are"} already wanted for ${day}. Post yours and see who is coming.`;

      const id = await record({
        playerId: saver.player_id,
        kind: "early-board",
        title,
        body,
        url: path,
        dedupeKey: `early-board:${eventId}:${saver.player_id}`,
      });

      if (id) {
        await deliverByPush(saver.player_id, title, body, path);

        const email = await playerEmail(saver.player_id);
        if (email) await deliverByEmail(id, email, title, body, path);
      }
    }
  } catch (error) {
    console.error("Could not send the early-board digest", error);
  }
}

/**
 * "Zach has your Perona" — a showcase answering a Flare already up.
 *
 * The other half of the founder's showcase loop, and the half that
 * makes it worth posting: somebody offers a card up, and the people in
 * this room who already asked for that card are told, without the
 * shower speaking to anyone.
 *
 * Recorded as an offer-received, because that is exactly what it means
 * to the person receiving it — somebody in this room can answer your
 * Flare. The dedupe key is the pair, so one showcase tells one hunter
 * once however many times the board re-reads.
 */
export async function notifyShowcaseMatch(
  showcaseFlareId: string,
  showcaserName: string,
  hunters: { flareId: string; playerSessionId: string }[],
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const context = await flareContext(showcaseFlareId);
    if (!context) return;

    const title = `${showcaserName} has your ${context.cardName}`;
    const body = "They posted it as a card they will let go. Go find them in the room.";
    const path = `/e/${context.code}`;

    for (const hunter of hunters) {
      const recipient = await notifiablePlayerForSession(hunter.playerSessionId);
      if (!recipient) continue;

      const id = await record({
        playerId: recipient.playerId,
        kind: "offer-received",
        title,
        body,
        url: path,
        dedupeKey: `showcase:${showcaseFlareId}:${hunter.flareId}`,
      });

      if (id) {
        await deliverByPush(recipient.playerId, title, body, path);
        if (recipient.email) {
          await deliverByEmail(id, recipient.email, title, body, path);
        }
      }
    }
  } catch (error) {
    console.error("Could not notify the showcase's matches", error);
  }
}

/**
 * The doorbell: "the board for Friday's locals is open."
 *
 * Fired by the hourly cron the moment a scheduled event's board opens —
 * the store's early window or midnight of event day, whichever comes
 * first — so the board starts filling before anyone is in the building.
 * Sent to players who saved this store as a local, excluding anyone
 * already on the board; the body carries the player's own Flare count,
 * because "RSVP and your 5 Flares go up" is the whole pitch.
 *
 * Push and inbox only, no email on purpose. This can fire at midnight,
 * which is phone-notification territory; the early-board digest keeps
 * the email lane for when there is actually a board worth reading.
 * The per-player dedupe key makes every re-run of the cron free.
 */
export async function notifyBoardOpen(eventId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = getSupabaseAdmin();

    const { data: event } = await admin
      .from("events")
      .select("id, name, join_code, starts_at, store_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!event?.join_code) return;

    const [{ data: store }, { data: savers }, { data: inRoom }] = await Promise.all([
      admin.from("stores").select("name").eq("id", event.store_id).maybeSingle(),
      admin.from("player_locals").select("player_id").eq("store_id", event.store_id),
      admin
        .from("event_participants")
        .select("player_session_id")
        .eq("event_id", eventId),
    ]);

    if (!savers || savers.length === 0) return;

    // Players already on the board rang their own doorbell.
    const sessionIds = (inRoom ?? []).map((row) => row.player_session_id);
    const joinedPlayers = new Set<string>();
    if (sessionIds.length > 0) {
      const { data: sessions } = await admin
        .from("player_sessions")
        .select("player_id")
        .in("id", sessionIds);
      for (const row of sessions ?? []) {
        if (row.player_id) joinedPlayers.add(row.player_id);
      }
    }

    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(event.starts_at));
    const storeName = store?.name ?? "your local store";
    const title = `The board is open: ${event.name} at ${storeName}`;
    const path = `/e/${event.join_code}`;

    for (const saver of savers) {
      if (joinedPlayers.has(saver.player_id)) continue;

      const { count } = await admin
        .from("player_wants")
        .select("id", { count: "exact", head: true })
        .eq("player_id", saver.player_id);

      const body =
        (count ?? 0) > 0
          ? `You are hunting ${count} ${count === 1 ? "card" : "cards"}. RSVP and ${count === 1 ? "it goes" : "they go"} up for ${day}.`
          : `Post what you are hunting and see who is coming ${day}.`;

      const id = await record({
        playerId: saver.player_id,
        kind: "board-open",
        title,
        body,
        url: path,
        dedupeKey: `board-open:${eventId}:${saver.player_id}`,
      });

      if (id) await deliverByPush(saver.player_id, title, body, path);
    }
  } catch (error) {
    console.error("Could not ring the board-open doorbell", error);
  }
}

/**
 * The kinds a test can imitate, with the wording each one really uses.
 *
 * Push notifications are the one part of the product that cannot be
 * checked by looking at a screen: the phone has to be locked, the app
 * has to be closed, and somebody else has to do something. This lets an
 * admin fire a real notification down the real rails at their own
 * account, so the plumbing can be proved before a Friday night.
 */
export const TEST_NOTICES = {
  "offer-received": {
    title: "CHUNC has your Charizard",
    body: "They said: “I have the reverse holo, meet at table 4”",
  },
  "trade-confirmed": {
    title: "Trade confirmed: Charizard",
    body: "CHUNC marked your trade done. Good trade.",
  },
  "board-open": {
    title: "The board is open: Friday Locals at Card Cavern",
    body: "You are hunting 5 cards. RSVP and they go up for Friday.",
  },
  "early-board": {
    title: "The Friday Locals board is open at Card Cavern",
    body: "12 cards are already wanted for Friday, and you own 3 of them. Bring the binder.",
  },
  "new-follower": {
    title: "CHUNC followed you",
    body: "Follow back and you are Trade partners.",
  },
  "room-flare": {
    title: "CHUNC is hunting Umbreon VMAX",
    body: "It just went up in your room. Check your binder.",
  },
} as const;

export type TestNoticeKind = keyof typeof TEST_NOTICES;

/**
 * Fires one sample notification at a player, through the real path.
 *
 * Recorded in the inbox and pushed to their phones exactly as the live
 * event would be, so a failure here is a failure that would have
 * happened for real. The dedupe key carries a fresh id, because the
 * whole point is being able to press it twice.
 *
 * Returns how many devices were reached, which is the number that
 * actually answers "why did my phone not buzz".
 */
export async function sendTestNotice(
  playerId: string,
  kind: TestNoticeKind,
): Promise<{ recorded: boolean; devices: number }> {
  if (!isSupabaseConfigured()) return { recorded: false, devices: 0 };

  const sample = TEST_NOTICES[kind];
  const path = "/profile";

  const { count } = await getSupabaseAdmin()
    .from("player_devices")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId);

  const id = await record({
    playerId,
    kind,
    title: sample.title,
    body: sample.body,
    url: path,
    dedupeKey: `test:${kind}:${playerId}:${crypto.randomUUID()}`,
  });

  if (id) await deliverByPush(playerId, sample.title, sample.body, path);

  return { recorded: id !== null, devices: count ?? 0 };
}

/** A player's email, for the delivery lanes that use one. */
async function playerEmail(playerId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data: player } = await admin
    .from("players")
    .select("user_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return null;
  const { data: user } = await admin.auth.admin.getUserById(player.user_id);
  return user?.user?.email ?? null;
}

/**
 * Somebody followed you.
 *
 * The social half of the product shipped silent: follows existed, and
 * nobody was ever told one had happened. Push and inbox only, no email
 * - a follow is a nice-to-know, and an inbox full of them would teach
 * players to ignore the lane that carries offers.
 *
 * The dedupe key is the pair, so unfollow-and-refollow does not become
 * a way to poke somebody repeatedly.
 */
export async function notifyNewFollower(
  followerId: string,
  followedId: string,
): Promise<void> {
  if (!isSupabaseConfigured() || followerId === followedId) return;

  try {
    const { data: follower } = await getSupabaseAdmin()
      .from("players")
      .select("display_name")
      .eq("id", followerId)
      .maybeSingle();

    const name = follower?.display_name ?? "A player";
    const title = `${name} followed you`;
    const body = "Follow back and you are Trade partners.";
    const path = `/p/${followerId}`;

    const id = await record({
      playerId: followedId,
      kind: "new-follower",
      title,
      body,
      url: path,
      dedupeKey: `follow:${followerId}:${followedId}`,
    });

    if (id) await deliverByPush(followedId, title, body, path);
  } catch (error) {
    console.error("Could not announce the new follower", error);
  }
}

/**
 * Somebody posted a Flare in a room you are standing in.
 *
 * The board updates the moment a card goes up, and nobody at a counter
 * is watching a board. This is the nudge that turns a posted card into
 * a conversation before either player leaves.
 *
 * Sent to every signed-in player in the room except the poster, push
 * and inbox only - a room can fill quickly, and email at that rate is
 * how a sender gets marked as spam. Never throws: the Flare is already
 * on the board.
 */
export async function notifyRoomFlare(
  eventId: string,
  posterSessionId: string,
  posterName: string,
  /**
   * Every card that went up in ONE posting action.
   *
   * A list rather than a card because a deck is one act. This used to
   * take a single id and be called once per Flare, so a player posting
   * thirty cards for a build sent thirty pushes to everybody in the
   * room — the founder's words: "I don't want all of those
   * notifications to show up as separate posts." One notice now, and
   * the count is the news.
   */
  cardIds: string[],
  intent: "want" | "showcase",
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = getSupabaseAdmin();

    /* The card's name is read here rather than passed in, so the app's
       route and the website's action cannot word the same event
       differently - and so no caller can put text of its own in a push. */
    const unique = [...new Set(cardIds)];
    if (unique.length === 0) return;

    const [{ data: event }, { data: participants }, { data: cards }] =
      await Promise.all([
        admin.from("events").select("join_code").eq("id", eventId).maybeSingle(),
        admin
          .from("event_participants")
          .select("player_session_id")
          .eq("event_id", eventId),
        /* Names are read here rather than passed in, so the app's route
           and the website's action cannot word the same event
           differently — and so no caller can put text of its own in a
           push. Only the first is needed, but reading one row and
           counting the rest would be two queries for one sentence. */
        admin.from("cards").select("exact_name").in("id", unique).limit(2),
      ]);

    if (!event?.join_code) return;
    const cardName = cards?.[0]?.exact_name ?? "a card";
    const count = unique.length;

    const sessionIds = (participants ?? [])
      .map((row) => row.player_session_id)
      .filter((id) => id !== posterSessionId);
    if (sessionIds.length === 0) return;

    const { data: sessions } = await admin
      .from("player_sessions")
      .select("player_id")
      .in("id", sessionIds);

    const recipients = new Set(
      (sessions ?? []).flatMap((row) => (row.player_id ? [row.player_id] : [])),
    );
    if (recipients.size === 0) return;

    /*
     * One card is named; a batch is counted. "Zach is hunting 24 cards"
     * is the whole news — naming one of twenty-four would suggest the
     * others matter less, and listing them will not fit in a push.
     */
    const subject = count === 1 ? cardName : `${count} cards`;

    const title =
      intent === "showcase"
        ? `${posterName} is letting go of ${subject}`
        : `${posterName} is hunting ${subject}`;
    const body =
      intent === "showcase"
        ? count === 1
          ? "It just went up in your room. Have a look before it goes."
          : "They just went up in your room. Have a look before they go."
        : count === 1
          ? "It just went up in your room. Check your binder."
          : "They just went up in your room. Check your binder.";
    const path = `/e/${event.join_code}`;

    /*
     * Keyed on the batch rather than the card, so posting a deck cannot
     * dedupe down to one card's worth of news, and re-running the same
     * post is still free.
     */
    const key = unique.slice().sort().join(",");

    for (const playerId of recipients) {
      const id = await record({
        playerId,
        kind: "room-flare",
        title,
        body,
        url: path,
        dedupeKey: `room-flare:${eventId}:${posterSessionId}:${key}:${playerId}`,
      });

      if (id) await deliverByPush(playerId, title, body, path);
    }
  } catch (error) {
    console.error("Could not tell the room about the Flare", error);
  }
}

/**
 * The requester confirmed a trade with you.
 *
 * Sent to the offer's responder — the requester tapped the button, so they
 * already know. The partner may have walked back to their table by then.
 */
export async function notifyTradeConfirmed(
  flareId: string,
  partnerSessionId: string,
  confirmerName: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const context = await flareContext(flareId);
    if (!context) return;

    const recipient = await notifiablePlayerForSession(partnerSessionId);
    if (!recipient) return;

    const title = `Trade confirmed: ${context.cardName}`;
    const body = `${confirmerName} marked your trade done. Good trade.`;
    const path = `/e/${context.code}`;

    const id = await record({
      playerId: recipient.playerId,
      kind: "trade-confirmed",
      title,
      body,
      url: path,
      dedupeKey: `trade:${flareId}:${partnerSessionId}`,
    });

    if (id) {
      await deliverByPush(recipient.playerId, title, body, path);
      if (recipient.email) {
        await deliverByEmail(id, recipient.email, title, body, path);
      }
    }
  } catch (error) {
    console.error("Could not notify the trade partner", error);
  }
}
