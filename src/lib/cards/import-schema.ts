import { z } from "zod";

/**
 * A set of cards imported from somewhere that is not a data provider.
 *
 * The founder's ask: OP-17 exists as spoilers on a fan site months
 * before any API carries it, and a board with no artwork for the set
 * everybody is actually hunting is a board nobody opens.
 *
 * Deliberately a manifest rather than a scraper endpoint. The server
 * never fetches a third-party page: the markup of a fan site changes
 * without warning, and a scrape running inside a request handler turns
 * somebody else's redesign into our outage. Collection happens on a
 * machine that can be watched, and what arrives here is data.
 *
 * Free of server-only imports so the rules can be unit-tested and so the
 * admin's browser can validate a file before spending an upload on it.
 */

/** Where a manifest came from. Stored as the printing's provider key. */
export const IMPORT_PROVIDERS = ["bandai", "kaizoku", "manual"] as const;

export type ImportProvider = (typeof IMPORT_PROVIDERS)[number];

export const IMPORT_PROVIDER_LABELS: Record<ImportProvider, string> = {
  bandai: "Official Bandai card list",
  kaizoku: "Car D. Kaizoku (spoilers)",
  manual: "Typed in by hand",
};

/** The six colours the game has printed. Lowercase, matching the sync. */
export const CARD_COLORS = [
  "red",
  "green",
  "blue",
  "purple",
  "black",
  "yellow",
] as const;

/** The card categories, in the provider's own capitalisation. */
export const CARD_CATEGORIES = [
  "Leader",
  "Character",
  "Event",
  "Stage",
  "DON!!",
] as const;

/**
 * One card. Gameplay fields are OPTIONAL, not absent.
 *
 * The original rule stands for spoiler scrapes: a fan site has a picture
 * and a number, and inventing a cost to fill the row would put a guess
 * in the catalogue that nothing later distinguishes from a fact. But the
 * official Bandai card list states every gameplay field, and refusing to
 * carry a fact because a different source could not have known it would
 * be the same mistake in the other direction. So: a field that is
 * present was read off a source that stated it; a field that is absent
 * stays null in the catalogue. Nothing here is ever guessed to fill a
 * gap — `duplicatePrintings` and the admin review screen exist for the
 * judgment calls.
 */
export const importCardSchema = z.object({
  /** The printed identifier, e.g. OP17-001. Normalised to upper case. */
  cardNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, "A card number is needed.")
    .max(20, "That does not look like a card number.")
    .regex(
      /^[A-Z0-9]+-[A-Z0-9]+$/,
      "Card numbers look like OP17-001: letters and digits either side of one dash.",
    ),
  /** The card's printed name, verbatim. */
  name: z
    .string()
    .trim()
    .min(1, "A card name is needed.")
    .max(200, "That name is too long to be real."),
  /**
   * Where the image was found. Only ever read by the collector on its own
   * machine — the server never fetches it, and it is kept so a wrong
   * picture can be traced back to the page it came from.
   */
  sourceUrl: z.string().trim().url().max(2000).optional(),
  /** Which file in the upload is this card's art. */
  file: z
    .string()
    .trim()
    .min(1)
    .max(200)
    /* No directories: the uploader matches these against file names, and
       a path here would be a way to reach outside the chosen folder. */
    .regex(/^[A-Za-z0-9._-]+$/, "File names only, no folders."),
  /** Base art, alternate art, and so on. Free text, shown as the label. */
  printingLabel: z.string().trim().max(80).optional(),
  rarity: z.string().trim().max(20).optional(),
  /**
   * The `_pN` suffix on the source's own id for this printing — a fact
   * off the page, recorded as the number it was. Classifying what the
   * parallel IS (manga art, special art) is a human call made in the
   * admin console afterwards, never here.
   */
  parallel: z.number().int().min(1).max(20).optional(),

  /* Gameplay, exactly as the provider sync spells it, so an imported
     card and a synced card answer the same search filters identically. */
  cardType: z.enum(CARD_CATEGORIES).optional(),
  colors: z.array(z.enum(CARD_COLORS)).max(3).optional(),
  cost: z.number().int().min(0).max(99).optional(),
  power: z.number().int().min(-99999).max(99999).optional(),
  counter: z.number().int().min(0).max(99999).optional(),
  life: z.number().int().min(0).max(99).optional(),
  attribute: z.string().trim().min(1).max(40).optional(),
  traits: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  effectText: z.string().trim().min(1).max(2000).optional(),
  triggerText: z.string().trim().min(1).max(1000).optional(),
});

export type ImportCard = z.infer<typeof importCardSchema>;

/**
 * The review screen's card edit, validated server-side like every write.
 *
 * Every field is present and nullable, unlike the import's optionals:
 * the form always states the whole card, so an empty input is an
 * explicit "this card has none", not an absence of information.
 */
export const cardFactsSchema = z.object({
  cardId: z.string().uuid(),
  cardType: z.enum(CARD_CATEGORIES).nullable(),
  colors: z.array(z.enum(CARD_COLORS)).max(3),
  cost: z.number().int().min(0).max(99).nullable(),
  power: z.number().int().min(-99999).max(99999).nullable(),
  counter: z.number().int().min(0).max(99999).nullable(),
  life: z.number().int().min(0).max(99).nullable(),
  attribute: z.string().trim().min(1).max(40).nullable(),
  traits: z.array(z.string().trim().min(1).max(80)).max(10),
  rarity: z.string().trim().min(1).max(20).nullable(),
  effectText: z.string().trim().min(1).max(2000).nullable(),
  triggerText: z.string().trim().min(1).max(1000).nullable(),
});

export type CardFacts = z.infer<typeof cardFactsSchema>;

export const importManifestSchema = z.object({
  provider: z.enum(IMPORT_PROVIDERS),
  /** e.g. OP17. Upper-cased to match `card_printings_set_code_is_normalized`. */
  setCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "A set code is needed.")
    .max(20)
    .regex(/^[A-Z0-9-]+$/, "Set codes are letters, digits and dashes."),
  /** e.g. "Emperors of the New World". Shown beside cards from the set. */
  setName: z.string().trim().min(1, "A set name is needed.").max(120),
  cards: z
    .array(importCardSchema)
    .min(1, "The manifest has no cards in it.")
    .max(1000, "That is more cards than any one set has."),
});

export type ImportManifest = z.infer<typeof importManifestSchema>;

/**
 * Card numbers appearing more than once in one manifest.
 *
 * Not an error on its own — a set legitimately has a base art and an
 * alternate art of the same number — but it IS an error when the two
 * carry the same printing label, because then they are the same printing
 * twice and the second would silently overwrite the first.
 */
export function duplicatePrintings(manifest: ImportManifest): string[] {
  const seen = new Set<string>();
  const clashes = new Set<string>();

  for (const card of manifest.cards) {
    const key = `${card.cardNumber}::${card.printingLabel ?? ""}`;
    if (seen.has(key)) clashes.add(card.cardNumber);
    seen.add(key);
  }

  return [...clashes].sort();
}

/**
 * The printing's stable identity within this provider.
 *
 * Card number and label, because that is what makes two rows genuinely
 * different products. Re-running an import with a corrected image
 * therefore updates the row rather than adding a second one.
 */
export function importExternalId(card: ImportCard): string {
  return card.printingLabel
    ? `${card.cardNumber}::${card.printingLabel}`
    : card.cardNumber;
}

/** Digits and letters only, for searching a number typed without the dash. */
export function compactNumber(cardNumber: string): string {
  return cardNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** What one picture's upload came back with. */
export type UploadResult = { ok: true } | { ok: false; reason: string };

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "deleted"; message: string }
  | {
      status: "done";
      message: string;
      cards: number;
      printings: number;
      images: number;
      /** Cards with no art in the bucket, named so they can be retried. */
      missing: string[];
    };

export const IMPORT_IDLE: ImportState = { status: "idle" };
