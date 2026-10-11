import "server-only";

import { cardResultsByIds } from "@/lib/cards/search";
import { avatarSrc } from "@/lib/players/profile-image";
import { upcomingFor } from "@/lib/stores/public-profile";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { IdleCard, IdleInfo, IdleNight, IdlePanel, IdlePost } from "./idle-rules";

export type { IdleCard, IdleInfo, IdleNight, IdlePost };

/**
 * What FlareCast's idle screen rotates through, for one store.
 *
 * Fetched every five minutes, apart from the screen's own poll, so the
 * thirty-second check stays light: these change over days, not seconds.
 *
 * What it carries, and what it never does, follows the wall's rules
 * (display-payload.ts): cards and counts, never a person's name or id,
 * never a price, and never what anybody is letting go of.
 */

export const NO_IDLE_INFO: IdleInfo = { nights: [], wanted: [], trades: 0, post: null };

const DAY_MS = 24 * 60 * 60 * 1000;
/** "Wanted here this week". */
const WANTED_DAYS = 7;
/** The trades line counts this far back. */
const TRADE_DAYS = 30;
/** A post older than this is not news any more. */
const POST_DAYS = 14;
/** The most cards the wanted panel shows. */
const WANTED_LIMIT = 8;

/** The idle panels' contents, only for the panels the store chose. */
export async function idleInfo(
  store: { id: string; timezone: string; early_board_hours: number },
  panels: readonly IdlePanel[],
): Promise<IdleInfo> {
  if (!isSupabaseConfigured() || panels.length === 0) return NO_IDLE_INFO;
  const admin = getSupabaseAdmin();
  const now = Date.now();
  const want = (panel: IdlePanel) => panels.includes(panel);

  /* The store's rooms in the last month: what both the wanted panel and
     the trades line are counted over. */
  const eventIds =
    want("wanted") || want("trades")
      ? await admin
          .from("events")
          .select("id, starts_at")
          .eq("store_id", store.id)
          .gte("starts_at", new Date(now - TRADE_DAYS * DAY_MS).toISOString())
          .then(({ data }) => data ?? [])
      : [];
  const weekIds = eventIds
    .filter((row) => new Date(row.starts_at).getTime() >= now - WANTED_DAYS * DAY_MS)
    .map((row) => row.id);
  const monthIds = eventIds.map((row) => row.id);

  const [nights, wanted, trades, post] = await Promise.all([
    want("nights")
      ? upcomingFor(store.id, store.early_board_hours, store.timezone, null).then(
          (list) =>
            list.map((night) => ({
              name: night.name,
              startsAt: night.startsAt,
              live: night.live,
              flaresOpen: night.phase === "live" || night.phase === "early",
              going: night.goingCount,
            })),
        )
      : Promise.resolve([] as IdleNight[]),
    want("wanted") ? wantedCards(weekIds) : Promise.resolve([] as IdleCard[]),
    want("trades") && monthIds.length > 0
      ? admin
          .from("trades")
          .select("id", { count: "exact", head: true })
          .in("event_id", monthIds)
          .is("disputed_by", null)
          .then(({ count }) => count ?? 0)
      : Promise.resolve(0),
    want("posts") ? latestPost(store.id, now) : Promise.resolve(null),
  ]);

  return { nights, wanted, trades, post };
}

/**
 * The cards most asked for in these rooms, by how many different people
 * asked. Wants only, and cancelled ones left out; one person asking for
 * four copies is still one person.
 */
async function wantedCards(eventIds: string[]): Promise<IdleCard[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("flares")
    .select("card_id, player_id, player_session_id")
    .in("event_id", eventIds)
    .eq("intent", "want")
    .neq("status", "cancelled")
    .limit(2000);
  if (error) {
    console.error("Could not read the idle screen's wanted cards", error);
    return [];
  }

  const askers = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const who = row.player_id ?? row.player_session_id;
    if (!who) continue;
    const set = askers.get(row.card_id) ?? new Set<string>();
    set.add(who);
    askers.set(row.card_id, set);
  }
  const top = [...askers.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, WANTED_LIMIT);
  if (top.length === 0) return [];

  const cards = new Map(
    (await cardResultsByIds(top.map(([cardId]) => cardId))).map((card) => [
      card.id,
      card,
    ]),
  );
  return top.flatMap(([cardId, people]) => {
    const card = cards.get(cardId);
    if (!card) return [];
    return [
      {
        cardId,
        cardName: card.exactName,
        cardNumber: card.canonicalCardNumber,
        imageUrl:
          card.printings.find((printing) => printing.imageUrl)?.imageUrl ?? null,
        people: people.size,
      },
    ];
  });
}

/** The store's newest post from the last fortnight, if it has one. */
async function latestPost(storeId: string, now: number): Promise<IdlePost | null> {
  const { data } = await getSupabaseAdmin()
    .from("store_posts")
    .select("title, body, image, published_at")
    .eq("store_id", storeId)
    .is("archived_at", null)
    .gte("published_at", new Date(now - POST_DAYS * DAY_MS).toISOString())
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    title: data.title,
    body: data.body,
    imageUrl: avatarSrc(data.image),
    publishedAt: data.published_at,
  };
}
