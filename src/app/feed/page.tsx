import type { Metadata } from "next";
import Link from "next/link";

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
 * the days somebody stands in a shop. See PRODUCT.md for the boundary this
 * feature is allowed to occupy.
 *
 * Scanning is not here. It used to be a button in this header, and the
 * founder cut it: "move the qr code scanner/code entry to Room. No need
 * to have that in the feed." It is the right call — scanning is what you
 * do standing at a counter, which is the moment you are opening Room
 * anyway, and a door on the reading screen is a door in the wrong wall.
 *
 * Almost everything on it is derived — there is no compose box and no
 * player can put a word in front of another one — so a pilot with six
 * players opens a feed with something in it on day one rather than being
 * taught that nothing happens here. The single exception is an
 * announcement from us, which wears the mark rather than a face and
 * carries the expiry that takes it away again.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-4 px-4 pt-6 pb-16"
      >
        <div className="flex w-full max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Feed</h1>
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
   * A guest has no follows and no locals, so there is nothing to derive.
   * They get the door instead of an empty page — a room reached with a
   * counter code and no account is the whole product for somebody who
   * has not signed up, and always has been.
   */
  if (!playerId) {
    return (
      <Shell>
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">Start trading</h2>
          <p className="text-sm text-text-secondary">
            The code at your store&rsquo;s counter gets you into the room, no account
            needed. Sign in and your stores, the boards open tonight and the people you
            follow all show up here.
          </p>
          {/* Room holds the scanner now, and it is the tab you are already
              opening when you are standing in a shop. */}
          <Link href="/room" className={buttonStyles("primary", "sm")}>
            Go to Room
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
            No rooms are open anywhere at the moment. When a board opens at one of your
            stores, or somebody you follow starts hunting a card you&rsquo;re holding,
            it shows up here.
          </p>
          <Link href="/room" className={buttonStyles("secondary", "sm")}>
            Go to Room
          </Link>
        </Card>
      ) : (
        items.map((item, index) => <Item key={`${item.kind}-${index}`} item={item} />)
      )}
    </Shell>
  );
}
