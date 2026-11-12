import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import {
  FeedList,
  GuestDoor,
  HowItWorks,
  LiveRoomBanner,
} from "@/components/feed/feed-list";
import { NotificationBell } from "@/components/feed/notification-bell";
import { PostalAsk } from "@/components/feed/postal-ask";
import { CodeSheet } from "@/components/nights/code-sheet";
import { Tour } from "@/components/onboarding/tour";
import { TabPageShell } from "@/components/players/tab-page-shell";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HEADER_BUTTON, HEADER_ICON } from "@/components/ui/header-button";
import { getViewer } from "@/lib/auth/session";
import { rememberFeed } from "@/lib/feed/memo";
import { planNearby } from "@/lib/feed/nearby-plan";
import { belongsToTab, feedRadiusFor, listFeed } from "@/lib/feed/repository";
import { feedViewFor } from "@/lib/feed/view-settings";
import { unreadCount } from "@/lib/notifications/inbox";
import { playerForUser, sessionForPlayer } from "@/lib/players/accounts";
import { listLocals } from "@/lib/players/locals";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

import { saveNearbyPostalAction } from "./actions";
import { LookFurtherButton, NearbyHeader } from "./nearby-reach";

export const metadata: Metadata = {
  title: "Nearby",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Nearby: the second tab, a standing trade room for your area.
 *
 * It was a filter on the Feed (`/feed?tab=nearby`, which still lands
 * here) until it took the Rooms slot in the bar on 2026-10-11. The
 * founder: "i really dont think the nights tab will be used as much,
 * and this nearby feature, if it works, could be extremely helpful for
 * people looking for cards."
 *
 * The app's Nearby tab is its Feed screen drawing the other half of the
 * same server answer (`<HomeScreen mode="nearby" />`), and this page is
 * the website's: the same list `listFeed` builds for the Feed, read
 * through `belongsToTab(item, "nearby")` and then `planNearby`, which
 * keeps only what is a trade. From the top, in the app's order:
 *
 *   - the QR at the top left, where the Feed has its +: the way into a
 *     store's room, which lived on the Rooms tab this one replaced
 *   - a room open at one of your stores, as a banner
 *   - "Near you · 50 mi": the reach, and the sheet that changes it
 *   - the ask for a ZIP, first, when the server has no location
 *   - who wants a card you hold, then Flares near you
 *   - the empty room, with Post a Flare and "Look within 100 miles"
 *
 * The stores near you and the nights coming up are not here, by the
 * founder's call (see lib/feed/nearby-plan.ts). The Rooms page keeps
 * its address, /nights, and has no slot in the bar, as in the app.
 */

function Shell({
  playerId = null,
  unread = 0,
  children,
}: {
  playerId?: string | null;
  unread?: number;
  children: React.ReactNode;
}) {
  return (
    <TabPageShell
      title="Nearby"
      surface
      /* Scan or enter a code, in place of the Feed's +. The app's
         Nearby header puts the same icon in the same corner. */
      leading={<CodeSheet />}
      /* The Feed's corner: the bell for a player, the door to Search
         for somebody with no inbox. */
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

export default async function NearbyPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <Card>
          <p className="text-text-secondary">
            Nearby can&rsquo;t be loaded right now. Try again in a moment.
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

  /* Nothing is near somebody we cannot place, and a guest has no ZIP
     to save one against: the same door the Feed gives them. */
  if (!playerId) {
    return (
      <Shell>
        <GuestDoor next="/nearby" />
      </Shell>
    );
  }

  const session = await sessionForPlayer(playerId);
  const [items, locals, unread, miles, view] = await Promise.all([
    /* The Feed's own list, remembered for half a minute, so a tap from
       one tab to the other does not rebuild it. See memo.ts. */
    rememberFeed(playerId, () => listFeed(playerId, session?.id ?? null)),
    /* For the live-room banner. */
    listLocals(playerId),
    /* The bell's dot. */
    unreadCount(playerId),
    /* The reach, for the "Near you · 50 mi" line. Null says "Distance"
       instead of a number nobody checked. */
    feedRadiusFor(playerId).catch(() => null),
    /* Compact or classic carries over from the Feed. */
    feedViewFor(playerId),
  ]);

  const liveLocal = locals.find((local) => local.liveNow) ?? null;

  /* Nearby is a trade room, not the whole of what the server files
     under it: see nearby-plan.ts. */
  const plan = planNearby(items.filter((item) => belongsToTab(item, "nearby")));

  return (
    <Shell playerId={playerId} unread={unread}>
      {/* A new player's first Nearby: two stops, once. A stop with
          nothing showing (no matches yet, a ZIP already saved) is
          passed over. See onboarding/tour.tsx. */}
      <Tour id="nearby" />

      {liveLocal && (
        <LiveRoomBanner name={liveLocal.name} joinCode={liveLocal.joinCode} />
      )}

      <NearbyHeader miles={miles} />

      {/* Nothing here works without a place, so the ask comes first. */}
      {plan.ask && (
        <Card className="flex flex-col gap-3" tour="nearby:location">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-text-primary">See Flares near you</h2>
            <p className="text-sm text-text-secondary">
              Tell us roughly where you are and we&rsquo;ll show what players around you
              are looking for and trading.
            </p>
          </div>
          <PostalAsk submitLabel="Show Flares near me" save={saveNearbyPostalAction} />
        </Card>
      )}

      <FeedList shown={plan.items} view={view} headings />

      {/* The room with nobody in it yet: said, with the two ways to
          change that, post or look further. Under any "wanted" rows,
          since those are trades too. */}
      {!plan.ask && plan.posts === 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold text-text-primary">No Flares near you yet</h2>
          <p className="text-sm text-text-secondary">
            {`Nobody within ${miles ?? 50} miles has a Flare up right now. Post one and players around you will see it here.`}
          </p>
          <Link href="/flare" className={buttonStyles("primary", "sm")}>
            Post a Flare
          </Link>
          {(miles ?? 50) < 100 && <LookFurtherButton />}
        </Card>
      )}

      {/* The explainer, for a screen that has not filled up yet: see
          HowItWorks. Counted over the whole list, as the app counts. */}
      {items.length < 3 && <HowItWorks />}
    </Shell>
  );
}
