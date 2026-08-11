"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { removeListEntryAction } from "@/lib/lists/actions";
import type { ListKind } from "@/lib/lists/schema";

/**
 * Remove, with the tap acknowledged.
 *
 * The founder's ask: a card should go grey the instant Remove is
 * pressed, with a spinner on it, rather than sitting there looking
 * untouched until the server comes back. On store wifi that gap is
 * seconds long and a silent button reads as broken — the same reason
 * the pledge control grew its overlay.
 *
 * The veil is one element doing both jobs: `backdrop-grayscale` drains
 * the colour out of whatever is behind it, and the translucent canvas
 * fill dims it, so the card itself never needs a class. Which matters,
 * because opacity on the tile would fade the spinner along with it. The
 * spinner sits above the veil at full strength, in accent, moving.
 *
 * A client island of a few dozen bytes: the list around it stays a
 * Server Component and a board of forty cards still ships one copy of
 * this, not forty.
 */

/**
 * The card's box at the top-left of the entry, measured by the caller.
 *
 * `width` spans the quantity fan as well, so a three-of greys out whole;
 * `cardWidth` is the front card alone, which is what the spinner centres
 * on. Those are different numbers and using one for both puts the circle
 * visibly off the card it belongs to.
 */
export type VeilBox = { width: number; height: number; cardWidth: number };

function RemovingVeil({ cover }: { cover?: VeilBox }) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  const spinner = <Loader2 className="size-5 animate-spin text-accent" />;
  const announce = (
    <span role="status" className="sr-only">
      Removing this card
    </span>
  );

  /*
   * No box given: fill the positioned ancestor. That is the stacked
   * row, where the whole row is the thing going away.
   */
  if (!cover) {
    return (
      <>
        <span
          aria-hidden="true"
          className="absolute inset-0 z-30 flex items-center justify-center rounded-[8px] bg-canvas/60 backdrop-grayscale"
        >
          {spinner}
        </span>
        {announce}
      </>
    );
  }

  /*
   * The card, and only the card — the founder's correction. A veil over
   * the whole tile greyed the name and the button too, and put the
   * circle in the gap below the art. Grey and spinner are separate
   * elements because they want different widths: the grey covers the
   * fan, the circle centres on the front card.
   */
  return (
    <>
      <span
        aria-hidden="true"
        style={{ width: cover.width, height: cover.height }}
        className="absolute top-0 left-0 z-30 rounded-[6px] bg-canvas/60 backdrop-grayscale"
      />
      <span
        aria-hidden="true"
        style={{ width: cover.cardWidth, height: cover.height }}
        className="absolute top-0 left-0 z-30 flex items-center justify-center"
      >
        {spinner}
      </span>
      {announce}
    </>
  );
}

function TileButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-7 w-full items-center justify-center rounded-[6px] border border-border text-[10px] font-medium text-text-muted transition-colors hover:text-text-secondary disabled:cursor-wait"
    >
      Remove
    </button>
  );
}

function RowButton() {
  const { pending } = useFormStatus();

  return (
    /*
     * Negative margins swallow the ghost button's own padding so its
     * label sits flush with the card's right edge (level with the "N
     * cards" count above) and on the card name's first line. The touch
     * target keeps its full size — only the box's position moves.
     */
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="-mt-1.5 -mr-3.5"
    >
      Remove
    </Button>
  );
}

export function RemoveEntry({
  code,
  kind,
  entryId,
  variant,
  cover,
}: {
  code: string;
  kind: ListKind;
  entryId: string;
  /** `tile` is the carousel's full-width control; `row` the stacked list's. */
  variant: "tile" | "row";
  /** The card's box, top-left of the entry. Omitted fills the entry. */
  cover?: VeilBox;
}) {
  return (
    <form action={removeListEntryAction}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entryId" value={entryId} />
      {/* Positioned against the entry's <li>, so the veil lands on the
          card and not on the button that started it. */}
      <RemovingVeil cover={cover} />
      {variant === "tile" ? <TileButton /> : <RowButton />}
    </form>
  );
}
