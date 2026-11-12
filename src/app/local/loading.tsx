import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { LoadingScreen } from "@/components/ui/spinner";

/**
 * What Messages shows while the conversations are being fetched: the
 * page's own chrome with the ring in the middle, so nothing moves when
 * the page lands. No heading here: the page decides its own, and a
 * visitor with no account gets a different one.
 */
export default function Loading() {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-4 px-4 pt-6 pb-16"
      >
        <div className="flex w-full max-w-2xl flex-col gap-6">
          <LoadingScreen />
        </div>
        <TabBarSpacer />
      </main>
      <PlayerTabBar />
    </>
  );
}
