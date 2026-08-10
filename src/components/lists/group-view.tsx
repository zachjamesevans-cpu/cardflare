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
 * this component only decides which of the two is unfolded, with the
 * same grid-rows slide the roster uses.
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
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

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden">{rail}</div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">{stacked}</div>
      </div>
    </>
  );
}
