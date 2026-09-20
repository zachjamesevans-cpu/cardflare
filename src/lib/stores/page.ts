import "server-only";

import { isGameSlug, type GameSlug } from "@/lib/players/games-catalog";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreRow, StoreUpdate } from "@/lib/supabase/types";
import { hoursToJson, parseHours } from "@/lib/stores/hours";
import type { StorePage, StorePageFields } from "@/lib/stores/page-schema";

/**
 * A store's own page, as its owner edits it.
 *
 * The public page (`public-profile.ts`) is what a PLAYER sees and is
 * shaped as a privacy boundary. This is what the OWNER sees in the
 * console: the same columns, raw, so the form can be filled in and
 * written back. Two shapes on purpose - the public one must never grow
 * a field just because the console needed it.
 */
export async function storePageFor(storeId: string): Promise<StorePageFields | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const [{ data, error }, { data: gameRows }] = await Promise.all([
    admin
      .from("stores")
      .select(
        "id, name, city, region, address_line, postal_code, phone, website, description, logo_image, cover_image, hours",
      )
      .eq("id", storeId)
      .maybeSingle(),
    admin.from("store_games").select("game").eq("store_id", storeId),
  ]);

  if (error) {
    console.error("Could not read the store page", error);
    return null;
  }
  if (!data) return null;

  return {
    storeId: data.id,
    name: data.name,
    city: data.city,
    region: data.region,
    addressLine: data.address_line,
    postalCode: data.postal_code,
    phone: data.phone,
    website: data.website,
    description: data.description,
    hours: parseHours(data.hours),
    games: storeGamesFrom(gameRows ?? []),
    logoPath: data.logo_image,
    coverPath: data.cover_image,
  };
}

/** The rows of `store_games` as slugs, in the catalogue's order, unknowns dropped. */
export function storeGamesFrom(rows: { game: string }[]): GameSlug[] {
  const games = rows.map((row) => row.game).filter(isGameSlug);
  return [...new Set(games)];
}

/**
 * True when the page says something a player could act on: a line
 * about the shop, a website, a phone, hours, or a picture. The setup
 * checklist's first step ticks on this, and it deliberately ignores
 * the address, which checkout and the directory import already fill in.
 */
export function storePageIsSetUp(
  page:
    | (Pick<StorePage, "description" | "website" | "phone"> &
        Partial<Pick<StorePageFields, "hours" | "logoPath" | "coverPath">>)
    | null,
): boolean {
  return Boolean(
    page &&
    (page.description ||
      page.website ||
      page.phone ||
      page.hours ||
      page.logoPath ||
      page.coverPath),
  );
}

/**
 * Writes the validated page. Authorisation is the caller's job.
 *
 * The games are REPLACED, not merged: the form posts the whole set of
 * boxes, so what arrives is the truth and the rows follow it. Two
 * writes rather than a transaction; a failure between them leaves the
 * store's columns right and its games stale, which the next Save fixes.
 */
export async function updateStorePage(
  storeId: string,
  input: StorePage,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  /*
   * Typed against the row and narrowed for the client: `StoreUpdate`
   * in types.ts does not yet list the columns this round's migration
   * added, and `store-images.ts` writes its two the same way.
   */
  const patch: StoreUpdate & Pick<StoreRow, "hours"> = {
    name: input.name,
    city: input.city,
    region: input.region,
    address_line: input.addressLine,
    postal_code: input.postalCode,
    phone: input.phone,
    website: input.website,
    description: input.description,
    hours: input.hours ? hoursToJson(input.hours) : null,
  };

  const { error } = await admin
    .from("stores")
    .update(patch as StoreUpdate)
    .eq("id", storeId);

  if (error) {
    console.error("Could not update the store page", error);
    return false;
  }

  const { error: clearError } = await admin
    .from("store_games")
    .delete()
    .eq("store_id", storeId);
  if (clearError) {
    console.error("Could not clear the store's games", clearError);
    return false;
  }

  if (input.games.length > 0) {
    const { error: insertError } = await admin
      .from("store_games")
      .insert(input.games.map((game) => ({ store_id: storeId, game })));
    if (insertError) {
      console.error("Could not record the store's games", insertError);
      return false;
    }
  }

  return true;
}

/**
 * When the owner finished or skipped the wizard, or null while the
 * console should still offer it. Read separately from the console
 * loader because that loader runs on every tab and this is asked on
 * two pages.
 */
export async function storeOnboardingCompletedAt(
  storeId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("onboarding_completed_at")
    .eq("id", storeId)
    .maybeSingle();
  if (error) {
    console.error("Could not read the store's onboarding state", error);
    return null;
  }
  return data?.onboarding_completed_at ?? null;
}

/** Stamps the wizard as finished or skipped. Idempotent: an earlier stamp stays. */
export async function markStoreOnboarded(storeId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const patch: StoreUpdate & Pick<StoreRow, "onboarding_completed_at"> = {
    onboarding_completed_at: new Date().toISOString(),
  };
  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update(patch as StoreUpdate)
    .eq("id", storeId)
    .is("onboarding_completed_at", null);
  if (error) {
    console.error("Could not mark the store as set up", error);
    return false;
  }
  return true;
}
