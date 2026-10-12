import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { FeedTile } from "@/components/feed/feed-tile";
import { WantedList } from "@/components/nearby/wanted-list";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { BackLink } from "@/components/ui/back-link";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { WANTED_PAGE, wantedNearYou } from "@/lib/nearby/matching";
import {
  isWantedSort,
  WANTED_HEADING,
  WANTED_PATH,
  WANTED_PRIVATE_LINE,
  wantedCountLine,
} from "@/lib/nearby/shared";
import { playerForUser } from "@/lib/players/accounts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: WANTED_HEADING,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * "Wanted near you": the whole list behind the Feed's card. Read live
 * on every visit, so an ask taken down is simply not here. `page`
 * shows that many pages of cards at once; "Show more cards" asks for
 * one more.
 */
export default async function WantedNearYouPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect(`/login?next=${WANTED_PATH}`);

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  const params = await searchParams;
  const sort = isWantedSort(params.sort) ? params.sort : "most";
  const pages = Math.min(20, Math.max(1, Math.floor(Number(params.page)) || 1));
  const wanted = playerId
    ? await wantedNearYou(playerId, sort, 0, WANTED_PAGE * pages)
    : null;

  const tiles = Object.fromEntries(
    (wanted?.groups ?? []).map((group) => [
      group.card.cardId,
      <FeedTile
        key={group.card.cardId}
        imageUrl={group.card.imageUrl}
        name={group.card.cardName}
        cardNumber={group.card.cardNumber}
        match={group.card.match}
      />,
    ]),
  );

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1">
              <BackLink href="/feed" />
              <h1 className="text-xl font-bold text-text-primary">{WANTED_HEADING}</h1>
            </span>
            {wanted && wanted.totalPeople > 0 && (
              <p className="text-sm text-text-secondary">
                {wantedCountLine(wanted.totalPeople)}. {WANTED_PRIVATE_LINE}
              </p>
            )}
          </div>

          {!wanted || wanted.groups.length === 0 ? (
            /* Live: the last ask can come down while the page was away. */
            <Card className="flex flex-col items-center gap-3 py-12 text-center">
              <MapPin className="size-6 text-text-muted" aria-hidden="true" />
              <p className="max-w-sm text-text-secondary">
                Nobody near you is looking for your cards right now. When someone is,
                they show up here.
              </p>
            </Card>
          ) : (
            <>
              <WantedList groups={wanted.groups} sort={sort} tiles={tiles} />
              {wanted.nextOffset !== null && (
                <Link
                  href={`${WANTED_PATH}?sort=${sort}&page=${pages + 1}`}
                  className={buttonStyles("secondary", "sm")}
                  scroll={false}
                >
                  Show more cards
                </Link>
              )}
            </>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
