"use client";

import { useState } from "react";
import { LayoutList, ListChecks, Trash2 } from "lucide-react";

import { FlareCardsSheet } from "@/components/feed/flare-cards-sheet";
import { FlareProgressSheet } from "@/components/feed/flare-progress-sheet";
import { useTakeDown } from "@/components/feed/undo-toast";
import { Button } from "@/components/ui/button";
import { DotsMenu, type MenuItem } from "@/components/ui/menu";
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
 */

interface PostShape {
  postId: string;
  cards: FeedCard[];
  total: number;
  direction: "want" | "showcase";
  yours: boolean;
  completed: boolean;
}

export function PostMenu({ post }: { post: PostShape }) {
  const [sheet, setSheet] = useState<"cards" | "progress" | null>(null);
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
      onSelect: () => takeDown(() => takeDownPostAction(post.postId)),
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
