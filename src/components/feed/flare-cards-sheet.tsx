"use client";

import { useEffect, useState } from "react";
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
import { cardCountLabel } from "@/lib/feed/card-copy";
import { offerItemsAction } from "@/lib/feed/post-actions";
import type { FeedCard } from "@/lib/feed/repository";

/**
 * Every card of a post, in one list, and the way to say which you have.
 *
 * Opened from the post's menu to read, or by "Offer cards" to answer:
 * the same sheet either way, because reading the list is how you
 * decide. A visitor picks cards and how many copies of each, never
 * above what is still wanted, then reviews and sends one offer for the
 * lot. The author's own post opens the list with no boxes; a post with
 * nothing left says so instead of offering a button that cannot work.
 *
 * Controlled: whoever renders the button that opens it holds `open`.
 * The count line and the buttons that used to sit beside them are gone
 * from under the cards — the founder wanted the post concise, with its
 * extras "only visible when you need it".
 */
export function FlareCardsSheet({
  open,
  onClose,
  postId,
  cards,
  total,
  direction,
  yours,
  completed,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  cards: FeedCard[];
  total: number;
  direction: "want" | "showcase";
  yours: boolean;
  completed: boolean;
}) {
  const [review, setReview] = useState(false);

  /*
   * OFFERED AT ONCE. An offer sent from the zoom, or from this very
   * sheet, says so under the card before the refresh brings the
   * server's word: the founder, "immediately visually show that I've
   * made an offer on it without having to refresh the feed."
   */
  const [offered, setOffered] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const onOffered = (event: Event) => {
      const { flareIds } = (event as CustomEvent<{ flareIds: string[] }>).detail;
      setOffered((current) => new Set([...current, ...flareIds]));
    };
    window.addEventListener("cardflare:offered", onOffered);
    return () => window.removeEventListener("cardflare:offered", onOffered);
  }, []);
  const rows = cards.map((card) =>
    card.flareId && offered.has(card.flareId) ? { ...card, youOffered: true } : card,
  );

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

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
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
          {rows.map((card) => {
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
                      <p className="text-xs text-text-secondary">You offered this</p>
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
                      Offer this card
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
          onSubmit={async (message) => {
            const result = await offerItemsAction(
              postId,
              lines.map((line) => ({ flareId: line.key, quantity: line.quantity })),
              message,
            );
            if (result.ok) {
              /* The same word the zoom sends, so the carousel behind
                 this sheet reads OFFERED on the same paint. */
              const refused = new Set(result.refused);
              window.dispatchEvent(
                new CustomEvent("cardflare:offered", {
                  detail: {
                    postId,
                    flareIds: lines
                      .map((line) => line.key)
                      .filter((flareId) => !refused.has(flareId)),
                  },
                }),
              );
            }
            return result;
          }}
          onSent={() => {
            selection.clear();
            onClose();
          }}
        />
      )}
    </>
  );
}
