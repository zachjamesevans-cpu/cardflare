"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreUpdate } from "@/lib/supabase/types";
import type { ListingState } from "@/lib/stores/listing-schema";

/**
 * Publishing a listing, verifying a business, and selling Ultra.
 *
 * THREE ACTIONS, NOT ONE, because they are three different decisions and
 * conflating them is exactly the mistake the schema was built to prevent.
 * Publishing says a discovered record is real enough to show. Verifying
 * says cardflare confirmed who controls the profile - it is trust, and it
 * is never for sale. Ultra is the commercial tier. A store can be
 * published and unverified, verified and free, or all three.
 *
 * Every one is behind `requireAdmin`. A client may never send
 * `verified = true` and have it believed; these are the only writes to
 * those columns in the product.
 */
async function setFields(storeId: string, fields: StoreUpdate): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update(fields)
    .eq("id", storeId);

  if (error) {
    console.error("Could not update the store listing", error);
    return false;
  }

  revalidatePath("/admin/stores");
  revalidatePath(`/admin/stores/${storeId}`);
  return true;
}

export async function setListingStateAction(
  _previous: ListingState,
  form: FormData,
): Promise<ListingState> {
  await requireAdmin();

  const storeId = String(form.get("storeId") ?? "");
  const publish = String(form.get("publish") ?? "") === "true";

  if (!storeId) return { status: "error", message: "No store." };

  const ok = await setFields(storeId, {
    listing_state: publish ? "published" : "draft",
  });

  return ok
    ? {
        status: "done",
        message: publish
          ? "Published. Players can see this listing now."
          : "Back to draft. Players cannot see it.",
      }
    : { status: "error", message: "That did not save." };
}

export async function setVerifiedAction(
  _previous: ListingState,
  form: FormData,
): Promise<ListingState> {
  const user = await requireAdmin();

  const storeId = String(form.get("storeId") ?? "");
  const verified = String(form.get("verified") ?? "") === "true";

  if (!storeId) return { status: "error", message: "No store." };

  const ok = await setFields(storeId, {
    /* The timestamp, not a boolean: "verified when" is the first
       question of any dispute about a listing. */
    verified_at: verified ? new Date().toISOString() : null,
    verified_by: verified ? user.id : null,
    /* Verifying a business means somebody controls the profile, so the
       listing is no longer unclaimed. Ultra is untouched - it is a
       different axis and buying it must never imply this. */
    ...(verified ? { claim_status: "claimed" as const } : {}),
  });

  return ok
    ? {
        status: "done",
        message: verified ? "Marked cardflare Verified." : "Verification removed.",
      }
    : { status: "error", message: "That did not save." };
}

export async function setTierAction(
  _previous: ListingState,
  form: FormData,
): Promise<ListingState> {
  await requireAdmin();

  const storeId = String(form.get("storeId") ?? "");
  const ultra = String(form.get("ultra") ?? "") === "true";

  if (!storeId) return { status: "error", message: "No store." };

  const ok = await setFields(storeId, { tier: ultra ? "ultra" : "free" });

  return ok
    ? { status: "done", message: ultra ? "Upgraded to Ultra." : "Back to free." }
    : { status: "error", message: "That did not save." };
}

/**
 * Publishes several drafts at once.
 *
 * An import creates dozens of listings in one act, and releasing them one
 * click at a time is the kind of chore that ends with somebody publishing
 * the wrong thing to get to the end of the list. Ids are named
 * explicitly - there is no "publish everything" - so this is still a
 * selection an admin made rather than a switch.
 */
export async function publishManyAction(
  _previous: ListingState,
  form: FormData,
): Promise<ListingState> {
  await requireAdmin();

  const ids = String(form.get("storeIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) return { status: "error", message: "Nothing selected." };
  if (!isSupabaseConfigured()) return { status: "error", message: "No database." };

  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update({ listing_state: "published" })
    .in("id", ids);

  if (error) {
    console.error("Could not publish the listings", error);
    return { status: "error", message: "That did not save. Nothing changed." };
  }

  revalidatePath("/admin/stores");

  return {
    status: "done",
    message: `Published ${ids.length} ${ids.length === 1 ? "listing" : "listings"}. Players can see them now.`,
  };
}
