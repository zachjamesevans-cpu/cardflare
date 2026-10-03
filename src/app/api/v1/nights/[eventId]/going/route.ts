import { z } from "zod";

import { apiPlayer, apiSession } from "@/lib/api/auth";
import { setGoing, type GoingResult } from "@/lib/events/going";

export const dynamic = "force-dynamic";

/**
 * Going, from the app. POST says you are; DELETE takes it back. Both
 * answer with the room's new count, the way the Going button paints it.
 *
 * Accounts only: a guest gets 401 and the app's sign-in door. The
 * session the token resolves to is handed to `setGoing` so a phone that
 * already is the account's identity mints nothing; a fresh install is
 * handed a token for that identity once, exactly as the join is.
 */

type Params = { params: Promise<{ eventId: string }> };

const eventIdSchema = z.guid();

const STATUS: Record<Exclude<GoingResult, { ok: true }>["reason"], number> = {
  "not-found": 404,
  "not-open": 409,
  "no-account": 401,
  unavailable: 503,
};

async function answer(
  request: Request,
  { params }: Params,
  going: boolean,
): Promise<Response> {
  const account = await apiPlayer(request);
  if (!account) return Response.json({ error: "no-account" }, { status: 401 });

  const id = eventIdSchema.safeParse((await params).eventId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  /* Token only, like the join: this decides whether to mint a token by
     asking whether the device already has an identity. */
  const session = await apiSession(request);

  const result = await setGoing(
    id.data,
    account.playerId,
    account.displayName,
    going,
    session,
  );
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: STATUS[result.reason] });
  }

  return Response.json({
    youGoing: result.youGoing,
    goingCount: result.goingCount,
    posted: result.posted,
    ...(result.freshToken ? { sessionToken: result.freshToken } : {}),
  });
}

export async function POST(request: Request, params: Params): Promise<Response> {
  return answer(request, params, true);
}

export async function DELETE(request: Request, params: Params): Promise<Response> {
  return answer(request, params, false);
}
