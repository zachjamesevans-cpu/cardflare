"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { cardCountLabel } from "@/components/feed/flare-carousel";
import {
  OfferReview,
  selectionSummary,
  useSelection,
  type OfferLine,
} from "@/components/flares/offer-review";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/cn";
import { offerItemsAction } from "@/lib/feed/post-actions";
import type { FeedCard } from "@/lib/feed/repository";

/**
 * Every card of a post, in one list, and the way to say which you have.
 *
 * Opened by "View all" to read, or by "Offer cards" to answer: the same
 * sheet either way, because reading the list is how you decide. A
 * visitor picks cards and how many copies of each, never above what is
 * still wanted, then reviews and sends one offer for the lot. The
 * author's own post opens the list with no boxes; a post with nothing
 * left says so instead of offering a button that cannot work.
 */
export function FlareCardsSheet({
  postId,
  cards,
  total,
  direction,
  yours,
  completed,
  remainingCopies,
}: {
  postId: string;
  cards: FeedCard[];
  total: number;
  direction: "want" | "showcase";
  yours: boolean;
  completed: boolean;
  remainingCopies: number;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);

  const offerable = direction === "want" && !yours && !completed;
  const canPick = (card: FeedCard) =>
    offerable &&
    Boolean(card.flareId) &&
    card.state !== "found" &&
    (card.remaining ?? card.quantity ?? 1) > 0;

  const remainingFor = (flareId: string) => {
    const card = cards.find((row) => row.flareId === flareId);
    return card ? (card.remaining ?? card.quantity ?? 1) : 0;
  };
  const selection = useSelection(remainingFor);
  const lines: OfferLine[] = Object.entries(selection.selected).flatMap(
    ([flareId, quantity]) => {
      const card = cards.find((row) => row.flareId === flareId);
      return card
        ? [
            {
              key: flareId,
              name: card.cardName,
              imageUrl: card.imageUrl,
              printingLabel: card.printingLabel ?? null,
              quantity,
            },
          ]
        : [];
    },
  );

  const copies =
    direction === "showcase"
      ? cards.reduce((sum, card) => sum + (card.quantity ?? 1), 0)
      : remainingCopies;
  const countLine =
    direction === "showcase"
      ? `${copies} ${copies === 1 ? "copy" : "copies"} available`
      : completed
        ? "All found"
        : `${copies} ${copies === 1 ? "copy" : "copies"} still needed`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            completed && direction === "want" ? "text-accent" : "text-text-secondary",
          )}
        >
          {completed && direction === "want" && (
            <Check className="mr-1 inline size-4 align-[-3px]" aria-hidden="true" />
          )}
          {countLine}
        </p>
        <div className="flex flex-wrap gap-2">
          {total > 1 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setOpen(true)}
            >
              View all {total}
            </Button>
          )}
          {offerable && (
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              Offer cards
            </Button>
          )}
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={
          direction === "showcase"
            ? `${total} ${total === 1 ? "card" : "cards"} on offer`
            : `${total} ${total === 1 ? "card" : "cards"} wanted`
        }
        footer={
          offerable ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm font-semibold text-text-primary tabular-nums">
                {selection.count > 0
                  ? selectionSummary(selection.count, selection.copies)
                  : "Tick the cards you have"}
              </p>
              <Button
                type="button"
                size="sm"
                disabled={selection.count === 0}
                onClick={() => setReview(true)}
                className="shrink-0"
              >
                Continue to offer
              </Button>
            </div>
          ) : null
        }
      >
        <ul className="flex flex-col gap-2">
          {cards.map((card) => {
            const pickable = canPick(card);
            const flareId = card.flareId ?? "";
            const picked = pickable && selection.has(flareId);
            return (
              <li
                key={card.cardId}
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--radius-control)] border bg-elevated/60 p-2.5",
                  picked ? "border-accent" : "border-border",
                  card.state === "found" && "opacity-70",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated">
                    {card.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={card.imageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {card.cardName}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {card.printingLabel ?? "Any printing"}
                    </p>
                    <p className="text-xs font-semibold text-accent tabular-nums">
                      {cardCountLabel(card, direction)}
                    </p>
                    {card.youOffered && (
                      <p className="text-xs text-text-secondary">
                        You said you have this
                      </p>
                    )}
                  </div>
                </div>
                {pickable && (
                  <div className="flex flex-wrap items-center gap-3 pl-[3.25rem]">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-primary">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => selection.toggle(flareId)}
                        className="size-5 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
                      />
                      I have this
                    </label>
                    {picked && (
                      <Stepper
                        value={selection.quantity(flareId)}
                        min={1}
                        max={remainingFor(flareId)}
                        label={`copies of ${card.cardName} you have`}
                        onChange={(value) => selection.setQuantity(flareId, value)}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>

      {offerable && (
        <OfferReview
          open={review}
          onClose={() => setReview(false)}
          lines={lines}
          onSubmit={(message) =>
            offerItemsAction(
              postId,
              lines.map((line) => ({ flareId: line.key, quantity: line.quantity })),
              message,
            )
          }
          onSent={() => {
            selection.clear();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
