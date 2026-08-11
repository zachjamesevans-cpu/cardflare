import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { AddToListForm } from "@/components/lists/add-to-list-form";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WantEntries } from "@/components/players/want-entries";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { currentRoomForSession } from "@/lib/players/current-room";
import { getPlayerSession } from "@/lib/players/session";
import { listWants } from "@/lib/players/wants";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your Flares",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The app's centre tab, on the website — and, the founder's reframe,
 * the list the whole product orbits: search on top, the Flares you are
 * hunting underneath, and every place you scan into (a room, a store
 * counter, a card show) set up to answer that list. Where a new Flare
 * lands is still the same three-way answer:
 *
 * - in a room they have joined: onto that board;
 * - signed in with no room: onto their account list, waiting for the
 *   next room to offer to post it;
 * - a guest with no room: pointed at the door, honestly. Guests have
 *   no account for a list to live on, so the hub is the payoff of
 *   signing in, never a gate.
 */
export default async function FlarePage() {
  const [viewer, session] = await Promise.all([getViewer(), getPlayerSession()]);

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const room = session ? await currentRoomForSession(session.id) : null;
  const images = cardImagesEnabled();
  const wants = playerId ? await listWants(playerId) : null;

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/" aria-label={`${SITE.name} home`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-5">
          {room ? (
            <>
              <Card className="flex flex-col gap-1">
                <p className="text-sm text-text-muted">{room.event.storeName}</p>
                <p className="font-semibold text-text-primary">
                  Posting to {room.event.name}
                </p>
              </Card>

              <AddToListForm code={room.code} kind="flare" imagesEnabled={images} />
            </>
          ) : playerId ? (
            <AddToListForm code="" kind="flare" imagesEnabled={images} target="list" />
          ) : (
            <Card className="flex flex-col gap-3">
              <h1 className="text-xl font-bold text-text-primary">Post a Flare</h1>
              <p className="text-text-secondary">
                A Flare goes up in a room. Scan the code at your store&rsquo;s counter,
                or enter it by hand, and this becomes the fastest way to say what you
                are hunting.
              </p>
              <div>
                <ButtonLink href="/join">Enter a code</ButtonLink>
              </div>
            </Card>
          )}

          {/*
           * The standing list, under the search that feeds it. Rendered
           * for any signed-in player whatever the room situation: a
           * Flare posted to a room saves here too, so the list below is
           * live either way. Same rows as the room's re-post panel,
           * verbs included.
           */}
          {wants !== null && (
            <Card className="flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-text-primary">Your Flares</h2>
                <span className="text-sm text-text-muted tabular-nums">
                  {wants.length} {wants.length === 1 ? "card" : "cards"}
                </span>
              </div>

              {wants.length === 0 ? (
                <p className="pt-3 text-sm text-text-secondary">
                  Post a Flare above and it stays here until you find the card. Every
                  room, store and show you scan into helps answer this list.
                </p>
              ) : (
                <WantEntries
                  code={room?.code ?? ""}
                  wants={wants}
                  imagesEnabled={images}
                />
              )}
            </Card>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
