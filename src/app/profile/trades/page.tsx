import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import {
  LockedRows,
  TradeHistoryList,
  TradeHistoryTotalsRow,
  TradeHistoryWall,
} from "@/components/trades/history";
import { LogTradeButton } from "@/components/trades/log-trade-sheet";
import { Card } from "@/components/ui/card";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { listLocals } from "@/lib/players/locals";
import { needsSetup, ownProfile } from "@/lib/players/profile";
import { viewerGames } from "@/lib/players/viewer-games";
import { listTradeHistory } from "@/lib/trades/history";

export const metadata: Metadata = {
  title: "Trade history",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every trade you confirmed, grouped by month, newest first, and the
 * ones you logged yourself beside them.
 *
 * Same guards as the profile, because it is the same viewer. The list
 * is Pro: a free player gets the counts, the blurred stand-in and the
 * pitch, and the server never sent them the rows. Logging is Pro too,
 * so the button goes with the rows.
 */
export default async function TradeHistoryPage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/profile/trades");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome");

  const profile = await ownProfile(playerId);
  if (!profile) redirect("/profile/settings");

  const [history, areas, locals, games] = await Promise.all([
    listTradeHistory(playerId, profile.tier),
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
        title="Trade history"
        description="Only you can see this. Stores see totals, never who traded what."
        areas={areas}
        currentArea={currentArea}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary underline-offset-4 transition-colors hover:text-text-primary hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to your profile
            </Link>
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

          <TradeHistoryTotalsRow totals={history.totals} />

          {history.locked ? (
            <div className="relative">
              <Card className="p-4">
                <LockedRows count={6} />
              </Card>
              <TradeHistoryWall count={history.totals.trades} />
            </div>
          ) : (
            <TradeHistoryList trades={history.trades} />
          )}

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
