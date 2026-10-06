import { UndoToastHost } from "@/components/feed/undo-toast";
import { getViewer } from "@/lib/auth/session";
import { unreadMessages } from "@/lib/local/threads";
import { playerForUser } from "@/lib/players/accounts";
import { getPlayerSession } from "@/lib/players/session";
import { PlayerTabs } from "./player-tabs";

/**
 * Decides whether the website is wearing its app face.
 *
 * Shown to anyone who is actually playing — a signed-in player, or a
 * guest who has joined a room on this device — and to nobody else. A
 * marketing visitor reading the homepage gets no bottom bar, and a
 * store owner in the dashboard has their own navigation.
 *
 * The unread dot is resolved here rather than in the client bar so
 * the count arrives with the page instead of after it. It is the
 * unread MESSAGES now, on the Messages tab; the notifications' dot
 * rides the Feed's bell.
 *
 * The take-down toast's host rides with the bar. A post that is taken
 * down leaves the page on the refresh, and the toast that offers to
 * put it back has to be drawn by something that stays: this is on
 * every page that draws a post menu or a board, and it sits right
 * above where the toast lands.
 */
export async function PlayerTabBar() {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  // A guest mid-event has no account, but they are still playing.
  const guest = playerId ? null : await getPlayerSession();

  if (!playerId && !guest) return null;

  return (
    <>
      <PlayerTabs unread={playerId ? await unreadMessages(playerId) : 0} />
      <UndoToastHost />
    </>
  );
}

/**
 * The room the bar occupies, so a page's last control is never trapped
 * under it. Paired with the bar on every page that renders one.
 *
 * The bar floats now, so this has to cover its height AND the gap it
 * leaves beneath itself - the app's `useTabBarInset` does the same sum
 * for the same reason. Tuned to the pill, not to the old docked bar.
 */
export function TabBarSpacer() {
  return <div aria-hidden="true" className="h-24" />;
}
