import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { LoadingScreen } from "@/components/ui/spinner";
import { SITE } from "@/lib/site";

/**
 * What a room shows while it is being fetched: the page's own chrome
 * with the ring in the middle, so nothing moves when the page lands.
 *
 * A Suspense fallback inside the page rather than a route loading.tsx:
 * a route boundary streams the shell before the page can say 404, and
 * a malformed code in the URL must stay a 404 (tests/e2e pins it). The
 * page validates the code first and suspends only past that.
 */
export function RoomLoading() {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center justify-start gap-3 px-5 pt-5 pb-16 sm:gap-5 sm:pt-10"
      >
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>
        <LoadingScreen label="Opening the room" />
        <TabBarSpacer />
      </main>
      <PlayerTabBar />
    </>
  );
}
