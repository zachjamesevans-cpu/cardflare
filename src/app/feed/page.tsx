import type { Metadata } from "next";
import Link from "next/link";
import { QrCode } from "lucide-react";

import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Item } from "@/components/feed/feed-items";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { playerForUser, sessionForPlayer } from "@/lib/players/accounts";
import { listFeed } from "@/lib/feed/repository";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Feed",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Feed — the room's question, asked from a sofa.
 *
 * Replaces Join as the first tab. Join was a tab used four times a month, on
 * the days somebody stands in a shop; scanning is a button now, which is
 * fewer taps than the tab it replaced. See PRODUCT.md for the boundary this
 * feature is allowed to occupy.
 *
 * Everything on it is derived — nothing is authored and there is no compose
 * box — so a pilot with six players opens a feed with something in it on day
 * one rather than being taught that nothing happens here.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-4 px-4 pt-6 pb-16"
      >
        <div className="flex w-full max-w-2xl items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Feed</h1>
          {/* Scanning left the tab bar and became a button, reachable from
              the one screen a player opens by habit. */}
          <Link
            href="/join"
            aria-label="Scan a code"
            className="flex size-10 items-center justify-center rounded-full border border-border-strong bg-elevated text-text-primary transition-colors hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <QrCode className="size-5" aria-hidden="true" />
          </Link>
        </div>

        <div className="flex w-full max-w-2xl flex-col gap-3">{children}</div>
        <TabBarSpacer />
      </main>
      <PlayerTabBar />
    </>
  );
}

export default async function FeedPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <Card>
          <p className="text-text-secondary">
            The feed can&rsquo;t be loaded right now. Try again in a moment.
          </p>
        </Card>
      </Shell>
    );
  }

  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  /*
   * A guest has no follows and no locals, so there is nothing to derive. They
   * get the door instead of an empty page — scanning is the whole product for
   * somebody without an account, and always has been.
   */
  if (!playerId) {
    return (
      <Shell>
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">Scan to start trading</h2>
          <p className="text-sm text-text-secondary">
            Scan the code at your store&rsquo;s counter and you&rsquo;re in the room.
            Sign in and your stores and the people you follow show up here.
          </p>
          <Link href="/join" className={buttonStyles("primary", "sm")}>
            Scan a code
          </Link>
        </Card>
      </Shell>
    );
  }

  const session = await sessionForPlayer(playerId);
  const items = await listFeed(playerId, session?.id ?? null);

  return (
    <Shell>
      {items.length === 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">Nothing on right now</h2>
          <p className="text-sm text-text-secondary">
            When a board opens at one of your stores, or somebody you follow starts
            hunting a card you&rsquo;re holding, it shows up here.
          </p>
          <Link href="/join" className={buttonStyles("secondary", "sm")}>
            Scan a code
          </Link>
        </Card>
      ) : (
        items.map((item, index) => (
          <Item key={`${item.kind}-${item.code}-${index}`} item={item} />
        ))
      )}
    </Shell>
  );
}
