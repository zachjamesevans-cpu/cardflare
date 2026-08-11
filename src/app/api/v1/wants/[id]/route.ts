import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { listWants, removeWant, setWantQuantity } from "@/lib/players/wants";

export const dynamic = "force-dynamic";

/**
 * Editing one saved want from the app: how many, or not at all.
 *
 * The website's re-post panel grew a stepper and a Remove on each row, so
 * the app's panel needs the same two verbs. Ownership is the `player_id`
 * filter on the write itself, not a check beforehand — a want that is not
 * yours matches nothing and changes nothing, with no round trip that
 * could tell an attacker whether the id exists.
 */

/** POST rather than PATCH, and the delta in a header if the body cannot fly. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { id } = await params;
  const payload = await readJsonPayload(request);
  const delta = Number((payload as { delta?: unknown } | null)?.delta);

  if (!Number.isFinite(delta) || delta === 0) return badRequest("delta is required");

  /*
   * A delta, not an absolute: the control is a pair of buttons, and two
   * quick taps should land on "two more" rather than on whichever number
   * the screen happened to be showing when the first one started.
   */
  const want = (await listWants(player.playerId)).find((entry) => entry.id === id);
  if (!want) return badRequest("no such want");

  const quantity = await setWantQuantity(
    id,
    player.playerId,
    want.quantity + Math.trunc(delta),
  );

  return Response.json({ ok: true, quantity });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { id } = await params;
  await removeWant(id, player.playerId);

  return Response.json({ ok: true });
}
