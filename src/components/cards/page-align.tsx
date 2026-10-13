"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FullScreen } from "@/components/ui/full-screen";
import { Spinner } from "@/components/ui/spinner";
import { cornersMakeAPage, type Point, type Quad } from "@/lib/cards/page-geometry";
import type { VisionView } from "@/lib/cards/page-jobs";
import {
  LINE_UP_HINT,
  LINE_UP_PAGE,
  POCKET_NAMES,
  READ_PAGE_AGAIN,
  RESCAN_FAILED,
  TURN_PAGE,
} from "@/lib/cards/scan-rules";
import { cn } from "@/lib/cn";

/**
 * Lining a page up by hand. The founder (2026-10-13): the scanner never
 * guesses where the pockets are; a photo the detector is unsure of comes
 * back as "needs-alignment", and the player puts the page's four corners
 * where they really are.
 *
 * The page's own photo, four handles on it that a finger or a mouse
 * drags (pointer events, so touch and mouse are one path, and the arrow
 * keys nudge one that has focus), starting where the detector thought
 * the page was. The first corner is A1's, the page's top left as it is
 * read, and it wears "A1"; Turn moves A1 to the next corner clockwise,
 * for a page photographed on its side. Read it again sends the corners
 * (`cornersMakeAPage` must hold, or it stays off) and the page goes back
 * to the reader. The app's twin draws the same screen in the same order.
 */

/** Where the handles start when the detector did not even find a page. */
const FALLBACK: Quad = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

/** How far an arrow key moves a handle, as a share of the photo. */
const NUDGE = 0.005;

/**
 * Each handle's pocket, A1's corner first and then clockwise: the
 * corners of A1, A3, C3 and C1. What a screen reader hears it called.
 */
const CORNER_POCKETS = [0, 2, 8, 6].map((slot) => POCKET_NAMES[slot]);

/** The player's own corners if they have lined it up before, else the detector's page. */
export function startCorners(vision: VisionView | null): Quad {
  return vision?.corners ?? vision?.page ?? FALLBACK;
}

/** The corners turned once: the next corner clockwise is A1's. */
export function turnCorners(corners: Quad): Quad {
  return [corners[1], corners[2], corners[3], corners[0]];
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function PageAlign({
  photo,
  start,
  onRead,
  onClose,
}: {
  /** The page's photo, as it was sent. */
  photo: string;
  start: Quad;
  /** The corners, sent; whether the page went back to the reader. */
  onRead: (corners: Quad) => Promise<boolean>;
  onClose: () => void;
}) {
  const [corners, setCorners] = useState<Quad>(start);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  /* The handle being dragged, and where on it the finger took hold. */
  const drag = useRef<{ index: number; dx: number; dy: number } | null>(null);

  const valid = cornersMakeAPage(corners);

  const place = (index: number, point: Point) =>
    setCorners(
      (all) =>
        all.map((each, at) =>
          at === index ? { x: clamp(point.x), y: clamp(point.y) } : each,
        ) as Quad,
    );

  const down = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const corner = corners[index];
    drag.current = {
      index,
      dx: event.clientX - (box.left + corner.x * box.width),
      dy: event.clientY - (box.top + corner.y * box.height),
    };
  };

  const move = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const held = drag.current;
    const box = frame.current?.getBoundingClientRect();
    if (!held || held.index !== index || !box || box.width === 0 || box.height === 0) {
      return;
    }
    place(index, {
      x: (event.clientX - held.dx - box.left) / box.width,
      y: (event.clientY - held.dy - box.top) / box.height,
    });
  };

  const letGo = () => {
    drag.current = null;
  };

  const nudge = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const by: Record<string, Point> = {
      ArrowLeft: { x: -NUDGE, y: 0 },
      ArrowRight: { x: NUDGE, y: 0 },
      ArrowUp: { x: 0, y: -NUDGE },
      ArrowDown: { x: 0, y: NUDGE },
    };
    const step = by[event.key];
    if (!step) return;
    event.preventDefault();
    const corner = corners[index];
    place(index, { x: corner.x + step.x, y: corner.y + step.y });
  };

  const read = async () => {
    if (!valid || sending) return;
    setSending(true);
    setFailed(false);
    const ok = await onRead(corners).catch(() => false);
    if (!ok) {
      setSending(false);
      setFailed(true);
    }
  };

  const outline = corners.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

  return (
    <FullScreen label={LINE_UP_PAGE} onClose={onClose}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 pt-10 text-center">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-text-primary">{LINE_UP_PAGE}</h2>
          <p className="max-w-sm text-sm text-text-secondary">{LINE_UP_HINT}</p>
        </div>

        {/* The photo at its own shape, so a share of it is a share of the frame. */}
        <div ref={frame} className="relative w-fit touch-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt=""
            draggable={false}
            /* A photo already in the cache can finish before onLoad is
               listening: asked once it is in the page as well. */
            ref={(image) => {
              if (image?.complete && image.naturalWidth > 0 && !loaded) setLoaded(true);
            }}
            onLoad={() => setLoaded(true)}
            className="block max-h-[60dvh] max-w-full rounded-[6px]"
          />
          {!loaded && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Spinner size="lg" />
            </div>
          )}
          {loaded && (
            <>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full"
              >
                <polygon
                  points={outline}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={2}
                  className={cn(
                    "fill-accent/10",
                    valid ? "stroke-accent" : "stroke-danger",
                  )}
                />
              </svg>
              {corners.map((corner, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={CORNER_POCKETS[index]}
                  onPointerDown={(event) => down(index, event)}
                  onPointerMove={(event) => move(index, event)}
                  onPointerUp={letGo}
                  onPointerCancel={letGo}
                  onKeyDown={(event) => nudge(index, event)}
                  style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
                  className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:cursor-grabbing"
                >
                  {/* A1's corner is filled and named; the others are rings. */}
                  {index === 0 ? (
                    <span className="flex size-7 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-contrast shadow-[var(--shadow-panel)]">
                      {POCKET_NAMES[0]}
                    </span>
                  ) : (
                    <span className="size-5 rounded-full border-2 border-accent bg-canvas/60 shadow-[var(--shadow-panel)]" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={sending}
            onClick={() => setCorners(turnCorners)}
          >
            <RotateCw className="size-4" aria-hidden="true" />
            {TURN_PAGE}
          </Button>
          <Button type="button" disabled={!valid || sending} onClick={read}>
            {READ_PAGE_AGAIN}
          </Button>
          {sending && (
            <p role="status" className="flex justify-center">
              <Spinner size="sm" />
            </p>
          )}
          {failed && (
            <p role="alert" className="text-sm text-danger">
              {RESCAN_FAILED}
            </p>
          )}
        </div>
      </div>
    </FullScreen>
  );
}
