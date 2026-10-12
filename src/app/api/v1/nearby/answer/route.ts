import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";
import { answerNearby } from "@/lib/nearby/answer";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["want", "flare"]),
  id: z.string().uuid(),
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

/**
 * A reply from "Wanted near you": the holder's draft, sent now, on an
 * ask that is still up. A Flare taken down since the screen loaded is
 * refused in words ("They found it or took it down."), not opened.
 */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("kind, id and a message are needed");

  const limited = tooMany(
    `message:${player.playerId}`,
    LIMITS.message.limit,
    LIMITS.message.windowMs,
  );
  if (limited) return limited;

  const { kind, id, body } = parsed.data;
  const outcome = await answerNearby(player.playerId, { kind, id }, body, {
    mayCreate: () =>
      tooMany(
        `thread-open:${player.playerId}`,
        LIMITS.threadOpen.limit,
        LIMITS.threadOpen.windowMs,
      ) === null,
  });

  return outcome.ok ? Response.json(outcome) : Response.json(outcome, { status: 409 });
}
