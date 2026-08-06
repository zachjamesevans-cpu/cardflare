/**
 * Resolving a Collectr product name to a catalog printing.
 *
 * The rule that keeps this honest: a printing is assigned only when the
 * name in the player's file and the provider's own name for a printing of
 * that card are the *same words*. Nothing is inferred from suffixes —
 * "(Alternate Art)" is not parsed and classified, it simply has to appear
 * in both names. Collectr and the catalog both take their names from the
 * same printed cards, so when they agree, the agreement is evidence; when
 * they differ at all, the row stays printing-unknown, which the matcher
 * already treats truthfully as "have the card, printing unproven".
 *
 * Free of server-only imports so the equality rule is unit-testable
 * against names from the real pilot file.
 */

export interface PrintingName {
  id: string;
  /** The provider's name for the printing; null when it never gave one. */
  printingName: string | null;
}

/**
 * The words of a name, spelling differences that carry no meaning removed:
 * case, runs of whitespace, and the punctuation conventions the two
 * sources are known to disagree on (Collectr writes "Monkey.D.Luffy -
 * ST01-012", hyphens and dots vary by list). Letters, digits and the
 * parenthetical structure all still have to agree.
 */
export function normalizeProductName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.\-–—'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The one printing this product name proves, or null.
 *
 * Null on no match — the catalog may simply not carry the set yet — and
 * null on more than one match, because two printings answering to the
 * same name is ambiguity, and recording either would be a guess.
 */
export function resolvePrintingId(
  productName: string,
  printings: PrintingName[],
): string | null {
  const wanted = normalizeProductName(productName);
  if (!wanted) return null;

  const hits = printings.filter(
    (printing) =>
      printing.printingName !== null &&
      normalizeProductName(printing.printingName) === wanted,
  );

  return hits.length === 1 ? hits[0].id : null;
}
