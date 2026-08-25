import { parseCardQuery } from "@/lib/cards/query";
import {
  floatAskedVariants,
  pickBasePrinting,
  printingLabel,
} from "@/lib/cards/schema";
import { searchCards } from "@/lib/cards/search";

export const dynamic = "force-dynamic";

/**
 * Card search for composing a Flare in the app — the same ranked search
 * the website's picker uses. Read-only over public catalog data, so no
 * authentication: the catalog is not a secret, and the picker has to
 * work the instant a guest starts typing.
 */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ cards: [] });

  /*
   * Same keyword narrowing the website's picker does, including the
   * fallback: if reading "leader" or "red" out of the text finds
   * nothing, the whole query runs unnarrowed, so the app can never end
   * up with fewer results than it had before.
   */
  const typed = parseCardQuery(query);
  let cards = await searchCards(typed.text, typed.filters);

  if (cards.length === 0 && typed.narrowed) {
    cards = await searchCards(query);
  }

  /* Same variant steering as the website: "zoro sp" floats the cards
     that have an SP and fronts each one's SP art. */
  const ask = typed.filters.variant;
  cards = floatAskedVariants(cards, ask);

  return Response.json({
    cards: cards.map((card) => ({
      id: card.id,
      name: card.exactName,
      cardNumber: card.canonicalCardNumber,
      // What the website's result row shows under the name — the app's
      // picker renders the same line and the same stats, so both send it.
      cardType: card.cardType,
      colors: card.colors,
      cost: card.cost,
      life: card.life,
      power: card.power,
      counter: card.counter,
      // The website leads with the base printing's art — or the version
      // the query asked for — never whichever set code sorted first; the
      // app must lead with the same one.
      basePrintingId: pickBasePrinting(card.printings, card.exactName, ask)?.id ?? null,
      printings: card.printings.map((printing) => ({
        id: printing.id,
        // The website's exact wording for a version — set code, rarity,
        // variant, promo, SPR-style mark — not the bare set code. The two
        // pickers must say the same thing about the same physical card.
        label: printingLabel(printing, card.exactName),
        imageUrl: printing.imageUrl,
      })),
    })),
  });
}
