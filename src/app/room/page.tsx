import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { JoinCodeForm } from "@/components/events/join-code-form";
import { YourStoresCard } from "@/components/players/your-stores-card";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { currentRoomForSession } from "@/lib/players/current-room";
import { listRecentStores } from "@/lib/players/locals";
import { getPlayerSession } from "@/lib/players/session";
import { listWants } from "@/lib/players/wants";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The app's Room tab, on the website.
 *
 * A destination rather than a page: the board itself still lives at
 * `/e/CODE`, and this is the door the bottom bar knocks on.
 *
 * It asks "which store?" first. It used to walk straight into the room
 * this session was last in, and the founder: "When clicking 'room' it
 * defaults to Mox Valley games. But really it should give me an option
 * for all stores I've been at recently. First." So the stores come
 * first, most recently visited at the top, with the room this browser
 * is standing in (derived by `currentRoomForSession`, so there is no
 * pointer to go stale) pinned above them as one tap back.
 *
 * Getting into a NEW room is the code box under the list. The founder:
 * "move the qr code scanner/code entry to Room. No need to have that in
 * the feed." A guest, or somebody who has been nowhere yet, sees the
 * box alone, because for them the whole screen is that question.
 */
export default async function RoomPage() {
  const [viewer, session] = await Promise.all([getViewer(), getPlayerSession()]);
  const room = session ? await currentRoomForSession(session.id) : null;

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  const [stores, wants] = playerId
    ? await Promise.all([listRecentStores(playerId), listWants(playerId)])
    : [[], []];
  const current = room
    ? { name: room.event.name, storeName: room.event.storeName, code: room.code }
    : null;
  const picking = stores.length > 0 || current !== null;

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-md flex-col gap-5">
          {picking ? (
            <>
              <YourStoresCard
                stores={stores}
                wantCount={wants.length}
                current={current}
              />

              <div className="flex flex-col gap-2 pt-2 text-center">
                <h2 className="text-lg font-bold tracking-tight text-text-primary">
                  Somewhere new?
                </h2>
                <p className="text-sm text-text-secondary">
                  Scan the code at the store&rsquo;s counter, or type it here.
                </p>
              </div>
              <JoinCodeForm autoFocus={false} />
            </>
          ) : (
            <>
              {/* Not wrapped in a card: the form brings its own, and a
                  card inside a card is two boxes saying one thing. */}
              <div className="flex flex-col gap-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                  No room yet
                </h1>
                <p className="text-text-secondary">
                  Scan the code at your store&rsquo;s counter, or type it here. Either
                  way the room lives on this tab until you leave it.
                </p>
              </div>

              <JoinCodeForm />
            </>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
