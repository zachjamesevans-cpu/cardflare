import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { addEntrySchema } from "@/lib/lists/schema";
import { saveWant } from "@/lib/players/wants";
import { findCardsByNumbers } from "@/lib/cards/search";
import { compactCardNumber, parseDeckList } from "@/lib/players/deck-list";
import { z } from "zod";

/** The pasted-list shape, told apart from a single card by `list`. */
const deckListSchema = z.object({
  list: z.string().min(1).max(20_000),
  deckLabel: z.string().trim().max(40).nullish(),
});

export const dynamic = "force-dynamic";

/**
 * Saving a hunt straight to the account, no room involved.
 *
 * The founder's midnight bug: the app's Flare tab always posted into the
 * last room, so a signed-in player adding cards from the couch quietly
 * kept a closed store's room warm. A want saved here touches no event —
 * it just waits, and the next room the player walks into asks the
 * question the panel already asks: "still hunting these?"
 *
 * Bearer auth only. Guests have no list for this to land in; their path
 * is still a live room.
 */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const body = await readJsonPayload(request);

  /*
   * A pasted deck list, which is the app's half of "post multiple flares
   * at once". Handled here rather than on its own route because it is
   * the same act — putting cards on the account's list — and the app's
   * transport makes every extra route another thing to get wrong in the
   * proxy.
   */
  const asDeck = deckListSchema.safeParse(body);
  if (asDeck.success) {
    const { lines, unreadable } = parseDeckList(asDeck.data.list);
    if (lines.length === 0) return badRequest("No card numbers in that list");

    const found = await findCardsByNumbers(lines.map((line) => line.cardNumber));

    let saved = 0;
    let atCap = false;
    const unknown: string[] = [];

    for (const line of lines) {
      const cardId = found.get(compactCardNumber(line.cardNumber));
      if (!cardId) {
        unknown.push(line.cardNumber);
        continue;
      }

      const outcome = await saveWant(player.playerId, {
        cardId,
        /* Any printing. A deck list says which card, never which art. */
        printingId: null,
        quantity: line.quantity,
        note: null,
        deckLabel: asDeck.data.deckLabel ?? null,
      });

      if (outcome === "saved") saved += 1;
      else if (outcome === "at-cap") {
        atCap = true;
        break;
      }
    }

    return Response.json({ ok: true, saved, unknown, unreadable, atCap });
  }

  const parsed = addEntrySchema.safeParse(body);
  if (!parsed.success) return badRequest("cardId and quantity are required");

  const outcome = await saveWant(player.playerId, parsed.data);

  if (outcome !== "saved") {
    return Response.json(
      { error: outcome },
      { status: outcome === "at-cap" ? 409 : 503 },
    );
  }

  return Response.json({ ok: true });
}
