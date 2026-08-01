import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CardProvider, ProvidedCard } from "./provider";

export interface ImportSummary {
  provider: string;
  cards: number;
  printings: number;
  aliases: number;
  skippedImages: number;
}

/** Supabase rejects very large payloads; cards go up in batches. */
const BATCH = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * Imports a provider's cards into the database.
 *
 * Idempotent: re-running upserts on `(game, code)` rather than duplicating, so
 * an import can be repeated safely after a partial failure or a data
 * correction. Printings and aliases are replaced per card rather than merged —
 * a card losing a printing upstream should lose it here, and merging would
 * accumulate stale rows forever.
 *
 * Artwork is dropped unless the provider declares it may supply it. That check
 * lives here, once, rather than in every provider.
 */
export async function importCards(provider: CardProvider): Promise<ImportSummary> {
  const admin = getSupabaseAdmin();
  const cards = await provider.fetchCards();

  const summary: ImportSummary = {
    provider: provider.name,
    cards: 0,
    printings: 0,
    aliases: 0,
    skippedImages: 0,
  };

  for (const batch of chunk(cards, BATCH)) {
    const { data: rows, error } = await admin
      .from("cards")
      .upsert(batch.map(toCardRow), { onConflict: "game,code" })
      .select("id, code");

    if (error || !rows) {
      throw new Error(`Could not upsert cards: ${error?.message}`, { cause: error });
    }

    summary.cards += rows.length;

    const idByCode = new Map(rows.map((row) => [row.code, row.id]));
    await replaceChildren(batch, idByCode, provider, summary);
  }

  return summary;
}

function toCardRow(card: ProvidedCard) {
  return {
    code: card.code,
    name: card.name,
    category: card.category,
    colors: card.colors,
    types: card.types,
    cost: card.cost ?? null,
    power: card.power ?? null,
    counter: card.counter ?? null,
    life: card.life ?? null,
    attribute: card.attribute ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function replaceChildren(
  batch: ProvidedCard[],
  idByCode: Map<string, string>,
  provider: CardProvider,
  summary: ImportSummary,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const cardIds = batch
    .map((card) => idByCode.get(card.code))
    .filter(Boolean) as string[];

  if (cardIds.length === 0) return;

  await admin.from("card_printings").delete().in("card_id", cardIds);
  await admin.from("card_aliases").delete().in("card_id", cardIds);

  const printings = batch.flatMap((card) => {
    const cardId = idByCode.get(card.code);
    if (!cardId) return [];

    return card.printings.map((printing) => {
      // The single place artwork is gated. A provider that has not declared
      // the capability cannot populate it by accident or by mistake.
      const allowed = provider.capabilities.images ? (printing.imageUrl ?? null) : null;
      if (printing.imageUrl && !allowed) summary.skippedImages += 1;

      return {
        card_id: cardId,
        set_code: printing.setCode,
        rarity: printing.rarity ?? null,
        variant: printing.variant ?? null,
        image_url: allowed,
      };
    });
  });

  const aliases = batch.flatMap((card) => {
    const cardId = idByCode.get(card.code);
    if (!cardId) return [];
    return card.aliases.map((alias) => ({ card_id: cardId, alias }));
  });

  if (printings.length > 0) {
    const { error } = await admin.from("card_printings").insert(printings);
    if (error) {
      throw new Error(`Could not insert printings: ${error.message}`, { cause: error });
    }
    summary.printings += printings.length;
  }

  if (aliases.length > 0) {
    const { error } = await admin.from("card_aliases").insert(aliases);
    if (error) {
      throw new Error(`Could not insert aliases: ${error.message}`, { cause: error });
    }
    summary.aliases += aliases.length;
  }
}
