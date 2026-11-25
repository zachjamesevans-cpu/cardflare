import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { GameHubView } from "@/components/games/game-hub-view";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { gameHub } from "@/lib/cards/game-hub";
import { cardImagesEnabled } from "@/lib/cards/images";
import { GAME_SLUGS, gameShortName } from "@/lib/players/games-catalog";
import { SITE } from "@/lib/site";

/**
 * A game's hub: most hunted, price moves this week, most searched
 * (src/lib/cards/game-hub.ts). The same for everyone, so it is worked out
 * at most once an hour per game.
 */
export const revalidate = 3600;

type Params = { params: Promise<{ game: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { game } = await params;
  return { title: `${gameShortName(game)} on ${SITE.name}` };
}

export default async function GameHubPage({ params }: Params) {
  const { game } = await params;
  const slug = GAME_SLUGS.find((entry) => entry === game);
  if (!slug) notFound();
  const hub = await gameHub(slug);

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-6 px-4 pt-6 pb-16 sm:px-6 sm:pt-10"
      >
        <Link href="/feed" aria-label={`${SITE.name} Feed`}>
          <Logo size={36} priority />
        </Link>
        <h1 className="sr-only">{gameShortName(slug)}</h1>
        <div className="w-full max-w-2xl">
          <GameHubView
            hub={hub}
            name={gameShortName(slug)}
            imagesEnabled={cardImagesEnabled()}
          />
        </div>
        <TabBarSpacer />
      </main>
      <PlayerTabBar />
    </>
  );
}
