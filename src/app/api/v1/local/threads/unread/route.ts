import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { unreadMessages } from "@/lib/local/threads";

export const dynamic = "force-dynamic";

/**
 * How many messages are waiting for the player, across every
 * conversation: the dot on the app's Messages tab. A number and
 * nothing else, so the bar does not download every conversation to
 * count them. The same count the website's bar draws its dot from.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json({ unread: await unreadMessages(player.playerId) });
}
