import "server-only";

import { generateShowCode } from "@/lib/events/join-code";
import { printingLabel, type CardPrinting } from "@/lib/cards/schema";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { InventoryForm, ShowRow } from "@/lib/supabase/types";
import { groupAvailability, MAX_INVENTORY, type VendorAvailability } from "./schema";

/**
 * Reads and writes for card shows, service-role behind explicit
 * authorisation — the shows tables have RLS on with zero policies, so
 * nothing here is reachable except through these functions, each of which is
 * called only after the action has established who is asking.
 */

const UNIQUE_VIOLATION = "23505";

/** Same reasoning as counter codes: remote collision, loud generator fault. */
const CODE_ATTEMPTS = 3;

export interface CreateShowInput {
  name: string;
  city: string | null;
  region: string | null;
  timezone: string;
  startsAt: string;
  endsAt: string;
}

export async function createShow(
  input: CreateShowInput,
  createdBy: string,
): Promise<ShowRow | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await admin
      .from("shows")
      .insert({
        name: input.name,
        city: input.city,
        region: input.region,
        timezone: input.timezone,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        join_code: generateShowCode(),
        created_by: createdBy,
      })
      .select()
      .single();

    if (data) return data;
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error("Could not create the show", error);
      return null;
    }
  }

  console.error("Could not find an unused show code in three attempts");
  return null;
}

/** Every show, newest first. The admin's list. */
export async function listShows(): Promise<ShowRow[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("shows")
    .select("*")
    .order("starts_at", { ascending: false });

  if (error) {
    console.error("Could not list shows", error);
    return [];
  }

  return data ?? [];
}

export async function findShowById(id: string): Promise<ShowRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("shows")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Could not read the show", error);
    return null;
  }

  return data;
}

/**
 * Shows a vendor can still claim a booth at: not yet over. Past shows are
 * history, and claiming a booth at one would only confuse the roster.
 */
export async function listClaimableShows(now = new Date()): Promise<ShowRow[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("shows")
    .select("*")
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("Could not list claimable shows", error);
    return [];
  }

  return data ?? [];
}

/** The vendor's own claims, keyed by show. */
export async function boothsForStore(storeId: string): Promise<Map<string, string>> {
  if (!isSupabaseConfigured()) return new Map();

  const { data, error } = await getSupabaseAdmin()
    .from("show_vendors")
    .select("show_id, booth")
    .eq("store_id", storeId);

  if (error) {
    console.error("Could not read the vendor's booths", error);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.show_id, row.booth]));
}

/** Claims (or moves) a vendor's booth at a show. */
export async function claimBooth(
  showId: string,
  storeId: string,
  booth: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin().from("show_vendors").upsert(
    { show_id: showId, store_id: storeId, booth },
    {
      onConflict: "show_id,store_id",
    },
  );

  if (error) {
    console.error("Could not claim the booth", error);
    return false;
  }

  return true;
}

export async function leaveShow(showId: string, storeId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("show_vendors")
    .delete()
    .eq("show_id", showId)
    .eq("store_id", storeId);

  if (error) {
    console.error("Could not leave the show", error);
    return false;
  }

  return true;
}

/** The admin's roster view: who is coming, and where they are sitting. */
export async function rosterForShow(
  showId: string,
): Promise<{ storeId: string; vendorName: string; booth: string }[]> {
  const roster = await rosterMap(showId);
  return [...roster.entries()]
    .map(([storeId, entry]) => ({ storeId, ...entry }))
    .sort((a, b) => a.booth.localeCompare(b.booth, undefined, { numeric: true }));
}

async function rosterMap(
  showId: string,
): Promise<Map<string, { vendorName: string; booth: string }>> {
  if (!isSupabaseConfigured()) return new Map();

  const admin = getSupabaseAdmin();

  const { data: claims, error } = await admin
    .from("show_vendors")
    .select("store_id, booth")
    .eq("show_id", showId);

  if (error) {
    console.error("Could not read the show's roster", error);
    return new Map();
  }

  const rows = claims ?? [];
  if (rows.length === 0) return new Map();

  const { data: stores, error: storeError } = await admin
    .from("stores")
    .select("id, name")
    .in(
      "id",
      rows.map((row) => row.store_id),
    );

  if (storeError) {
    console.error("Could not resolve vendor names", storeError);
    return new Map();
  }

  const names = new Map((stores ?? []).map((row) => [row.id, row.name]));

  return new Map(
    rows.map((row) => [
      row.store_id,
      { vendorName: names.get(row.store_id) ?? "A vendor", booth: row.booth },
    ]),
  );
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                  */
/* -------------------------------------------------------------------------- */

/** One line of stock, as the vendor's dashboard renders it. */
export interface InventoryLine {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  printingLabel: string | null;
  form: InventoryForm;
  grader: string | null;
  grade: number | null;
  quantity: number;
}

type UpsertOutcome = { ok: true } | { ok: false; reason: "at-cap" | "unavailable" };

/**
 * States one line of stock. Restating the same physical thing — same card,
 * printing, form, grader, grade — replaces its quantity, which is what
 * "upload your inventory before the show" means row by row.
 */
export async function upsertInventory(
  storeId: string,
  entry: {
    cardId: string;
    printingId: string | null;
    form: InventoryForm;
    grader: string | null;
    grade: number | null;
    quantity: number;
  },
): Promise<UpsertOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  const { count, error: countError } = await admin
    .from("vendor_inventory")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (countError) {
    console.error("Could not count inventory", countError);
    return { ok: false, reason: "unavailable" };
  }

  if ((count ?? 0) >= MAX_INVENTORY) return { ok: false, reason: "at-cap" };

  const { error } = await admin.from("vendor_inventory").upsert(
    {
      store_id: storeId,
      card_id: entry.cardId,
      printing_id: entry.printingId,
      form: entry.form,
      grader: entry.grader,
      grade: entry.grade,
      quantity: entry.quantity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,card_id,printing_id,form,grader,grade" },
  );

  if (error) {
    console.error("Could not save the inventory line", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/** Scoped to the owning store: an id alone removes nothing. */
export async function removeInventory(id: string, storeId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("vendor_inventory")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) {
    console.error("Could not remove the inventory line", error);
    return false;
  }

  return true;
}

export async function listInventory(storeId: string): Promise<InventoryLine[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("vendor_inventory")
    .select("id, card_id, printing_id, form, grader, grade, quantity, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not read the inventory", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const lookups = await cardLookups(
    rows.map((row) => ({ cardId: row.card_id, printingId: row.printing_id })),
  );

  return rows.map((row) => ({
    id: row.id,
    cardId: row.card_id,
    cardName: lookups.cards.get(row.card_id)?.name ?? "Unknown card",
    cardNumber: lookups.cards.get(row.card_id)?.number ?? "",
    printingLabel: labelFor(row.printing_id, row.card_id, lookups),
    form: row.form,
    grader: row.grader,
    grade: row.grade === null ? null : Number(row.grade),
    quantity: row.quantity,
  }));
}

/* -------------------------------------------------------------------------- */
/* The attendee's hot path                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which vendors at this show have any of these cards, and where they sit.
 *
 * Two indexed reads after the roster: inventory narrowed by card ids AND the
 * show's vendors, then names and labels resolved in bulk. Assembled by the
 * pure `groupAvailability`, which is where the tests live.
 */
export async function showAvailability(
  showId: string,
  cardIds: string[],
): Promise<Map<string, VendorAvailability[]>> {
  if (!isSupabaseConfigured() || cardIds.length === 0) return new Map();

  const roster = await rosterMap(showId);
  if (roster.size === 0) return new Map();

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("vendor_inventory")
    .select("store_id, card_id, printing_id, form, grader, grade, quantity")
    .in("card_id", cardIds)
    .in("store_id", [...roster.keys()]);

  if (error) {
    console.error("Could not read show availability", error);
    return new Map();
  }

  const rows = data ?? [];
  if (rows.length === 0) return new Map();

  const lookups = await cardLookups(
    rows.map((row) => ({ cardId: row.card_id, printingId: row.printing_id })),
  );

  return groupAvailability(
    rows.map((row) => ({
      storeId: row.store_id,
      cardId: row.card_id,
      form: row.form,
      grader: row.grader,
      grade: row.grade === null ? null : Number(row.grade),
      quantity: row.quantity,
      printingLabel: labelFor(row.printing_id, row.card_id, lookups),
    })),
    roster,
  );
}

/* -------------------------------------------------------------------------- */
/* Shared lookups                                                             */
/* -------------------------------------------------------------------------- */

interface Lookups {
  cards: Map<string, { name: string; number: string }>;
  printings: Map<string, CardPrinting>;
}

function labelFor(
  printingId: string | null,
  cardId: string,
  lookups: Lookups,
): string | null {
  if (!printingId) return null;
  const printing = lookups.printings.get(printingId);
  if (!printing) return null;
  return printingLabel(printing, lookups.cards.get(cardId)?.name ?? "");
}

async function cardLookups(
  refs: { cardId: string; printingId: string | null }[],
): Promise<Lookups> {
  const admin = getSupabaseAdmin();

  const cardIds = [...new Set(refs.map((ref) => ref.cardId))];
  const printingIds = [
    ...new Set(refs.map((ref) => ref.printingId).filter((id): id is string => !!id)),
  ];

  const [cards, printings] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", cardIds),
    printingIds.length > 0
      ? admin
          .from("card_printings")
          .select(
            "id, card_id, set_code, set_name, printing_label, variant_type, rarity, printing_name, is_promo, image_url",
          )
          .in("id", printingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (cards.error || printings.error) {
    console.error("Could not resolve inventory cards", cards.error ?? printings.error);
  }

  return {
    cards: new Map(
      (cards.data ?? []).map((row) => [
        row.id,
        { name: row.exact_name, number: row.canonical_card_number },
      ]),
    ),
    printings: new Map(
      (printings.data ?? []).map((row) => [
        row.id,
        {
          id: row.id,
          setCode: row.set_code,
          setName: row.set_name,
          printingLabel: row.printing_label,
          variantType: row.variant_type,
          rarity: row.rarity,
          printingName: row.printing_name,
          isPromo: row.is_promo,
          imageUrl: row.image_url,
        },
      ]),
    ),
  };
}
