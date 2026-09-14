import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { InboxList } from "@/components/inbox/inbox-list";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { markInboxReadAction } from "@/lib/notifications/inbox-actions";
import { listInbox } from "@/lib/notifications/inbox";
import { playerForUser } from "@/lib/players/accounts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The app's Inbox tab, on the website.
 *
 * The backbone has been recording these since Milestone 13 and email
 * has been delivering them, but the only way to read the inbox itself
 * was the app — so a player on a laptop never saw the offer that landed
 * while they were away. Same rows, same fifty, same order.
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

  const items = playerId ? await listInbox(playerId) : [];
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/" aria-label={`${SITE.name} home`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-text-primary">Notifications</h1>
            {unread > 0 && (
              <form action={markInboxReadAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Mark all read
                </Button>
              </form>
            )}
          </div>

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
                opens early at a store you save, it lands here.
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
