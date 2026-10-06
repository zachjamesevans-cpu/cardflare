"use client";

import { ArrowLeft, Check, X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import {
  chosenPrinting,
  keyOf,
  lineKey,
  type DraftCard,
} from "@/components/flares/draft";
import { draftSummary } from "@/lib/flares/draft-rules";
import type { CardPrinting, CardResult } from "@/lib/cards/schema";

/**
 * Picking several cards for one Flare.
 *
 * The search the whole site uses, with a strip above it of what is
 * picked so far, in order. A result already in the draft wears its
 * number and its copies, and tapping it again is one more copy rather
 * than a second row. The search stays as it was between taps, so
 * somebody adding three Zoros does not type "zoro" three times.
 */
/**
 * How many copies are in, and nothing else. The founder: "Should now
 * just have a 1, 2, 3, etc… when clicking these cards whether base
 * rarity or not." The order they went in is not a number anybody
 * needs while picking. Since binder round 3 it is drawn as the one
 * quantity tag, "×1", "×2", the binder picker's mark too; on a picked
 * result "×1" shows, because there it says the result is picked.
 */
function markCount(quantity: number): number {
  return quantity;
}

export function CardPicker({
  imagesEnabled,
  playerGames,
  game = null,
  cards,
  onAdd,
  onRemove,
  onLess,
  onDone,
}: {
  imagesEnabled: boolean;
  playerGames: readonly string[];
  /** The room's game from a tournament QR, which narrows the search. */
  game?: string | null;
  cards: DraftCard[];
  onAdd: (card: CardResult, printing?: CardPrinting) => void;
  /** Both take a line key (`keyOf`): one card in one printing. */
  onRemove: (key: string) => void;
  /** One fewer copy; gone at none. The minus beside the badge. */
  onLess: (key: string) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/*
       * The way out sits LEFT of the title, never top-right. In a room
       * the composer opens under the door's own close button, which
       * lives in that corner; at phone width the two sat on top of each
       * other (the audit of 2026-10-01). Back when nothing is picked,
       * Done once something is, one button either way.
       */}
      <div className="flex items-center gap-3 pr-8">
        <Button
          type="button"
          size="sm"
          variant={cards.length === 0 ? "secondary" : "primary"}
          onClick={onDone}
          className="shrink-0"
        >
          {cards.length === 0 ? (
            <ArrowLeft className="size-4" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          {cards.length === 0 ? "Back" : "Done"}
        </Button>
        <div className="flex min-w-0 flex-col">
          <h2 className="font-semibold text-text-primary">Add cards</h2>
          <p className="truncate text-xs text-text-muted tabular-nums">
            {cards.length === 0 ? "Nothing picked yet" : draftSummary(cards)}
          </p>
        </div>
      </div>

      {cards.length > 0 && (
        <ul
          aria-label="Picked cards"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto py-0.5 [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((item) => {
            const printing = chosenPrinting(item);
            return (
              <li key={keyOf(item)} className="relative shrink-0">
                <span className="block h-[70px] w-[50px] overflow-hidden rounded-[6px] border border-border bg-elevated">
                  {printing?.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={printing.imageUrl}
                      alt={item.card.exactName}
                      className="size-full object-cover"
                    />
                  )}
                </span>
                {/* The binder's quantity tag, the one every count of
                    copies wears; nothing for a single copy. */}
                <QuantityBadge
                  quantity={item.quantity}
                  className="absolute top-1 left-1"
                />
                <button
                  type="button"
                  onClick={() => onRemove(keyOf(item))}
                  aria-label={`Remove ${item.card.exactName}`}
                  className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-secondary hover:text-text-primary"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CardSearch
        imagesEnabled={imagesEnabled}
        playerGames={playerGames}
        game={game}
        autoFocus
        onSelect={onAdd}
        onUnpick={(card, printing) => onLess(lineKey(card.id, printing?.id ?? null))}
        /*
         * THE NUMBER GOES WHERE THE TAP WENT.
         *
         * The founder: "it adds the number at the root of the card. for
         * example, if there's 7 diff alt arts for bonney and i click the
         * bottom one, the number appears to the right of the main one...
         * you should't have to scroll up to see that."
         *
         * So the card row wears the badge only when the pick was the
         * card itself - "any printing", which is what tapping the row
         * means. A pick that named a version wears it on that version,
         * down in the list where the finger already is.
         */
        markFor={(card) => {
          const line = cards.find((item) => keyOf(item) === lineKey(card.id, null));
          return line ? markCount(line.quantity) : null;
        }}
        markForPrintingFor={(card) => {
          if (!cards.some((item) => item.card.id === card.id && item.printingId)) {
            return undefined;
          }
          return (printing) => {
            const line = cards.find(
              (item) => keyOf(item) === lineKey(card.id, printing.id),
            );
            return line ? markCount(line.quantity) : null;
          };
        }}
      />
    </div>
  );
}
