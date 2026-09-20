import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
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

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select(
      "id, name, city, region, address_line, postal_code, phone, website, description",
    )
    .eq("id", storeId)
    .maybeSingle();

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
  };
}

/**
 * True when the page says something a player could act on: a line
 * about the shop, a website or a phone. The setup checklist's first
 * step ticks on this, and it deliberately ignores the address, which
 * checkout and the directory import already fill in.
 */
export function storePageIsSetUp(
  page: Pick<StorePage, "description" | "website" | "phone"> | null,
): boolean {
  return Boolean(page && (page.description || page.website || page.phone));
}

/** Writes the validated page. Authorisation is the caller's job. */
export async function updateStorePage(
  storeId: string,
  input: StorePage,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update({
      name: input.name,
      city: input.city,
      region: input.region,
      address_line: input.addressLine,
      postal_code: input.postalCode,
      phone: input.phone,
      website: input.website,
      description: input.description,
    })
    .eq("id", storeId);

  if (error) {
    console.error("Could not update the store page", error);
    return false;
  }
  return true;
}
