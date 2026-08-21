import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreClaimStatus, StoreTier } from "@/lib/supabase/types";

/**
 * Stores near a point, and the line past which a coordinate may not go.
 *
 * The privacy rule is the whole design: "never expose someone's exact
 * device location... perform distance calculations server-side... do not
 * return raw precise coordinates in public client payloads." So the
 * returned shape has NO latitude and NO longitude. Not optional ones,
 * not nulled ones - absent, so no client payload can carry them by
 * somebody forgetting to strip a field.
 *
 * A store's own address is public information and is returned; a
 * PLAYER's position is never stored here at all in Phase 1 and only ever
 * arrives as a search origin.
 *
 * Bounding box then haversine, and no PostGIS. At metro scale a degree
 * box costs one index scan and haversine is accurate to well under a
 * mile, which is the resolution "2.4 miles away" needs. PostGIS is the
 * right answer at national scale and buys nothing for one city.
 */
export interface NearbyStore {
  storeId: string;
  name: string;
  city: string | null;
  region: string | null;
  addressLine: string | null;
  /** Rounded to a tenth. The number a player is shown, not a position. */
  miles: number;
  claimStatus: StoreClaimStatus;
  tier: StoreTier;
  verified: boolean;
}

const EARTH_MILES = 3958.8;

/** Rough miles per degree of latitude; longitude shrinks toward the pole. */
const MILES_PER_DEGREE_LAT = 69;

export function milesBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}

/**
 * The box to ask Postgres for, before haversine sorts what comes back.
 *
 * Longitude degrees get shorter as latitude rises, so the box widens by
 * 1/cos(lat). Clamped because at the poles that tends to infinity and a
 * search near one should return a wide box rather than an error.
 */
export function boundingBox(
  origin: { latitude: number; longitude: number },
  radiusMiles: number,
) {
  const latSpan = radiusMiles / MILES_PER_DEGREE_LAT;
  const shrink = Math.max(Math.cos((origin.latitude * Math.PI) / 180), 0.01);
  const lonSpan = radiusMiles / (MILES_PER_DEGREE_LAT * shrink);

  return {
    minLat: origin.latitude - latSpan,
    maxLat: origin.latitude + latSpan,
    minLon: origin.longitude - lonSpan,
    maxLon: origin.longitude + lonSpan,
  };
}

export async function storesNear(
  origin: { latitude: number; longitude: number },
  radiusMiles: number,
  limit = 10,
): Promise<NearbyStore[]> {
  if (!isSupabaseConfigured()) return [];

  const box = boundingBox(origin, radiusMiles);

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select(
      "id, name, city, region, address_line, latitude, longitude, claim_status, tier, verified_at",
    )
    /* Published only. A draft is an imported candidate nobody has
       approved, and it must never reach a player. */
    .eq("listing_state", "published")
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLon)
    .lte("longitude", box.maxLon);

  if (error) {
    console.error("Could not read nearby stores", error);
    return [];
  }

  return (data ?? [])
    .flatMap((row) => {
      if (row.latitude === null || row.longitude === null) return [];

      const miles = milesBetween(origin, {
        latitude: row.latitude,
        longitude: row.longitude,
      });
      if (miles > radiusMiles) return [];

      /* The coordinate is dropped HERE, at the edge of the server, and
         the return type has nowhere to put one back. */
      return [
        {
          storeId: row.id,
          name: row.name,
          city: row.city,
          region: row.region,
          addressLine: row.address_line,
          miles: Math.round(miles * 10) / 10,
          claimStatus: row.claim_status,
          tier: row.tier,
          verified: row.verified_at !== null,
        },
      ];
    })
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit);
}
