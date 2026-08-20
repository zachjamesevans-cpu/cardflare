import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Flame, Wand2 } from "lucide-react";

import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { FeedSearch } from "@/components/feed/feed-search";
import { Item } from "@/components/feed/feed-items";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { playerForUser, sessionForPlayer } from "@/lib/players/accounts";
import { listFeed } from "@/lib/feed/repository";
import { listWants } from "@/lib/players/wants";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

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

/**
 * The things a player can always do, whatever the room is doing.
 *
 * The app's home row, on the website, because the two are one product:
 * same three doors, same order, same words. Scanning is deliberately not
 * among them - "move the qr code scanner/code entry to Room. No need to
 * have that in the feed" - and Room is a tab away on both platforms.
 */
const ACTIONS = [
  { href: "/profile/settings", icon: ClipboardList, label: "Your wants" },
  { href: "/profile/store", icon: Flame, label: "Embers store" },
  { href: "/profile/customize", icon: Wand2, label: "Customize" },
];

/**
 * Who you are and what you have.
 *
 * The Feed can be short - on a quiet week it should be - and the screen
 * still has to open with something true. A name and a balance are true
 * every time, and the balance is what makes the two evergreen items at
 * the bottom mean anything.
 */
function Header({
  playerId,
  displayName,
  avatarUrl,
  wants,
  balance,
}: {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  wants: number;
  balance: number | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <PlayerAvatar
          displayName={displayName}
          seed={playerId}
          avatarUrl={avatarUrl}
          frame={null}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">{displayName}</p>
          <p className="text-sm text-text-muted">
            {wants > 0
              ? `${wants} ${wants === 1 ? "card" : "cards"} on your want list`
              : "No wants saved yet"}
          </p>
        </div>
        {/* Only when a balance actually arrived: a missing one is not a
            zero one, and "0 Embers" beside somebody holding thousands is
            worse than saying nothing. */}
        {balance !== null && (
          <p className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent">
            <Flame className="size-4" aria-hidden="true" />
            {balance.toLocaleString()}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-elevated px-2 py-3 text-center transition-colors hover:border-border-strong"
          >
            <action.icon className="size-5 text-accent" aria-hidden="true" />
            <span className="text-xs text-text-secondary">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-4 px-4 pt-6 pb-16"
      >
        {/* The title, and the one door out to other people. Same place on
            both platforms: top right of the main feed. */}
        <div className="flex w-full max-w-2xl flex-wrap items-center gap-3">
          <h1 className="flex-1 text-2xl font-bold tracking-tight text-text-primary">
            Feed
          </h1>
          <FeedSearch />
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
  const [items, wants, account] = await Promise.all([
    listFeed(playerId, session?.id ?? null),
    listWants(playerId),
    /* The face and the balance the header opens with. Two columns off an
       indexed row, the same read the app's /me makes for the same job. */
    getSupabaseAdmin()
      .from("players")
      .select("display_name, avatar_url, embers_balance")
      .eq("id", playerId)
      .maybeSingle(),
  ]);

  return (
    <Shell>
      {account.data && (
        <Header
          playerId={playerId}
          displayName={account.data.display_name}
          avatarUrl={account.data.avatar_url}
          wants={wants.length}
          balance={account.data.embers_balance ?? null}
        />
      )}

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

      {/*
       * The explainer, for a screen that has not filled up yet.
       *
       * Unconditional, it meant an established player read "how it works"
       * under their own board every time they opened the tab. Below three
       * items there is room for it and a newcomer needs it; above three it
       * is the least interesting thing present. Same rule as the app's.
       */}
      {items.length < 3 && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold text-text-primary">How it works</h2>
          <p className="text-sm text-text-secondary">
            Post a Flare for the card you&rsquo;re hunting. When somebody in the room
            has it, they raise a hand, and you go trade, in person, at the table.
          </p>
        </Card>
      )}
    </Shell>
  );
}
