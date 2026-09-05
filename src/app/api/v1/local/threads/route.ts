import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";
import { listThreads, openFlareThread } from "@/lib/local/threads";
import { LIMITS, tooMany } from "@/lib/api/throttle";

export const dynamic = "force-dynamic";

/** The player's conversations, most recent talk first. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json(
    absoluteImageUrls({ threads: await listThreads(player.playerId) }),
  );
}

const openSchema = z.object({
  flareId: z.string().uuid(),
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

/**
 * "I have this": opens the thread for a Flare and sends the first
 * message. Answering the same Flare again lands in the same thread.
 */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `thread-open:${player.playerId}`,
    LIMITS.threadOpen.limit,
    LIMITS.threadOpen.windowMs,
  );
  if (limited) return limited;

  const parsed = openSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("flareId and a message are needed");

  const outcome = await openFlareThread(
    parsed.data.flareId,
    player.playerId,
    parsed.data.body,
  );

  if (!outcome.ok) {
    /* The reasons a client can do something about, in words it can show. */
    const message =
      outcome.reason === "no-account"
        ? "This player posted as a guest, so there is nowhere to send a message."
        : outcome.reason === "yourself"
          ? "That one is yours."
          : outcome.reason === "closed"
            ? "This conversation was ended."
            : "Could not start the conversation.";
    return Response.json({ ok: false, message }, { status: 409 });
  }

  return Response.json({ ok: true, threadId: outcome.threadId });
}
