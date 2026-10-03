import "server-only";

import { formatEventMoment } from "@/lib/events/format";
import { listParticipants } from "@/lib/events/participants";
import { findEventById, findStoreById } from "@/lib/events/repository";
import { heldByCard, matchFor } from "@/lib/matching/schema";
import {
  notifyNightMatchForGoer,
  notifyNightMatchForHolder,
} from "@/lib/notifications/notify";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { instantToLocal } from "@/lib/time/zone";

/**
 * Night matches: who on the roster wants what you hold, and who holds
 * what you want, told before the night rather than at the table.
 *
 * The founder: "Matches ping you before the night." Two directions
 * when P says Going to night E:
 *
 * - P hears about the roster: how many of the other players going
 *   want a card on P's Have list. Once per day per night, so a roster
 *   that grows through the week keeps P posted without nagging.
 * - The roster hears about P: each player going whose Have list holds
 *   a card P wants, once per (night, P). Capped so a tournament of a
 *   hundred does not fan out a hundred pushes from one tap.
 *
 * The Have list is `player_cards` marked for local trade, which the
 * trade binders keep in step; wants are `player_wants`. Everything is
 * computed at read time, and the only state it leaves is the
 * notification rows. Nothing here throws: the seat is taken already.
 */

/** How many roster players one Going may ping. */
export const NIGHT_MATCH_ROSTER_CAP = 20;

type Held = { cardId: string; printingId: string | null };

export async function afterGoing(eventId: string, playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const event = await findEventById(eventId);
    if (!event) return;
    const store = await findStoreById(event.store_id);
    if (!store) return;

    /* The other accounts on the roster: a guest has nothing to match
       and nowhere to be told. */
    const roster = await listParticipants(eventId);
    const others = [
      ...new Set(
        roster.flatMap((row) =>
          row.playerId && row.playerId !== playerId ? [row.playerId] : [],
        ),
      ),
    ].slice(0, NIGHT_MATCH_ROSTER_CAP);
    if (others.length === 0) return;

    const everyone = [playerId, ...others];
    const admin = getSupabaseAdmin();

    /* Have lists hang off sessions; wants off accounts. One bridge
       query, then one read of each list for the whole roster. */
    const playerBySession = await sessionsForPlayers(everyone);
    const sessionIds = [...playerBySession.keys()];

    const [haves, wants] = await Promise.all([
      sessionIds.length > 0
        ? admin
            .from("player_cards")
            .select("player_session_id, card_id, printing_id")
            .in("player_session_id", sessionIds)
            .eq("local_trade", true)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("player_wants")
        .select("player_id, card_id, printing_id")
        .in("player_id", everyone),
    ]);
    if (haves.error || wants.error) {
      console.error("Could not read the night's lists", haves.error ?? wants.error);
      return;
    }

    const havesByPlayer = new Map<string, Held[]>();
    for (const row of haves.data ?? []) {
      const owner = playerBySession.get(row.player_session_id);
      if (!owner) continue;
      const list = havesByPlayer.get(owner) ?? [];
      list.push({ cardId: row.card_id, printingId: row.printing_id });
      havesByPlayer.set(owner, list);
    }
    const wantsByPlayer = new Map<string, Held[]>();
    for (const row of wants.data ?? []) {
      const list = wantsByPlayer.get(row.player_id) ?? [];
      list.push({ cardId: row.card_id, printingId: row.printing_id });
      wantsByPlayer.set(row.player_id, list);
    }

    const when = formatEventMoment(event.starts_at, store.timezone);
    const code = event.join_code ?? store.join_code;
    const day = instantToLocal(new Date(), store.timezone).slice(0, 10);

    /* P hears about the roster. */
    const goerHeld = heldByCard(havesByPlayer.get(playerId) ?? []);
    let hunting = 0;
    if (goerHeld.size > 0) {
      for (const other of others) {
        const theirWants = wantsByPlayer.get(other) ?? [];
        if (theirWants.some((want) => matchFor(want, goerHeld) !== null)) hunting += 1;
      }
    }
    if (hunting > 0) {
      await notifyNightMatchForGoer({
        playerId,
        eventId,
        eventName: event.name,
        storeName: store.name,
        when,
        code,
        count: hunting,
        day,
      });
    }

    /* The roster hears about P. */
    const goerWants = wantsByPlayer.get(playerId) ?? [];
    if (goerWants.length === 0) return;

    const hits: { holderId: string; cardId: string }[] = [];
    for (const other of others) {
      const held = heldByCard(havesByPlayer.get(other) ?? []);
      if (held.size === 0) continue;
      const hit = goerWants.find((want) => matchFor(want, held) !== null);
      if (hit) hits.push({ holderId: other, cardId: hit.cardId });
    }
    if (hits.length === 0) return;

    const [{ data: goer }, { data: cards }] = await Promise.all([
      admin.from("players").select("display_name").eq("id", playerId).maybeSingle(),
      admin
        .from("cards")
        .select("id, exact_name")
        .in("id", [...new Set(hits.map((hit) => hit.cardId))]),
    ]);
    const nameByCard = new Map((cards ?? []).map((card) => [card.id, card.exact_name]));
    const goerName = goer?.display_name ?? "A player";

    for (const hit of hits) {
      await notifyNightMatchForHolder({
        holderId: hit.holderId,
        goerId: playerId,
        goerName,
        cardName: nameByCard.get(hit.cardId) ?? "card",
        eventId,
        eventName: event.name,
        storeName: store.name,
        when,
        code,
      });
    }
  } catch (error) {
    console.error("Could not run the night matches", error);
  }
}
