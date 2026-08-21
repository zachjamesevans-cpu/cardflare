import "server-only";

import { FixturePlacesProvider } from "@/lib/places/fixtures";
import { SnapshotPlacesProvider, snapshots } from "@/lib/places/snapshot";
import { scoreRelevance, type Relevance } from "@/lib/places/relevance";
import type { PlaceCandidate, PlacesProvider } from "@/lib/places/provider";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Finding shops, judging them, and never publishing one by accident.
 *
 * The whole flow is deliberately two-stage. `discover` reads a provider
 * and returns candidates with a verdict and a duplicate check attached;
 * `importCandidates` writes rows, and only for ids an admin has named.
 * Nothing here publishes: an imported store lands as `draft`, which is
 * what keeps "nothing gets published without CardFlare admin approval"
 * a fact about the database rather than a promise about the console.
 *
 * PHASE 1 USES FIXTURES. The provider is chosen here, in one line, and
 * the Overture implementation drops in without the console, the scoring
 * or the import knowing. There is no real search wired up yet, on
 * purpose - the founder approves the first one.
 */
export function placesProvider(): PlacesProvider {
  /*
   * A real discovery run, when one has been done.
   *
   * The search happens in a terminal because Overture is parquet rather
   * than an API; the console imports from what it found. With no snapshot
   * on disk the fixtures answer instead, so the review flow is always
   * exercisable without a real dataset.
   */
  return snapshots().length > 0
    ? new SnapshotPlacesProvider()
    : new FixturePlacesProvider();
}

export type DuplicateState = "new" | "already-in-cardflare" | "possible-duplicate";

export interface StoreCandidate extends PlaceCandidate {
  relevance: Relevance;
  duplicate: DuplicateState;
  /** The store it matched, when it matched one. */
  existingStoreId: string | null;
  /** Dismissed before, so the console can keep it out of the way. */
  rejected: boolean;
}

/** The counter-code alphabet: no vowels, so nothing spells a word. */
const CODE_ALPHABET = "0123456789BCDFGHJKLMNPQRSTVWXYZ";

function counterCode(): string {
  let out = "";
  for (let i = 0; i < 7; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Punctuation and company suffixes off, for comparing two shop names. */
function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(llc|inc|co|company|ltd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Rough miles between two points. Good enough to spot a duplicate. */
function milesBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 3958.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Candidates for an area, with everything an admin needs to decide.
 *
 * The duplicate check runs against provider id first, because that is
 * exact, and falls back to name-and-place because the same shop found by
 * two providers, or typed in by hand years ago, has no id in common.
 */
export async function discover(
  area: string,
  radiusMiles: number,
): Promise<StoreCandidate[]> {
  const provider = placesProvider();
  const found = await provider.search({ area, radiusMiles });

  if (!isSupabaseConfigured()) {
    return found.map((candidate) => ({
      ...candidate,
      relevance: scoreRelevance(candidate),
      duplicate: "new" as const,
      existingStoreId: null,
      rejected: false,
    }));
  }

  const admin = getSupabaseAdmin();
  const ids = found.map((candidate) => candidate.providerPlaceId);

  const [sources, rejections, stores] = await Promise.all([
    admin
      .from("store_sources")
      .select("store_id, provider_place_id")
      .eq("provider", provider.name)
      .in("provider_place_id", ids),
    admin
      .from("store_candidate_rejections")
      .select("provider_place_id")
      .eq("provider", provider.name)
      .in("provider_place_id", ids),
    admin.from("stores").select("id, name, city, latitude, longitude"),
  ]);

  const byProviderId = new Map(
    (sources.data ?? []).map((row) => [row.provider_place_id, row.store_id]),
  );
  const dismissed = new Set(
    (rejections.data ?? []).map((row) => row.provider_place_id),
  );

  return found.map((candidate) => {
    const relevance = scoreRelevance(candidate);
    const exact = byProviderId.get(candidate.providerPlaceId);

    if (exact) {
      return {
        ...candidate,
        relevance,
        duplicate: "already-in-cardflare" as const,
        existingStoreId: exact,
        rejected: dismissed.has(candidate.providerPlaceId),
      };
    }

    /* Same name in the same town, or a shop within a quarter mile with a
       matching name: the two ways one business ends up here twice. */
    const wanted = normaliseName(candidate.name);
    const near = (stores.data ?? []).find((store) => {
      if (normaliseName(store.name) !== wanted) return false;
      if (store.city && candidate.city && store.city === candidate.city) return true;

      return (
        store.latitude !== null &&
        store.longitude !== null &&
        candidate.latitude !== null &&
        candidate.longitude !== null &&
        milesBetween(
          { latitude: store.latitude, longitude: store.longitude },
          { latitude: candidate.latitude, longitude: candidate.longitude },
        ) < 0.25
      );
    });

    return {
      ...candidate,
      relevance,
      duplicate: near ? ("possible-duplicate" as const) : ("new" as const),
      existingStoreId: near?.id ?? null,
      rejected: dismissed.has(candidate.providerPlaceId),
    };
  });
}

export interface ImportResult {
  created: number;
  skipped: number;
}

/**
 * Writes the chosen candidates as UNCLAIMED DRAFT listings.
 *
 * Draft, not published: an import is an admin saying "these look real",
 * and publishing is a second decision. Unclaimed, because nobody at the
 * shop has said anything yet - and never verified, never Ultra, both of
 * which are set by a person and neither of which this function can
 * reach.
 *
 * A provenance row per store, with the licence and attribution the
 * provider gave for that individual record. Overture Places is a mix of
 * CDLA Permissive 2.0, Apache 2.0 and CC0 1.0, so the attribution that
 * travels with a record is a property of the record.
 */
export async function importCandidates(
  candidates: PlaceCandidate[],
  importedBy: string | null,
): Promise<ImportResult> {
  if (!isSupabaseConfigured() || candidates.length === 0) {
    return { created: 0, skipped: candidates.length };
  }

  const admin = getSupabaseAdmin();
  const provider = placesProvider().name;
  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const { data: existing } = await admin
      .from("store_sources")
      .select("store_id")
      .eq("provider", provider)
      .eq("provider_place_id", candidate.providerPlaceId)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    const { data: store, error } = await admin
      .from("stores")
      .insert({
        name: candidate.name,
        /*
         * A code now, not on claim.
         *
         * `stores.join_code` is not null and unique, and the counter code
         * is generated in the database rather than typed. Seven characters
         * from the same alphabet the migration uses, retried on collision
         * by the unique index rather than by a loop here: an unclaimed
         * listing is a draft nobody can walk into, so the code is dormant
         * until the shop claims the row it is already attached to.
         */
        join_code: counterCode(),
        /* No contact address is known for a shop that has not claimed
           itself, and the column is not null. Empty rather than invented:
           nothing should ever try to email an unclaimed listing. */
        contact_email: "",
        city: candidate.city,
        region: candidate.region,
        address_line: candidate.addressLine,
        postal_code: candidate.postalCode,
        country: candidate.country,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        phone: candidate.phone,
        website: candidate.website,
        claim_status: "unclaimed",
        listing_state: "draft",
        tier: "free",
      })
      .select("id")
      .single();

    if (error || !store) {
      console.error("Could not create the store listing", error);
      skipped += 1;
      continue;
    }

    await admin.from("store_sources").insert({
      store_id: store.id,
      provider,
      provider_place_id: candidate.providerPlaceId,
      license: candidate.license,
      attribution: candidate.attribution,
      imported_by: importedBy,
      last_verified_at: null,
      last_synced_at: null,
    });

    created += 1;
  }

  return { created, skipped };
}

/** Remembers a "no", so the same junk stops coming back every search. */
export async function rejectCandidate(
  providerPlaceId: string,
  rejectedBy: string | null,
  reason: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin().from("store_candidate_rejections").upsert(
    {
      provider: placesProvider().name,
      provider_place_id: providerPlaceId,
      rejected_by: rejectedBy,
      reason,
    },
    { onConflict: "provider,provider_place_id" },
  );

  if (error) console.error("Could not remember the rejected candidate", error);
}
