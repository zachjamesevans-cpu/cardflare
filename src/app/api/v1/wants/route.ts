import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { addEntrySchema } from "@/lib/lists/schema";
import { postAreaFlares } from "@/lib/local/area";
import { saveWant } from "@/lib/players/wants";
import { findCardsByNumbers } from "@/lib/cards/search";
import { compactCardNumber, parseDeckList } from "@/lib/players/deck-list";
import { previewDeckList } from "@/lib/players/deck-list-preview";
import { absoluteImageUrls } from "@/lib/api/absolute";
import { z } from "zod";
import { LIMITS, tooMany } from "@/lib/api/throttle";

/** The pasted-list shape, told apart from a single card by `list`. */
const deckListSchema = z.object({
  list: z.string().min(1).max(20_000),
  deckLabel: z.string().trim().max(40).nullish(),
});

/**
 * The same paste, asked about rather than saved: the app's confirmation
 * screen. Checked BEFORE the save shape, because zod strips the keys it
 * does not know — a preview body would otherwise match `deckListSchema`
 * and save the list it was only supposed to show.
 */
const deckPreviewSchema = z.object({
  list: z.string().min(1).max(20_000),
  preview: z.literal(true),
});

export const dynamic = "force-dynamic";
/* A pasted deck is one batched insert now, but a race with the unique
   index falls back to card by card; give that room to finish. */
export const maxDuration = 60;

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
   * "Are these the cards I meant?" — the pasted list looked up with
   * names and art, nothing written. The phone shows the faces and only
   * then offers the save below.
   *
   * Its own, looser limit: the paste screen previews as the player
   * types (debounced), so a single deck can ask a dozen times. Counting
   * those against the post's twenty locked people out of posting the
   * list they had just checked.
   */
  const asPreview = deckPreviewSchema.safeParse(body);
  if (asPreview.success) {
    const previewLimited = tooMany(
      `deck-preview:${player.playerId}`,
      LIMITS.deckPreview.limit,
      LIMITS.deckPreview.windowMs,
    );
    if (previewLimited) return previewLimited;

    const { lines, unreadable } = parseDeckList(asPreview.data.list);
    const entries = await previewDeckList(lines);
    return Response.json(absoluteImageUrls({ ok: true, entries, unreadable }));
  }

  /*
   * A pasted deck list, which is the app's half of "post multiple flares
   * at once". Handled here rather than on its own route because it is
   * the same act — putting cards on the account's list — and the app's
   * transport makes every extra route another thing to get wrong in the
   * proxy.
   */
  /* Everything past a preview writes, and shares the strict limit. */
  const limited = tooMany(
    `deck-list:${player.playerId}`,
    LIMITS.deckList.limit,
    LIMITS.deckList.windowMs,
  );
  if (limited) return limited;

  const asDeck = deckListSchema.safeParse(body);
  if (asDeck.success) {
    const { lines, unreadable } = parseDeckList(asDeck.data.list);
    if (lines.length === 0) return badRequest("No card numbers in that list");

    const found = await findCardsByNumbers(lines.map((line) => line.cardNumber));

    const unknown: string[] = [];
    const cards = [];

    for (const line of lines) {
      const cardId = found.get(compactCardNumber(line.cardNumber));
      if (!cardId) {
        unknown.push(line.cardNumber);
        continue;
      }

      cards.push({
        cardId,
        /* Any printing. A deck list says which card, never which art. */
        printingId: null,
        quantity: line.quantity,
        note: null,
      });
    }

    /*
     * A pasted deck goes UP, as one post — the website's paste does the
     * same, and the two platforms cannot differ on what a button does.
     * One batch id and the deck's own name, so thirty cards read as one
     * thing on everybody's Local rather than as thirty rows.
     */
    const outcome =
      cards.length > 0
        ? await postAreaFlares(
            player.playerId,
            cards,
            null,
            asDeck.data.deckLabel ?? null,
          )
        : ({ ok: false, reason: "unavailable" } as const);

    /* A post that failed says so, rather than "0 saved" in a 200 that
       reads like success: the founder's Settings review found it. */
    if (cards.length > 0 && !outcome.ok) {
      return Response.json({ error: "could-not-post" }, { status: 503 });
    }
    const saved = outcome.ok ? outcome.posted : 0;
    /* Kept for older builds that read it; nothing caps a paste now. */
    const atCap = false;

    return Response.json({
      ok: true,
      saved,
      /* Per card, so the phone can say "Posted 18 of 20 · 2 were
         already up" rather than a bare count. */
      total: cards.length,
      alreadyUp: outcome.ok ? outcome.alreadyUp : 0,
      failed: outcome.ok ? outcome.failed : 0,
      unknown,
      unreadable,
      atCap,
    });
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
