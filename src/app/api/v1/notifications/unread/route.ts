import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { unreadCount } from "@/lib/notifications/inbox";

export const dynamic = "force-dynamic";

/**
 * How many notices are unread, for the dot on the app's Inbox tab.
 *
 * A head count and nothing else, so the app can ask on every tab
 * change and every return to the foreground without fetching the list.
 * The same number the website's tab bar and the push badge use.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  return Response.json({ unread: await unreadCount(player.playerId) });
}
