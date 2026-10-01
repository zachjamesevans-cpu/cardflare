"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * A long section of the board, folded.
 *
 * The founder asked what a hundred Flares does to the room: one person's
 * section swallowed the board. So a section shows its first few cards
 * and a control at the end, "and N more", which shows the whole section
 * in place; while open, the same control reads "Show less". The rail and
 * the stacked list both obey it, and your own section folds exactly like
 * everyone else's, so you see what the room sees.
 *
 * A client island around server-rendered children, in the manner of
 * `GroupView`: every card arrives fully formed, offer forms and all, and
 * this component only holds the one bit of state. The board decides which
 * cards lie past the fold (it knows the drawn order and the constant, and
 * deck folders count by cards, not by folders) and wraps those in
 * `BeyondFold`; this component says whether they are on screen. The
 * zoom shelf is not folded at all: tapping a card still pages the WHOLE
 * section, because the fold is about the board's height, not about what
 * the person posted.
 */
const Open = createContext(false);

export function SectionFold({
  hidden,
  variant,
  children,
}: {
  /** How many cards lie past the fold. Zero or less: no control at all. */
  hidden: number;
  /**
   * Where the control is drawn. In the rail it is a tile-sized button at
   * the shelf's end, inside the same `<ul>`; in the stacked list it is a
   * quiet text control on a row of its own.
   */
  variant: "rail" | "stacked";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const label = open ? "Show less" : `and ${hidden} more`;

  return (
    <Open.Provider value={open}>
      {children}
      {hidden > 0 &&
        (variant === "rail" ? (
          <li className="flex w-14 shrink-0 flex-col">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              /* The card's own box and corner radius, so the control sits on
                 the shelf like a tile rather than a stray caption. */
              className="flex aspect-[60/84] w-full cursor-pointer items-center justify-center rounded-[6px] border border-dashed border-border px-1 text-center text-[11px] leading-[14px] font-semibold text-accent transition-colors hover:border-accent hover:text-accent-hover"
            >
              {label}
            </button>
          </li>
        ) : (
          <div className="flex border-t border-border pt-1">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {label}
            </button>
          </div>
        ))}
    </Open.Provider>
  );
}

/**
 * Something past the fold: on screen only once the section is open.
 *
 * Wraps a card, or a whole deck folder when its first card is already
 * past the fold. Draws nothing of its own, so a row still lands directly
 * in its list.
 */
export function BeyondFold({ children }: { children: ReactNode }) {
  const open = useContext(Open);
  return open ? children : null;
}
