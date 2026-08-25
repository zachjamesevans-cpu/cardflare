import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeName } from "./domain";
import {
  CARD_ART_BUCKET,
  cardArtExtension,
  cardArtFolder,
  cardArtObjectPath,
  cardArtSrc,
  cardArtStem,
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
 * **The pictures arrive one request each.** The first cut posted the
 * whole set in a single form and the founder's real import — two hundred
 * cards, some forty megabytes — took the page down. A Server Action
 * request is capped at 1MB by default and Vercel refuses a body over
 * 4.5MB whatever Next is configured to allow, so no amount of raising a
 * limit fixes it. Each picture is its own small request now, and the
 * rows are written afterwards from what actually landed in the bucket.
 *
 * That split has a second benefit worth keeping: an import that dies
 * half way can be run again and picks up where it stopped, because the
 * bucket is the record of what arrived rather than a variable in a
 * request that no longer exists.
 *
 * Everything is written under the manifest's own provider key, never
 * under a real provider's, which is what makes the whole import
 * reversible — see `deleteImportedSet`.
 */

/** One card's artwork, already read into memory by the caller. */
export interface ImportImage {
  mimeType: string;
  bytes: ArrayBuffer;
}

/**
 * Stores one card's picture, and nothing else.
 *
 * Returns the object path so the caller can report it. Re-storing
 * replaces rather than fails: the path is derived from the card, so an
 * upload for a card that already has art IS the correction.
 */
export async function storeCardArt(
  providerKey: string,
  setCode: string,
  externalId: string,
  image: ImportImage,
): Promise<{ objectPath: string } | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "The database is not configured." };

  const extension = cardArtExtension(image.mimeType);
  if (!extension) return { error: `${image.mimeType} is not an image we store.` };

  const objectPath = cardArtObjectPath({
    providerKey,
    setCode,
    cardNumber: externalId,
    extension,
  });

  const { error } = await getSupabaseAdmin()
    .storage.from(CARD_ART_BUCKET)
    .upload(objectPath, image.bytes, { contentType: image.mimeType, upsert: true });

  if (error) {
    console.error(`Could not store art at ${objectPath}`, error);
    return { error: error.message };
  }

  return { objectPath };
}

/**
 * The art already in the bucket for one set, keyed by card stem.
 *
 * Read from storage rather than tracked through the upload, so a run
 * that was interrupted, retried, or done in two sittings still writes
 * rows that match what is actually there.
 */
export async function storedArtFor(
  providerKey: string,
  setCode: string,
): Promise<Map<string, string>> {
  const folder = cardArtFolder(providerKey, setCode);
  const found = new Map<string, string>();

  if (!isSupabaseConfigured()) return found;

  /* Paged: the listing caps at 100 by default, and a set is bigger. */
  for (let offset = 0; offset < 2000; offset += 100) {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(CARD_ART_BUCKET)
      .list(folder, { limit: 100, offset });

    if (error) {
      console.error("Could not list the stored card art", error);
      break;
    }

    const page = data ?? [];
    for (const object of page) {
      const stem = object.name.slice(0, object.name.lastIndexOf("."));
      if (stem) found.set(stem, `${folder}/${object.name}`);
    }

    if (page.length < 100) break;
  }

  return found;
}

export interface ImportOutcome {
  cards: number;
  printings: number;
  images: number;
  /** Card numbers with no art in the bucket. Named so they can be retried. */
  missing: string[];
}

/**
 * Writes the cards and printings, pointing each at whatever art is
 * already stored for it.
 *
 * Runs after the pictures, never before: a row claiming an image that is
 * not in the bucket is a card that renders as a broken placeholder, and
 * the other order guarantees a window where that is true for every card
 * in the set.
 */
export async function writeImportedSet(
  manifest: ImportManifest,
): Promise<ImportOutcome | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "The database is not configured." };

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const stored = await storedArtFor(manifest.provider, manifest.setCode);

  /*
   * One row per card NUMBER, not per manifest entry: a base art and an
   * alternate art are two printings of one card, and `cards` is keyed on
   * the number. Deduplicated here rather than by the upsert, because
   * PostgreSQL refuses an ON CONFLICT batch that hits the same key twice
   * within a single statement. The BASE printing speaks for the card
   * when the manifest has one — a parallel's page entry sometimes states
   * less than its base does.
   */
  const byNumber = new Map<string, ImportCard>();
  for (const card of manifest.cards) {
    const held = byNumber.get(card.cardNumber);
    if (!held || (held.parallel !== undefined && card.parallel === undefined)) {
      byNumber.set(card.cardNumber, card);
    }
  }

  const cardRows = [...byNumber.values()].map((card) => ({
    canonical_card_number: card.cardNumber,
    compact_card_number: compactNumber(card.cardNumber),
    exact_name: card.name,
    normalized_name: normalizeName(card.name),
    provider_key: manifest.provider,
    provider_external_id: card.cardNumber,
    /*
     * Gameplay fields are written EXPLICITLY, absent ones as null. A
     * field in the manifest was read off a source that stated it — the
     * official card list states them all — and a field the source did
     * not state stays null rather than being guessed, so nothing in the
     * catalogue is indistinguishable from a fact without being one.
     * Spelling every column out also means a column added tomorrow fails
     * the typecheck here rather than being quietly skipped.
     */
    card_type: card.cardType ?? null,
    colors: card.colors ?? [],
    traits: card.traits ?? [],
    cost: card.cost ?? null,
    power: card.power ?? null,
    counter: card.counter ?? null,
    life: card.life ?? null,
    rarity: card.rarity ?? null,
    attribute: card.attribute ?? null,
    effect_text: card.effectText ?? null,
    trigger_text: card.triggerText ?? null,
    raw_metadata: { source: manifest.provider, setCode: manifest.setCode },
    provider_updated_at: null,
    updated_at: now,
  }));

  const { error: cardError } = await admin
    .from("cards")
    .upsert(cardRows, { onConflict: "game,canonical_card_number" });

  if (cardError) return { error: `Could not write the cards: ${cardError.message}` };

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

  const missing: string[] = [];
  let withArt = 0;

  const printingRows = [];

  /*
   * Whether this manifest's source records parallels at all. Decided
   * over the whole manifest, not per card: "no suffix" only means "the
   * regular printing" on a source that writes suffixes.
   */
  const statesParallels = manifest.cards.some((entry) => entry.parallel !== undefined);

  for (const card of manifest.cards) {
    const cardId = idByNumber.get(card.cardNumber);
    if (!cardId) {
      missing.push(card.cardNumber);
      continue;
    }

    const externalId = importExternalId(card);
    const objectPath = stored.get(cardArtStem(externalId)) ?? null;

    if (objectPath) withArt += 1;
    else missing.push(card.cardNumber);

    /*
     * Variant flags stay three-valued. For most manifests nobody has
     * classified anything, so they stay null — but the official card
     * list's `_pN` suffix is a statement both ways: a suffixed entry IS
     * a parallel, and an unsuffixed entry on the official list IS the
     * set's regular printing. What KIND of parallel — manga, special —
     * is still a person's call, made on the review screen.
     */
    const isParallel = card.parallel !== undefined;

    printingRows.push({
      card_id: cardId,
      provider_key: manifest.provider,
      provider_external_id: externalId,
      set_code: manifest.setCode,
      set_name: manifest.setName,
      printing_label: card.printingLabel ?? null,
      variant_type: null,
      rarity: card.rarity ?? null,
      printing_name: card.name,
      image_id: null,
      provider_source: "import",
      is_alternate_art: statesParallels ? isParallel : null,
      is_promo: null,
      is_parallel: statesParallels ? isParallel : null,
      is_reprint: null,
      language: "en",
      image_url: objectPath ? cardArtSrc(objectPath) : null,
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
    images: withArt,
    missing: [...new Set(missing)].sort(),
  };
}

export interface DeleteOutcome {
  printings: number;
  cards: number;
  images: number;
}

/**
 * Removes an imported set completely: rows, art and all.
 *
 * The founder imported a manifest before its pictures, ended up with two
 * hundred artless cards and no way back. A door in needs a door out, and
 * "run some SQL" is not one when the console is where the mistake was
 * made.
 *
 * Card rows are deleted only when nothing else points at them. A card
 * this import created that a real provider has since also published
 * belongs to the provider now, and deleting it would take the provider's
 * printing down with it.
 */
export async function deleteImportedSet(
  providerKey: string,
  setCode: string,
): Promise<DeleteOutcome | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "The database is not configured." };

  const admin = getSupabaseAdmin();

  const { data: doomed, error: findError } = await admin
    .from("card_printings")
    .select("id, card_id")
    .eq("provider_key", providerKey)
    .eq("set_code", setCode);

  if (findError) return { error: `Could not find the set: ${findError.message}` };

  const printings = doomed ?? [];
  const cardIds = [...new Set(printings.map((row) => row.card_id))];

  if (printings.length > 0) {
    const { error } = await admin
      .from("card_printings")
      .delete()
      .in(
        "id",
        printings.map((row) => row.id),
      );

    if (error) return { error: `Could not remove the printings: ${error.message}` };
  }

  /*
   * Only the cards nothing is left pointing at. Asked AFTER the
   * printings are gone, so the question is "is anything still using
   * this?" rather than "was anything else using it before?".
   */
  let orphaned: string[] = [];

  if (cardIds.length > 0) {
    const { data: survivors } = await admin
      .from("card_printings")
      .select("card_id")
      .in("card_id", cardIds);

    const stillUsed = new Set((survivors ?? []).map((row) => row.card_id));
    orphaned = cardIds.filter((id) => !stillUsed.has(id));

    if (orphaned.length > 0) {
      const { error } = await admin.from("cards").delete().in("id", orphaned);
      if (error) return { error: `Could not remove the cards: ${error.message}` };
    }
  }

  /* The bucket last. A stored object with no row is invisible; a row
     pointing at a deleted object is a broken picture on a board. */
  const stored = await storedArtFor(providerKey, setCode);
  const paths = [...stored.values()];

  if (paths.length > 0) {
    const { error } = await admin.storage.from(CARD_ART_BUCKET).remove(paths);
    if (error) console.error("Could not remove the stored art", error);
  }

  return {
    printings: printings.length,
    cards: orphaned.length,
    images: paths.length,
  };
}
