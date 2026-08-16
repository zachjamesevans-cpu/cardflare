"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A horizontal shelf of cards, with a fade on its trailing edge.
 *
 * The fade exists because the sixth card looked cut off rather than
 * scrollable — the founder's earlier ask. This is the correction to it:
 * a fade that never goes away keeps promising more cards after the last
 * one has arrived, which is the same lie in the opposite direction.
 *
 * So it is measured rather than assumed. The gradient shows only while
 * there is somewhere left to scroll, and eases out when the rail
 * reaches its end or was never long enough to scroll at all.
 *
 * A client island purely for that measurement: the cards themselves
 * arrive server-rendered as `children`, with their Server Action forms
 * intact, and nothing about them is re-rendered here.
 */
export function Rail({
  children,
  ariaLabel,
  labelledBy,
}: {
  children: React.ReactNode;
  ariaLabel?: string;
  labelledBy?: string;
}) {
  const list = useRef<HTMLUListElement>(null);

  /** True once there is nothing further to the right. */
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const element = list.current;
    if (!element) return;

    const room = element.scrollWidth - element.clientWidth;

    /*
     * A rail with nothing to scroll counts as "at the end" too. A short
     * shelf of two cards used to carry the same gradient as a long one,
     * which read as a list that had been cut off.
     *
     * The one-pixel tolerance is not fussiness: sub-pixel layout and
     * fractional device ratios mean scrollLeft rarely lands exactly on
     * the maximum, and a fade that survives at 0.4px left is the bug.
     */
    setAtEnd(room <= 1 || element.scrollLeft >= room - 1);
  }, []);

  /*
   * Deliberately every render, with no dependency array. Cards come and
   * go as Flares are posted, pledged and removed, and a re-render with
   * different children changes the scroll width without firing a scroll
   * or a resize. This is one layout read, and it is what keeps the fade
   * honest when the shelf's contents change under it.
   */
  useEffect(measure);

  useEffect(() => {
    const element = list.current;
    if (!element) return;

    element.addEventListener("scroll", measure, { passive: true });

    /* Catches the phone turning, and the shelf being given more room. */
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  return (
    /*
     * Pulled back by exactly the padding below, so the first card's edge
     * lands on the same line as everything above it. Without this the
     * shelf sat eight pixels right of the header it belongs to, which is
     * the sort of thing nobody can name and everybody can see.
     */
    <div className="relative -mx-2">
      <ul
        ref={list}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        /*
         * The padding is for the glow, not for looks. `overflow-x-auto`
         * clips vertically as well as horizontally, so a ring with a
         * soft shadow on a tile - which is how a card you are holding
         * is marked - got sliced off at the top and at the left edge
         * where those tiles now sort to. This is the room it needs.
         */
        className="flex items-start gap-2 overflow-x-auto px-2 pt-2 pb-3"
      >
        {children}
      </ul>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-0 right-0 h-1/2 w-8 bg-gradient-to-l from-surface to-transparent transition-opacity duration-[var(--duration-base)] ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />
    </div>
  );
}
