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

export const PRINTING_CLASSIFICATIONS = [
  "base",
  "alt-art",
  "manga",
  "special",
  "promo",
  "reprint",
  "unclassified",
] as const;

export type PrintingClassification = (typeof PRINTING_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABELS: Record<PrintingClassification, string> = {
  base: "Base art",
  "alt-art": "Alt art",
  manga: "Manga art",
  special: "Special art",
  promo: "Promo",
  reprint: "Reprint",
  unclassified: "Not classified",
};

/** What each choice writes. Booleans follow the schema's three-valued rule. */
export interface PrintingClassificationColumns {
  /** What players see in the printing chip, or null to fall back to the set code. */
  printing_label: string | null;
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
  const custom = label?.trim() || null;

  switch (choice) {
    case "base":
      return {
        printing_label: custom,
        variant_type: null,
        is_alternate_art: false,
        is_parallel: false,
        is_promo: false,
        is_reprint: null,
      };
    case "alt-art":
      return {
        printing_label: custom ?? "Alt art",
        variant_type: null,
        is_alternate_art: true,
        is_parallel: true,
        is_promo: false,
        is_reprint: null,
      };
    case "manga":
      return {
        printing_label: custom ?? "Manga art",
        variant_type: "manga",
        is_alternate_art: true,
        is_parallel: true,
        is_promo: false,
        is_reprint: null,
      };
    case "special":
      return {
        printing_label: custom ?? "Special art",
        variant_type: "special",
        is_alternate_art: true,
        is_parallel: true,
        is_promo: false,
        is_reprint: null,
      };
    case "promo":
      return {
        printing_label: custom ?? "Promo",
        variant_type: null,
        is_alternate_art: null,
        is_parallel: null,
        is_promo: true,
        is_reprint: null,
      };
    case "reprint":
      return {
        printing_label: custom,
        variant_type: null,
        is_alternate_art: null,
        is_parallel: null,
        is_promo: false,
        is_reprint: true,
      };
    case "unclassified":
      return {
        printing_label: custom,
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
  if (row.variant_type === "manga") return "manga";
  if (row.variant_type === "special") return "special";
  if (row.is_promo) return "promo";
  if (row.is_reprint) return "reprint";
  if (row.is_alternate_art || row.is_parallel) return "alt-art";
  if (row.is_alternate_art === false || row.is_parallel === false) return "base";
  return "unclassified";
}

export const classifyPrintingSchema = z.object({
  printingId: z.string().uuid(),
  classification: z.enum(PRINTING_CLASSIFICATIONS),
  label: z.string().trim().max(80).optional(),
});
