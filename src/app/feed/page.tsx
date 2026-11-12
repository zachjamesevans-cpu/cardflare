import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PostSpotlight } from "@/components/onboarding/post-spotlight";
import { TabPageShell } from "@/components/players/tab-page-shell";
import {
  FeedList,
  GuestDoor,
  HowItWorks,
  LiveRoomBanner,
} from "@/components/feed/feed-list";
import { Plus, Search } from "lucide-react";
import { HEADER_BUTTON, HEADER_ICON } from "@/components/ui/header-button";
import { NotificationBell } from "@/components/feed/notification-bell";
import { belongsToTab } from "@/lib/feed/repository";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { playerForUser, sessionForPlayer } from "@/lib/players/accounts";
import { listFeed } from "@/lib/feed/repository";
import { rememberFeed } from "@/lib/feed/memo";
import { feedViewFor } from "@/lib/feed/view-settings";
import { listLocals } from "@/lib/players/locals";
import { unreadCount } from "@/lib/notifications/inbox";
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
 * The door is the QR at the top left of Nearby now (/nearby), which took
 * the Rooms slot in the bar.
 *
 * FOLLOWING, AND NOTHING ELSE. There were three filters under the
 * wordmark here: Following, Nearby and My Flares. My Flares went when
 * the founder asked "is my flares even useful anymore now that they're
 * displaying in your own profile?" and the answer was no: everything in
 * it was already in Following and on your profile. Nearby became a tab
 * of its own in the bar (2026-10-11); the founder: "this nearby feature,
 * if it works, could be extremely helpful for people looking for cards."
 * So the Feed is the Following list with no filter row, exactly as the
 * app's Feed tab. An old link to `?tab=nearby` is sent on to /nearby,
 * and `?tab=mine` lands here, on the plain Feed.
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
   centred with the Feed behind it, the notifications bell on the right,
   the tab bar below. Search is a tab of its own now (Feed, Nearby,
   Messages, Search, Profile). The bell is a player's: somebody with no
   inbox, who may have no tab bar either, gets the door to Search in
   its place. */
function Shell({
  playerId = null,
  unread = 0,
  tour = false,
  children,
}: {
  playerId?: string | null;
  unread?: number;
  /** A new player's first look, from the intro: point at the + (PostSpotlight). */
  tour?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TabPageShell
      title="Feed"
      surface
      /* The + at the top left posts a Flare, the way Instagram's posts:
         the founder gave the tab bar's middle to Messages, which gets
         opened far more often than a Flare gets posted. A player's: a
         guest posts from a room. */
      leading={
        playerId ? (
          <>
            <Link
              href="/flare"
              aria-label="Post a Flare"
              className={HEADER_BUTTON}
              data-spotlight="post-flare"
            >
              <Plus className={HEADER_ICON} aria-hidden="true" />
            </Link>
            {tour && <PostSpotlight />}
          </>
        ) : undefined
      }
      trailing={
        playerId ? (
          <NotificationBell unread={unread} />
        ) : (
          <Link href="/search" aria-label="Search" className={HEADER_BUTTON}>
            <Search className={HEADER_ICON} aria-hidden="true" />
          </Link>
        )
      }
    >
      {children}
    </TabPageShell>
  );
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tour?: string }>;
}) {
  const { tab, tour } = await searchParams;

  /* Nearby has its own address. Every link written while it was a
     filter here (`/feed?tab=nearby`) keeps working. Anything else in
     `tab`, the retired `mine` included, is the plain Feed. */
  if (tab === "nearby") redirect("/nearby");

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

  /* A guest has no follows and no locals, so there is nothing to
     derive: they get the door instead of an empty page. */
  if (!playerId) {
    return (
      <Shell>
        <GuestDoor next="/feed" />
      </Shell>
    );
  }

  const session = await sessionForPlayer(playerId);
  const [items, locals, unread] = await Promise.all([
    /* Remembered for half a minute: the Feed and Nearby are two reads
       of this one list, and a tab tap must not rebuild it. See memo.ts. */
    rememberFeed(playerId, () => listFeed(playerId, session?.id ?? null)),
    /* For the live-room banner below. Room lost its tab to Local, so
       the Feed is where a live room announces itself now. */
    listLocals(playerId),
    /* The bell's dot. */
    unreadCount(playerId),
  ]);

  const liveLocal = locals.find((local) => local.liveNow) ?? null;

  /* The Following half of the server's list; Nearby draws the other
     (src/app/nearby/page.tsx). Which half an item belongs to is decided
     in one place for both platforms, version skew and all - see
     `belongsToTab`. Matching `item.tab` here directly was the stricter
     of the two clients: an item from a newer server, filed under a tab
     this build has never heard of, vanished on the website while the
     app still showed it. No headings: the server sends Following as one
     chronological list, and the founder wants it read as one, with no
     section titles cutting it up. */
  /* How this reader wants their Feed drawn. Read here rather than in
     the card, so one query answers it for the whole page. */
  const view = await feedViewFor(playerId);

  const shown = items.filter((item) => belongsToTab(item, "following"));

  return (
    <Shell playerId={playerId} unread={unread} tour={tour === "post"}>
      {/* A room open at one of your stores, pinned above everything
          derived. */}
      {liveLocal && (
        <LiveRoomBanner name={liveLocal.name} joinCode={liveLocal.joinCode} />
      )}

      {shown.length === 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">Nothing from people yet</h2>
          <p className="text-sm text-text-secondary">
            Follow a friend and their Flares show up here. Find them by name in Search.
          </p>
          {/* The app's empty Following list has the same button, to the
              same tab. */}
          <Link href="/search" className={buttonStyles("secondary", "sm")}>
            Find a player
          </Link>
        </Card>
      ) : (
        <FeedList shown={shown} view={view} />
      )}

      {/* The explainer, for a screen that has not filled up yet: see
          HowItWorks. Counted over the whole list, as the app counts. */}
      {items.length < 3 && <HowItWorks />}
    </Shell>
  );
}
