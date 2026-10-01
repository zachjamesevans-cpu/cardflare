"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { useTakeDown } from "@/components/feed/undo-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { takeDownRoomFlareAction } from "@/lib/flares/withdraw-actions";
import { removeListEntryAction } from "@/lib/lists/actions";
import type { ListKind } from "@/lib/lists/schema";

/**
 * A Flare's two exits, on the board, with the tap acknowledged.
 *
 * "Remove" used to be the one control under your own card, and it
 * meant found: the card went grey with the tick everywhere, and the
 * Feed told your followers. The audit of 2026-10-01 found the gap in
 * that: a card posted by mistake had no way out that was not an
 * announcement. So there are two controls now, and they say what they
 * do. "Found it" is the old action, a plain form posting to the Server
 * Action. "Take down" withdraws the card and tells nobody, with a
 * minute's Undo in the toast beside the tab bar. The app's room draws
 * the same pair (mobile/src/screens/room.tsx).
 *
 * The founder's ask on the tap itself: a card should go grey the
 * instant a control is pressed, with a spinner on it, rather than
 * sitting there looking untouched until the server comes back. On
 * store wifi that gap is seconds long and a silent button reads as
 * broken. Both controls drop the same veil.
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

function Veil({
  cover,
  pending,
  label,
}: {
  cover?: VeilBox;
  pending: boolean;
  label: string;
}) {
  if (!pending) return null;

  const spinner = <Loader2 className="size-5 animate-spin text-accent" />;
  const announce = (
    <span role="status" className="sr-only">
      {label}
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

/** The veil for the form, which knows it is pending from the form itself. */
function FormVeil({ cover }: { cover?: VeilBox }) {
  const { pending } = useFormStatus();
  return <Veil cover={cover} pending={pending} label="Marking this card found" />;
}

const TILE_BUTTON =
  "flex h-6 w-full cursor-pointer items-center justify-center rounded-[6px] px-0 text-[10px] font-medium transition-colors disabled:cursor-wait";

function FoundTileButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        TILE_BUTTON,
        "border border-border bg-elevated text-text-primary hover:border-border-strong",
      )}
    >
      Found it
    </button>
  );
}

function FoundRowButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      Found it
    </Button>
  );
}

/**
 * "Take down": withdraws the card under the room identity and puts the
 * Undo up. A button, not a form, because the ids the server returns are
 * what the toast holds, and a form's action has nowhere to hand them.
 */
function TakeDownButton({
  code,
  flareId,
  variant,
  cover,
}: {
  code: string;
  flareId: string;
  variant: "tile" | "row";
  cover?: VeilBox;
}) {
  const { takeDown, pending } = useTakeDown(code);
  const onClick = () => takeDown(() => takeDownRoomFlareAction(code, flareId));

  return (
    <>
      <Veil cover={cover} pending={pending} label="Taking this card down" />
      {variant === "tile" ? (
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className={cn(TILE_BUTTON, "text-danger hover:bg-danger/10")}
        >
          Take down
        </button>
      ) : (
        /*
         * A negative right margin swallows the ghost button's own
         * padding so its label sits flush with the card's right edge,
         * level with the "N cards" count above. The touch target keeps
         * its full size — only the box's position moves.
         */
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={pending}
          className="-mr-3.5 text-danger hover:bg-danger/10 hover:text-danger"
        >
          Take down
        </Button>
      )}
    </>
  );
}

export function RemoveEntry({
  code,
  kind,
  entryId,
  variant,
  cover,
  className,
}: {
  code: string;
  kind: ListKind;
  entryId: string;
  /** `tile` is the carousel's full-width control; `row` the stacked list's. */
  variant: "tile" | "row";
  /** The card's box, top-left of the entry. Omitted fills the entry. */
  cover?: VeilBox;
  /** Placement classes for the wrapper, which is the flex item. */
  className?: string;
}) {
  const found = (
    <form action={removeListEntryAction}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="entryId" value={entryId} />
      {/* Positioned against the entry's <li>, so the veil lands on the
          card and not on the button that started it. */}
      <FormVeil cover={cover} />
      {variant === "tile" ? <FoundTileButton /> : <FoundRowButton />}
    </form>
  );

  /* Only a Flare can be taken down. The Have list's one exit stays the
     form, under its old meaning. */
  if (kind !== "flare") {
    return <div className={className}>{found}</div>;
  }

  return variant === "tile" ? (
    /* Stacked, because a 56px tile has room for one word per line. */
    <div className={cn("flex flex-col gap-1", className)}>
      {found}
      <TakeDownButton code={code} flareId={entryId} variant="tile" cover={cover} />
    </div>
  ) : (
    /* Side by side on the name's baseline, the board's rule. */
    <div className={cn("flex items-center gap-1", className)}>
      {found}
      <TakeDownButton code={code} flareId={entryId} variant="row" cover={cover} />
    </div>
  );
}
