import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { huntsFor, markHuntCard } from "@/lib/players/hunts";

export const dynamic = "force-dynamic";

const tickSchema = z.object({
  /** The Flare the card is. A hunt card IS a Flare; there is no second row. */
  flareId: z.string().uuid(),
  found: z.boolean(),
});

/**
 * Ticking a card off a hunt, from the app.
 *
 * The founder: "needs to be a simply way in hunts to mark off if you've
 * already found that card. think of it as a checklist... you can check
 * them off yourself as you collect the cards."
 *
 * The answer carries the WHOLE hunts list back rather than an ack. A
 * tick changes three numbers on the folder it is in - what is left, how
 * many copies, how many found - and a phone that has to recompute those
 * for itself is a phone that will eventually disagree with the profile
 * it is sitting on. One read, and both platforms show the same thing.
 */
export async function POST(request: Request) {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = tickSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Say which card, and ticked or not.");

  const result = await markHuntCard(
    player.playerId,
    parsed.data.flareId,
    parsed.data.found,
  );

  if (!result.ok) {
    /*
     * "not-yours" is answered as a plain bad request rather than a 403.
     * Telling a caller "that Flare exists but is not yours" is a way to
     * enumerate other people's Flares one id at a time; the honest
     * answer to a card that is not on your list is that it is not on
     * your list.
     */
    if (result.reason === "traded") {
      return badRequest("That card was closed by a trade.");
    }
    if (result.reason === "not-yours") {
      return badRequest("That card is not on one of your hunts.");
    }
    return badRequest("Could not update that card.");
  }

  return Response.json({ hunts: await huntsFor(player.playerId) });
}
