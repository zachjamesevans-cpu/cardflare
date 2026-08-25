import "server-only";

import { pickBasePrinting, type CardPrinting } from "@/lib/cards/schema";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { compactCardNumber, type DeckLine } from "./deck-list";

/**
 * A pasted list, looked up before it is saved.
 *
 * The founder's ask, after a paste went wrong quietly: "have a loading
 * screen that loads all cards, with images, for confirmation that they
 * are the cards someone wants." A list of numbers is write-only to a
 * human — OP13-031 could be anything — so the confirmation is the ART,
 * shown before the save button does anything.
 *
 * One entry per pasted line, in pasted order, matched or not: a number
 * the catalogue does not know comes back with a null name rather than
 * disappearing, because "which lines failed" is the entire point of a
 * confirmation step.
 */
export interface DeckPreviewEntry {
  cardNumber: string;
  quantity: number;
  /** Null when the number is not in the catalogue (yet). */
  name: string | null;
  imageUrl: string | null;
}

export async function previewDeckList(lines: DeckLine[]): Promise<DeckPreviewEntry[]> {
  const unmatched = lines.map((line) => ({
    cardNumber: line.cardNumber,
    quantity: line.quantity,
    name: null,
    imageUrl: null,
  }));

  if (lines.length === 0 || !isSupabaseConfigured()) return unmatched;

  const admin = getSupabaseAdmin();
  const compact = [...new Set(lines.map((line) => compactCardNumber(line.cardNumber)))];

  const { data: cards, error } = await admin
    .from("cards")
    .select("id, exact_name, compact_card_number")
    .in("compact_card_number", compact);

  if (error) {
    console.error("Could not preview a deck list", error.message);
    return unmatched;
  }

  const cardByCompact = new Map(
    (cards ?? []).map((row) => [row.compact_card_number, row]),
  );
  const cardIds = (cards ?? []).map((row) => row.id);

  /* Every printing of every matched card, so the art shown is the same
     base printing the rest of the product would pick — not whichever
     alt happened to sort first. */
  const byCard = new Map<string, CardPrinting[]>();
  if (cardIds.length > 0) {
    const { data: printings } = await admin
      .from("card_printings")
      .select(
        "id, card_id, set_code, set_name, printing_label, variant_type, rarity, printing_name, is_promo, image_url",
      )
      .in("card_id", cardIds);

    for (const row of printings ?? []) {
      const list = byCard.get(row.card_id) ?? [];
      list.push({
        id: row.id,
        setCode: row.set_code,
        setName: row.set_name,
        printingLabel: row.printing_label,
        variantType: row.variant_type,
        rarity: row.rarity,
        printingName: row.printing_name,
        isPromo: row.is_promo,
        imageUrl: row.image_url,
      });
      byCard.set(row.card_id, list);
    }
  }

  return lines.map((line) => {
    const card = cardByCompact.get(compactCardNumber(line.cardNumber));
    if (!card) {
      return {
        cardNumber: line.cardNumber,
        quantity: line.quantity,
        name: null,
        imageUrl: null,
      };
    }

    const base = pickBasePrinting(byCard.get(card.id) ?? [], card.exact_name);
    return {
      cardNumber: line.cardNumber,
      quantity: line.quantity,
      name: card.exact_name,
      imageUrl: base?.imageUrl ?? null,
    };
  });
}
