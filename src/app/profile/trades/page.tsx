import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import {
  LockedRows,
  monthOf,
  TradeHistoryRow,
  TradeHistoryTotalsRow,
  TradeHistoryWall,
} from "@/components/trades/history";
import { Card } from "@/components/ui/card";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { needsSetup, ownProfile } from "@/lib/players/profile";
import { listTradeHistory } from "@/lib/trades/history";

export const metadata: Metadata = {
  title: "Trade history",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every trade you confirmed, grouped by month, newest first.
 *
 * Same guards as the profile, because it is the same viewer. The list
 * is Pro: a free player gets the counts, the blurred stand-in and the
 * pitch, and the server never sent them the rows.
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

  const [history, areas] = await Promise.all([
    listTradeHistory(playerId, profile.tier),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
  ]);

  const currentArea = areas.some((area) => area.href === "/profile")
    ? "/profile"
    : undefined;

  /* One card per month, so a year of Fridays reads as a calendar. */
  const months: { label: string; trades: typeof history.trades }[] = [];
  for (const trade of history.trades) {
    const label = monthOf(trade.confirmedAt);
    const last = months[months.length - 1];
    if (last && last.label === label) last.trades.push(trade);
    else months.push({ label, trades: [trade] });
  }

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
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-sm font-semibold text-accent tabular-nums">
              <Flame className="size-4" aria-hidden="true" />
              {history.totals.embers.toLocaleString()}
              <span className="font-medium text-text-muted">earned trading</span>
            </span>
          </div>

          <TradeHistoryTotalsRow totals={history.totals} />

          {history.locked ? (
            <div className="relative">
              <Card className="p-4">
                <LockedRows count={6} />
              </Card>
              <TradeHistoryWall count={history.totals.trades} />
            </div>
          ) : months.length === 0 ? (
            <Card className="flex flex-col gap-1">
              <p className="font-semibold text-text-primary">Nothing traded yet</p>
              <p className="text-sm text-text-secondary">
                Confirm a trade in a room and it lands here, with who it was with and
                what it paid.
              </p>
            </Card>
          ) : (
            months.map((month) => (
              <Card key={month.label} className="flex flex-col gap-3 p-4">
                <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                  {month.label}
                </p>
                <ul className="flex flex-col">
                  {month.trades.map((trade) => (
                    <TradeHistoryRow key={trade.id} trade={trade} />
                  ))}
                </ul>
              </Card>
            ))
          )}

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
