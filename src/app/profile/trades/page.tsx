import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Flame } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { HistoryList } from "@/components/trades/history";
import { LogTradeButton } from "@/components/trades/log-trade-sheet";
import { BackLink } from "@/components/ui/back-link";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { listFlareHistory } from "@/lib/flares/history";
import { playerForUser } from "@/lib/players/accounts";
import { listLocals } from "@/lib/players/locals";
import { needsSetup, ownProfile } from "@/lib/players/profile";
import { viewerGames } from "@/lib/players/viewer-games";
import { listTradeHistory } from "@/lib/trades/history";

export const metadata: Metadata = {
  title: "History",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * History: every trade you confirmed or logged, and every Flare that
 * has finished (found, traded or taken down) with who answered it,
 * grouped by month, newest first, behind chips All · Trades · Flares.
 * The URL stays /profile/trades so every link to it keeps working.
 *
 * Same guards as the profile, because it is the same viewer. The trade
 * rows are Pro: a free player gets the counts, the blurred stand-in
 * and the pitch, and the server never sent them the rows. Logging is
 * Pro too, so the button goes with the rows. The Flare rows are free.
 */
export default async function HistoryPage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/profile/trades");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) redirect("/profile/settings");
  /* Both guards at once: one roundtrip, not two in a row. */
  const [setupOwed, profile] = await Promise.all([
    needsSetup(playerId),
    ownProfile(playerId),
  ]);
  if (setupOwed) redirect("/welcome");
  if (!profile) redirect("/profile/settings");

  const [history, flares, areas, locals, games] = await Promise.all([
    listTradeHistory(playerId, profile.tier),
    listFlareHistory(playerId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
    listLocals(playerId),
    viewerGames(),
  ]);

  const currentArea = areas.some((area) => area.href === "/profile")
    ? "/profile"
    : undefined;

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="History"
        description="Only you can see this. Stores see totals, never who traded what."
        areas={areas}
        currentArea={currentArea}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BackLink href="/profile" />
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-sm font-semibold text-accent tabular-nums">
                <Flame className="size-4" aria-hidden="true" />
                {history.totals.embers.toLocaleString()}
                <span className="font-medium text-text-muted">earned trading</span>
              </span>
              {/* Writing a trade down is Pro, like reading them: the
                  wall below already makes the pitch. */}
              {!history.locked && (
                <LogTradeButton
                  locals={locals.map((store) => store.name)}
                  imagesEnabled={cardImagesEnabled()}
                  playerGames={games}
                />
              )}
            </div>
          </div>

          <HistoryList
            locked={history.locked}
            totals={history.totals}
            trades={history.trades}
            flares={flares}
          />

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
