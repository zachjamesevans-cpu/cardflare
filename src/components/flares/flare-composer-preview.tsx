"use client";

import { FlareFeedCard } from "@/components/feed/flare-feed-card";
import { Button } from "@/components/ui/button";
import { chosenPrinting, type Draft } from "@/components/flares/draft";
import { printingLabel } from "@/lib/cards/schema";
import type { FeedCard, HuntItem } from "@/lib/feed/repository";

/**
 * The post, before it is one.
 *
 * Built into the exact shape the Feed reads and drawn by the exact
 * component the Feed draws, so what is previewed is what goes up. Back
 * returns to the composer with the draft untouched; "Post flare" is
 * the one button that writes anything.
 */
export function FlareComposerPreview({
  draft,
  viewer,
  huntName,
  onBack,
  onPost,
  pending,
  error,
}: {
  draft: Draft;
  viewer: { id: string; displayName: string; avatarUrl: string | null };
  huntName: string | null;
  onBack: () => void;
  onPost: () => void;
  pending: boolean;
  error: string | null;
}) {
  const cards: FeedCard[] = draft.cards.map((item) => {
    const printing = item.printingId ? chosenPrinting(item) : null;
    const art = chosenPrinting(item);
    return {
      cardId: item.card.id,
      cardName: item.card.exactName,
      cardNumber: item.card.canonicalCardNumber,
      imageUrl: art?.imageUrl ?? null,
      match: null,
      state: "open",
      youOffered: false,
      printingId: item.printingId,
      printingLabel: printing ? printingLabel(printing, item.card.exactName) : null,
      quantity: item.quantity,
      remaining: item.quantity,
      huntRequestId: null,
    };
  });
  const copies = cards.reduce((sum, card) => sum + (card.quantity ?? 1), 0);
  const hunt =
    draft.intent === "want" && huntName ? { id: "preview", name: huntName } : null;

  const item: HuntItem = {
    kind: "hunt",
    postId: "preview",
    likes: 0,
    comments: 0,
    liked: false,
    code: null,
    storeName: null,
    eventName: null,
    playerId: viewer.id,
    displayName: viewer.displayName,
    avatarUrl: viewer.avatarUrl,
    frame: null,
    ring: null,
    direction: draft.intent,
    deckLabel: huntName,
    postedAt: new Date().toISOString(),
    milesAway: null,
    storeId: null,
    acceptsTrade: draft.acceptsTrade,
    acceptsCash: draft.acceptsCash,
    note: draft.caption.trim() || null,
    offers: 0,
    hunt,
    remainingCopies: copies,
    completed: false,
    cards,
    total: cards.length,
    youCanAnswer: 0,
    yours: true,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text-primary">Preview</h2>
        <p className="text-sm text-text-secondary">
          This is how it will read in the Feed.
        </p>
      </div>

      <FlareFeedCard item={item} preview />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button type="button" onClick={onPost} disabled={pending} className="flex-1">
          {pending ? "Posting…" : "Post flare"}
        </Button>
      </div>
    </div>
  );
}
