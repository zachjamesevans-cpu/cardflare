import { apiPlayer, apiStoreRole, unauthorized } from "@/lib/api/auth";
import { storeHasFeature } from "@/lib/stores/ultra-access";
import { remoteDisplaysFor } from "@/lib/event-hub/remote";

export const dynamic = "force-dynamic";

/**
 * The remote's read: every screen at this store and every timer on it.
 *
 * Who may ask: an account with ANY role at the store. An owner and an
 * organizer both run the timers; a player with no membership row, or
 * one at a different store, gets a 403 rather than a list. The role
 * is read from `store_members` on every request, never from the
 * token, so revoking an organizer takes effect on their next poll.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { storeId } = await params;

  const role = await apiStoreRole(player.userId, storeId);
  if (role === null) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!(await storeHasFeature(storeId, "flarecast"))) {
    return Response.json({ error: "ultra-required" }, { status: 402 });
  }

  const now = Date.now();
  const displays = await remoteDisplaysFor(storeId, now);

  return Response.json({ displays, at: new Date(now).toISOString() });
}
