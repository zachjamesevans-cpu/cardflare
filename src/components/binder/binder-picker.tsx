"use client";

import { X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import {
  chosenPrinting,
  keyOf,
  lineKey,
  type DraftCard,
} from "@/components/flares/draft";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import { Stepper } from "@/components/ui/stepper";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { printingLabel, type CardPrinting, type CardResult } from "@/lib/cards/schema";
import { cn } from "@/lib/cn";
import { draftSummary, MAX_COPIES } from "@/lib/flares/draft-rules";

/**
 * The binder's card picker: the Flare picker, adapted.
 *
 * The founder: "Binder should bring up same menu as posting flares -
 * can select multiple of one card, etc, to put into binder at mass.
 * Basically copy the full flare menu for grabbing a flare but adapt it
 * to adding to a binder." So it is the Flare picker's parts in the
 * Flare picker's order: what is picked so far, then the search the
 * whole site uses. A tap on a result is one copy, a tap again is one
 * more, a tap on a version under it is that exact printing, and the
 * minus beside a result's tag is one fewer, all through the composer's
 * own draft rules (`addCard`, `lessCard`), so the two pickers count
 * the same way.
 *
 * What the binder adds: every picked card in the tray wears the
 * binder's quantity tag, the tapped one opens a stepper for "I have six
 * of these" without six taps, and a result already in this binder says
 * so, "×2 in this binder", so nobody adds a card they already filed.
 */
export function BinderPicker({
  imagesEnabled,
  playerGames,
  picks,
  focus,
  inBinder,
  onAdd,
  onLess,
  onQuantity,
  onRemove,
  onFocus,
}: {
  imagesEnabled: boolean;
  playerGames: readonly string[];
  /** The tray, in the order picked. */
  picks: DraftCard[];
  /** The line key whose stepper is open, the last one touched. */
  focus: string | null;
  /** Copies already in this binder, by card id. */
  inBinder: ReadonlyMap<string, number>;
  onAdd: (card: CardResult, printing?: CardPrinting) => void;
  /** One fewer copy of a line; gone at none. */
  onLess: (key: string) => void;
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onFocus: (key: string) => void;
}) {
  const focused = picks.find((item) => keyOf(item) === focus) ?? null;
  const focusedPrinting = focused ? chosenPrinting(focused) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-muted tabular-nums">
        {picks.length === 0 ? "Nothing picked yet" : draftSummary(picks)}
      </p>

      {picks.length > 0 && (
        <ul
          aria-label="Picked cards"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-1.5 pt-1.5 pb-0.5 [&::-webkit-scrollbar]:hidden"
        >
          {picks.map((item) => {
            const key = keyOf(item);
            const printing = chosenPrinting(item);
            const art =
              imagesEnabled && isRenderableImageUrl(printing?.imageUrl ?? null);
            return (
              <li key={key} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => onFocus(key)}
                  aria-pressed={key === focus}
                  aria-label={`${item.card.exactName}, ${item.quantity} ${item.quantity === 1 ? "copy" : "copies"}`}
                  className={cn(
                    "block h-[70px] w-[50px] cursor-pointer overflow-hidden rounded-[6px] border bg-elevated",
                    key === focus
                      ? "border-accent ring-2 ring-accent"
                      : "border-border",
                  )}
                >
                  {art ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={printing?.imageUrl ?? ""}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="line-clamp-3 px-0.5 text-[8px] font-semibold text-text-secondary">
                      {item.card.exactName}
                    </span>
                  )}
                </button>
                <QuantityBadge
                  quantity={item.quantity}
                  className="pointer-events-none absolute top-1 left-1"
                />
                <button
                  type="button"
                  onClick={() => onRemove(key)}
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

      {/* The tapped card's copies: the stepper the Flare composer's
          card editor has, for a count bigger than a few taps. */}
      {focused && (
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-text-primary">
              {focused.card.exactName}
            </span>
            <span className="truncate text-xs text-text-muted">
              {focused.printingId && focusedPrinting
                ? (printingLabel(focusedPrinting, focused.card.exactName) ??
                  "This printing")
                : "Any printing"}
            </span>
          </div>
          <Stepper
            value={focused.quantity}
            min={1}
            max={MAX_COPIES}
            label={`copies of ${focused.card.exactName}`}
            onChange={(quantity) => onQuantity(keyOf(focused), quantity)}
          />
        </div>
      )}

      <CardSearch
        imagesEnabled={imagesEnabled}
        playerGames={playerGames}
        autoFocus
        onSelect={onAdd}
        onUnpick={(card, printing) => onLess(lineKey(card.id, printing?.id ?? null))}
        /* The Flare picker's rule: the tag goes where the tap went, on
           the card for any printing, on the version for that version. */
        markFor={(card) => {
          const line = picks.find((item) => keyOf(item) === lineKey(card.id, null));
          return line ? line.quantity : null;
        }}
        markForPrintingFor={(card) => {
          if (!picks.some((item) => item.card.id === card.id && item.printingId)) {
            return undefined;
          }
          return (printing) => {
            const line = picks.find(
              (item) => keyOf(item) === lineKey(card.id, printing.id),
            );
            return line ? line.quantity : null;
          };
        }}
        noteFor={(card) => <InThisBinder copies={inBinder.get(card.id) ?? 0} />}
      />
    </div>
  );
}

/** "In this binder", or "×2 in this binder"; nothing for a card not in it. */
export function InThisBinder({ copies }: { copies: number }) {
  if (copies <= 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
      {copies > 1 ? (
        <>
          <QuantityBadge quantity={copies} size="md" />
          in this binder
        </>
      ) : (
        "In this binder"
      )}
    </span>
  );
}
