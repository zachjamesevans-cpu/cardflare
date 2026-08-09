import "server-only";

import { sendEmail } from "@/lib/email/client";
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
async function flareContext(
  flareId: string,
): Promise<{ ownerSessionId: string; cardName: string; code: string } | null> {
  const admin = getSupabaseAdmin();

  const { data: flare } = await admin
    .from("flares")
    .select("player_session_id, card_id, event_id")
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
  kind: "offer-received" | "trade-confirmed";
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

    const title = `${responderName} has your ${context.cardName}`;
    const body = message
      ? `They said: “${message}”`
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
