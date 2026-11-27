import type { Metadata } from "next";

import { GAME_SLUGS } from "@/lib/players/games-catalog";
import { SearchPanel } from "@/components/feed/search-panel";
import { AddCardsBar } from "@/components/flares/add-cards-bar";
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
  searchParams: Promise<{ game?: string; adding?: string; back?: string }>;
}) {
  /* "Search Lorcana" on a game's hub: that game's cards only. */
  const params = await searchParams;
  const asked = params.game;
  /* "Add cards" from the composer: the same search, cards only, with
     Done back to the Flare (add-cards-bar.tsx). */
  const adding = params.adding === "1";
  /* Back to the composer it came from: /flare or a room. A path on this
     site only, never another origin. */
  const back =
    params.back?.startsWith("/") && !params.back.startsWith("//")
      ? params.back
      : "/flare";
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
    <TabPageShell title={adding ? "Add cards" : "Search"}>
      {adding && (
        <h1 className="text-center text-lg font-extrabold text-text-primary">
          Add cards
        </h1>
      )}
      <SearchPanel
        account={playerId}
        flaredCardIds={flaredCardIds}
        game={game}
        adding={adding}
      />
      {adding && <AddCardsBar href={back} />}
    </TabPageShell>
  );
}
