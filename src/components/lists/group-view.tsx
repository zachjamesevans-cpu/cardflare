"use client";

import { useState, type ReactNode } from "react";
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
 * this component only decides which of the two is unfolded.
 *
 * The unfold animates ONE thing: the arriving view, growing downward
 * from the header that was tapped. The first version animated both —
 * the rail collapsing to nothing while the stacked view grew — and the
 * founder's read was exactly right: two height animations fighting
 * means the eye watches cards being dragged upward at the same moment
 * new ones arrive. Whatever is being replaced now simply stops being
 * there, and the only movement on screen is downward from the tap.
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

  /*
   * Whether the section has ever been toggled. Without this the rail
   * would play its unfold on page load, and a board of ten players
   * arriving is ten sections animating at nobody's request.
   */
  const [touched, setTouched] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setTouched(true);
        }}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 text-left"
      >
        {identity}
        <span className="flex shrink-0 items-center gap-2">
          {meta}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 text-text-muted transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {/*
       * `hidden` rather than unmounted, so the server-rendered forms
       * inside keep their state across a fold and unfold.
       */}
      <div className={open ? "hidden" : touched ? "unfold-down" : ""}>
        <div className="overflow-hidden">{rail}</div>
      </div>

      <div className={open ? "unfold-down" : "hidden"}>
        <div className="overflow-hidden">{stacked}</div>
      </div>
    </>
  );
}
