import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { CardSearch } from "@/components/cards/card-search";
import { DataAttribution } from "@/components/cards/data-attribution";
import { cardImagesEnabled } from "@/lib/cards/images";
import { viewerGames } from "@/lib/players/viewer-games";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Card search",
  description: `Search One Piece, Magic, Pokémon, Flesh and Blood, Riftbound and Lorcana cards on ${SITE.name}.`,
  // Not indexed while the catalog is being loaded and search is in beta.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Card search.
 *
 * The image flag is read on the server and passed down, so the client never
 * reasons about configuration — it just renders what it is told, and when
 * images are off no `<img>` exists to request anything.
 */
export default async function CardsPage() {
  const games = await viewerGames();

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center gap-8 px-5 py-10">
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Card search
          </h1>
          <p className="text-text-secondary">
            Search by name or card number. Pick a game, or search them all.
          </p>
        </div>

        <CardSearch imagesEnabled={cardImagesEnabled()} playerGames={games} autoFocus />

        <div className="border-t border-border pt-5">
          <DataAttribution />
        </div>
      </div>
    </main>
  );
}
