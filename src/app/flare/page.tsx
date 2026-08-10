import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { AddToListForm } from "@/components/lists/add-to-list-form";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { currentRoomForSession } from "@/lib/players/current-room";
import { getPlayerSession } from "@/lib/players/session";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Post a Flare",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The app's centre tab, on the website — and the same three-way answer
 * the app's hub gives, because where a Flare lands depends on where the
 * player is:
 *
 * - in a room they have joined: onto that board;
 * - signed in with no room: onto their account list, waiting for the
 *   next room to offer to post it;
 * - a guest with no room: pointed at the door, honestly.
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

  return (
    <>
      <main id="main" className="flex min-h-dvh flex-col items-center gap-8 px-5 py-16">
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
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
