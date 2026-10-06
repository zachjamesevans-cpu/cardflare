/**
 * What an inbox row says and when, shared by the website and mirrored
 * by the app (`mobile/src/screens/inbox.tsx`). No server imports, so a
 * unit test can hold the two platforms to the same words.
 */

/**
 * "4m", "3h", "2d", "3w" — Instagram's clock, which the founder held up
 * beside ours. The time sits inline after the sentence, so the shorter
 * it is the better the row reads; "ago" is understood.
 */
export function ago(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/**
 * The name at the front of a title, split off so it can be bold and
 * the rest regular, the way "savannahjburcham liked your story" reads.
 *
 * Only when the title genuinely starts with the actor's current name:
 * a renamed player's old notice keeps its old wording, and a title
 * with no person in it ("Trade confirmed: Charizard") is bold whole.
 */
export function splitTitle(
  title: string,
  actorName: string | null | undefined,
): { lead: string | null; rest: string } {
  if (actorName && title.startsWith(`${actorName} `)) {
    return { lead: actorName, rest: title.slice(actorName.length) };
  }
  return { lead: null, rest: title };
}

/**
 * The icon a row with nobody behind it leads with. A board opening at
 * a store is the store; anything else that lost its person is a bell.
 */
export function kindIcon(kind: string): "store" | "bell" {
  return kind === "board-open" || kind === "early-board" || kind === "store-post"
    ? "store"
    : "bell";
}

/**
 * Back-to-back notices that say the same thing, as one row with a
 * count: three "Kaito offered on Charizard" in a row read as "×3"
 * instead of a wall. Same kind, same person, same sentence (which
 * names the card) and the same place to go. Only consecutive ones,
 * so the list's order still says when things happened; the newest of
 * the run stands for it, and the run is unread if any of it is.
 */
export function collapseRuns<
  T extends {
    id: string;
    kind: string;
    title: string;
    url: string | null;
    readAt: string | null;
    actor?: { playerId: string } | null;
  },
>(items: T[]): { item: T; count: number; anyUnread: boolean }[] {
  const runs: { item: T; count: number; anyUnread: boolean; key: string }[] = [];
  for (const n of items) {
    const key = [n.kind, n.actor?.playerId ?? "", n.title, n.url ?? ""].join("|");
    const last = runs[runs.length - 1];
    if (last && last.key === key) {
      last.count += 1;
      if (!n.readAt) last.anyUnread = true;
    } else {
      runs.push({ item: n, count: 1, anyUnread: !n.readAt, key });
    }
  }
  return runs.map(({ item, count, anyUnread }) => ({ item, count, anyUnread }));
}
