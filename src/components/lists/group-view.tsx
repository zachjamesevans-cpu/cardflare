"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * One player's section of the board: the rail, until you ask for more.
 *
 * The founder's synthesis, replacing the stacked/carousel toggle
 * entirely: the board always reads as the compact carousel, and the
 * chevron on a player's header unfolds THAT player into the full
 * stacked view — offers, notes, confirms, the lot — the same gesture
 * the roster just taught. Detail becomes a per-person question instead
 * of a page-wide mode.
 *
 * A client island around server-rendered children: the rail and the
 * stacked list arrive fully formed (server-action forms intact), and
 * this component only decides which of the two is on screen.
 *
 * It behaves as a drawer, and that took two corrections to get right.
 * The first version animated both views at once — the rail collapsing
 * while the stacked view grew — which read as the cards being shoved
 * upward. The second animated only the arriving view, which opened
 * correctly and then teleported shut, because the outgoing view was
 * simply removed. So the close is now its own phase: the drawer tucks
 * itself in, and only once it has gone does the rail come back, with
 * the same downward motion that opened it.
 */
export function GroupView({
  identity,
  meta,
  rail,
  stacked,
}: {
  /** The avatar-and-name block, left side of the header. */
  identity: ReactNode;
  /** The badges-and-count block, beside the chevron. */
  meta: ReactNode;
  rail: ReactNode;
  stacked: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  /** The stacked view is on its way out but still on screen. */
  const [closing, setClosing] = useState(false);

  /*
   * How tall the rail is, remembered while it is on screen.
   *
   * This is what stops the drawer bouncing. Without it the section
   * passes through zero height on the way in and on the way out, so
   * everything below jumps up by the rail's height and back down
   * again — measured at 154px. Holding the drawer at the height the
   * rail occupies means the page only ever moves in one direction.
   */
  const railBox = useRef<HTMLDivElement>(null);
  const [railHeight, setRailHeight] = useState<number | null>(null);

  /*
   * Re-measured whenever the rail is on screen, because cards come and
   * go as Flares are posted and pledged. The guard on the value having
   * actually changed is what makes this safe to run after every render:
   * a second pass finds the same number and stops.
   */
  useEffect(() => {
    if (open || !railBox.current) return;
    const measured = railBox.current.offsetHeight;
    if (measured > 0 && measured !== railHeight) setRailHeight(measured);
  }, [open, railHeight]);

  /* What the chevron and assistive technology should say. A press to
     close reads as closed immediately, even though the drawer is still
     visibly retracting. */
  const expanded = open && !closing;

  return (
    <>
      {/*
       * The identity lives BESIDE the toggle now, not inside it. It used
       * to sit within the expand button, which made the player's name
       * part of "unfold this section" — and the founder's ask is that
       * tapping a person opens their profile popup, which means the
       * identity block has to be able to carry its own button. A button
       * inside a button is invalid HTML, so the header splits: the
       * person on the left, and everything else remains the toggle.
       */}
      {/*
       * A hairline under the header, from the founder's mockup. The
       * person and their cards used to run together as one block of
       * things at slightly different sizes; a rule says "this is who,
       * and below is what they have" without a word of copy.
       */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-3">
        {identity}
        <button
          type="button"
          onClick={() => {
            if (open) setClosing(true);
            else setOpen(true);
          }}
          aria-expanded={expanded}
          aria-label={expanded ? "Show fewer of their cards" : "Show all their cards"}
          /*
           * shrink-0 + ml-auto, NOT flex-1: this button must never be
           * crushed. Squeezed on a phone it used to wrap its badge into
           * a tall oval that painted over the name beside it; refusing
           * to shrink makes the header wrap it onto its own line
           * instead, and ml-auto keeps it right-aligned there.
           */
          className="ml-auto flex shrink-0 items-center gap-2 text-left"
        >
          {meta}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-text-muted transition-transform duration-300 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/*
       * The rail never animates. It is the resting state, not a thing
       * that opens — and animating it back in was the last bounce:
       * measured, the page dropped 154px below where it settles while
       * the rail grew from nothing. The drawer already holds that space
       * open, so the rail simply takes it over.
       */}
      {!open && (
        <div ref={railBox}>
          {/*
           * No `overflow-hidden` here, unlike the drawer below.
           *
           * The drawer needs it because it animates its own height. The
           * rail does not animate at all, and clipping it undoes the one
           * thing its padding exists for: the rail bleeds outward by
           * exactly that padding so its first card lines up with the
           * header, and a clip box at the header's edge slices the glow
           * off a card you are holding. That is a bug this board has
           * already had once.
           */}
          {rail}
        </div>
      )}

      {open && (
        <div
          className={closing ? "fold-up" : "unfold-down"}
          /*
           * Held at the rail's height in BOTH directions, so the page
           * never passes through a state shorter than the one it rests
           * in. Opening grows from the rail's height rather than from
           * zero, closing lands on it, and the handover changes nothing.
           */
          style={railHeight ? { minHeight: railHeight } : undefined}
          /*
           * The handover. The drawer is only swapped for the rail once
           * it has finished retracting, which is what makes the two
           * motions read as one gesture rather than a cut.
           *
           * Guarded on the phase because the opening animation lands
           * here too, and on the target because a card inside the
           * stacked view finishing its own animation must not close
           * the section somebody just opened.
           */
          onAnimationEnd={(event) => {
            if (!closing || event.target !== event.currentTarget) return;
            setClosing(false);
            setOpen(false);
          }}
        >
          <div className="overflow-hidden">{stacked}</div>
        </div>
      )}
    </>
  );
}
