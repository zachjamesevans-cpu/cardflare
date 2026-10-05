import "server-only";

import { goingStates } from "@/lib/events/going";
import type { NightPhase } from "@/lib/events/nights";
import { roomPhase } from "@/lib/events/schema";
import type { GameSlug } from "@/lib/players/games-catalog";
import { avatarSrc } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { caseFor } from "@/lib/stores/case";
import type { CasePick } from "@/lib/stores/case-schema";
import { parseHours, type StoreHours } from "@/lib/stores/hours";
import { storeGamesFrom } from "@/lib/stores/page";

/**
 * A store as a player may see it.
 *
 * The shape is the privacy boundary: no coordinates, no contact email, no
 * provenance beyond the attribution line the licence requires. Everything
 * here is either the shop's own public contact information or something
 * cardflare decided (verified, tier).
 *
 * A DRAFT LISTING IS NOT VISIBLE. An imported candidate nobody approved
 * returns null and the page 404s, which keeps "nothing is published
 * without admin approval" true at the last hop as well as the first.
 */
export interface PublicStore {
  storeId: string;
  name: string;
  city: string | null;
  region: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  verified: boolean;
  ultra: boolean;
  /** One of the ten Founding Stores: wears the mark on its page. */
  founding: boolean;
  unclaimed: boolean;
  /**
   * What the store says about itself, or null. Only a claimed store can
   * have written one - the console's page form is behind ownership - so
   * an unclaimed listing stays factual by construction.
   */
  description: string | null;
  /** The line the source licence requires, when the record came from one. */
  attribution: string | null;
  /**
   * The store's own pictures, as `/api/avatars/...` paths the website
   * draws directly; the app's route makes them absolute. Only a
   * claimed store can have uploaded one, so an unclaimed listing has
   * none by construction, the same way it has no description.
   */
  logoUrl: string | null;
  coverUrl: string | null;
  /** Seven days, Sunday first, or null while the shop has not said. */
  hours: StoreHours | null;
  games: GameSlug[];
  /** The zone the hours are read in, so "open now" is the shop's now. */
  timeZone: string;
  /** Up to six cards from the synced singles, chosen by hand. */
  casePicks: CasePick[];
  /**
   * The next nights on the calendar, soonest first, so a player
   * deciding whether to walk in can see when. Three at most; a night
   * that is running now is the first of them.
   */
  upcoming: UpcomingNight[];
}

export interface UpcomingNight {
  eventId: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  joinCode: string | null;
  /** Running right now. */
  live: boolean;
  /**
   * When the board opens before doors, for a store that opens it
   * early; null when the board opens with the night. The store page
   * says so, so a player knows they can post before they arrive.
   */
  boardOpensAt: string | null;
  /** Who has said Going, and whether the viewer has. */
  goingCount: number;
  youGoing: boolean;
  /**
   * Where the night stands for the Going button: live, early (board
   * open ahead of doors) or upcoming (posted, not yet in the window).
   * Null once the start has passed without the store opening it.
   */
  phase: NightPhase | null;
}

async function upcomingFor(
  storeId: string,
  earlyBoardHours: number,
  timeZone: string,
  viewerId: string | null,
): Promise<UpcomingNight[]> {
  const now = Date.now();
  const since = new Date(now - 4 * 60 * 60 * 1000).toISOString();
  const { data } = await getSupabaseAdmin()
    .from("events")
    .select("id, name, starts_at, ends_at, join_code, status, cancelled_at")
    .eq("store_id", storeId)
    .eq("kind", "scheduled")
    .neq("status", "closed")
    .gte("starts_at", since)
    .order("starts_at")
    .limit(3);

  const rows = (data ?? []).filter((row) => !row.cancelled_at);
  const going = await goingStates(
    rows.map((row) => row.id),
    viewerId,
  );

  return rows.map((row) => {
    const phase = roomPhase(
      {
        kind: "scheduled",
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        earlyBoardHours,
        storeTimeZone: timeZone,
      },
      now,
    );
    return {
      eventId: row.id,
      name: row.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      joinCode: row.join_code,
      live: row.status === "open",
      boardOpensAt:
        earlyBoardHours > 0
          ? new Date(
              new Date(row.starts_at).getTime() - earlyBoardHours * 60 * 60 * 1000,
            ).toISOString()
          : null,
      goingCount: going.get(row.id)?.goingCount ?? 0,
      youGoing: going.get(row.id)?.youGoing ?? false,
      phase:
        phase === "live" || phase === "early" || phase === "upcoming" ? phase : null,
    };
  });
}

/**
 * `viewerId` is the signed-in player, for `youGoing` on each night;
 * null for a guest, who sees the counts and no button of their own.
 */
export async function publicStore(
  storeId: string,
  viewerId: string | null = null,
): Promise<PublicStore | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("stores")
    .select(
      "id, name, city, region, address_line, postal_code, phone, website, claim_status, tier, verified_at, listing_state, description, logo_image, cover_image, hours, timezone, early_board_hours, gift_kind, gift_ended_at",
    )
    .eq("id", storeId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.listing_state !== "published") return null;

  const [{ data: source }, { data: gameRows }] = await Promise.all([
    admin.from("store_sources").select("attribution").eq("store_id", storeId).limit(1),
    admin.from("store_games").select("game").eq("store_id", storeId),
  ]);

  const address =
    [data.address_line, data.city, data.region, data.postal_code]
      .filter(Boolean)
      .join(", ") || null;

  return {
    storeId: data.id,
    name: data.name,
    city: data.city,
    region: data.region,
    address,
    phone: data.phone,
    website: data.website,
    verified: data.verified_at !== null,
    ultra: data.tier === "ultra",
    founding: data.gift_kind === "founding" && data.gift_ended_at === null,
    unclaimed: data.claim_status === "unclaimed",
    description: data.description,
    attribution: source?.[0]?.attribution ?? null,
    logoUrl: avatarSrc(data.logo_image),
    coverUrl: avatarSrc(data.cover_image),
    hours: parseHours(data.hours),
    games: storeGamesFrom(gameRows ?? []),
    timeZone: data.timezone ?? "UTC",
    casePicks: await caseFor(storeId),
    upcoming: await upcomingFor(
      storeId,
      data.early_board_hours ?? 0,
      data.timezone ?? "UTC",
      viewerId,
    ),
  };
}
