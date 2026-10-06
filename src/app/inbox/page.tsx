import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, MessageCircle } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { InboxList } from "@/components/inbox/inbox-list";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { BackLink } from "@/components/ui/back-link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { unreadMessages } from "@/lib/local/threads";
import { markInboxReadAction } from "@/lib/notifications/inbox-actions";
import { listInbox, type InboxItem } from "@/lib/notifications/inbox";
import { playerForUser } from "@/lib/players/accounts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Inbox",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The notifications, opened from the bell at the Feed's top right.
 * It was the app's Inbox tab until round 16 gave that slot to
 * Messages; the page, its rows and its address are unchanged.
 *
 * The backbone has been recording these since Milestone 13 and email
 * has been delivering them, but the only way to read the inbox itself
 * was the app — so a player on a laptop never saw the offer that landed
 * while they were away. Same rows, same fifty, same order.
 *
 * Messages has its door here too. The audit of 2026-10-01: with Local
 * off, the conversations lived at /local with no tab and no link, so
 * a reply could only be found from the notice that announced it. The
 * row at the top is the way in, unread count and all, shown even when
 * nothing else has arrived. The app's Inbox draws the same row.
 */
export default async function InboxPage() {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  // An inbox belongs to an account. A guest has nowhere for one to live.
  if (viewer.kind === "anonymous") redirect("/login?next=/inbox");

  const [items, unreadThreads]: [InboxItem[], number] = playerId
    ? await Promise.all([listInbox(playerId), unreadMessages(playerId)])
    : [[], 0];
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        {/* A tab-bar page: the logo goes back to the Feed, not the
            marketing home. */}
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Opened from the Feed's bell now, not a tab, so it has a
                way back to where it was opened. */}
            <span className="flex items-center gap-1">
              <BackLink href="/feed" />
              <h1 className="text-xl font-bold text-text-primary">Inbox</h1>
            </span>
            {unread > 0 && (
              <form action={markInboxReadAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Mark all read
                </Button>
              </form>
            )}
          </div>

          {playerId && (
            <Link
              href="/local"
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-accent">
                <MessageCircle className="size-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 font-semibold text-text-primary">
                  Messages
                  {unreadThreads > 0 && (
                    <span className="rounded-full bg-accent px-1.5 text-[11px] leading-5 font-bold text-accent-contrast tabular-nums">
                      {unreadThreads > 99 ? "99+" : unreadThreads}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </span>
                <span className="text-sm text-text-secondary">
                  Conversations about cards, and with players you message.
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-text-muted"
                aria-hidden="true"
              />
            </Link>
          )}

          {!playerId ? (
            <Card className="flex flex-col gap-3">
              <p className="text-text-secondary">
                Notifications arrive with a player account. Yours is not set up yet.
              </p>
            </Card>
          ) : items.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-12 text-center">
              <Bell className="size-6 text-text-muted" aria-hidden="true" />
              <p className="max-w-sm text-text-secondary">
                Nothing yet. When somebody offers on one of your Flares, or a board
                opens early at a store you follow, it lands here.
              </p>
              <ButtonLink href="/room" variant="secondary">
                Find a room
              </ButtonLink>
            </Card>
          ) : (
            <Card className="p-2 sm:p-3">
              <InboxList items={items} />
            </Card>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
