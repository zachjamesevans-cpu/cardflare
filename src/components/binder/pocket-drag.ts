"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Moving a card between pockets in one gesture, the website's half of
 * the app's hold to move.
 *
 * The founder: "Drag and drop isn't perfect - you have to hold it down
 * to go into edit mode, then press it again. I should be able to hold
 * it down, and without lifting finger start moving the cards around."
 * So there is no mode. On a touch screen a finger held still on a card
 * for LIFT_MS lifts it (a buzz where the phone has one, the card grows
 * and casts a shadow) and the same finger, still down, carries it.
 * Moving before then is a scroll, as it always was. A mouse needs no
 * hold to say it means to drag, so a few pixels of movement with the
 * button down lifts the card at once.
 *
 * Pointer events, not the browser's own drag and drop, because a
 * phone's browser does not start one of those from a finger. While a
 * card is up the page does not scroll (the touchmove is cancelled), so
 * the finger moves the card and nothing else.
 *
 * Where it is over is read from the grid's geometry, not from whatever
 * element is under the finger, so cards sliding aside underneath it
 * never make the target flicker. Held over a page arrow, or at the
 * page's left or right edge, for TURN_MS, the page turns, and keeps
 * turning while it is held there.
 */

/** Where a held card is hovering: a pocket on this page (0 to 8), an edge, or Remove. */
export type DropSpot = number | "prev" | "next" | "remove";

/** How long a finger holds a card before it lifts. */
export const LIFT_MS = 300;
/** How long a card is held at a page's edge before the page turns. */
export const TURN_MS = 600;
/** A finger that wanders further than this before the lift is scrolling. */
const TOUCH_SLOP = 8;
/** A mouse that moves this far with the button down is dragging. */
const MOUSE_SLOP = 4;
/** How far inside the grid's side counts as its edge. */
const EDGE = 12;

/** What the page draws while a card is up: which card, and how big. */
export interface Lifted {
  entryId: string;
  width: number;
  height: number;
}

/** One press, from the pointer going down to it coming up. */
interface Gesture {
  entryId: string;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Where in the card the pointer took hold, so the card does not jump. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  lifted: boolean;
  over: DropSpot | null;
  liftTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  /** Takes the window listeners off again. */
  detach: () => void;
}

export function usePocketDrag({
  enabled,
  columns,
  onDrop,
  onTurn,
  canTurn,
}: {
  /** The owner's binder, with nothing in flight. */
  enabled: boolean;
  columns: number;
  /** Let go over `spot`; null when it was let go over nothing. */
  onDrop: (entryId: string, spot: DropSpot | null) => void;
  /** Turn the page, while a card is held at its edge. */
  onTurn: (side: "prev" | "next") => void;
  /** Whether there is a page that way; when not, the edge is just a pocket. */
  canTurn: (side: "prev" | "next") => boolean;
}) {
  const [lifted, setLifted] = useState<Lifted | null>(null);
  const [over, setOver] = useState<DropSpot | null>(null);

  /** The grid of pockets, for reading which pocket a point is over. */
  const grid = useRef<HTMLUListElement | null>(null);
  /** The card that follows the pointer, moved without a render. */
  const ghost = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  /* The page's newest callbacks, for listeners that outlive a render. */
  const latest = useRef({ onDrop, onTurn, canTurn });
  useLayoutEffect(() => {
    latest.current = { onDrop, onTurn, canTurn };
  });

  const place = () => {
    const now = gesture.current;
    const element = ghost.current;
    if (!now || !element) return;
    const x = now.x - now.offsetX;
    const y = now.y - now.offsetY;
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.08)`;
  };

  /* The page draws the ghost once a card lifts: under the finger
     before the first paint, not in the corner for a frame. */
  useLayoutEffect(() => {
    if (lifted) place();
  }, [lifted]);

  const spotAt = (x: number, y: number): DropSpot | null => {
    const hit = document.elementFromPoint(x, y);
    const mark = hit?.closest<HTMLElement>("[data-drop]")?.dataset.drop;
    if (mark === "remove") return mark;
    const turns = latest.current.canTurn;
    if ((mark === "prev" || mark === "next") && turns(mark)) return mark;
    const box = grid.current?.getBoundingClientRect();
    if (!box || y < box.top || y > box.bottom) return null;
    if (x < box.left + EDGE && turns("prev")) return "prev";
    if (x > box.right - EDGE && turns("next")) return "next";
    if (x < box.left || x > box.right) return null;
    const column = Math.min(
      columns - 1,
      Math.max(0, Math.floor(((x - box.left) / box.width) * columns)),
    );
    const row = Math.min(
      columns - 1,
      Math.max(0, Math.floor(((y - box.top) / box.height) * columns)),
    );
    return row * columns + column;
  };

  const stopTurning = (now: Gesture) => {
    if (now.turnTimer) clearTimeout(now.turnTimer);
    now.turnTimer = null;
  };

  /* Held at an edge: the page turns after TURN_MS, and again every
     TURN_MS for as long as it is held there. */
  const turnWhileHeld = (now: Gesture, side: "prev" | "next") => {
    stopTurning(now);
    now.turnTimer = setTimeout(() => {
      if (gesture.current !== now || now.over !== side) return;
      latest.current.onTurn(side);
      turnWhileHeld(now, side);
    }, TURN_MS);
  };

  const hover = (now: Gesture, spot: DropSpot | null) => {
    if (spot === now.over) return;
    now.over = spot;
    setOver(spot);
    if (spot === "prev" || spot === "next") turnWhileHeld(now, spot);
    else stopTurning(now);
  };

  const lift = (now: Gesture) => {
    if (gesture.current !== now || now.lifted) return;
    now.lifted = true;
    setLifted({ entryId: now.entryId, width: now.width, height: now.height });
    /* The buzz the app gives with expo-haptics, where a browser can. */
    if (now.touch && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(12);
      } catch {
        /* Refused: the card lifting is the signal. */
      }
    }
    hover(now, spotAt(now.x, now.y));
  };

  const finish = (now: Gesture, dropped: boolean) => {
    if (gesture.current !== now) return;
    gesture.current = null;
    now.detach();
    if (now.liftTimer) clearTimeout(now.liftTimer);
    stopTurning(now);
    setLifted(null);
    setOver(null);
    if (!now.lifted) return;
    /* The release that ends a drag is not also a tap on the card: the
       click it would fire is swallowed, once, before it opens the viewer. */
    const swallow = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(
      () => window.removeEventListener("click", swallow, { capture: true }),
      0,
    );
    if (dropped) latest.current.onDrop(now.entryId, now.over);
  };

  /* Nothing left running when the page goes. */
  useEffect(
    () => () => {
      const now = gesture.current;
      if (!now) return;
      gesture.current = null;
      now.detach();
      if (now.liftTimer) clearTimeout(now.liftTimer);
      if (now.turnTimer) clearTimeout(now.turnTimer);
    },
    [],
  );

  const begin = (entryId: string, event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || gesture.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== now.pointerId) return;
      now.x = move.clientX;
      now.y = move.clientY;
      if (!now.lifted) {
        const moved = Math.hypot(now.x - now.startX, now.y - now.startY);
        /* A finger moving before the hold is a scroll: the page has it. */
        if (now.touch) {
          if (moved > TOUCH_SLOP) finish(now, false);
        } else if (moved > MOUSE_SLOP) {
          lift(now);
        }
        return;
      }
      place();
      hover(now, spotAt(now.x, now.y));
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== now.pointerId) return;
      finish(now, up.type === "pointerup");
    };
    /* While a card is up the finger moves it, not the page. */
    const onTouchMove = (touch: TouchEvent) => {
      if (now.lifted && touch.cancelable) touch.preventDefault();
    };

    const now: Gesture = {
      entryId,
      pointerId: event.pointerId,
      touch: event.pointerType !== "mouse",
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      width: box.width,
      height: box.height,
      lifted: false,
      over: null,
      liftTimer: null,
      turnTimer: null,
      detach: () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("touchmove", onTouchMove);
      },
    };
    gesture.current = now;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    /* A finger lifts the card by holding still; a mouse, by moving. */
    if (now.touch) now.liftTimer = setTimeout(() => lift(now), LIFT_MS);
  };

  /** Spread on a filled pocket: the press that may become a drag. */
  const pocketProps = (entryId: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => begin(entryId, event),
    /* A long press is not a request for the picture's menu. */
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      if (gesture.current) event.preventDefault();
    },
  });

  return { lifted, over, grid, ghost, pocketProps };
}

/**
 * THE OTHERS SLIDE ASIDE. Each card in the grid is keyed by its entry,
 * so when a hovered drop (or a landed one) moves it to another pocket
 * the same element moves; this measures where each one was, relative
 * to the grid, and plays the step from there to where it is now. The
 * app does the same with reanimated. Nothing moves for somebody who
 * asked for less motion.
 */
export function useSlide(grid: { current: HTMLElement | null }, layout: string) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const was = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const origin = grid.current?.getBoundingClientRect();
    if (!origin) return;
    const still =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = new Map<string, { x: number; y: number }>();
    for (const [id, node] of nodes.current) {
      const box = node.getBoundingClientRect();
      const at = { x: box.left - origin.left, y: box.top - origin.top };
      now.set(id, at);
      const before = was.current.get(id);
      if (
        still ||
        !before ||
        (Math.abs(before.x - at.x) < 1 && Math.abs(before.y - at.y) < 1) ||
        typeof node.animate !== "function"
      ) {
        continue;
      }
      node.animate(
        [
          { transform: `translate(${before.x - at.x}px, ${before.y - at.y}px)` },
          { transform: "none" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
    was.current = now;
  }, [grid, layout]);

  /** The ref for one card's cell. */
  return (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
}
