"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import {
  discover,
  importCandidates,
  rejectCandidate,
  type StoreCandidate,
} from "@/lib/stores/discovery";
import type { DiscoverState, ImportState } from "@/lib/stores/discovery-schema";

/**
 * Running a search, and then - separately - writing rows.
 *
 * Two actions rather than one on purpose. "Select all likely LGS" must
 * only SELECT; importing is its own explicit act with a count in front of
 * it. A single action that searched and imported would make the count a
 * courtesy rather than a gate.
 */
export async function discoverStoresAction(
  _previous: DiscoverState,
  form: FormData,
): Promise<DiscoverState> {
  await requireAdmin();

  const area = String(form.get("area") ?? "").trim();
  const radiusMiles = Number(form.get("radiusMiles") ?? 25);

  if (!area) {
    return {
      status: "error",
      area,
      radiusMiles,
      candidates: [],
      message: "Enter a city or area to search.",
    };
  }

  const candidates = await discover(area, radiusMiles);

  return {
    status: "found",
    area,
    radiusMiles,
    candidates,
    message: `${candidates.length} ${candidates.length === 1 ? "candidate" : "candidates"} from the ${"fixtures"} provider.`,
  };
}

/**
 * Writes the chosen candidates as unclaimed DRAFT listings.
 *
 * The payload carries the candidates themselves rather than ids to look
 * up again, because the provider is not queryable by id - Overture is a
 * parquet file, not an API - and a second search to resolve a selection
 * would be a second full scan.
 */
export async function importStoresAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  const user = await requireAdmin();

  const raw = String(form.get("selected") ?? "");
  if (!raw) return { status: "error", message: "Nothing selected." };

  let candidates: StoreCandidate[];
  try {
    candidates = JSON.parse(raw) as StoreCandidate[];
  } catch {
    return { status: "error", message: "That selection could not be read." };
  }

  const result = await importCandidates(candidates, user.id);
  revalidatePath("/admin/stores");

  /* A failure is reported as a failure. The first cut folded these into
     "skipped ... already known", so a database missing the migration
     told the founder his stores were already there. */
  if (result.created === 0 && result.failed > 0) {
    return {
      status: "error",
      message: `Nothing was created. ${result.failed} ${
        result.failed === 1 ? "listing" : "listings"
      } failed: ${result.error ?? "unknown error"}`,
    };
  }

  const parts = [
    `Created ${result.created} unclaimed ${result.created === 1 ? "listing" : "listings"}`,
  ];
  if (result.skipped > 0) parts.push(`skipped ${result.skipped} already in cardflare`);
  /* Say WHY, not just how many. A count without the reason sent the
     founder back to the console twice. */
  if (result.failed > 0) {
    parts.push(`${result.failed} failed: ${result.error ?? "unknown error"}`);
  }

  return {
    status: result.failed > 0 ? "error" : "done",
    message: `${parts.join(", ")}. They are drafts until you publish them.`,
  };
}

/** Remembers a "no", so the same junk stops coming back every search. */
export async function rejectCandidateAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  const user = await requireAdmin();

  const providerPlaceId = String(form.get("providerPlaceId") ?? "").trim();
  if (!providerPlaceId) return { status: "error", message: "Nothing to dismiss." };

  await rejectCandidate(
    providerPlaceId,
    user.id,
    String(form.get("reason") ?? "").trim() || null,
  );

  return { status: "done", message: "Dismissed. It will not be offered again." };
}
