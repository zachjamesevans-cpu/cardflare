import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { CardPageView } from "@/components/cards/card-page";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { cardPage } from "@/lib/cards/card-page";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Card",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One card, on a page of its own: what a search result opens.
 *
 * Public, so a link to it works signed out, and the You block is then
 * the way in; not indexed, because the page is who has a card near
 * you and that is not a page for the open web. A card the catalogue
 * does not carry is missing, which is what `cardPage` decides. The
 * back link goes to the Feed, where the search lives.
 */
export default async function CardRoute({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const viewer = await getViewer();
  const viewerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const page = await cardPage(cardId, viewerId);
  if (!page) notFound();

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-4 pt-6 pb-16 sm:px-6 sm:pt-10"
      >
        <Link href="/feed" aria-label={`${SITE.name} Feed`}>
          <Logo size={36} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-4">
          <Link
            href="/feed"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the Feed
          </Link>

          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <CardPageView
              page={page}
              viewerId={viewerId}
              imagesEnabled={cardImagesEnabled()}
            />
          </Card>
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
