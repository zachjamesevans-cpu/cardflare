import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { JoinCodeForm } from "@/components/events/join-code-form";
import { FollowingCard } from "@/components/players/following-card";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { currentRoomForSession } from "@/lib/players/current-room";
import { listLocals } from "@/lib/players/locals";
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
 * `/e/CODE`, and this is the door the bottom bar knocks on. Which room
 * is derived from the session's own participation — see
 * `currentRoomForSession` — so there is no pointer to go stale.
 *
 * Getting INTO a room happens here now, not on the Feed. The founder:
 * "move the qr code scanner/code entry to Room. No need to have that in
 * the feed." The code form is on this page rather than a link away,
 * because the whole of this screen when you are not in a room is the
 * question "which room?".
 *
 * The stores a player follows answer the same question from the other
 * side, so they live under the form: one tap onto a store's page, and
 * "I'll be there" when its next board is already open. This is the
 * list's one home; settings no longer carries a copy.
 */
export default async function RoomPage() {
  const [viewer, session] = await Promise.all([getViewer(), getPlayerSession()]);
  const room = session ? await currentRoomForSession(session.id) : null;

  if (room) redirect(`/e/${room.code}`);

  /* Guests see the form alone: following needs an account to hang the
     list on. */
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  const [locals, wants] = playerId
    ? await Promise.all([listLocals(playerId), listWants(playerId)])
    : [[], []];

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
          {/* Not wrapped in a card: the form brings its own, and a card
              inside a card is two boxes saying one thing. */}
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              No room yet
            </h1>
            <p className="text-text-secondary">
              Scan the code at your store&rsquo;s counter, or type it here. Either way
              the room lives on this tab until you leave it.
            </p>
          </div>

          <JoinCodeForm />

          <FollowingCard locals={locals} wantCount={wants.length} />
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
