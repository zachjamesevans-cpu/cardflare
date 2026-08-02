"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { CardThumbnail } from "./card-thumbnail";
import { cardImageAlt, isRenderableImageUrl } from "@/lib/cards/images";

/**
 * A thumbnail you can open at a readable size.
 *
 * Tap or click, not hover. Hover does not exist on the phones this is built
 * for, and on a desktop a hover-opened panel over a scrolling list fires by
 * accident every time somebody's pointer crosses a row. Hover earns its keep
 * on the affordance instead — the cursor and the ring say "this opens".
 *
 * Built on the native `<dialog>`, which brings the focus trap, Escape, inert
 * background and `::backdrop` with it.
 *
 * Not used inside the card search: those thumbnails live inside the result
 * button, and a button inside a button is invalid.
 */

/** Long enough to read as a movement, short enough not to be in the way. */
const OPEN_MS = 220;
const CLOSE_MS = 140;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/** How long a pointer must rest on a thumbnail before it counts as intent. */
const DWELL_MS = 120;

/** Matches the thumbnail's own `sizes`, so it reuses that exact cached image. */
const THUMB_SIZES = "56px";

export function CardImageZoom({
  imageUrl,
  exactName,
  cardNumber,
  enabled,
  anyPrinting = false,
  caption,
}: {
  imageUrl: string | null;
  exactName: string;
  cardNumber: string;
  enabled: boolean;
  anyPrinting?: boolean;
  /** The printing, so the large view says which version is being shown. */
  caption?: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  /**
   * Whether the full-size image has been asked for yet.
   *
   * Not on page load. A board of thirty rows would pull thirty full-size cards
   * over store wifi to serve the one somebody eventually taps — a hundredfold
   * increase in bytes for the common case, browsing, to save a wait in the
   * rare one. Instead it starts loading on the first sign of intent: a pointer
   * arriving, a finger landing, or keyboard focus. Touch-to-click is a couple
   * of hundred milliseconds, which is a real head start.
   */
  const [warm, setWarm] = useState(false);
  const [sharp, setSharp] = useState(false);

  /**
   * A pointer has to settle before it counts as intent.
   *
   * Without this, sweeping a mouse down a board of thirty rows warms thirty
   * full-size images — reintroducing the exact cost the lazy approach exists
   * to avoid, just triggered by a mouse instead of by page load. Dwelling is
   * the difference between passing over a row and considering it. Touch and
   * keyboard focus are unambiguous and warm immediately.
   */
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDwell = useCallback(() => {
    if (dwell.current) clearTimeout(dwell.current);
    dwell.current = null;
  }, []);

  useEffect(() => cancelDwell, [cancelDwell]);

  const reducedMotion = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  /**
   * Grows the panel out of the thumbnail that was tapped.
   *
   * Measured rather than approximated with a transform-origin: the thumbnail
   * can be anywhere down a long list, and a panel that springs from the middle
   * of the screen does not connect to the thing that was pressed.
   */
  const open = useCallback(() => {
    const element = dialog.current;
    const box = panel.current;
    const from = opener.current?.getBoundingClientRect();

    if (!element) return;

    setWarm(true);
    element.showModal();

    if (!box || !from || reducedMotion()) return;

    const to = box.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = to.width > 0 ? from.width / to.width : 0.2;

    box.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ],
      { duration: OPEN_MS, easing: EASE },
    );
  }, [reducedMotion]);

  /** Shrinks back towards the thumbnail, then actually closes. */
  const close = useCallback(() => {
    const element = dialog.current;
    const box = panel.current;
    const to = opener.current?.getBoundingClientRect();

    if (!element) return;

    if (!box || !to || reducedMotion()) {
      element.close();
      return;
    }

    const from = box.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = from.width > 0 ? to.width / from.width : 0.2;

    const animation = box.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
      ],
      { duration: CLOSE_MS, easing: EASE, fill: "forwards" },
    );

    animation.finished.then(() => element.close()).catch(() => element.close());
  }, [reducedMotion]);

  const thumbnail = (
    <CardThumbnail
      imageUrl={imageUrl}
      exactName={exactName}
      cardNumber={cardNumber}
      enabled={enabled}
      anyPrinting={anyPrinting}
    />
  );

  /*
   * Nothing to open, so nothing to press. Rendering a button over the
   * placeholder would promise a bigger picture that does not exist.
   */
  if (!enabled || !isRenderableImageUrl(imageUrl)) return thumbnail;

  const intent = () => {
    cancelDwell();
    setWarm(true);
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={open}
        onPointerEnter={(event) => {
          // Touch fires pointerenter too, and `onTouchStart` already covers it.
          if (event.pointerType === "touch") return;
          cancelDwell();
          dwell.current = setTimeout(() => setWarm(true), DWELL_MS);
        }}
        onPointerLeave={cancelDwell}
        onTouchStart={intent}
        onFocus={intent}
        aria-label={`View ${exactName} larger`}
        className="shrink-0 cursor-zoom-in rounded-[7px] transition-transform duration-[var(--duration-base)] hover:ring-2 hover:ring-accent/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:scale-95"
      >
        {thumbnail}
      </button>

      <dialog
        ref={dialog}
        aria-label={cardImageAlt(exactName, cardNumber)}
        /* Escape fires `cancel`, which would close without the animation. */
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        /*
         * Clicking the backdrop closes. The dialog element fills the viewport
         * when modal, so a click landing on it rather than on the panel is a
         * click on the backdrop.
         */
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="m-auto max-h-[92dvh] w-[min(92vw,26rem)] overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-[2px]"
      >
        <div
          ref={panel}
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-text-primary"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-semibold">{exactName}</p>
              <p className="font-mono text-xs text-text-muted">
                {cardNumber}
                {caption && <span className="font-sans"> · {caption}</span>}
              </p>
            </div>

            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-m-1 shrink-0 rounded-full p-1 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {/*
           * Sized to the card's own proportions so nothing jumps when the
           * image arrives.
           */}
          <div className="relative aspect-[60/84] w-full overflow-hidden rounded-[8px] bg-elevated">
            {/*
             * The thumbnail, blown up. Requested at the same size the row
             * already used, so it is a cache hit and paints immediately —
             * there is never an empty box. Blurred on purpose, so it reads as
             * an image arriving rather than as a broken one.
             */}
            <Image
              src={imageUrl}
              alt=""
              aria-hidden="true"
              fill
              sizes={THUMB_SIZES}
              className="scale-105 object-contain blur-md"
            />

            {warm && (
              <Image
                src={imageUrl}
                alt={cardImageAlt(exactName, cardNumber)}
                fill
                sizes="(max-width: 448px) 92vw, 416px"
                /*
                 * Eager, or the warm-up warms nothing. A closed <dialog> is
                 * `display: none`, so a lazily-loaded image inside it never
                 * intersects the viewport and never starts — measuring the
                 * requests showed the head start was imaginary.
                 */
                priority
                onLoad={() => setSharp(true)}
                className={`object-contain transition-opacity duration-200 ${
                  sharp ? "opacity-100" : "opacity-0"
                }`}
              />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
