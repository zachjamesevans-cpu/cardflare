import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { pointFromCoords } from "@/lib/geo/zip";
import { readJsonPayload } from "@/lib/api/payload";
import { postAreaFlares, withdrawAreaFlare } from "@/lib/local/area";

export const dynamic = "force-dynamic";

/**
 * Posting a Flare to your area, and taking it down.
 *
 * The app's half of the same lib the website's Server Actions call, so
 * the two platforms cannot drift on who may post one or where it lands.
 */

const cardSchema = z.object({
  cardId: z.string().uuid(),
  printingId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(99).optional(),
  note: z.string().trim().max(280).nullable().optional(),
  intent: z.enum(["want", "showcase"]).optional(),
  acceptsTrade: z.boolean().optional(),
  acceptsCash: z.boolean().optional(),
});

/**
 * One card, or a list posted as one thing.
 *
 * `cards` is what makes a deck read as a single post rather than thirty:
 * every row shares one batch id, the same mechanism a room's board has
 * used since decks could be pasted. The single-card shape stays for the
 * common case and for older builds.
 */
const postSchema = cardSchema
  .extend({
    cards: z.array(cardSchema).min(1).max(120).optional(),
    /** What to call the group, when there is one. */
    deckLabel: z.string().trim().max(40).nullable().optional(),
    /* The phone's coordinate, when it has permission. Same bargain as the
     Local feed's: it rides this request and is never stored. */
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .partial({ cardId: true });

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = postSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised Flare");

  const { latitude, longitude, cards, deckLabel, ...single } = parsed.data;

  const list = cards ?? (single.cardId ? [{ ...single, cardId: single.cardId }] : []);
  if (list.length === 0) return badRequest("Unrecognised Flare");

  const result = await postAreaFlares(
    player.playerId,
    list,
    pointFromCoords(latitude, longitude),
    deckLabel ?? null,
  );

  if (result.ok) {
    return Response.json({ ok: true, batchId: result.batchId, posted: result.posted });
  }

  if (result.reason === "already-posted") {
    return Response.json(
      { ok: false, error: "already-posted", message: "That card is already up." },
      { status: 409 },
    );
  }

  /*
   * 503, and named. The app translates this into a sentence about the
   * server rather than about the card, so nobody goes hunting for a bug
   * in a client that did everything right.
   */
  if (result.reason === "not-migrated") {
    return Response.json(
      {
        ok: false,
        error: "not-migrated",
        message: "Posting from Local isn't switched on yet.",
      },
      { status: 503 },
    );
  }

  return Response.json({ ok: false, error: "unavailable" }, { status: 500 });
}

const deleteSchema = z.object({ flareId: z.string().uuid() });

export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = deleteSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised Flare");

  const ok = await withdrawAreaFlare(player.playerId, parsed.data.flareId);
  return Response.json({ ok }, { status: ok ? 200 : 500 });
}
