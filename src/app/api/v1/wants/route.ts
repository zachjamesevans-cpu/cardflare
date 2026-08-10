import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { addEntrySchema } from "@/lib/lists/schema";
import { saveWant } from "@/lib/players/wants";

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

  const parsed = addEntrySchema.safeParse(await readJsonPayload(request));
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
