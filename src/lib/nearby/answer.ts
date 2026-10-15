import "server-only";

import { binderSessionFor } from "@/lib/lists/haves";
import { avatarPathFor, avatarSrc } from "@/lib/players/profile-image";
import { blockedBetween } from "@/lib/players/safety";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { setLocalTrade } from "@/lib/lists/repository";
import {
  openFlareThread,
  openWantThread,
  type OpenThreadOptions,
} from "@/lib/local/threads";

import { askIsLive, pruneStaleNearbyNotices, type Ask } from "./live";
import { ANSWER_GONE } from "./shared";

/**
 * Answering somebody on "Wanted near you", for the app's route and the
 * website's action alike: the holder's own words (the draft, edited or
 * not), sent only now, and only while the ask still stands. A Flare
 * taken down a minute ago does not get a conversation opened on it.
 */
export async function answerNearby(
  playerId: string,
  ask: Ask,
  body: string,
  options: OpenThreadOptions,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  if (!(await askIsLive(ask))) return { ok: false, message: ANSWER_GONE };

  const outcome =
    ask.kind === "want"
      ? await openWantThread(ask.id, playerId, body, options)
      : await openFlareThread(ask.id, playerId, body, options);
  if (outcome.ok) return outcome;

  return {
    ok: false,
    message:
      outcome.reason === "not-found"
        ? ANSWER_GONE
        : outcome.reason === "closed"
          ? "You can't message this player."
          : outcome.reason === "yourself"
            ? "That one is yours."
            : outcome.reason === "empty"
              ? "Write something first."
              : outcome.reason === "rate-limited"
                ? "That is a lot of conversations at once. Give it a minute."
                : "Could not send that. Try again in a moment.",
  };
}

/**
 * Who a new message would go to, and which card it is about: what the
 * website's "new message" page draws before anything is sent. Null for
 * an ask that is gone, the viewer's own, a guest's (nobody to write
 * to), or one with a block between the two - the page says nothing it
 * would refuse to send.
 */
export async function askPreview(
  viewerId: string,
  ask: Ask,
): Promise<{
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  cardName: string;
  imageUrl: string | null;
} | null> {
  if (!(await askIsLive(ask))) return null;
  const admin = getSupabaseAdmin();

  let posterId: string | null = null;
  let cardId: string | null = null;
  let printingId: string | null = null;
  if (ask.kind === "want") {
    const { data } = await admin
      .from("player_wants")
      .select("player_id, card_id, printing_id")
      .eq("id", ask.id)
      .maybeSingle();
    posterId = data?.player_id ?? null;
    cardId = data?.card_id ?? null;
    printingId = data?.printing_id ?? null;
  } else {
    const { data } = await admin
      .from("flares")
      .select("player_id, player_session_id, card_id, printing_id")
      .eq("id", ask.id)
      .maybeSingle();
    posterId = data?.player_id ?? null;
    if (!posterId && data?.player_session_id) {
      const { data: session } = await admin
        .from("player_sessions")
        .select("player_id")
        .eq("id", data.player_session_id)
        .maybeSingle();
      posterId = session?.player_id ?? null;
    }
    cardId = data?.card_id ?? null;
    printingId = data?.printing_id ?? null;
  }
  if (!posterId || !cardId || posterId === viewerId) return null;
  if (await blockedBetween(viewerId, posterId)) return null;

  const [{ data: poster }, { data: card }, { data: printings }] = await Promise.all([
    admin
      .from("players")
      .select(
        "id, display_name, avatar_url, avatar_animated, tier, equipped_avatar_frame",
      )
      .eq("id", posterId)
      .maybeSingle(),
    admin.from("cards").select("exact_name").eq("id", cardId).maybeSingle(),
    admin
      .from("card_printings")
      .select("id, image_url")
      .eq("card_id", cardId)
      .not("image_url", "is", null),
  ]);
  if (!poster || !card) return null;
  const art =
    (printingId && printings?.find((row) => row.id === printingId)?.image_url) ||
    printings?.[0]?.image_url ||
    null;

  return {
    playerId: poster.id,
    displayName: poster.display_name,
    avatarUrl: avatarSrc(avatarPathFor(poster)),
    cardName: card.exact_name,
    imageUrl: art,
  };
}

/**
 * "Not trading this anymore": takes one card off Trade locally, so its
 * whole section leaves "Wanted near you" and its notices leave the
 * Inbox. The honest way to say "stop showing me this" - the card is no
 * longer offered, rather than the people being hidden.
 */
export async function stopTrading(
  playerId: string,
  displayName: string,
  haveEntryId: string,
): Promise<boolean> {
  const session = await binderSessionFor(playerId, displayName, false);
  if (!session) return false;
  const saved = await setLocalTrade(haveEntryId, session.id, false);
  if (saved) await pruneStaleNearbyNotices(playerId);
  return saved;
}
