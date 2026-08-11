import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { currentRoomForSession } from "@/lib/players/current-room";
import { getPlayerSession } from "@/lib/players/session";
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
 */
export default async function RoomPage() {
  const session = await getPlayerSession();
  const room = session ? await currentRoomForSession(session.id) : null;

  if (room) redirect(`/e/${room.code}`);

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/" aria-label={`${SITE.name} home`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-md flex-col gap-5">
          <Card className="flex flex-col gap-3">
            <h1 className="text-xl font-bold text-text-primary">No room yet</h1>
            <p className="text-text-secondary">
              Scan the code at your store&rsquo;s counter and the room lives here. You
              can also type the code by hand.
            </p>
            <div>
              <ButtonLink href="/join">Enter a code</ButtonLink>
            </div>
          </Card>
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
