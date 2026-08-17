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
export const IMPORT_PROVIDERS = ["kaizoku", "manual"] as const;

export type ImportProvider = (typeof IMPORT_PROVIDERS)[number];

export const IMPORT_PROVIDER_LABELS: Record<ImportProvider, string> = {
  kaizoku: "Car D. Kaizoku (spoilers)",
  manual: "Typed in by hand",
};

/**
 * One card. Gameplay fields are absent on purpose.
 *
 * A spoiler image and a card number is genuinely all a scrape has, and
 * inventing a cost or a colour to fill the row would put guesses in the
 * catalogue that nothing later distinguishes from facts. The columns are
 * nullable; they stay null until a provider supplies them.
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
});

export type ImportCard = z.infer<typeof importCardSchema>;

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

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      message: string;
      cards: number;
      printings: number;
      images: number;
      /** Cards whose art could not be stored, named so they can be retried. */
      skipped: string[];
    };

export const IMPORT_IDLE: ImportState = { status: "idle" };
