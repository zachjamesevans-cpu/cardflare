import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";
import {
  listThreads,
  openDirectThread,
  openFlareThread,
  openWantThread,
} from "@/lib/local/threads";
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

/*
 * Exactly one anchor: a posted Flare or a saved want, each with a first
 * message; or a person, with none — a direct message opens empty and
 * the composer is the next screen.
 */
const openSchema = z
  .object({
    flareId: z.string().uuid().optional(),
    wantId: z.string().uuid().optional(),
    playerId: z.string().uuid().optional(),
    body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH).optional(),
  })
  .refine(
    (value) =>
      [value.flareId, value.wantId, value.playerId].filter(Boolean).length === 1,
    { message: "one of flareId, wantId or playerId" },
  )
  .refine((value) => Boolean(value.playerId) || Boolean(value.body), {
    message: "a message is needed",
  });

/**
 * "I have this": opens the thread for a Flare and sends the first
 * message. Answering the same Flare again lands in the same thread.
 * With `playerId`, opens (or finds) the direct conversation with that
 * person and sends nothing.
 */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = openSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) {
    return badRequest(
      "flareId, wantId or playerId, and a message for the first two, are needed",
    );
  }

  const { flareId, wantId, playerId, body } = parsed.data;

  /* A Flare's or a want's open sends a message, so it counts as one. */
  if (!playerId) {
    const limited = tooMany(
      `message:${player.playerId}`,
      LIMITS.message.limit,
      LIMITS.message.windowMs,
    );
    if (limited) return limited;
  }

  /*
   * The new-conversations ceiling, charged only when a conversation is
   * actually started. Tapping Message on somebody you already talk to,
   * or answering a Flare twice, finds the thread and costs nothing.
   */
  let refused: Response | null = null;
  const mayCreate = () => {
    refused = tooMany(
      `thread-open:${player.playerId}`,
      LIMITS.threadOpen.limit,
      LIMITS.threadOpen.windowMs,
    );
    return refused === null;
  };

  const outcome = playerId
    ? await openDirectThread(player.playerId, playerId, { mayCreate })
    : flareId
      ? await openFlareThread(flareId, player.playerId, body ?? "", { mayCreate })
      : await openWantThread(wantId!, player.playerId, body ?? "", { mayCreate });

  if (!outcome.ok && outcome.reason === "rate-limited") {
    return (
      refused ??
      Response.json(
        { error: "rate-limited", message: "That is a lot at once. Try again in a moment." },
        { status: 429 },
      )
    );
  }

  if (!outcome.ok) {
    /* The reasons a client can do something about, in words it can show. */
    const message =
      outcome.reason === "no-account"
        ? "This player posted as a guest, so there is nowhere to send a message."
        : outcome.reason === "yourself"
          ? playerId
            ? "That is you."
            : "That one is yours."
          : outcome.reason === "closed"
            ? "You can't message this player."
            : "Could not start the conversation.";
    return Response.json({ ok: false, message }, { status: 409 });
  }

  return Response.json({ ok: true, threadId: outcome.threadId });
}
