import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { IMPORT_PROVIDERS } from "./import-schema";

/**
 * Sets that came in by hand rather than from a provider.
 *
 * The console's answer to "what in here is a placeholder?". Counting the
 * printings that actually carry art alongside the total is the number
 * that matters: an import which stored forty of two hundred pictures
 * looks identical to a complete one until somebody opens a board.
 */

export interface ImportedSet {
  providerKey: string;
  setCode: string;
  setName: string | null;
  printings: number;
  withArt: number;
}

export async function listImportedSets(): Promise<ImportedSet[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("card_printings")
    .select("provider_key, set_code, set_name, image_url")
    .in("provider_key", [...IMPORT_PROVIDERS]);

  if (error) {
    console.error("Could not list the imported sets", error);
    return [];
  }

  const sets = new Map<string, ImportedSet>();

  for (const row of data ?? []) {
    const setCode = row.set_code ?? "—";
    const key = `${row.provider_key}::${setCode}`;

    const existing = sets.get(key) ?? {
      providerKey: row.provider_key,
      setCode,
      setName: row.set_name,
      printings: 0,
      withArt: 0,
    };

    existing.printings += 1;
    if (row.image_url) existing.withArt += 1;

    sets.set(key, existing);
  }

  return [...sets.values()].sort((a, b) => a.setCode.localeCompare(b.setCode));
}

/** One printing on the review screen, with the card facts it belongs to. */
export interface ReviewPrinting {
  printingId: string;
  cardId: string;
  cardNumber: string;
  name: string;
  imageUrl: string | null;
  printingLabel: string | null;
  variantType: string | null;
  isAlternateArt: boolean | null;
  isParallel: boolean | null;
  isPromo: boolean | null;
  isReprint: boolean | null;
  rarity: string | null;
  facts: {
    cardType: string | null;
    colors: string[];
    cost: number | null;
    power: number | null;
    counter: number | null;
    life: number | null;
    attribute: string | null;
    traits: string[];
    rarity: string | null;
    effectText: string | null;
    triggerText: string | null;
  };
}

/**
 * An imported set, one row per printing, for the review screen.
 *
 * Two flat reads joined here rather than an embedded select, like every
 * query in this codebase — the screen edits both halves, so it needs
 * both: what a printing IS (per printing) and what the card DOES (per
 * number).
 */
export async function listSetForReview(
  providerKey: string,
  setCode: string,
): Promise<ReviewPrinting[]> {
  if (!isSupabaseConfigured()) return [];
  if (!(IMPORT_PROVIDERS as readonly string[]).includes(providerKey)) return [];

  const admin = getSupabaseAdmin();

  const { data: printings, error } = await admin
    .from("card_printings")
    .select(
      "id, card_id, printing_label, variant_type, is_alternate_art, is_parallel, is_promo, is_reprint, rarity, image_url",
    )
    .eq("provider_key", providerKey)
    .eq("set_code", setCode)
    .order("provider_external_id");

  if (error) {
    console.error("Could not list the set for review", error);
    return [];
  }

  const rows = printings ?? [];
  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  if (cardIds.length === 0) return [];

  const { data: cards, error: cardError } = await admin
    .from("cards")
    .select(
      "id, canonical_card_number, exact_name, card_type, colors, cost, power, counter, life, attribute, traits, rarity, effect_text, trigger_text",
    )
    .in("id", cardIds);

  if (cardError) {
    console.error("Could not read the set's cards", cardError);
    return [];
  }

  const cardById = new Map((cards ?? []).map((card) => [card.id, card]));

  return rows.flatMap((row) => {
    const card = cardById.get(row.card_id);
    /* A printing whose card is gone is a broken row, not a screen entry. */
    if (!card) return [];

    return [
      {
        printingId: row.id,
        cardId: card.id,
        cardNumber: card.canonical_card_number,
        name: card.exact_name,
        imageUrl: row.image_url,
        printingLabel: row.printing_label,
        variantType: row.variant_type,
        isAlternateArt: row.is_alternate_art,
        isParallel: row.is_parallel,
        isPromo: row.is_promo,
        isReprint: row.is_reprint,
        rarity: row.rarity,
        facts: {
          cardType: card.card_type,
          colors: card.colors ?? [],
          cost: card.cost,
          power: card.power,
          counter: card.counter,
          life: card.life,
          attribute: card.attribute,
          traits: card.traits ?? [],
          rarity: card.rarity,
          effectText: card.effect_text,
          triggerText: card.trigger_text,
        },
      },
    ];
  });
}
