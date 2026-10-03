"use client";

import { useContext, useMemo, useState, type ReactNode } from "react";
import { Flag, LayoutList, ListChecks, Trash2 } from "lucide-react";

import {
  OfferPicksContext,
  useOfferBuild,
  type OfferableCard,
} from "@/components/cards/card-image-zoom";
import { FlareCardsSheet } from "@/components/feed/flare-cards-sheet";
import { FlareProgressSheet } from "@/components/feed/flare-progress-sheet";
import { usePostHidden } from "@/components/feed/hidden-posts";
import { useTakeDown } from "@/components/feed/undo-toast";
import { OfferReview } from "@/components/flares/offer-review";
import { ReportSheet } from "@/components/players/report-sheet";
import { Button } from "@/components/ui/button";
import { DotsMenu, type MenuItem } from "@/components/ui/menu";
import { inYourOfferLine } from "@/lib/feed/offer-copy";
import type { FeedCard } from "@/lib/feed/repository";
import { takeDownPostAction } from "@/lib/flares/withdraw-actions";

/**
 * What you can do to a post, behind the three dots.
 *
 * The founder, on a post carrying "Update progress", "2 copies still
 * needed" and "View all 2" under its cards: "Delete... nest all of this
 * in a 3 dot menu in top right. Similar to how instagram does it for
 * editing posts." So the full list and the progress ticks live here,
 * and the card under them is the post and nothing else. The sheets are
 * dialogs in the top layer, so they open from the corner as well as
 * they did from under the cards. The app draws the same menu
 * (mobile/src/flare-feed-card.tsx).
 *
 * Your own post has two exits, and both are here. "Update progress"
 * is the first: tick the copies you found, and the post says so.
 * "Take down" is the second, from the audit of 2026-10-01: a wrong
 * post had no way out that did not announce "found it" to everybody.
 * Take down withdraws the cards everywhere, tells nobody, and puts up
 * an Undo for a minute. It shows for both directions.
 *
 * Somebody else's post ends with "Report" instead: the same sheet a
 * profile and a conversation open, filed against this post.
 */

export interface PostShape {
  postId: string;
  cards: FeedCard[];
  total: number;
  direction: "want" | "showcase";
  yours: boolean;
  completed: boolean;
}

/**
 * THE POST OWNS THE PICKS.
 *
 * The audit of 2026-10-02: "Closing the viewer silently drops every
 * picked card." The founder's call: keep them for the page's life, no
 * warning dialog, and show them under the post while the viewer is
 * closed. The Feed card is server-rendered and its tiles are built
 * there, so the picks cannot travel as props; they live in this one
 * client component around the post and reach every tile's viewer
 * through `OfferPicksContext`. The review is drawn here, once, so the
 * viewer and the "Review" link under the post open the same sheet
 * over the same lines. Nothing is stored: a reload starts clean.
 */
export function PostOffer({
  post,
  children,
}: {
  post: PostShape;
  children: ReactNode;
}) {
  const offerable = post.direction === "want" && !post.yours && !post.completed;
  const cards = useMemo<OfferableCard[]>(
    () =>
      offerable
        ? post.cards.flatMap((card) =>
            card.flareId && card.state !== "found"
              ? [
                  {
                    flareId: card.flareId,
                    name: card.cardName,
                    imageUrl: card.imageUrl,
                    printingLabel: card.printingLabel ?? null,
                    max: card.remaining ?? card.quantity ?? 1,
                  },
                ]
              : [],
          )
        : [],
    [offerable, post.cards],
  );
  const build = useOfferBuild(post.postId, cards);

  if (cards.length === 0) return <>{children}</>;

  return (
    <OfferPicksContext.Provider value={build}>
      {children}
      <OfferReview
        open={build.reviewOpen}
        onClose={build.closeReview}
        lines={build.lines}
        onQuantity={build.setQuantity}
        onRemove={build.remove}
        onSubmit={build.submit}
        onSent={build.clear}
      />
    </OfferPicksContext.Provider>
  );
}

/**
 * "2 in your offer · Review", under the post, while anything is picked
 * and the viewer is closed: the picks are never out of sight, and the
 * review is one press away without reopening a card. Sending or
 * taking everything out clears it.
 */
export function InYourOffer() {
  const build = useContext(OfferPicksContext);
  if (!build || build.count === 0) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-accent tabular-nums">
      {inYourOfferLine(build.count)}
      <span className="text-text-muted" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        onClick={build.openReview}
        className="cursor-pointer rounded-[var(--radius-control)] font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        Review
      </button>
    </p>
  );
}

/**
 * A post that was just taken down is not drawn. The server already
 * said ok; the refresh behind the toast confirms it. See hidden-posts.
 */
export function UnlessHidden({
  postId,
  children,
}: {
  postId: string;
  children: ReactNode;
}) {
  const hidden = usePostHidden(postId);
  if (hidden) return null;
  return <>{children}</>;
}

export function PostMenu({ post }: { post: PostShape }) {
  const [sheet, setSheet] = useState<"cards" | "progress" | "report" | null>(null);
  const { takeDown } = useTakeDown();

  const items: MenuItem[] = [];
  if (post.total > 1) {
    items.push({
      key: "cards",
      label: `View all ${post.total} cards`,
      icon: <LayoutList />,
      onSelect: () => setSheet("cards"),
    });
  }
  if (
    post.yours &&
    post.direction === "want" &&
    post.cards.some((card) => card.flareId)
  ) {
    items.push({
      key: "progress",
      label: "Update progress",
      icon: <ListChecks />,
      onSelect: () => setSheet("progress"),
    });
  }
  if (post.yours) {
    items.push({
      key: "take-down",
      label: "Take down",
      icon: <Trash2 />,
      onSelect: () => takeDown(() => takeDownPostAction(post.postId), post.postId),
    });
  }
  if (!post.yours) {
    items.push({
      key: "report",
      label: "Report",
      icon: <Flag />,
      onSelect: () => setSheet("report"),
    });
  }

  if (items.length === 0) return null;

  return (
    <>
      <DotsMenu items={items} label="More about this post" />
      <FlareCardsSheet
        open={sheet === "cards"}
        onClose={() => setSheet(null)}
        postId={post.postId}
        cards={post.cards}
        total={post.total}
        direction={post.direction}
        yours={post.yours}
        completed={post.completed}
      />
      {post.yours && post.direction === "want" && (
        <FlareProgressSheet
          open={sheet === "progress"}
          onClose={() => setSheet(null)}
          cards={post.cards}
        />
      )}
      {!post.yours && (
        <ReportSheet
          open={sheet === "report"}
          onClose={() => setSheet(null)}
          kind="post"
          targetId={post.postId}
        />
      )}
    </>
  );
}

/**
 * The one button a post is for, on somebody else's want: the same list,
 * opened with the boxes showing. Stays on the card, because it is the
 * action and not an extra.
 */
export function OfferCardsButton({ post }: { post: PostShape }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Offer cards
      </Button>
      <FlareCardsSheet
        open={open}
        onClose={() => setOpen(false)}
        postId={post.postId}
        cards={post.cards}
        total={post.total}
        direction={post.direction}
        yours={post.yours}
        completed={post.completed}
      />
    </>
  );
}
