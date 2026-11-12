import Link from "next/link";

import { Item } from "@/components/feed/feed-items";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { sectionHeading, type FeedEntry } from "@/lib/feed/repository";
import type { FeedView } from "@/lib/feed/views";

/**
 * What the Feed page and the Nearby page both draw.
 *
 * The app's two tabs are one screen (`HomeScreen`, with a `mode`), so
 * the banner, the list and the explainer cannot differ between them.
 * The website has a page per tab, and these are the parts the two
 * pages share for the same reason.
 */

/**
 * One tab's items, in the order given.
 *
 * `headings` is for Nearby. Never on the Feed: the server sends
 * Following as one chronological list, and the founder wants it read
 * as one, with no section titles cutting it up. Where headings are on
 * they are drawn only when the list holds more than one section.
 */
export function FeedList({
  shown,
  view,
  headings = false,
}: {
  shown: FeedEntry[];
  /** How this reader wants their Feed drawn. */
  view: FeedView;
  headings?: boolean;
}) {
  const sectionsShown = headings ? new Set(shown.map((item) => item.section)).size : 0;

  return shown.map((item, index) => (
    <div
      /* A post keeps its identity when the list moves, so nothing
         of one post's state lands on another's. */
      key={item.kind === "hunt" ? `hunt-${item.postId}` : `${item.kind}-${index}`}
      /* Nearby's first-visit tour stops on who wants your cards
         (onboarding/tour.tsx); only that page mounts the tour. */
      data-tour={item.kind === "nearbyMatch" ? "nearby:wanted" : undefined}
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
      {/* Why this is on your screen, ABOVE the card it explains:
          under it, the line read as the next card's caption. A
          feed that explains itself stops feeling arbitrary even
          when it is thin. A post carries its own label in its
          header instead - the founder: no separate text between
          cards - and a store's post is a post, so it goes without
          one too. */}
      {item.kind !== "hunt" && item.kind !== "storePost" && (
        <p className="-mb-1 text-xs text-text-muted">{item.reason}</p>
      )}
      <Item item={item} view={view} />
    </div>
  ));
}

/**
 * The Room tab's job, as a banner: gone from the bar, never gone from
 * reach. Shows the moment a room is open at one of your stores and
 * takes you straight onto its board. On the Feed and on Nearby, as in
 * the app.
 */
export function LiveRoomBanner({ name, joinCode }: { name: string; joinCode: string }) {
  return (
    <Link
      href={`/e/${joinCode}`}
      className="flex w-full max-w-2xl items-center gap-3 rounded-[var(--radius-card)] border border-accent bg-elevated p-4 hover:border-accent-hover"
    >
      <span className="relative flex size-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex size-3 rounded-full bg-accent" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-text-primary">
          Room open at {name}
        </span>
        <span className="block text-sm text-text-secondary">
          Tap to jump onto the board.
        </span>
      </span>
    </Link>
  );
}

/**
 * The explainer, for a screen that has not filled up yet.
 *
 * Unconditional, it meant an established player read "how it works"
 * under their own board every time they opened the tab. Below three
 * items there is room for it and a newcomer needs it; above three it
 * is the least interesting thing present. Same rule as the app's, and
 * the page decides when: `items.length < 3`.
 */
export function HowItWorks() {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold text-text-primary">How it works</h2>
      <p className="text-sm text-text-secondary">
        Post a Flare for the card you&rsquo;re looking for. When a friend or somebody in
        your room has it, they raise a hand and you trade in person.
      </p>
    </Card>
  );
}

/**
 * What somebody with no account sees in place of a feed.
 *
 * A guest has no follows and no locals, so there is nothing to derive.
 * They get the door instead of an empty page: a room reached with a
 * counter code and no account is the whole product for somebody who
 * has not signed up, and always has been.
 *
 * `next` is the page to come back to once they have an account.
 */
export function GuestDoor({ next }: { next: "/feed" | "/nearby" }) {
  const back = encodeURIComponent(next);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold text-text-primary">Start trading</h2>
      <p className="text-sm text-text-secondary">
        Create a free account and the cards you are looking for reach your friends and
        every room you walk into. At a store right now? The code at the counter gets you
        into tonight&rsquo;s room, no account needed.
      </p>
      {/* The doors, in the order the copy offers them: the account,
          the way in for somebody who has one, and Room, which holds
          the scanner for the person already standing in a shop. */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/signup?next=${back}`} className={buttonStyles("primary", "sm")}>
          Create account
        </Link>
        <Link href={`/login?next=${back}`} className={buttonStyles("secondary", "sm")}>
          Sign in
        </Link>
        <Link href="/room" className={buttonStyles("ghost", "sm")}>
          Open the room
        </Link>
      </div>
    </Card>
  );
}
