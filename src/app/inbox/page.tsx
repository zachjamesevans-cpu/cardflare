import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";

import { Logo } from "@/components/brand/logo";
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

/** "3 minutes ago" beats a timestamp for something that just happened. */
function ago(iso: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

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
              <ButtonLink href="/join" variant="secondary">
                Find a room
              </ButtonLink>
            </Card>
          ) : (
            <Card className="p-4">
              <ul className="flex flex-col">
                {items.map((item) => {
                  const body = (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p
                          className={
                            item.readAt
                              ? "font-medium text-text-secondary"
                              : "font-semibold text-text-primary"
                          }
                        >
                          {!item.readAt && (
                            <span
                              aria-label="Unread"
                              className="mr-2 inline-block size-2 rounded-full bg-accent align-middle"
                            />
                          )}
                          {item.title}
                        </p>
                        <span className="text-xs text-text-muted">
                          {ago(item.createdAt)}
                        </span>
                      </div>
                      {item.body && (
                        <p className="text-sm text-text-secondary">{item.body}</p>
                      )}
                    </>
                  );

                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                    >
                      {/* Most of these happened somewhere; the row is the
                          way back to it. */}
                      {item.url ? (
                        <Link
                          href={item.url}
                          className="flex flex-col gap-1 rounded-[var(--radius-control)] transition-colors hover:text-text-primary"
                        >
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
