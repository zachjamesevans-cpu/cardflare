import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreClaimState } from "@/lib/supabase/types";
import type { ClaimFields } from "@/lib/stores/claim-schema";

/**
 * Requests to own a listing, and the queue an admin works through.
 *
 * DELIBERATELY NOT SELF-SERVICE. Approving a claim hands somebody
 * control of a real business's public profile, so the first version of
 * that decision is a human reading an address and saying yes. Nothing
 * here approves anything on its own, and nothing a claimant can type
 * changes a store record.
 */
export interface StoreClaim {
  claimId: string;
  storeId: string;
  storeName: string;
  createdAt: string;
  claimantName: string;
  claimantEmail: string;
  claimantRole: string | null;
  businessEmail: string | null;
  notes: string | null;
  state: StoreClaimState;
  reviewedAt: string | null;
  reviewNote: string | null;
  /**
   * The claimant's address is at the same domain as the shop's website.
   *
   * Not proof and never treated as any - anybody can buy a domain, and
   * plenty of real owners use gmail. It is a hint, computed here so
   * every admin sees the same one rather than each of them squinting at
   * two strings in a list.
   */
  domainMatchesWebsite: boolean;
}

export type ClaimDecision = "approved" | "rejected" | "more-info";

/**
 * Record a claim.
 *
 * Returns the id rather than the row: the claimant is told "we have it,
 * we will be in touch", and there is nothing else about the request
 * that is theirs to see.
 *
 * A store that is not published cannot be claimed. Otherwise a draft
 * nobody approved could be claimed by whoever guessed its id, and the
 * rule that nothing goes public without an admin would have a hole in
 * it shaped exactly like this form.
 */
export async function submitClaim(
  storeId: string,
  fields: ClaimFields,
): Promise<{ ok: boolean; claimId?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "CardFlare is not connected to its database." };
  }

  const admin = getSupabaseAdmin();

  const { data: store } = await admin
    .from("stores")
    .select("id, listing_state, claim_status")
    .eq("id", storeId)
    .maybeSingle();

  if (!store || store.listing_state !== "published") {
    return { ok: false, error: "That store is not listed." };
  }

  if (store.claim_status === "claimed") {
    /* Said plainly rather than silently accepted. Somebody looking at a
       claimed shop and filling this in has misunderstood something, and
       a cheerful "thanks, we will be in touch" would leave them waiting
       for a reply that is never coming. */
    return { ok: false, error: "Someone already manages this store." };
  }

  /*
   * One open claim per address per store. Two different people at the
   * same shop both asking is real and both should reach the queue; the
   * same person asking four times is a queue an admin has to dedupe by
   * hand.
   */
  const { data: existing } = await admin
    .from("store_claims")
    .select("id")
    .eq("store_id", storeId)
    .eq("claimant_email", fields.claimantEmail)
    .eq("state", "pending")
    .limit(1);

  if (existing?.[0]) {
    return { ok: true, claimId: existing[0].id };
  }

  const { data, error } = await admin
    .from("store_claims")
    .insert({
      store_id: storeId,
      claimant_name: fields.claimantName,
      claimant_email: fields.claimantEmail,
      claimant_role: fields.claimantRole || null,
      business_email: fields.businessEmail || null,
      notes: fields.notes || null,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Could not send that. Try again?" };
  }

  return { ok: true, claimId: data.id };
}

/** The queue, newest first within a state. */
export async function listClaims(state?: StoreClaimState): Promise<StoreClaim[]> {
  if (!isSupabaseConfigured()) return [];

  let query = getSupabaseAdmin()
    .from("store_claims")
    .select(
      "id, store_id, created_at, claimant_name, claimant_email, claimant_role, business_email, notes, state, reviewed_at, review_note",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (state) query = query.eq("state", state);

  const { data } = await query;
  if (!data || data.length === 0) return [];

  /* The shop's name and website in one query rather than one per row -
     a queue of forty claims must not be forty round trips. */
  const storeIds = [...new Set(data.map((row) => row.store_id))];
  const { data: stores } = await getSupabaseAdmin()
    .from("stores")
    .select("id, name, website")
    .in("id", storeIds);

  const byId = new Map((stores ?? []).map((s) => [s.id, s]));

  return data.map((row) => {
    const store = byId.get(row.store_id);

    return {
      claimId: row.id,
      storeId: row.store_id,
      storeName: store?.name ?? "Unknown store",
      createdAt: row.created_at,
      claimantName: row.claimant_name,
      claimantEmail: row.claimant_email,
      claimantRole: row.claimant_role,
      businessEmail: row.business_email,
      notes: row.notes,
      state: row.state,
      reviewedAt: row.reviewed_at,
      reviewNote: row.review_note,
      domainMatchesWebsite: sameDomain(
        row.business_email ?? row.claimant_email,
        store?.website ?? null,
      ),
    };
  });
}

/**
 * Does this address live at the shop's own domain?
 *
 * A hint for a human, never a decision. Compared without `www.` and
 * without case, because those differences mean nothing to anybody.
 */
export function sameDomain(email: string, website: string | null): boolean {
  if (!website) return false;

  const at = email.lastIndexOf("@");
  if (at < 0) return false;

  const inbox = email
    .slice(at + 1)
    .toLowerCase()
    .replace(/^www\./, "");
  if (!inbox) return false;

  /* The stored website may or may not carry a scheme, so parse what is
     there rather than assuming a shape a spreadsheet import obeyed. */
  const host = website
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/^www\./, "");

  return host === inbox;
}

/**
 * An admin's answer.
 *
 * Approving is the only branch that touches the store, and it does two
 * things at once on purpose: the listing becomes claimed AND the
 * claimant's address becomes the contact. A claim approved without a
 * contact address is a shop nobody can reach, which is the state this
 * whole feature exists to end.
 *
 * It does NOT verify and it does NOT change tier. CardFlare Verified is
 * a separate decision about whether we confirmed who they are, and
 * Ultra is a commercial tier. Somebody who claims a listing has neither
 * until an admin says so, which is why they are three controls.
 */
export async function decideClaim(
  claimId: string,
  decision: ClaimDecision,
  reviewerId: string,
  reviewNote: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "CardFlare is not connected to its database." };
  }

  const admin = getSupabaseAdmin();

  const { data: claim } = await admin
    .from("store_claims")
    .select("id, store_id, claimant_email, state")
    .eq("id", claimId)
    .maybeSingle();

  if (!claim) return { ok: false, error: "That claim no longer exists." };

  if (decision === "approved") {
    const { error } = await admin
      .from("stores")
      .update({
        claim_status: "claimed",
        contact_email: claim.claimant_email,
      })
      .eq("id", claim.store_id);

    if (error) {
      /* The claim is NOT marked approved if the store did not change.
         A queue that says "approved" over a listing still marked
         unclaimed is worse than one that says "try again". */
      return { ok: false, error: "Could not hand over the listing. Try again?" };
    }
  }

  const { error } = await admin
    .from("store_claims")
    .update({
      state: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
      review_note: reviewNote || null,
    })
    .eq("id", claimId);

  if (error) return { ok: false, error: "Could not save that decision." };

  return { ok: true };
}

/** How many are waiting, for the console's heading. */
export async function pendingClaimCount(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const { count } = await getSupabaseAdmin()
    .from("store_claims")
    .select("id", { count: "exact", head: true })
    .eq("state", "pending");

  return count ?? 0;
}
