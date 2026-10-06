import "server-only";

import { unreadCount } from "@/lib/notifications/inbox";
import { groupForKind } from "@/lib/notifications/push-prefs";
import { pushPrefsFor } from "@/lib/notifications/push-prefs-server";
import type { NotificationRow } from "@/lib/supabase/types";

import { sendEmail } from "@/lib/email/client";
import { collectionAvailability } from "@/lib/players/collection";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { avatarSrc } from "@/lib/players/profile-image";
import { storeHasFeature } from "@/lib/stores/ultra-access";
import { siteUrl } from "@/lib/site";
import { STORE_POST_NOTICES_PER_DAY } from "@/lib/stores/post-schema";

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

/**
 * The account behind a room session, or null for a guest.
 *
 * The actor on a notice: the responder who offered, the poster whose
 * card went up, the requester who confirmed. A guest has no profile
 * to lead with, so their notice keeps the kind's icon instead.
 */
async function playerIdForSession(sessionId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("player_id")
    .eq("id", sessionId)
    .maybeSingle();

  return data?.player_id ?? null;
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

  /*
   * A board Flare, or nothing to notify about.
   *
   * This whole path is the room's: somebody raised a hand on a board and
   * the poster's phone should say so. An area Flare has no board and no
   * hands to raise — it is answered by opening a thread, which sends its
   * own notice — so there is deliberately nothing here for one.
   */
  if (!flare.event_id || !flare.player_session_id) return null;

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
    | "room-flare"
    | "message-received"
    | "nearby-match"
    | "post-comment"
    | "store-post"
    | "night-match"
    | "night-reminder";
  title: string;
  body: string | null;
  url: string;
  dedupeKey: string;
  /**
   * The player who did it, when a person did. The inbox leads with
   * their face, the way Instagram's does, and the name in the title
   * is not enough for that: names change, and a title is prose.
   * Null for the notices nobody sends - a board opening at a store.
   */
  actorId: string | null;
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
      actor_id: entry.actorId,
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

/**
 * Who did it, for the push's picture: their name and an absolute link
 * to their uploaded picture. Null when nobody did it, or when they have
 * no picture, so a push only ever shows a real face.
 *
 * The still picture, never the animated one: a lock screen draws one
 * frame anyway, and a still is a fraction of the bytes for a phone to
 * fetch in the few seconds iOS gives it.
 */
export async function pushActor(
  actorId: string | null | undefined,
): Promise<{ name: string; avatar: string } | null> {
  if (!actorId) return null;
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("display_name, avatar_url")
    .eq("id", actorId)
    .maybeSingle();
  const path = avatarSrc(data?.avatar_url ?? null);
  if (!data || !path) return null;
  return { name: data.display_name, avatar: `${siteUrl()}${path}` };
}

async function deliverByPush(
  playerId: string,
  title: string,
  body: string | null,
  path: string,
  kind: NotificationRow["kind"],
  /** The player who did it, so the push can wear their face. */
  actorId: string | null = null,
): Promise<void> {
  const admin = getSupabaseAdmin();

  /* The account's switch for this kind of notice. Off means the Inbox
     keeps the notice and the phone stays quiet. */
  const prefs = await pushPrefsFor(playerId);
  if (!prefs[groupForKind(kind)]) return;

  const { data: devices, error } = await admin
    .from("player_devices")
    .select("id, push_token")
    .eq("player_id", playerId);

  if (error || !devices || devices.length === 0) return;

  /* The badge is the Inbox's unread count, so the icon's number and
     the Inbox agree; the notice this push carries is already in it. */
  const [badge, actor] = await Promise.all([
    unreadCount(playerId).catch(() => 0),
    pushActor(actorId).catch(() => null),
  ]);

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
          badge,
          /* Android 8 and later drops a push with no channel. The app
             creates "default" when it registers. */
          channelId: "default",
          /*
           * The sender's face. On iOS the app's notification service
           * extension (mobile/targets/notification-service) reads these
           * two fields and turns the push into a communication
           * notification: their picture large, the app's icon small in
           * the corner, the way Messages and Instagram look. It may
           * only touch a push marked mutable. A push with no actor, or
           * an actor with no picture, is delivered as it always was.
           */
          ...(actor ? { mutableContent: true } : {}),
          data: actor
            ? { url: path, actorName: actor.name, actorAvatar: actor.avatar }
            : { url: path },
        })),
      ),
      signal: AbortSignal.timeout(8_000),
    });

    const result = (await response.json().catch(() => null)) as {
      data?: { status: string; id?: string; details?: { error?: string } }[];
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

    /* A ticket per accepted send. "DeviceNotRegistered" for a phone
       that deleted the app arrives in the RECEIPT, read later by the
       push-receipts cron, which is where the token is pruned. */
    const tickets = devices.flatMap((device, index) => {
      const ticket = result?.data?.[index];
      return ticket?.status === "ok" && ticket.id
        ? [{ ticket_id: ticket.id, device_id: device.id }]
        : [];
    });
    if (tickets.length > 0) {
      const { error: ticketError } = await admin.from("push_tickets").insert(tickets);
      if (ticketError) console.error("Could not keep the push tickets", ticketError);
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
        cardflare tells you when something needs you in a room. You got this
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
  /** Several cards in one offer: the notice counts them, once. */
  batch: { count: number } = { count: 1 },
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const context = await flareContext(flareId);
    if (!context) return;

    const [recipient, actorId] = await Promise.all([
      notifiablePlayerForSession(context.ownerSessionId),
      playerIdForSession(responderSessionId),
    ]);
    if (!recipient) return;

    /*
     * The wording follows the card, not the button. On a Flare the
     * responder HAS what the owner needs; on a showcase the owner has
     * it and the responder WANTS it. One sentence for each, because
     * "Kaito has your Perona" sent to the person holding Perona reads
     * as nonsense.
     */
    /*
     * Several cards, one sentence. The founder: "CHUNC has 4 of the
     * cards you're looking for", as one message, not four. The same
     * problem posting several cards in one Flare solved on the way in.
     */
    const title =
      batch.count > 1
        ? context.intent === "showcase"
          ? `${responderName} wants ${batch.count} of your cards`
          : `${responderName} has ${batch.count} of the cards you're looking for`
        : context.intent === "showcase"
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
      actorId,
    });

    if (id) {
      await deliverByPush(
        recipient.playerId,
        title,
        body,
        path,
        "offer-received",
        actorId,
      );
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
    /* The push to a store's regulars is part of its Ultra. */
    if (!(await storeHasFeature(event.store_id, "earlyBoardPush"))) return;

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
        actorId: null,
        title,
        body,
        url: path,
        dedupeKey: `early-board:${eventId}:${saver.player_id}`,
      });

      if (id) {
        await deliverByPush(saver.player_id, title, body, path, "early-board");

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
    const actorId = await playerIdForSession(context.ownerSessionId);

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
        actorId,
      });

      if (id) {
        await deliverByPush(
          recipient.playerId,
          title,
          body,
          path,
          "offer-received",
          actorId,
        );
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
          ? `You are looking for ${count} ${count === 1 ? "card" : "cards"}. RSVP and ${count === 1 ? "it goes" : "they go"} up for ${day}.`
          : `Post what you are looking for and see who is coming ${day}.`;

      const id = await record({
        playerId: saver.player_id,
        kind: "board-open",
        actorId: null,
        title,
        body,
        url: path,
        dedupeKey: `board-open:${eventId}:${saver.player_id}`,
      });

      if (id) await deliverByPush(saver.player_id, title, body, path, "board-open");
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
    title: "Kaito has your Charizard",
    body: "They said: “I have the reverse holo, meet at table 4”",
  },
  "trade-confirmed": {
    title: "Trade confirmed: Charizard",
    body: "Kaito marked your trade done. Good trade.",
  },
  "board-open": {
    title: "The board is open: Friday Locals at Card Cavern",
    body: "You are looking for 5 cards. RSVP and they go up for Friday.",
  },
  "early-board": {
    title: "The Friday Locals board is open at Card Cavern",
    body: "12 cards are already wanted for Friday, and you own 3 of them. Bring the binder.",
  },
  "new-follower": {
    title: "Kaito followed you",
    body: "Follow back and you're trade partners.",
  },
  "room-flare": {
    title: "Kaito is looking for Umbreon VMAX",
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
    /* No actor. The recipient used to stand in for the sample's trader,
       which put the admin's own face on a row saying somebody had their
       card, and the audit read it as a notice from themselves. Kaito is
       nobody, so the row leads with the bell instead. */
    actorId: null,
  });

  /* The push wears the admin's own face, so one tap proves the picture
     path end to end; the Inbox row keeps no actor (see above). */
  if (id) {
    await deliverByPush(
      playerId,
      sample.title,
      sample.body,
      path,
      "board-open",
      playerId,
    );
  }

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
    /*
     * "Follow back" is wrong advice to somebody who followed first: this
     * follow IS the follow back, and the pair are partners now. The audit
     * had exactly that row in its inbox. One query says which it is.
     */
    const { count: alreadyFollowing } = await getSupabaseAdmin()
      .from("player_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", followedId)
      .eq("followed_id", followerId);
    const body =
      (alreadyFollowing ?? 0) > 0
        ? "You follow each other now, so you're trade partners."
        : "Follow back and you're trade partners.";
    const path = `/p/${followerId}`;

    const id = await record({
      playerId: followedId,
      kind: "new-follower",
      title,
      body,
      url: path,
      dedupeKey: `follow:${followerId}:${followedId}`,
      actorId: followerId,
    });

    if (id)
      await deliverByPush(followedId, title, body, path, "new-follower", followerId);
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

    const [{ data: event }, { data: participants }, { data: cards }, actorId] =
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
        playerIdForSession(posterSessionId),
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
     * One card is named; a batch is counted. "Zach is looking for 24 cards"
     * is the whole news — naming one of twenty-four would suggest the
     * others matter less, and listing them will not fit in a push.
     */
    const subject = count === 1 ? cardName : `${count} cards`;

    const title =
      intent === "showcase"
        ? `${posterName} is offering ${subject}`
        : `${posterName} is looking for ${subject}`;
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

    /* Ten at a time rather than one after another: a full room is a
       hundred people, and a hundred sequential inserts and pushes is
       the difference between "instant" and "a minute later". */
    const everyone = [...recipients];
    for (let at = 0; at < everyone.length; at += 10) {
      await Promise.all(
        everyone.slice(at, at + 10).map(async (playerId) => {
          const id = await record({
            playerId,
            kind: "room-flare",
            title,
            body,
            url: path,
            dedupeKey: `room-flare:${eventId}:${posterSessionId}:${key}:${playerId}`,
            actorId,
          });

          if (id)
            await deliverByPush(playerId, title, body, path, "room-flare", actorId);
        }),
      );
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

    /* Only the requester can confirm, and the requester owns the Flare:
       the face on this notice is the Flare's owner. */
    const [recipient, actorId] = await Promise.all([
      notifiablePlayerForSession(partnerSessionId),
      playerIdForSession(context.ownerSessionId),
    ]);
    if (!recipient) return;

    /* The second hand: the partner is asked, not told. Their tap in the
       room is what pays both sides. */
    const title = `${confirmerName} says you traded ${context.cardName}. Did you?`;
    const body = "Tap Yes in the room and you both earn Embers.";
    const path = `/e/${context.code}`;

    const id = await record({
      playerId: recipient.playerId,
      kind: "trade-confirmed",
      title,
      body,
      url: path,
      dedupeKey: `trade:${flareId}:${partnerSessionId}`,
      actorId,
    });

    if (id) {
      await deliverByPush(
        recipient.playerId,
        title,
        body,
        path,
        "trade-confirmed",
        actorId,
      );
      if (recipient.email) {
        await deliverByEmail(id, recipient.email, title, body, path);
      }
    }
  } catch (error) {
    console.error("Could not notify the trade partner", error);
  }
}

/**
 * A message landed in a Flare thread — the Local tab's conversations.
 *
 * ONE NOTICE PER THREAD PER SITTING, not one per message. The dedupe
 * key is thread + recipient, so the first unread message rings and the
 * rest of the burst arrives silently behind it; reading the thread
 * deletes the notice (see readThread), which is what lets the NEXT
 * message ring again. A conversation should interrupt somebody once,
 * not once per sentence.
 *
 * Push and inbox, no email: messages move at chat speed, and chat over
 * email is how a sender gets marked as spam.
 */
export async function notifyMessageReceived(
  threadId: string,
  senderId: string,
  recipientId: string,
  body: string,
  context?: { flareCardId?: string },
): Promise<void> {
  if (!isSupabaseConfigured() || senderId === recipientId) return;

  try {
    const admin = getSupabaseAdmin();

    const [{ data: sender }, card] = await Promise.all([
      admin.from("players").select("display_name").eq("id", senderId).maybeSingle(),
      context?.flareCardId
        ? admin
            .from("cards")
            .select("exact_name")
            .eq("id", context.flareCardId)
            .maybeSingle()
            .then((result) => result.data)
        : Promise.resolve(null),
    ]);

    const name = sender?.display_name ?? "A player";
    const title = card?.exact_name
      ? `${name} messaged about ${card.exact_name}`
      : `${name} sent a message`;
    const preview = body.length > 120 ? `${body.slice(0, 119)}…` : body;
    /* The thread itself, not the list: a tap lands in the conversation. */
    const path = `/local?thread=${encodeURIComponent(threadId)}`;

    const id = await record({
      playerId: recipientId,
      kind: "message-received",
      title,
      body: preview,
      url: path,
      dedupeKey: `message:${threadId}:${recipientId}`,
      actorId: senderId,
    });

    if (id)
      await deliverByPush(
        recipientId,
        title,
        preview,
        path,
        "message-received",
        senderId,
      );
  } catch (error) {
    console.error("Could not announce the message", error);
  }
}

/**
 * Somebody wrote under your Flare post.
 *
 * Once per commenter per post: the first line from a person buzzes,
 * the rest of their thoughts wait in the thread. Offers made from the
 * Feed do not come through here - the room's own "has your card"
 * notice already covers that tap.
 */
export async function notifyPostComment(
  postId: string,
  authorId: string,
  commenterId: string,
  commenterName: string,
  body: string,
): Promise<void> {
  if (!isSupabaseConfigured() || authorId === commenterId) return;

  try {
    const title = `${commenterName} commented on your Flare`;
    const preview = body.length > 120 ? `${body.slice(0, 119)}…` : body;
    const path = "/feed";

    const id = await record({
      playerId: authorId,
      kind: "post-comment",
      title,
      body: preview,
      url: path,
      dedupeKey: `post-comment:${postId}:${commenterId}`,
      actorId: commenterId,
    });

    if (id)
      await deliverByPush(authorId, title, preview, path, "post-comment", commenterId);
  } catch (error) {
    console.error("Could not announce the comment", error);
  }
}

/**
 * "Tyler is looking for your OP17 Shanks", to the HOLDER only.
 *
 * Nearby matching's one notice. The wanter hears nothing until the
 * holder answers, which keeps the room's oldest rule: a binder is never
 * broadcast, and a holder chooses to be found. The dedupe key is the
 * pair of rows, so one want and one card tell one person once however
 * often either side re-saves.
 */
export async function notifyNearbyMatch(match: {
  holderId: string;
  /** "want:<id>" or "flare:<id>": the ask this answers. */
  askKey: string;
  haveEntryId: string;
  /** The wanter, whose face leads the inbox row. */
  wanterId: string;
  wanterName: string;
  cardName: string;
  milesLabel: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const title = `${match.wanterName} is looking for your ${match.cardName}`;
    const body = `${match.milesLabel}. Tap to say you have it.`;
    const path = "/feed";

    const id = await record({
      playerId: match.holderId,
      kind: "nearby-match",
      title,
      body,
      url: path,
      dedupeKey: `nearby:${match.askKey}:${match.haveEntryId}`,
      actorId: match.wanterId,
    });

    if (id)
      await deliverByPush(
        match.holderId,
        title,
        body,
        path,
        "nearby-match",
        match.wanterId,
      );
  } catch (error) {
    console.error("Could not notify the nearby match", error);
  }
}

/**
 * Night matches, the goer's side: somebody going to the same night
 * wants a card on your Have list. Counted rather than named, once a
 * day per night, because a roster grows all week and the point is to
 * open the room and look. Nobody did this, so no actor.
 */
export async function notifyNightMatchForGoer(entry: {
  playerId: string;
  eventId: string;
  eventName: string;
  storeName: string;
  /** `formatEventMoment` in the store's zone. */
  when: string;
  /** The room's code, or the store's for a room with none of its own. */
  code: string;
  count: number;
  /** YYYY-MM-DD in the store's zone: the once-a-day key. */
  day: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const n = entry.count;
    const title = `${n} ${n === 1 ? "person" : "people"} going to ${entry.eventName} ${n === 1 ? "is" : "are"} hunting cards in your binder`;
    const body = `${entry.storeName} · ${entry.when}. Open the room to see who.`;
    const path = `/e/${entry.code}`;

    const id = await record({
      playerId: entry.playerId,
      kind: "night-match",
      title,
      body,
      url: path,
      dedupeKey: `night:${entry.eventId}:${entry.playerId}:${entry.day}`,
      actorId: null,
    });

    if (id) await deliverByPush(entry.playerId, title, body, path, "night-match");
  } catch (error) {
    console.error("Could not notify the goer's night matches", error);
  }
}

/** The reminder's words, pure so a test can read them without a database. */
export function nightReminderCopy(entry: {
  eventName: string;
  storeName: string;
  when: string;
  matches: number;
  bring: number;
}): { title: string; body: string } {
  const title = `${entry.eventName} is today at ${entry.storeName}`;
  if (entry.matches === 0) {
    return {
      title,
      body: `${entry.when}. Nothing matched yet. Post a Flare so people know what to bring.`,
    };
  }
  const matches = `${entry.matches} ${entry.matches === 1 ? "match" : "matches"} on the board`;
  const bring =
    entry.bring > 0
      ? `, ${entry.bring} ${entry.bring === 1 ? "card" : "cards"} to bring`
      : "";
  return { title, body: `${entry.when}. ${matches}${bring}.` };
}

/**
 * The reminder on the day: once per night per player who said Going,
 * sent by the daily cron in the hours before doors, with the two
 * numbers that decide what goes in the bag. Nobody did this, so no
 * actor; the dedupe key makes a second run of the cron free.
 */
export async function notifyNightReminder(entry: {
  playerId: string;
  eventId: string;
  eventName: string;
  storeName: string;
  /** `formatEventMoment` in the store's zone. */
  when: string;
  code: string;
  matches: number;
  bring: number;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const { title, body } = nightReminderCopy(entry);
    const path = `/e/${entry.code}`;

    const id = await record({
      playerId: entry.playerId,
      kind: "night-reminder",
      title,
      body,
      url: path,
      dedupeKey: `reminder:${entry.eventId}:${entry.playerId}`,
      actorId: null,
    });

    if (id) await deliverByPush(entry.playerId, title, body, path, "night-reminder");
    return id !== null;
  } catch (error) {
    console.error("Could not send the night reminder", error);
    return false;
  }
}

/**
 * Night matches, the roster's side: somebody just said Going and wants
 * a card you hold. Once per (night, goer), with the goer's face on it.
 */
export async function notifyNightMatchForHolder(entry: {
  holderId: string;
  goerId: string;
  goerName: string;
  cardName: string;
  eventId: string;
  eventName: string;
  storeName: string;
  when: string;
  code: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const title = `${entry.goerName} is going to ${entry.eventName} and wants your ${entry.cardName}`;
    const body = `${entry.storeName} · ${entry.when}. Tap to see the board.`;
    const path = `/e/${entry.code}`;

    const id = await record({
      playerId: entry.holderId,
      kind: "night-match",
      title,
      body,
      url: path,
      dedupeKey: `night:${entry.eventId}:${entry.holderId}:${entry.goerId}`,
      actorId: entry.goerId,
    });

    if (id)
      await deliverByPush(
        entry.holderId,
        title,
        body,
        path,
        "night-match",
        entry.goerId,
      );
  } catch (error) {
    console.error("Could not notify the holder's night match", error);
  }
}

/**
 * The partner said yes: the author hears the trade is confirmed. Both
 * sides are paid by then, so this can say so.
 */
export async function notifyTradeAcknowledged(
  flareId: string,
  requesterSessionId: string,
  partnerName: string,
  partnerSessionId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const context = await flareContext(flareId);
    if (!context) return;

    const [recipient, actorId] = await Promise.all([
      notifiablePlayerForSession(requesterSessionId),
      playerIdForSession(partnerSessionId),
    ]);
    if (!recipient) return;

    const title = `Trade confirmed: ${context.cardName}`;
    const body = `${partnerName} confirmed it. You both earned Embers.`;
    const path = `/e/${context.code}`;

    const id = await record({
      playerId: recipient.playerId,
      kind: "trade-confirmed",
      title,
      body,
      url: path,
      dedupeKey: `trade-ack:${flareId}:${requesterSessionId}`,
      actorId,
    });

    if (id)
      await deliverByPush(
        recipient.playerId,
        title,
        body,
        path,
        "trade-confirmed",
        actorId,
      );
  } catch (error) {
    console.error("Could not notify the trade's author", error);
  }
}

/**
 * "We traded", said in a conversation, and the answer to it.
 *
 * Three moments, one voice. The person on the other end is asked, not
 * told ("did you?"); the one who said it hears whether the other side
 * agreed. Push and inbox, no email, at chat speed like the messages
 * around it. Recorded under the trade kind the room's notices use.
 */
export async function notifyThreadTrade(
  threadId: string,
  tradeId: string,
  actorId: string,
  recipientId: string,
  moment: "proposed" | "confirmed" | "declined",
): Promise<void> {
  if (!isSupabaseConfigured() || actorId === recipientId) return;

  try {
    const admin = getSupabaseAdmin();
    const [{ data: actor }, { data: trade }] = await Promise.all([
      admin.from("players").select("display_name").eq("id", actorId).maybeSingle(),
      admin.from("trades").select("card_id").eq("id", tradeId).maybeSingle(),
    ]);
    const { data: card } = trade
      ? await admin
          .from("cards")
          .select("exact_name")
          .eq("id", trade.card_id)
          .maybeSingle()
      : { data: null };

    const name = actor?.display_name ?? "A player";
    const cardName = card?.exact_name ?? "a card";
    const title =
      moment === "proposed"
        ? `${name} says you traded ${cardName}. Did you?`
        : moment === "confirmed"
          ? `Trade confirmed: ${cardName}`
          : `${name} said that trade did not happen`;
    const body =
      moment === "proposed"
        ? "Tap Yes in the conversation and you both earn Embers."
        : moment === "confirmed"
          ? `${name} confirmed it. You both earned Embers.`
          : "It will not count. Talk it over in the conversation.";
    const path = "/local";

    const id = await record({
      playerId: recipientId,
      kind: "trade-confirmed",
      title,
      body,
      url: path,
      dedupeKey: `thread-trade:${tradeId}:${moment}:${recipientId}`,
      actorId,
    });

    if (id)
      await deliverByPush(recipientId, title, body, path, "trade-confirmed", actorId);
  } catch (error) {
    console.error("Could not announce the conversation's trade", error);
  }
}

/**
 * A store you follow posted an update.
 *
 * The founder: "a store announcing 'OP-12 prerelease Saturday, 20
 * seats' as a Flare-shaped post to its followers. This is the thing
 * that makes following worth it." So a follow earns a push: the
 * store's name in the title, the post's own title as the body, and
 * the store's page one tap away.
 *
 * Sent to every follower (a `player_locals` row) except the store's
 * own staff, who wrote it. Push and inbox only, no email - a shop that
 * posts on Tuesday and Thursday would train an inbox to ignore it.
 * And capped: after the second post of a day the rest post quietly,
 * so a store cannot buzz its followers ten times before lunch.
 *
 * Recorded under the board-open kind, the one notice that is already
 * "from the store, with nobody behind it" - the inbox leads it with
 * the storefront. The kinds are a check constraint in the database,
 * and this round ships no migration; a kind of its own is a one-line
 * migration when the founder wants the inbox to tell the two apart.
 */
export async function notifyStorePost(
  storeId: string,
  postId: string,
  postTitle: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = getSupabaseAdmin();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: store }, { count: today }, { data: locals }, { data: staff }] =
      await Promise.all([
        admin.from("stores").select("name").eq("id", storeId).maybeSingle(),
        admin
          .from("store_posts")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId)
          .gte("published_at", dayAgo),
        admin.from("player_locals").select("player_id").eq("store_id", storeId),
        admin.from("store_members").select("user_id").eq("store_id", storeId),
      ]);

    if (!store) return;
    /* This post is already counted: the third of the day posts quietly. */
    if ((today ?? 0) > STORE_POST_NOTICES_PER_DAY) return;

    const followers = new Set((locals ?? []).map((row) => row.player_id));
    if (followers.size === 0) return;

    const staffUsers = (staff ?? []).map((row) => row.user_id);
    if (staffUsers.length > 0) {
      const { data: staffPlayers } = await admin
        .from("players")
        .select("id")
        .in("user_id", staffUsers);
      for (const row of staffPlayers ?? []) followers.delete(row.id);
    }
    if (followers.size === 0) return;

    const title = `${store.name} posted an update`;
    const body = postTitle.length > 120 ? `${postTitle.slice(0, 119)}…` : postTitle;
    const path = `/s/${storeId}`;

    const everyone = [...followers];
    for (let at = 0; at < everyone.length; at += 10) {
      await Promise.all(
        everyone.slice(at, at + 10).map(async (playerId) => {
          const id = await record({
            playerId,
            kind: "store-post",
            title,
            body,
            url: path,
            dedupeKey: `store-post:${postId}:${playerId}`,
            actorId: null,
          });

          if (id) await deliverByPush(playerId, title, body, path, "store-post");
        }),
      );
    }
  } catch (error) {
    console.error("Could not tell the followers about the store post", error);
  }
}
