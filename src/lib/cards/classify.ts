import { z } from "zod";

/**
 * What a printing IS, in the words the founder uses.
 *
 * The Bandai page states that a parallel exists (the `_pN` suffix) but
 * never what kind it is — a manga art and a plain alternate art look
 * identical in the markup. That call needs eyes on the picture, so it
 * belongs to a person in the admin console, and this module is the
 * shared vocabulary between that screen and the database.
 *
 * Free of server imports so the mapping is unit-testable and the client
 * can render the choices without pulling server code into the bundle.
 */

/**
 * The words are the PROVIDER'S words, letter for letter. The founder,
 * with two search results side by side: a synced alt art reads
 * "OP-16 · L · Alternate Art" while an imported one read "Alt art · L"
 * — "make sure the naming structure when searching things is the
 * same". So a classification writes `variant_type` ("Alternate Art",
 * "SP", "Manga") and leaves `printing_label` alone, which keeps the
 * set code first in every chip exactly as the sync's printings render.
 */
export const PRINTING_CLASSIFICATIONS = [
  "base",
  "alt-art",
  "manga",
  "sp",
  "promo",
  "reprint",
  "unclassified",
] as const;

export type PrintingClassification = (typeof PRINTING_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABELS: Record<PrintingClassification, string> = {
  base: "Base art",
  "alt-art": "Alternate Art",
  manga: "Manga",
  sp: "SP",
  promo: "Promo",
  reprint: "Reprint",
  unclassified: "Not classified",
};

/** What each choice writes. Booleans follow the schema's three-valued rule. */
export interface PrintingClassificationColumns {
  /**
   * Always null: the chip's first part must stay the set code, exactly
   * as the sync's printings render. The variant word rides in
   * `variant_type`, which the chip prints after the rarity.
   */
  printing_label: null;
  variant_type: string | null;
  is_alternate_art: boolean | null;
  is_parallel: boolean | null;
  is_promo: boolean | null;
  is_reprint: boolean | null;
}

/**
 * The columns a classification sets.
 *
 * A human choosing IS information, so the booleans the choice speaks to
 * become true or false rather than staying null — saying "this is the
 * base art" is exactly a claim that it is not an alternate art. The
 * booleans a choice says nothing about stay null: classifying a manga
 * art says nothing about whether it is also a reprint.
 *
 * "unclassified" returns everything to null, the honest state for a
 * printing nobody has looked at — it is the undo, and it is why the
 * choice exists at all.
 */
export function classificationColumns(
  choice: PrintingClassification,
  label?: string | null,
): PrintingClassificationColumns {
  /* An override changes the WORD, never the structure: it lands in
     variant_type on the choices that have one. */
  const word = (usual: string) => label?.trim() || usual;

  switch (choice) {
    case "base":
      return {
        printing_label: null,
        variant_type: null,
        is_alternate_art: false,
        is_parallel: false,
        is_promo: false,
        is_reprint: null,
      };
    case "alt-art":
      return {
        printing_label: null,
        variant_type: word("Alternate Art"),
        is_alternate_art: true,
        is_parallel: true,
        is_promo: false,
        is_reprint: null,
      };
    case "manga":
      return {
        printing_label: null,
        variant_type: word("Manga"),
        is_alternate_art: true,
        is_parallel: true,
        is_promo: false,
        is_reprint: null,
      };
    case "sp":
      return {
        printing_label: null,
        variant_type: word("SP"),
        is_alternate_art: true,
        is_parallel: true,
        is_promo: false,
        is_reprint: null,
      };
    case "promo":
      return {
        printing_label: null,
        variant_type: null,
        is_alternate_art: null,
        is_parallel: null,
        is_promo: true,
        is_reprint: null,
      };
    case "reprint":
      return {
        printing_label: null,
        variant_type: null,
        is_alternate_art: null,
        is_parallel: null,
        is_promo: false,
        is_reprint: true,
      };
    case "unclassified":
      return {
        printing_label: null,
        variant_type: null,
        is_alternate_art: null,
        is_parallel: null,
        is_promo: null,
        is_reprint: null,
      };
  }
}

/**
 * Reads a stored printing back into the closest choice, so the review
 * screen's select shows what the row already says instead of a blank.
 */
export function classificationOf(row: {
  variant_type: string | null;
  is_alternate_art: boolean | null;
  is_parallel: boolean | null;
  is_promo: boolean | null;
  is_reprint: boolean | null;
}): PrintingClassification {
  const variant = row.variant_type?.toLowerCase() ?? "";
  if (variant.startsWith("manga")) return "manga";
  if (variant === "sp" || variant.startsWith("special")) return "sp";
  if (row.is_promo) return "promo";
  if (row.is_reprint) return "reprint";
  if (row.is_alternate_art || row.is_parallel || variant.startsWith("alternate")) {
    return "alt-art";
  }
  if (row.is_alternate_art === false || row.is_parallel === false) return "base";
  return "unclassified";
}

export const classifyPrintingSchema = z.object({
  printingId: z.string().uuid(),
  classification: z.enum(PRINTING_CLASSIFICATIONS),
  label: z.string().trim().max(80).optional(),
});
