import type { Metadata } from "next";
import Link from "next/link";

import { LocalScreen } from "@/components/local/local-screen";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { localFeed } from "@/lib/local/feed";
import { listThreads } from "@/lib/local/threads";
import { playerForUser } from "@/lib/players/accounts";
import { postalCodeForPlayer } from "@/lib/players/location";

export const metadata: Metadata = {
  title: "Local",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Local — the tab that took Room's place in the bar.
 *
 * The founder's reframe: the Room tab was a screen for four nights a
 * month, and the live room now rides the Feed as a banner instead.
 * This slot goes to the other twenty-six days: every Flare posted at a
 * store near you, and the conversations they start. The room itself is
 * one link away for anybody standing in a shop.
 *
 * The website's origin is the profile ZIP — a browser permission
 * prompt is worse than five typed digits on every axis that matters —
 * and the app's is the device, per request. Same feed either way.
 */
export default async function LocalPage() {
  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) {
    return (
      <Shell>
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">Flares near you</h2>
          <p className="text-sm text-text-secondary">
            Local shows every Flare posted near you, and lets you message the poster
            when you have the card. It needs an account, so the conversation is with a
            real name.
          </p>
          <Link href="/signup" className={buttonStyles("primary", "sm")}>
            Create an account
          </Link>
        </Card>
      </Shell>
    );
  }

  const [feed, threads, postalCode] = await Promise.all([
    localFeed(playerId, null),
    listThreads(playerId),
    postalCodeForPlayer(playerId),
  ]);

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="flex-1 text-2xl font-bold tracking-tight text-text-primary">
          Local
        </h1>
        {/* The room's door, for somebody standing in a shop right now. */}
        <Link
          href="/room"
          className="text-sm font-semibold text-accent hover:text-accent-hover"
        >
          In a shop? Open the Room
        </Link>
      </div>

      <LocalScreen feed={feed} threads={threads} postalCode={postalCode} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-4 px-4 pt-6 pb-16"
      >
        <div className="flex w-full max-w-2xl flex-col gap-6">{children}</div>
        <TabBarSpacer />
      </main>
      <PlayerTabBar />
    </>
  );
}
