"use client";

import { useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Ban, Flag, LayoutList, ListChecks, Trash2 } from "lucide-react";

import {
  OfferPicksContext,
  useOfferBuild,
  type OfferableCard,
} from "@/components/cards/card-image-zoom";
import { FlareCardsSheet } from "@/components/feed/flare-cards-sheet";
import { FlareProgressSheet } from "@/components/feed/flare-progress-sheet";
import {
  hideAuthor,
  useAuthorHidden,
  usePostHidden,
} from "@/components/feed/hidden-posts";
import { showUndoToast, useTakeDown } from "@/components/feed/undo-toast";
import { OfferReview } from "@/components/flares/offer-review";
import { ReportSheet } from "@/components/players/report-sheet";
import { Button } from "@/components/ui/button";
import { DotsMenu, type MenuItem } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/sheet";
import { inYourOfferLine } from "@/lib/feed/offer-copy";
import type { FeedCard } from "@/lib/feed/repository";
import { takeDownPostAction } from "@/lib/flares/withdraw-actions";
import { blockPlayerAction } from "@/lib/players/safety-actions";

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
 * Somebody else's post ends with "Report" and then "Block": the same
 * report sheet a profile and a conversation open, filed against this
 * post, and the same block a profile's three dots take, confirmed in
 * the same words. A block hides every post by that player on the page
 * at once (see hidden-posts) and says so in the status line. A post
 * by a store or a guest has no player to block, so it has no Block.
 */

export interface PostShape {
  postId: string;
  cards: FeedCard[];
  total: number;
  direction: "want" | "showcase";
  yours: boolean;
  completed: boolean;
  /** The author, for Block. Null for a store's or a guest's post. */
  playerId: string | null;
  /** The author's name, for "Block Alex?". */
  playerName: string;
}

/** The status line after a block lands, the same words as the app's. */
export const BLOCKED_LINE =
  "Blocked. Their posts are hidden and they cannot message you.";

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
 * A post that was just taken down, or whose author was just blocked,
 * is not drawn. The server already said ok; the refresh behind the
 * status line confirms it. See hidden-posts.
 */
export function UnlessHidden({
  postId,
  playerId,
  children,
}: {
  postId: string;
  /** The author, so a block takes every one of their posts at once. */
  playerId?: string | null;
  children: ReactNode;
}) {
  const hidden = usePostHidden(postId);
  const authorHidden = useAuthorHidden(playerId);
  if (hidden || authorHidden) return null;
  return <>{children}</>;
}

/**
 * The second step of Block, from a post: what it does, and the one
 * word to confirm. The words are the profile's (block-controls.tsx),
 * verbatim; what differs is what happens after, since a Feed has
 * posts to hide rather than a row to swap. "They are not told" is the
 * promise the whole feature rests on, so it is said here too.
 */
function BlockPostSheet({
  open,
  onClose,
  playerId,
  name,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string;
  name: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const block = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await blockPlayerAction(playerId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      /* Their posts leave on this paint; the line says so; the refresh
         behind it only confirms. */
      hideAuthor(playerId);
      onClose();
      showUndoToast({ message: BLOCKED_LINE, flareIds: [] });
      router.refresh();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Block"
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="danger"
            size="md"
            className="flex-1"
            onClick={block}
            disabled={pending}
          >
            {pending ? "Blocking…" : "Block"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={onClose}
            disabled={pending}
          >
            Keep
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-text-primary">Block {name}?</p>
        <p className="text-sm text-text-secondary">
          You will not see their posts, and neither of you can message the other. They
          are not told.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function PostMenu({ post }: { post: PostShape }) {
  const [sheet, setSheet] = useState<"cards" | "progress" | "report" | "block" | null>(
    null,
  );
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
  if (!post.yours && post.playerId) {
    items.push({
      key: "block",
      label: "Block",
      icon: <Ban />,
      onSelect: () => setSheet("block"),
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
      {!post.yours && post.playerId && (
        <BlockPostSheet
          open={sheet === "block"}
          onClose={() => setSheet(null)}
          playerId={post.playerId}
          name={post.playerName}
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
