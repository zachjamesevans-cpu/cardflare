"use client";

import { X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { chosenPrinting, type DraftCard } from "@/components/flares/draft";
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
/** "1", or "1 · 2 copies" once there is more than one. */
function markText(index: number, quantity: number): string {
  return quantity > 1 ? `${index + 1} · ${quantity} copies` : `${index + 1}`;
}

export function CardPicker({
  imagesEnabled,
  playerGames,
  cards,
  onAdd,
  onRemove,
  onDone,
}: {
  imagesEnabled: boolean;
  playerGames: readonly string[];
  cards: DraftCard[];
  onAdd: (card: CardResult, printing?: CardPrinting) => void;
  onRemove: (cardId: string) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="font-semibold text-text-primary">Add cards</h2>
          <p className="text-xs text-text-muted tabular-nums">
            {cards.length === 0 ? "Nothing picked yet" : draftSummary(cards)}
          </p>
        </div>
        <Button type="button" size="sm" onClick={onDone}>
          {cards.length === 0 ? "Back" : "Done"}
        </Button>
      </div>

      {cards.length > 0 && (
        <ul
          aria-label="Picked cards"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto py-0.5 [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((item, index) => {
            const printing = chosenPrinting(item);
            return (
              <li key={item.card.id} className="relative shrink-0">
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
                <span className="absolute top-1 left-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-contrast tabular-nums">
                  {index + 1}
                  {item.quantity > 1 && ` · ${item.quantity}`}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(item.card.id)}
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
        autoFocus
        onSelect={onAdd}
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
          const index = cards.findIndex((item) => item.card.id === card.id);
          if (index === -1) return null;
          const item = cards[index];
          if (item.printingId) return null;
          return markText(index, item.quantity);
        }}
        markForPrintingFor={(card) => {
          const index = cards.findIndex((item) => item.card.id === card.id);
          if (index === -1) return undefined;
          const item = cards[index];
          if (!item.printingId) return undefined;
          return (printing) =>
            printing.id === item.printingId ? markText(index, item.quantity) : null;
        }}
      />
    </div>
  );
}
