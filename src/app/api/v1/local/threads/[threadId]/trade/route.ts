import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import {
  answerThreadTrade,
  proposeThreadTrade,
  THREAD_TRADE_QUANTITY_MAX,
  type ThreadTradeFailure,
} from "@/lib/trades/thread-trades";

export const dynamic = "force-dynamic";

/**
 * "We traded", inside a conversation, for the app. POST says it; PATCH
 * answers it. The same lib the website's actions call, so the two
 * platforms cannot drift on who may say what.
 */

const proposeSchema = z.object({
  cardId: z.guid().nullish(),
  printingId: z.guid().nullish(),
  quantity: z.number().int().min(1).max(THREAD_TRADE_QUANTITY_MAX).default(1),
  got: z.boolean().optional(),
});

const answerSchema = z.object({
  tradeId: z.guid(),
  answer: z.enum(["yes", "no"]),
});

function statusFor(reason: ThreadTradeFailure): number {
  switch (reason) {
    case "not-found":
      return 404;
    case "closed":
    case "pending":
    case "already-traded":
    case "answered":
      return 409;
    case "no-card":
      return 400;
    default:
      return 503;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `trade:${player.playerId}`,
    LIMITS.message.limit,
    LIMITS.message.windowMs,
  );
  if (limited) return limited;

  const parsed = proposeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Could not read the trade");

  const { threadId } = await params;
  const outcome = await proposeThreadTrade(threadId, player.playerId, parsed.data);
  if (!outcome.ok) {
    return Response.json(
      { ok: false, reason: outcome.reason },
      { status: statusFor(outcome.reason) },
    );
  }
  return Response.json({ ok: true, trade: outcome.trade });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = answerSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Could not read the answer");

  /* The thread in the path is the conversation the app is looking at;
     the trade carries its own, and the lib checks the viewer against
     the trade. */
  await params;
  const outcome = await answerThreadTrade(
    parsed.data.tradeId,
    player.playerId,
    parsed.data.answer === "yes",
  );
  if (!outcome.ok) {
    return Response.json(
      { ok: false, reason: outcome.reason },
      { status: statusFor(outcome.reason) },
    );
  }
  return Response.json({ ok: true });
}
