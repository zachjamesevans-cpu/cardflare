import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { LoadingScreen } from "@/components/ui/spinner";
import { SITE } from "@/lib/site";

/**
 * What Nights shows while it is being fetched: the page's own chrome
 * with the ring in the middle, so nothing moves when the page lands.
 */
export default function Loading() {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-4 px-2 pt-6 pb-16 sm:px-6"
      >
        <Link href="/feed" aria-label={`${SITE.name} Feed`}>
          <Logo size={30} priority />
        </Link>
        <LoadingScreen />
        <TabBarSpacer />
      </main>
      <PlayerTabBar />
    </>
  );
}
