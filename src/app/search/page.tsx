import type { Metadata } from "next";

import { GAME_SLUGS } from "@/lib/players/games-catalog";
import { SearchPanel } from "@/components/feed/search-panel";
import { TabPageShell } from "@/components/players/tab-page-shell";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { foundCardsFor, listWants } from "@/lib/players/wants";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Search tab, on the website: the app's Search tab, the same
 * search.
 *
 * The founder wanted five tabs with Messages dead centre, and picked
 * Search for the fifth slot, in this order: Feed, Nights, Messages,
 * Search, Profile, the way Instagram's bar has its own search. It was an icon in the
 * Feed's top right until then; the bell has that corner to itself now.
 *
 * The account is only whose recent searches to show. A guest searches
 * the same catalogue with this device's own list.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  /* "Search Lorcana" on a game's hub: that game's cards only. */
  const asked = (await searchParams).game;
  const game = GAME_SLUGS.find((slug) => slug === asked) ?? null;
  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  /* Your open Flares' cards, for the flame on a result (any art of it). */
  const flaredCardIds = playerId
    ? await Promise.all([listWants(playerId), foundCardsFor(playerId)]).then(
        ([wants, found]) => [
          ...new Set(
            wants.filter((want) => !found.has(want.cardId)).map((want) => want.cardId),
          ),
        ],
      )
    : [];

  return (
    <TabPageShell title="Search">
      <SearchPanel account={playerId} flaredCardIds={flaredCardIds} game={game} />
    </TabPageShell>
  );
}
