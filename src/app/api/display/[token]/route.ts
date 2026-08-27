import { displayPayload } from "@/lib/event-hub/display-payload";
import { findDisplayByToken } from "@/lib/event-hub/repository";

export const dynamic = "force-dynamic";

/**
 * What the television polls.
 *
 * The whole realtime layer, and deliberately so. This codebase has no
 * websockets anywhere — `RoomTicker` says why: every table is RLS-on
 * with no policies, so Supabase Realtime would need read policies
 * written for the first time, and a socket on a shop's wifi is a
 * liability rather than a feature. See ARCHITECTURE.md.
 *
 * The reason polling is not a compromise HERE specifically: no countdown
 * is transmitted. The payload carries the timestamps a person set, and
 * the display does the arithmetic itself. So the interval decides how
 * fast a PAUSE reaches the wall — a few seconds — and has nothing to do
 * with whether the number on the wall is correct. A television that has
 * not heard from us in a minute is still counting down accurately, and
 * one that has been asleep for an hour catches up on its first poll.
 *
 * GET only. A display token names a display and can do nothing else
 * with it: there is no POST here, no action reads this token, and the
 * body is assembled by `displayPayload` rather than being a row of a
 * table. The one write that can happen under a poll is `displayPayload`
 * materialising a round start Auto Mode already scheduled — decided
 * entirely by store-configured state behind a guarded update, so the
 * token holder cannot cause, hasten, or repeat it. See
 * `settleAutoRounds` for why it lives on the poll.
 */

/** Read-only and short-lived. A shop's television is not a CDN customer. */
const CACHE = "no-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const display = await findDisplayByToken(token);

  /*
   * The same 404 for a malformed token, an unknown one, and a display
   * that was deleted. There is nothing to learn here by guessing.
   */
  if (!display) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  const payload = await displayPayload(display);

  return Response.json(payload, {
    headers: { "cache-control": CACHE },
  });
}
