import { printingLabel } from "@/lib/cards/schema";
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

  const cards = await searchCards(query);

  return Response.json({
    cards: cards.map((card) => ({
      id: card.id,
      name: card.exactName,
      cardNumber: card.canonicalCardNumber,
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
