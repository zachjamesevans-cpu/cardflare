import { variantName } from "./price-shape";
import { pickBasePrinting, type CardPrinting } from "./schema";

/**
 * A card's distinct artworks, for the card page's carousel: swipe across
 * a card's arts (its alternate arts, manga arts, promos) on the app and
 * the website. The founder (2026-11-25): "for alt arts, you should be
 * able to swipe between them like a carousel ... for all tcg's."
 *
 * One page per IMAGE, not per printing: Scrydex gives a foil and a
 * normal print the same picture, and two identical pages would read as
 * a bug. A page carries every variant it shows ("Normal · Foil"), so
 * the prices panel can follow the swipe. The plain art leads (the same
 * pick as everywhere a card is drawn), alternate arts after it.
 */
export interface CardArt {
  imageUrl: string;
  /** "Alt Art", "Normal · Foil". */
  label: string;
  /** Scrydex's variant names on this art: "normal", "foil". */
  variants: string[];
  /** Our printings with this art, the first the one a Flare names: each
      art is its own card to hunt (the founder, "all alternate arts need
      to be treated as separate cards"). */
  printingIds: string[];
}

export function cardArts(
  printings: readonly CardPrinting[],
  cardName: string,
): CardArt[] {
  const withArt = printings.filter((printing) => printing.imageUrl);
  if (withArt.length === 0) return [];
  const base = pickBasePrinting([...withArt], cardName);

  const groups = new Map<string, CardPrinting[]>();
  for (const printing of withArt) {
    const url = printing.imageUrl as string;
    groups.set(url, [...(groups.get(url) ?? []), printing]);
  }

  const alt = (group: CardPrinting[]) =>
    Number(
      group.every((printing) => /alt|manga|special/i.test(printing.variantType ?? "")),
    );
  const ordered = [...groups.entries()].sort(([urlA, a], [urlB, b]) => {
    if (urlA === base?.imageUrl) return -1;
    if (urlB === base?.imageUrl) return 1;
    return alt(a) - alt(b);
  });

  return ordered.map(([imageUrl, group]) => {
    const variants = group
      .map((printing) => printing.variantType)
      .filter((variant): variant is string => Boolean(variant));
    const names = [...new Set(variants.map(variantName))];
    return {
      imageUrl,
      label:
        names.length > 0 ? names.join(" · ") : (group[0].printingLabel ?? cardName),
      variants: [...new Set(variants)],
      printingIds: group.map((printing) => printing.id),
    };
  });
}
