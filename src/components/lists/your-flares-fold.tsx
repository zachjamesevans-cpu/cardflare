"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import {
  HIDE_YOUR_FLARES,
  SHOW_YOUR_FLARES,
  yourFlaresLine,
} from "@/lib/events/room-view";

/**
 * Your own Flares on the room's board, folded to one line.
 *
 * The founder (2026-11-15), after scanning into a room: "When someone
 * scans into a room I feel like it should be dead simple imo. This is
 * so much info." Your group was drawn open on the board with Found it
 * and Take down under every card: a row of buttons about cards you
 * already know you want, in among the cards you came to see. Folded,
 * it is "Your 3 Flares are up" and Show; open, it is exactly the group
 * the board always drew, with Hide on the same line.
 *
 * It starts open when somebody has offered on one of them, because that
 * is when you need it, and opens itself when an offer arrives on a
 * refresh. The offers note above the board links here
 * (`#flares-<session>`), so a tap on that link, or arriving with it in
 * the address, opens the group first and then scrolls to it: a hidden
 * group is not somewhere the browser can scroll to by itself.
 *
 * A client island around server-rendered children: the group arrives
 * whole, forms intact, and is only hidden while folded, never thrown
 * away. The app's room folds the same group with the same words
 * (mobile/src/room-view.ts holds them on that side).
 */
export function YourFlaresFold({
  count,
  initialOpen,
  anchorId,
  children,
}: {
  /** How many Flares the viewer has on this board. */
  count: number;
  /** Open on arrival: somebody has offered on one of the viewer's Flares. */
  initialOpen: boolean;
  /** The id the offers note links to, inside the group. */
  anchorId: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [jump, setJump] = useState(0);
  const id = useId();

  /*
   * An offer arriving on a refresh opens the group; an offer withdrawn
   * leaves it as the viewer last had it. Adjusted during render, the
   * way React recommends for state that follows a prop.
   */
  const [offered, setOffered] = useState(initialOpen);
  if (offered !== initialOpen) {
    setOffered(initialOpen);
    if (initialOpen) setOpen(true);
  }

  /* The offers note's link, or the address, asking for this group. */
  useEffect(() => {
    const target = `#${anchorId}`;
    const reveal = () => {
      setOpen(true);
      setJump((value) => value + 1);
    };
    const onClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link?.getAttribute("href") === target) reveal();
    };
    const onHash = () => {
      if (window.location.hash === target) reveal();
    };
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", onHash);
    const frame = window.requestAnimationFrame(onHash);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", onHash);
      window.cancelAnimationFrame(frame);
    };
  }, [anchorId]);

  /* Once the group is on screen, go to it. */
  useEffect(() => {
    if (jump === 0) return;
    document.getElementById(anchorId)?.scrollIntoView({ block: "start" });
  }, [jump, anchorId]);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] text-left text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <span className="min-w-0 truncate font-semibold text-text-primary tabular-nums">
          {yourFlaresLine(count)}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-medium text-accent">
          {open ? HIDE_YOUR_FLARES : SHOW_YOUR_FLARES}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      <div id={id} hidden={!open} className={open ? "flex flex-col gap-1.5" : "hidden"}>
        {children}
      </div>
    </div>
  );
}
