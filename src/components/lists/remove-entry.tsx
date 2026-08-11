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

function RemovingVeil({ bleed }: { bleed: number }) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <>
      <span
        aria-hidden="true"
        /*
         * `bleed` reaches past the tile's right edge to cover the fanned
         * ghost copies, which sit in the margin outside it. Without it a
         * three-of goes grey with a bright sliver of card still showing.
         */
        style={bleed > 0 ? { right: -bleed } : undefined}
        className="absolute inset-0 z-30 flex items-center justify-center rounded-[8px] bg-canvas/60 backdrop-grayscale"
      >
        <Loader2 className="size-5 animate-spin text-accent" />
      </span>
      <span role="status" className="sr-only">
        Removing this card
      </span>
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
  bleed = 0,
}: {
  code: string;
  kind: ListKind;
  entryId: string;
  /** `tile` is the carousel's full-width control; `row` the stacked list's. */
  variant: "tile" | "row";
  /** Pixels the quantity fan overhangs the tile on the right. */
  bleed?: number;
}) {
  return (
    <form action={removeListEntryAction}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entryId" value={entryId} />
      {/* Positioned against the entry's <li>, so the veil covers the whole
          card and not just the button that started it. */}
      <RemovingVeil bleed={bleed} />
      {variant === "tile" ? <TileButton /> : <RowButton />}
    </form>
  );
}
