import { apiPlayer, apiStoreRole, badRequest, unauthorized } from "@/lib/api/auth";
import { storeHasFeature } from "@/lib/stores/ultra-access";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { controlTimer } from "@/lib/event-hub/control";
import { remoteTimer } from "@/lib/event-hub/remote";
import { isRemoteOp } from "@/lib/event-hub/remote-wire";
import { findDisplay, findTimer } from "@/lib/event-hub/repository";

export const dynamic = "force-dynamic";

/**
 * One press on the remote.
 *
 * The same words the console's buttons send, through the same
 * `controlTimer`, so a Hold from a phone is exactly a Hold from the
 * console: computed from the row as it is now, guarded where it races
 * the automatic start, and a no-op when it would change nothing.
 *
 * Authorisation walks DISPLAY-FIRST, the way the console's
 * `authorizedTimer` does: the timer names its display, the display
 * names its store, and the caller's role at that store is what admits
 * them. A forged timer id from another store fails on the role check,
 * not on the timer existing.
 *
 * The reply carries the timer re-read after the write, so the phone
 * can settle on what the wall now shows without a second request.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ timerId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `remote-control:${player.playerId}`,
    LIMITS.remoteControl.limit,
    LIMITS.remoteControl.windowMs,
  );
  if (limited) return limited;

  const body = (await readJsonPayload(request)) as {
    op?: unknown;
    intermissionChoice?: unknown;
    intermissionCustom?: unknown;
  } | null;

  const op = body?.op;
  if (!isRemoteOp(op)) return badRequest("Unrecognised timer op");

  const { timerId } = await params;

  const timer = await findTimer(timerId);
  if (!timer) return Response.json({ error: "not-found" }, { status: 404 });

  const display = await findDisplay(timer.displayId);
  if (!display) return Response.json({ error: "not-found" }, { status: 404 });

  const role = await apiStoreRole(player.userId, display.storeId);
  if (role === null) return Response.json({ error: "forbidden" }, { status: 403 });
  /* FlareCast is Ultra's, on the phone as on the web. */
  if (!(await storeHasFeature(display.storeId, "flarecast"))) {
    return Response.json({ error: "ultra-required" }, { status: 402 });
  }

  const asText = (value: unknown): string | null =>
    typeof value === "string" ? value : null;

  await controlTimer(
    { timer, display },
    op,
    {
      intermissionChoice: asText(body?.intermissionChoice),
      intermissionCustom: asText(body?.intermissionCustom),
    },
    player.displayName,
  );

  /* Re-read rather than echoed: a guarded press that lost its race
     must answer with the winner's row, not with what this phone hoped. */
  const after = (await findTimer(timerId)) ?? timer;

  return Response.json({ ok: true, timer: remoteTimer(after, display) });
}
