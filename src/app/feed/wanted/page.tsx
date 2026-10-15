import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { WantedGrid } from "@/components/nearby/wanted-list";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { BackLink } from "@/components/ui/back-link";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { WANTED_PAGE, wantedNearYou } from "@/lib/nearby/matching";
import {
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
 * "Wanted near you": your wanted cards as a grid, each card's people in
 * a sheet. Read live on every visit, so an ask taken down is simply not
 * here. Most wanted first, closest first inside a card: nothing to
 * sort. `card` opens that card's sheet (the Feed's summary links so);
 * `page` shows that many pages of cards at once.
 */
export default async function WantedNearYouPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; page?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect(`/login?next=${WANTED_PATH}`);

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  const params = await searchParams;
  const pages = Math.min(20, Math.max(1, Math.floor(Number(params.page)) || 1));
  const wanted = playerId
    ? await wantedNearYou(playerId, "most", 0, WANTED_PAGE * pages)
    : null;

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
              <>
                <p className="font-semibold text-text-primary">
                  {wantedCountLine(wanted.totalPeople)}
                </p>
                <p className="text-sm text-text-muted">{WANTED_PRIVATE_LINE}</p>
              </>
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
              <WantedGrid groups={wanted.groups} initialCardId={params.card ?? null} />
              {wanted.nextOffset !== null && (
                <Link
                  href={`${WANTED_PATH}?page=${pages + 1}`}
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
