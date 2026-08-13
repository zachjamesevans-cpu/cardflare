"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

/*
 * The close is the open, reversed. It used to run in 140ms, and with an
 * ease-out that front-loads most of the movement it was over before the
 * eye caught it — the founder reported the card as having no closing
 * animation at all, and tracing the panel's transform showed one that
 * was technically running and practically invisible. Same duration now,
 * and the easing is the literal mirror of the opening curve: reversing
 * cubic-bezier(x1,y1,x2,y2) gives cubic-bezier(1-x2,1-y2,1-x1,1-y1), so
 * the card leaves slowly and lands fast, exactly as it arrived.
 */
const CLOSE_MS = OPEN_MS;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_REVERSE = "cubic-bezier(1, 0, 0.8, 1)";

/** How long a pointer must rest on a thumbnail before it counts as intent. */
const DWELL_MS = 120;

/** Matches the thumbnail's own `sizes`, so it reuses that exact cached image. */
const THUMB_SIZES = "56px";

/*
 * Transparent ↔ the same dimmer the stylesheet's `backdrop:` classes
 * declare, blur included — animating only the colour would leave a
 * bare 2px blur on screen for a frame at the end of the close.
 */
const BACKDROP_CLEAR: Keyframe = {
  backgroundColor: "rgb(0 0 0 / 0)",
  backdropFilter: "blur(0px)",
};
const BACKDROP_DIM: Keyframe = {
  backgroundColor: "rgb(0 0 0 / 0.75)",
  backdropFilter: "blur(2px)",
};

export function CardImageZoom({
  imageUrl,
  exactName,
  cardNumber,
  enabled,
  anyPrinting = false,
  caption,
  note = null,
  lookingFor = null,
  direction = "want",
  stillNeeds = null,
  terms = null,
  pledges = [],
  thumbClassName,
  thumb,
}: {
  imageUrl: string | null;
  exactName: string;
  cardNumber: string;
  enabled: boolean;
  anyPrinting?: boolean;
  /** The printing, so the large view says which version is being shown. */
  caption?: string | null;
  /** The Flare's note, shown in the large view under the number. */
  note?: string | null;
  /** How many the Flare is for, said in words in the large view. */
  lookingFor?: number | null;
  /**
   * Which way the Flare points, because the same number means opposite
   * things. A player reported opening a card from the "Letting go"
   * section and being told the owner was looking for it.
   */
  direction?: "want" | "showcase";
  /** Copies still unpledged, when hands are already up. */
  stillNeeds?: number | null;
  /**
   * Trade, cash or either, when it is not the assumed plain trade.
   *
   * The carousel tile has a fixed anatomy and no room for it, so the
   * large view is where somebody deciding whether to walk over finds
   * out that they should bring money.
   */
  terms?: string | null;
  /**
   * Who has raised a hand, by name. The tile draws coverage as a count;
   * this is where "checked off by whom?" gets answered — the founder's
   * ask: tap the card, see "Kaito is bringing 3".
   */
  pledges?: { name: string; quantity: number }[];
  /** Sizes the thumbnail; the carousel view renders cards art-first. */
  thumbClassName?: string;
  /**
   * A ready-made thumbnail to open from, replacing the default
   * CardThumbnail. The showcase renders its cards through CosmeticCard
   * so they wear what the player bought, and the founder's ask was that
   * tapping one opens the same viewer with the same animation as
   * everywhere else — one zoom, whatever the card is dressed in.
   */
  thumb?: ReactNode;
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

  /**
   * The animation currently applied to the panel, so it can be called off.
   *
   * The close animation has to be `fill: "forwards"` or the panel would snap
   * back to full size for a frame before the dialog actually closes. Forwards
   * means it keeps applying after it ends — so on reopening, the panel played
   * the open animation, looked right for its 220ms, and then collapsed to
   * `scale(0.16) opacity(0)` the moment the open animation stopped applying
   * and the stale close animation took back over.
   *
   * It also poisoned the measurement: `getBoundingClientRect` reports the
   * transformed box, so the second open measured a panel that was already
   * scaled to nothing and animated from nonsense.
   */
  const running = useRef<Animation | null>(null);

  /**
   * The backdrop's animation, tracked for the same call-it-off reasons.
   *
   * The panel always animated; the backdrop never did. `showModal()` slams
   * the dimmer on at full strength and `close()` rips it away in one frame,
   * and that one-frame jump back to a bright page is the flash the founder
   * felt on the phone — the panel's own 140ms shrink was already over by
   * then. So the dimmer now fades with the panel, both ways, driven on the
   * `::backdrop` pseudo-element. Close keeps `fill: "forwards"` so the
   * dialog is dismissed from an already-transparent backdrop.
   */
  const backdropRunning = useRef<Animation | null>(null);

  /**
   * Fades the backdrop, tolerating browsers that cannot.
   *
   * Animating a pseudo-element needs the `pseudoElement` option, which older
   * WebKit throws on — there, the backdrop pops exactly as it always did,
   * which is a fallback, not a regression.
   */
  const fadeBackdrop = useCallback(
    (
      element: HTMLDialogElement,
      frames: [Keyframe, Keyframe],
      options: KeyframeAnimationOptions,
    ) => {
      try {
        backdropRunning.current = element.animate(frames, {
          ...options,
          pseudoElement: "::backdrop",
        });
      } catch {
        backdropRunning.current = null;
      }
    },
    [],
  );

  /**
   * Whether the dialog is currently up.
   *
   * Closing a `<dialog>` hands focus back to the button that opened it, which
   * fires the same `focus` that counts as intent — so the image was re-warmed
   * the instant it was dropped and every card ever opened stayed decoded in
   * memory. The refocus happens inside `close()`, before the `close` event, so
   * checking this flag rejects it without depending on the ordering of two
   * state updates from two different event dispatches.
   */
  const isOpen = useRef(false);

  /** Called before measuring, so the panel is measured untransformed. */
  const stopAnimation = useCallback(() => {
    running.current?.cancel();
    running.current = null;
    backdropRunning.current?.cancel();
    backdropRunning.current = null;
  }, []);

  const cancelDwell = useCallback(() => {
    if (dwell.current) clearTimeout(dwell.current);
    dwell.current = null;
  }, []);

  useEffect(() => cancelDwell, [cancelDwell]);

  /**
   * Drops the full-size image once the dialog is closed, however it closed.
   *
   * Otherwise every card opened stays decoded in memory for the life of the
   * page, which on a phone is how a tab gets killed. Re-warming costs nothing:
   * the browser still has the bytes, so it is a cache hit.
   *
   * A native listener rather than React's `onClose`, because `close` does not
   * bubble and so never reaches React's delegated handler. Measured: the
   * element fired `close` while the large image stayed mounted.
   */
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    const onClose = () => {
      isOpen.current = false;
      running.current?.cancel();
      running.current = null;
      backdropRunning.current?.cancel();
      backdropRunning.current = null;
      setWarm(false);
      setSharp(false);
    };

    element.addEventListener("close", onClose);
    return () => element.removeEventListener("close", onClose);
  }, []);

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

    stopAnimation();
    cancelDwell();
    isOpen.current = true;
    setWarm(true);
    element.showModal();

    if (!box || !from || reducedMotion()) return;

    fadeBackdrop(element, [BACKDROP_CLEAR, BACKDROP_DIM], {
      duration: OPEN_MS,
      easing: EASE,
    });

    const to = box.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = to.width > 0 ? from.width / to.width : 0.2;

    running.current = box.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ],
      { duration: OPEN_MS, easing: EASE },
    );
  }, [cancelDwell, fadeBackdrop, reducedMotion, stopAnimation]);

  /** Shrinks back towards the thumbnail, then actually closes. */
  const close = useCallback(() => {
    const element = dialog.current;
    const box = panel.current;
    const to = opener.current?.getBoundingClientRect();

    if (!element) return;

    stopAnimation();

    if (!box || !to || reducedMotion()) {
      element.close();
      return;
    }

    const from = box.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = from.width > 0 ? to.width / from.width : 0.2;

    fadeBackdrop(element, [BACKDROP_DIM, BACKDROP_CLEAR], {
      duration: CLOSE_MS,
      easing: EASE_REVERSE,
      fill: "forwards",
    });

    const animation = box.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
      ],
      { duration: CLOSE_MS, easing: EASE_REVERSE, fill: "forwards" },
    );

    running.current = animation;

    animation.finished
      .then(() => {
        // Only if nothing has taken over since — a cancel means somebody
        // reopened, and closing the dialog they just opened is the bug.
        if (running.current === animation) element.close();
      })
      .catch(() => {});
  }, [fadeBackdrop, reducedMotion, stopAnimation]);

  const thumbnail = thumb ?? (
    <CardThumbnail
      imageUrl={imageUrl}
      exactName={exactName}
      cardNumber={cardNumber}
      enabled={enabled}
      anyPrinting={anyPrinting}
      className={thumbClassName}
    />
  );

  /*
   * Nothing to open, so nothing to press. Rendering a button over the
   * placeholder would promise a bigger picture that does not exist.
   */
  if (!enabled || !isRenderableImageUrl(imageUrl)) return thumbnail;

  const intent = () => {
    if (isOpen.current) return;
    cancelDwell();
    setWarm(true);
  };

  /**
   * Intent withdrawn: the pointer moved on, or focus did.
   *
   * Cancelling the pending timer is not enough on its own. A pointer that
   * dwells, warms, opens and closes is still resting on the thumbnail
   * afterwards, so nothing ever drops that image again — measured as three
   * dialogs each holding a full-size card after opening and closing three
   * rows. Leaving has to cool an already-warm image too, not just call off
   * one that had not started.
   */
  const cool = () => {
    cancelDwell();
    if (!isOpen.current) setWarm(false);
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={open}
        onPointerEnter={(event) => {
          // Touch fires pointerenter too, and `onTouchStart` already covers it.
          if (event.pointerType === "touch" || isOpen.current) return;
          cancelDwell();
          dwell.current = setTimeout(() => setWarm(true), DWELL_MS);
        }}
        onPointerLeave={cool}
        onTouchStart={intent}
        onFocus={intent}
        onBlur={cool}
        aria-label={`View ${exactName} larger`}
        className={`shrink-0 cursor-zoom-in rounded-[7px] transition-transform duration-[var(--duration-base)] hover:ring-2 hover:ring-accent/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:scale-95 ${thumbClassName ? "w-full" : ""}`}
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
              {/* Said in words here even though the tile draws it as a
                  stack, for anyone who cannot read the layers. Both truths
                  when hands are up: the ask, and what is still missing.
                  Coverage is a want's problem only — nobody pledges to
                  take a card off somebody's hands. */}
              {lookingFor != null && (
                <p className="mt-1 text-sm font-medium text-accent">
                  {direction === "showcase" ? (
                    lookingFor === 1 ? (
                      "Letting this go"
                    ) : (
                      `Letting go of ${lookingFor}`
                    )
                  ) : (
                    <>
                      Looking for {lookingFor}
                      {stillNeeds != null &&
                        stillNeeds !== lookingFor &&
                        (stillNeeds === 0
                          ? " · all spoken for"
                          : ` · still needs ${stillNeeds}`)}
                    </>
                  )}
                </p>
              )}
              {pledges.length > 0 && (
                <ul className="mt-1 flex flex-col">
                  {pledges.map((pledge, index) => (
                    <li key={index} className="text-sm text-text-secondary">
                      <span className="font-medium text-text-primary">
                        {pledge.name}
                      </span>{" "}
                      is bringing {pledge.quantity}
                    </li>
                  ))}
                </ul>
              )}
              {terms && <p className="mt-1 text-sm font-medium text-accent">{terms}</p>}
              {/* The note travels with the card: the carousel tile has no
                  room for it, so the zoom is where it gets read. */}
              {note && (
                <p className="mt-1 text-sm text-text-secondary italic">{note}</p>
              )}
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
