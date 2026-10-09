/**
 * A scanned card, in the picker's own shape.
 *
 * The scan route answers with the website's CardResult (the same card
 * the website's scanner gets), and the binder's picker and tray speak
 * CardHit, the shape /api/v1/cards sends. This is the one translation,
 * kept apart from ./api so tests/unit/card-scan-app.test.ts can run it
 * beside the website's `printingLabel` and fail if a version reads
 * differently on the phone.
 */

/** A printing as the website sends it (src/lib/cards/schema.ts CardPrinting). */
export interface ScanPrinting {
  id: string;
  setCode: string | null;
  setName: string | null;
  printingLabel: string | null;
  variantType: string | null;
  rarity: string | null;
  printingName: string | null;
  isPromo: boolean | null;
  imageUrl: string | null;
}

/** A card as the website sends it (src/lib/cards/schema.ts CardResult). */
export interface ScanCard {
  id: string;
  exactName: string;
  canonicalCardNumber: string;
  cardType: string | null;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  printings: ScanPrinting[];
  game?: string | null;
}

/** "EB04-007", "OP01-024b": the shape of a printed number, not a word. */
const CARD_NUMBER_SHAPE = /^[a-z]{1,4}\d{2,}-\d+[a-z]*$/i;

/** The website's `printingVariantMark`, line for line. */
function variantMark(printing: ScanPrinting, cardName: string): string | null {
  const name = printing.printingName?.trim();
  if (!name || name === cardName) return null;
  if (!name.startsWith(cardName)) return name;

  const suffix = name.slice(cardName.length).trim();
  const groups = [...suffix.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim());
  const outside = suffix
    .replace(/\(([^()]*)\)/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kept = [outside, ...groups].filter(
    (part) => part.length > 0 && !CARD_NUMBER_SHAPE.test(part),
  );
  return kept.length > 0 ? kept.join(" ") : null;
}

/** The website's `printingLabel(printing, cardName)`: how a version reads. */
export function scanPrintingLabel(
  printing: ScanPrinting,
  cardName: string,
): string | null {
  const parts = [
    printing.printingLabel ?? printing.setCode,
    printing.rarity,
    printing.variantType &&
    printing.rarity &&
    printing.variantType.trim().toLowerCase() === printing.rarity.trim().toLowerCase()
      ? null
      : printing.variantType,
    printing.isPromo ? "Promo" : null,
    variantMark(printing, cardName),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The card as a picker row. Its art leads with the printing the scan
 * pointed at, else the first printing that has a picture.
 */
export function scanHit(
  card: ScanCard,
  printingId: string | null,
): {
  id: string;
  name: string;
  cardNumber: string;
  cardType: string | null;
  colors: string[];
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  basePrintingId: string | null;
  printings: { id: string; label: string | null; imageUrl: string | null }[];
  game: string | null;
} {
  const lead =
    card.printings.find(
      (printing) => printing.id === printingId && printing.imageUrl,
    ) ??
    card.printings.find((printing) => printing.imageUrl) ??
    card.printings[0] ??
    null;
  return {
    id: card.id,
    name: card.exactName,
    cardNumber: card.canonicalCardNumber,
    cardType: card.cardType,
    colors: card.colors,
    cost: card.cost,
    life: card.life,
    power: card.power,
    counter: card.counter,
    basePrintingId: lead?.id ?? null,
    printings: card.printings.map((printing) => ({
      id: printing.id,
      label: scanPrintingLabel(printing, card.exactName),
      imageUrl: printing.imageUrl,
    })),
    game: card.game ?? null,
  };
}
