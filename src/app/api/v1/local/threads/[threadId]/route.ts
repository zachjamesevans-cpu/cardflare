import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";
import { closeThread, readThread, sendThreadMessage } from "@/lib/local/threads";

export const dynamic = "force-dynamic";

/**
 * One conversation. Reading it IS the read receipt: the other side's
 * unread messages get their timestamp and the inbox notice clears, so
 * the next message can ring again.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { threadId } = await params;
  const thread = await readThread(threadId, player.playerId);
  if (!thread.ok) return Response.json({ ok: false }, { status: 404 });

  return Response.json(thread);
}

const sendSchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = sendSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("a message is needed");

  const { threadId } = await params;
  const outcome = await sendThreadMessage(threadId, player.playerId, parsed.data.body);

  if (!outcome.ok) {
    const status = outcome.reason === "closed" ? 409 : 404;
    return Response.json({ ok: false, reason: outcome.reason }, { status });
  }

  return Response.json({ ok: true });
}

/** Ends the conversation, from either chair. Final on purpose. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { threadId } = await params;
  const outcome = await closeThread(threadId, player.playerId);

  if (!outcome.ok) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true });
}
