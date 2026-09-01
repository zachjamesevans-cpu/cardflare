import "server-only";

import { FixturePlacesProvider } from "@/lib/places/fixtures";
import { SnapshotPlacesProvider, snapshots } from "@/lib/places/snapshot";
import { scoreRelevance, type Relevance } from "@/lib/places/relevance";
import type { PlaceCandidate, PlacesProvider } from "@/lib/places/provider";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreUpdate } from "@/lib/supabase/types";

/**
 * Finding shops, judging them, and never publishing one by accident.
 *
 * The whole flow is deliberately two-stage. `discover` reads a provider
 * and returns candidates with a verdict and a duplicate check attached;
 * `importCandidates` writes rows, and only for ids an admin has named.
 * Nothing here publishes: an imported store lands as `draft`, which is
 * what keeps "nothing gets published without cardflare admin approval"
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

/**
 * The counter-code alphabet, copied from the constraint that checks it.
 *
 * `stores_join_code_shape` is `^[0-9A-HJKMNP-TV-Z]{7}$`: digits plus every
 * letter except I, L, O and U - the four that a stranger reading a code
 * off a counter confuses with 1, 1, 0 and V.
 *
 * The first version of this list reasoned "no vowels" instead of reading
 * the constraint, which dropped A and E (allowed) and kept L (not). Any
 * code containing an L failed the check - about one in five - and five of
 * thirty-five imports died on it.
 */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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
  /**
   * Matched an existing store by name and place, so the provider's
   * address and coordinate filled that store's gaps instead of a second
   * row being created for the same shop. See importCandidates.
   */
  enriched: number;
  /** Already in cardflare, matched by provider id. Not a problem. */
  skipped: number;
  /** Tried and failed. A problem, and never to be reported as a skip. */
  failed: number;
  /** The first failure's message, so the console can say what broke. */
  error: string | null;
}

/**
 * Whether the store-directory schema is actually there.
 *
 * Deploying the app and applying the migrations are two different acts in
 * this project - there is no CI that runs `supabase db push` - so the
 * console can be live against a database that has never heard of
 * `store_sources`. Without this check every insert fails on an unknown
 * column, and the only feedback is a count.
 */
export async function directorySchemaReady(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("store_sources")
    .select("store_id")
    .limit(1);

  return !error;
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
    return {
      created: 0,
      enriched: 0,
      skipped: candidates.length,
      failed: 0,
      error: null,
    };
  }

  if (!(await directorySchemaReady())) {
    return {
      created: 0,
      enriched: 0,
      skipped: 0,
      failed: candidates.length,
      error: "The store directory migration has not been applied to this database.",
    };
  }

  const admin = getSupabaseAdmin();
  const provider = placesProvider().name;
  let created = 0;
  let enriched = 0;
  let skipped = 0;
  let failed = 0;
  let firstError: string | null = null;

  /*
   * Every store already known, read once, so a candidate can be matched
   * against the shops cardflare has rather than only against the ids this
   * provider has used before. `discover` has always computed this match
   * and shown it as "possible duplicate"; the import ignored it, so an
   * admin importing a metro that contained one of their own customers
   * created a SECOND row for that shop.
   *
   * That split is not cosmetic. Rooms, events and Flares hang off the
   * customer's row; the coordinate arrives on the imported one. Local
   * finds stores by coordinate and then asks for their boards, so the row
   * it can find has no boards and the row with the boards it cannot find
   * - and a player standing inside the shop is told there is nothing
   * within a hundred miles. One business, one row: the store-directory
   * migration says so in its first paragraph, and this is the code that
   * was quietly disagreeing.
   */
  const { data: known } = await admin
    .from("stores")
    .select(
      "id, name, city, address_line, postal_code, country, phone, website, latitude, longitude",
    );

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

    /* The same rule `discover` flags as "possible duplicate": the same
       name in the same town, or the same name within a quarter mile. */
    const wanted = normaliseName(candidate.name);
    const twin = (known ?? []).find((store) => {
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

    if (twin) {
      /*
       * Fill the gaps and nothing else. A shop that claimed its listing
       * and corrected its own address must not have that overwritten by
       * a places provider on the next import, so every field is written
       * only where cardflare currently knows nothing.
       */
      const gaps: StoreUpdate = {};
      if (twin.address_line === null && candidate.addressLine !== null)
        gaps.address_line = candidate.addressLine;
      if (twin.postal_code === null && candidate.postalCode !== null)
        gaps.postal_code = candidate.postalCode;
      if (twin.country === null && candidate.country !== null)
        gaps.country = candidate.country;
      if (twin.phone === null && candidate.phone !== null) gaps.phone = candidate.phone;
      if (twin.website === null && candidate.website !== null)
        gaps.website = candidate.website;
      if (
        (twin.latitude === null || twin.longitude === null) &&
        candidate.latitude !== null &&
        candidate.longitude !== null
      ) {
        gaps.latitude = candidate.latitude;
        gaps.longitude = candidate.longitude;
      }

      if (Object.keys(gaps).length > 0) {
        const { error: gapError } = await admin
          .from("stores")
          .update(gaps)
          .eq("id", twin.id);

        if (gapError) {
          console.error("Could not fill the store's gaps from the provider", gapError);
          failed += 1;
          firstError ??= gapError.message;
          continue;
        }
      }

      /* Provenance still gets recorded: this provider record is now
         attached to the store it actually describes. */
      await admin.from("store_sources").insert({
        store_id: twin.id,
        provider,
        provider_place_id: candidate.providerPlaceId,
        license: candidate.license,
        attribution: candidate.attribution,
        imported_by: importedBy,
        last_verified_at: null,
        last_synced_at: null,
      });

      enriched += 1;
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
        /*
         * NULL, not "".
         *
         * Nobody at an unclaimed shop has agreed to hear from us, so
         * there is no address and inventing one would be worse than
         * having none. An empty string was the first answer and it was
         * wrong twice: it fails the email-shape check the column has
         * carried since the first migration, and had it passed it would
         * read as a real-but-blank address everywhere downstream.
         */
        contact_email: null,
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
      /*
       * A FAILURE, counted as one.
       *
       * This used to add to `skipped`, and the console reported the total
       * as "already known" - so thirty-five inserts failing on a database
       * without the directory migration read as thirty-five stores that
       * were already there. A count that cannot tell success from failure
       * is worse than no count.
       */
      console.error("Could not create the store listing", error);
      failed += 1;
      firstError ??= error?.message ?? "The insert failed.";
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

  return { created, enriched, skipped, failed, error: firstError };
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
