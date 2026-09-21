import type { Metadata } from "next";
import Link from "next/link";

import { TabPageShell } from "@/components/players/tab-page-shell";
import { FeedFilterTabs } from "@/components/feed/feed-filter-tabs";
import { FeedSearch } from "@/components/feed/feed-search";
import { Item } from "@/components/feed/feed-items";
import {
  belongsToTab,
  FEED_TAB_VALUES,
  sectionHeading,
  type FeedTab,
} from "@/lib/feed/repository";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { playerForUser, sessionForPlayer } from "@/lib/players/accounts";
import { listFeed } from "@/lib/feed/repository";
import { feedViewFor } from "@/lib/feed/view-settings";
import { listLocals } from "@/lib/players/locals";
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

/*
 * NO IDENTITY HEADER. The Feed opens on the Feed.
 *
 * There was a Header here - your face, your name, your want count and
 * your Embers balance - on the argument that a quiet week still has to
 * open with something true. The founder cut it: "it's not necessary to
 * show my username, flare points, or anything like that... to allow the
 * feed to have more vertical space."
 *
 * He is right about what it cost. Every one of those facts is about the
 * viewer, who already knows them, and they sat above the first post on
 * the page. Both the balance and the want count live on /profile, so
 * nothing here was the only way to reach anything.
 *
 * Two reads went with it: the want list, and the players row for the
 * name, face and balance. The Feed page no longer asks for either.
 */

/* The chrome is TabPageShell, shared with a player's page: the wordmark
   centred with the Feed behind it, the search on the right, the tab
   bar below. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <TabPageShell title="Feed" trailing={<FeedSearch />}>
      {children}
    </TabPageShell>
  );
}

const TABS: FeedTab[] = FEED_TAB_VALUES;

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: FeedTab = TABS.includes(rawTab as FeedTab)
    ? (rawTab as FeedTab)
    : "following";

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
            Create a free account and the cards you are looking for reach your friends
            and every room you walk into. At a store right now? The code at the counter
            gets you into tonight&rsquo;s room, no account needed.
          </p>
          {/* The doors, in the order the copy offers them: the account,
              the way in for somebody who has one, and Room, which holds
              the scanner for the person already standing in a shop. */}
          <div className="flex flex-wrap gap-2">
            <Link href="/signup?next=%2Ffeed" className={buttonStyles("primary", "sm")}>
              Create free account
            </Link>
            <Link
              href="/login?next=%2Ffeed"
              className={buttonStyles("secondary", "sm")}
            >
              Sign in
            </Link>
            <Link href="/room" className={buttonStyles("ghost", "sm")}>
              Go to Room
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  const session = await sessionForPlayer(playerId);
  const [items, locals] = await Promise.all([
    listFeed(playerId, session?.id ?? null),
    /* For the live-room banner below. Room lost its tab to Local, so
       the Feed is where a live room announces itself now. */
    listLocals(playerId),
  ]);

  const liveLocal = locals.find((local) => local.liveNow) ?? null;

  /* Following | Nearby | My Flares. Which filter an item belongs under
     is decided in one place for both platforms, version skew and all -
     see `belongsToTab`. Matching `item.tab` here directly was the
     stricter of the two clients: an item from a newer server, filed
     under a tab this build has never heard of, vanished on the website
     while the app still showed it. Headings only where a tab holds
     more than one section, and never on Following: the server sends
     that tab as one chronological list, and the founder wants it read
     as one, with no section titles cutting it up. */
  /* How this reader wants their Feed drawn. Read here rather than in
     the card, so one query answers it for the whole page. */
  const view = playerId ? await feedViewFor(playerId) : "classic";

  const shown = items.filter((item) => belongsToTab(item, tab));
  const sectionsShown =
    tab === "following" ? 0 : new Set(shown.map((item) => item.section)).size;

  return (
    <Shell>
      <FeedFilterTabs value={tab} />

      {/* The Room tab's job, as a banner: gone from the bar, never gone
          from reach. Shows the moment a room is open at one of your
          stores and takes you straight onto its board. */}
      {liveLocal && (
        <Link
          href={`/e/${liveLocal.joinCode}`}
          className="flex w-full max-w-2xl items-center gap-3 rounded-[var(--radius-card)] border border-accent bg-elevated p-4 hover:border-accent-hover"
        >
          <span className="relative flex size-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-3 rounded-full bg-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-text-primary">
              Room open at {liveLocal.name}
            </span>
            <span className="block text-sm text-text-secondary">
              Tap to jump onto the board.
            </span>
          </span>
        </Link>
      )}

      {shown.length === 0 && tab === "following" ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">Nothing from people yet</h2>
          <p className="text-sm text-text-secondary">
            Follow a friend and their Flares show up here. Find them by name from the
            search up top.
          </p>
        </Card>
      ) : shown.length === 0 && tab === "mine" ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">You have not posted yet</h2>
          <p className="text-sm text-text-secondary">
            Post a Flare for a card you are looking for and it shows up here, and in
            Following with everyone else&rsquo;s.
          </p>
          <Link href="/flare" className={buttonStyles("secondary", "sm")}>
            Post a Flare
          </Link>
        </Card>
      ) : shown.length === 0 ? (
        /* The tab is one of three and the other two are answered above,
           so this is Nearby's empty state and nobody else's. */
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">Nothing on right now</h2>
          <p className="text-sm text-text-secondary">
            Post a Flare for a card you are looking for, or follow a friend, and it
            shows up here. At a store? The code at the counter gets you into
            tonight&rsquo;s room.
          </p>
          <Link href="/room" className={buttonStyles("secondary", "sm")}>
            Go to Room
          </Link>
        </Card>
      ) : (
        shown.map((item, index) => (
          <div
            /* A post keeps its identity when the list moves, so nothing
               of one post's state lands on another's. */
            key={item.kind === "hunt" ? `hunt-${item.postId}` : `${item.kind}-${index}`}
            className="flex flex-col gap-3"
          >
            {/* The heading, only where the section changes. The order was
                always an argument about what is worth a tap; this is the
                argument said out loud. */}
            {/* A section we have no title for draws NOTHING - an empty
                heading still takes a line box, which on the app read as
                forty-three points of unexplained black above the first
                card. Same forgiving rule the item kinds follow. */}
            {sectionsShown > 1 &&
              sectionHeading(item.section) &&
              (index === 0 || shown[index - 1].section !== item.section) && (
                <h2 className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
                  {sectionHeading(item.section)}
                </h2>
              )}
            <Item item={item} view={view} />
            {/* Why this is on your screen. A feed that explains itself
                stops feeling arbitrary even when it is thin. A post
                carries its own label in its header instead - the
                founder: no separate text between cards - and a store's
                post is a post, so it goes without one too. */}
            {item.kind !== "hunt" && item.kind !== "storePost" && (
              <p className="-mt-1 text-xs text-text-muted">{item.reason}</p>
            )}
          </div>
        ))
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
            Post a Flare for the card you&rsquo;re looking for. When a friend or
            somebody in your room has it, they raise a hand and you trade in person.
          </p>
        </Card>
      )}
    </Shell>
  );
}
