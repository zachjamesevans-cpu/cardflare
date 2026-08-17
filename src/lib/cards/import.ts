import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeName } from "./domain";
import {
  CARD_ART_BUCKET,
  cardArtObjectPath,
  cardArtSrc,
  cardArtExtension,
} from "./art-storage";
import {
  compactNumber,
  importExternalId,
  type ImportCard,
  type ImportManifest,
} from "./import-schema";

/**
 * Bringing a set into the catalogue from a manifest and a pile of files.
 *
 * The counterpart to `sync.ts`, and deliberately not part of it. A sync
 * pulls from a provider that guarantees a shape; this takes whatever a
 * person could gather and writes the little of it that is trustworthy.
 * Folding the two together would mean the sync's contracts quietly
 * loosening to accommodate a scrape.
 *
 * Everything is written under the manifest's own provider key, never
 * under a real provider's. That is what makes the whole import
 * reversible in one statement the day a provider ships the set properly:
 *
 *   delete from public.card_printings
 *    where provider_key = 'kaizoku' and set_code = 'OP17';
 */

export interface ImportOutcome {
  cards: number;
  printings: number;
  images: number;
  /** Card numbers whose art did not store. Named so they can be retried. */
  skipped: string[];
}

/** One card's artwork, already read into memory by the caller. */
export interface ImportImage {
  /** Matches `ImportCard.file`. */
  file: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

/**
 * Writes the cards, stores the art, then writes the printings.
 *
 * In that order for a reason. A printing row carries the path its image
 * will be served from, so the file has to be in the bucket before the
 * row claiming it exists — the other way round leaves a window where the
 * catalogue points at nothing. A card whose image fails to store gets a
 * printing with no art rather than no printing at all: the number and
 * the name are still worth having, and the board renders the placeholder
 * exactly as it does for any card the provider gave no picture for.
 */
export async function importCardSet(
  manifest: ImportManifest,
  images: Map<string, ImportImage>,
): Promise<ImportOutcome | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "The database is not configured." };

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  /*
   * One row per card NUMBER, not per manifest entry: a base art and an
   * alternate art are two printings of one card, and `cards` is keyed on
   * the number. Deduplicated here rather than by the upsert, because
   * PostgreSQL refuses an ON CONFLICT batch that hits the same key twice
   * within a single statement.
   */
  const byNumber = new Map<string, ImportCard>();
  for (const card of manifest.cards) {
    if (!byNumber.has(card.cardNumber)) byNumber.set(card.cardNumber, card);
  }

  const cardRows = [...byNumber.values()].map((card) => ({
    canonical_card_number: card.cardNumber,
    compact_card_number: compactNumber(card.cardNumber),
    exact_name: card.name,
    normalized_name: normalizeName(card.name),
    provider_key: manifest.provider,
    provider_external_id: card.cardNumber,
    /*
     * Gameplay fields are written EXPLICITLY null rather than left off.
     * A scrape has a picture and a number; writing a guessed cost would
     * put something in the catalogue that nothing later tells apart from
     * a fact. Spelling them out also means a column added tomorrow
     * fails the typecheck here rather than being quietly skipped.
     */
    card_type: null,
    colors: [],
    traits: [],
    cost: null,
    power: null,
    counter: null,
    life: null,
    rarity: card.rarity ?? null,
    attribute: null,
    effect_text: null,
    trigger_text: null,
    raw_metadata: { source: manifest.provider, setCode: manifest.setCode },
    provider_updated_at: null,
    updated_at: now,
  }));

  const { error: cardError } = await admin
    .from("cards")
    .upsert(cardRows, { onConflict: "game,canonical_card_number" });

  if (cardError) {
    return { error: `Could not write the cards: ${cardError.message}` };
  }

  /* Read the ids back: the upsert may have updated rows that already
     existed, so the ids are not knowable from what was just sent. */
  const { data: written, error: readError } = await admin
    .from("cards")
    .select("id, canonical_card_number")
    .in("canonical_card_number", [...byNumber.keys()]);

  if (readError) {
    return { error: `Could not read the cards back: ${readError.message}` };
  }

  const idByNumber = new Map(
    (written ?? []).map((row) => [row.canonical_card_number, row.id]),
  );

  const skipped: string[] = [];
  let stored = 0;

  const printingRows = [];

  for (const card of manifest.cards) {
    const cardId = idByNumber.get(card.cardNumber);
    if (!cardId) {
      skipped.push(card.cardNumber);
      continue;
    }

    const image = images.get(card.file);
    let imageUrl: string | null = null;

    if (image) {
      const extension = cardArtExtension(image.mimeType);

      if (!extension) {
        skipped.push(card.cardNumber);
      } else {
        const objectPath = cardArtObjectPath({
          providerKey: manifest.provider,
          setCode: manifest.setCode,
          cardNumber: importExternalId(card),
          extension,
        });

        const { error: uploadError } = await admin.storage
          .from(CARD_ART_BUCKET)
          .upload(objectPath, image.bytes, {
            contentType: image.mimeType,
            /* Re-running an import with a corrected picture must replace
               the file rather than fail: the path is derived from the
               card, so the old object is the one being corrected. */
            upsert: true,
          });

        if (uploadError) {
          console.error(`Could not store art for ${card.cardNumber}`, uploadError);
          skipped.push(card.cardNumber);
        } else {
          imageUrl = cardArtSrc(objectPath);
          stored += 1;
        }
      }
    }

    printingRows.push({
      card_id: cardId,
      provider_key: manifest.provider,
      provider_external_id: importExternalId(card),
      set_code: manifest.setCode,
      set_name: manifest.setName,
      printing_label: card.printingLabel ?? null,
      variant_type: null,
      rarity: card.rarity ?? null,
      printing_name: card.name,
      image_id: null,
      provider_source: "import",
      /* Three-valued on purpose in the schema: null means nobody
         classified this printing, which is the truth for a scrape. */
      is_alternate_art: null,
      is_promo: null,
      is_parallel: null,
      is_reprint: null,
      language: "en",
      image_url: imageUrl,
      raw_metadata: card.sourceUrl ? { sourceUrl: card.sourceUrl } : null,
      provider_updated_at: null,
      updated_at: now,
    });
  }

  const { error: printingError } = await admin
    .from("card_printings")
    .upsert(printingRows, { onConflict: "provider_key,provider_external_id" });

  if (printingError) {
    return { error: `Could not write the printings: ${printingError.message}` };
  }

  return {
    cards: cardRows.length,
    printings: printingRows.length,
    images: stored,
    skipped: [...new Set(skipped)].sort(),
  };
}
