import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ChevronRight, Search, MapPin } from "lucide-react";

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
import { Card } from "@/components/ui/card";
import { HEADER_BUTTON, HEADER_ICON } from "@/components/ui/header-button";
import { getViewer } from "@/lib/auth/session";
import { listBinders } from "@/lib/binder/binder";
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
  const [items, locals, unread, miles, view, binders] = await Promise.all([
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
    /* Your binders up for trade, under Yours. */
    listBinders(playerId, playerId).catch(() => []),
  ]);

  const liveLocal = locals.find((local) => local.liveNow) ?? null;

  /* Nearby is a trade room, not the whole of what the server files
     under it: see nearby-plan.ts. */
  const plan = planNearby(items.filter((item) => belongsToTab(item, "nearby")));
  /*
   * YOURS, FIRST: your open Flares (the three newest) and your binders
   * up for trade, what players near you see of you. Nearby only ever
   * showed others, so a Flare posted from here never appeared here - the
   * founder (2026-11-27): "it doesn't even go in this screen". The app's
   * NearbyYours is the same.
   */
  const mine = items
    .filter((item) => item.kind === "hunt" && item.yours && !item.completed)
    .slice(0, 3);
  const tradeBinders = binders.filter((binder) => binder.forTrade);
  /* Every account has one (binder.ts): an empty one is Nearby's next step. */
  const emptyTrades = tradeBinders.find(
    (binder) => binder.isDefault && binder.count === 0,
  );
  const showsYours = !plan.ask && (mine.length > 0 || tradeBinders.length > 0);

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

      {showsYours && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
              Yours
            </h2>
            <p className="text-sm text-text-secondary">
              {`Players within ${miles ?? 50} mi see these.`}
            </p>
          </div>
          {tradeBinders.map((binder) => (
            <Link
              key={binder.id}
              href={`/profile/binders/${binder.id}`}
              className="flex items-center gap-3 py-1 text-text-primary hover:text-accent"
            >
              <ArrowLeftRight className="size-4 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {binder.name}
              </span>
              <span className="text-sm text-text-muted">
                {binder.count === 0
                  ? "Add cards"
                  : `${binder.count} ${binder.count === 1 ? "card" : "cards"}`}
              </span>
              <ChevronRight className="size-4 text-text-muted" aria-hidden="true" />
            </Link>
          ))}
          {mine.length > 0 && <FeedList shown={mine} view={view} />}
        </section>
      )}

      {showsYours && plan.items.length > 0 && (
        <h2 className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
          Near you
        </h2>
      )}
      <FeedList shown={plan.items} view={view} headings={!showsYours} />

      {/* The room with nobody in it yet: said, with the two ways to
          change that, post or look further. Under any "wanted" rows,
          since those are trades too. */}
      {/*
       * Nothing near: one empty state, centred and unboxed, not a box and
       * an explainer under it. The founder (2026-11-25), of this tab:
       * "weird to have those text blocks then more text between them."
       * The app's NearbyEmpty is the same.
       */}
      {!plan.ask && plan.posts === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <MapPin className="size-6" aria-hidden="true" />
          </span>
          <h2 className="text-xl font-extrabold text-text-primary">
            No other players nearby yet
          </h2>
          <p className="max-w-sm text-[15px] text-text-secondary">
            {`When players within ${miles ?? 50} miles post Flares or put binders up for trade, they show up here.`}
          </p>
          {emptyTrades && (
            <p className="max-w-sm text-[15px] text-text-secondary">
              Cards in your Trades binder are matched with players near you who are
              hunting them.
            </p>
          )}
          {/* No buttons to make anything: every account has a Trades
              binder (binder.ts), and an empty one is the next step. */}
          {emptyTrades && (
            <Link
              href={`/profile/binders/${emptyTrades.id}`}
              className="text-sm font-bold text-accent hover:text-accent-hover"
            >
              Add cards to your Trades binder
            </Link>
          )}
          {(miles ?? 50) < 100 && <LookFurtherButton />}
        </div>
      ) : (
        /* The explainer, for a screen that has not filled up yet: see
           HowItWorks. Counted over the whole list, as the app counts. */
        items.length < 3 && <HowItWorks />
      )}
    </Shell>
  );
}
