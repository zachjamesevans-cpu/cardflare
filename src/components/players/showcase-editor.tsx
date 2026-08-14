"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import {
  DressingPicker,
  type DressingOption,
} from "@/components/players/dressing-picker";
import {
  dressAllShowcaseAction,
  dressShowcaseAction,
} from "@/lib/players/profile-actions";
import { SHOP_IDLE, type ShopState } from "@/lib/players/profile-schema";

/**
 * Tapping a card on your own shelf opens its dressing room.
 *
 * The founder's spec: each card can wear its own border and holo, chosen
 * from inside the card after it is up. So on the owner's profile the tap
 * that shows everyone else a big picture opens this instead — a live
 * preview and the same carousel pickers the add flow uses, plus the one
 * button that makes a whole shelf match: Apply to all.
 *
 * Every pick saves immediately, shop-style. A Save button between "I
 * tapped Galaxy" and "the card wears Galaxy" is a step that exists only
 * to be forgotten. Apply to all is the exception with a real button,
 * because it changes eight other cards and should feel like a decision.
 *
 * Same dialog movement as the card viewer and the profile popup — one
 * gesture family for everything that opens over the room.
 */

const OPEN_MS = 220;
const CLOSE_MS = OPEN_MS;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_REVERSE = "cubic-bezier(1, 0, 0.8, 1)";

const BACKDROP_CLEAR: Keyframe = {
  backgroundColor: "rgb(0 0 0 / 0)",
  backdropFilter: "blur(0px)",
};
const BACKDROP_DIM: Keyframe = {
  backgroundColor: "rgb(0 0 0 / 0.75)",
  backdropFilter: "blur(2px)",
};

export function ShowcaseEditor({
  entryId,
  name,
  number,
  imageUrl,
  imagesEnabled,
  frame,
  holo,
  effect,
  frames,
  holos,
}: {
  entryId: string;
  name: string;
  number: string;
  imageUrl: string | null;
  imagesEnabled: boolean;
  /** What the card is wearing right now, resolved to concrete slugs. */
  frame: string | null;
  holo: string | null;
  /** Profile-wide, worn in every preview, not editable here. */
  effect: string | null;
  frames: DressingOption[];
  holos: DressingOption[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const running = useRef<Animation | null>(null);
  const backdropRunning = useRef<Animation | null>(null);
  const form = useRef<HTMLFormElement>(null);

  /*
   * The picked pair, shown instantly. The server confirms through the
   * action and the page revalidates behind it; starting from the props
   * on every open keeps a stale pick from surviving a failed write.
   */
  const [picked, setPicked] = useState({ frame, holo });

  const [state, action] = useActionState<ShopState, FormData>(
    dressShowcaseAction,
    SHOP_IDLE,
  );
  const [allState, allAction] = useActionState<ShopState, FormData>(
    dressAllShowcaseAction,
    SHOP_IDLE,
  );

  const reducedMotion = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const stopAnimation = useCallback(() => {
    running.current?.cancel();
    running.current = null;
    backdropRunning.current?.cancel();
    backdropRunning.current = null;
  }, []);

  const fadeBackdrop = useCallback(
    (
      element: HTMLDialogElement,
      frames_: [Keyframe, Keyframe],
      options: KeyframeAnimationOptions,
    ) => {
      try {
        backdropRunning.current = element.animate(frames_, {
          ...options,
          pseudoElement: "::backdrop",
        });
      } catch {
        backdropRunning.current = null;
      }
    },
    [],
  );

  const open = useCallback(() => {
    const element = dialog.current;
    const box = panel.current;
    const from = opener.current?.getBoundingClientRect();

    if (!element) return;

    stopAnimation();
    setPicked({ frame, holo });
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
  }, [fadeBackdrop, frame, holo, reducedMotion, stopAnimation]);

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
        if (running.current === animation) element.close();
      })
      .catch(() => {});
  }, [fadeBackdrop, reducedMotion, stopAnimation]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    const onClose = () => {
      running.current?.cancel();
      running.current = null;
      backdropRunning.current?.cancel();
      backdropRunning.current = null;
    };

    element.addEventListener("close", onClose);
    return () => element.removeEventListener("close", onClose);
  }, []);

  const pick = (next: { frame: string | null; holo: string | null }) => {
    setPicked(next);
    /*
     * Submit on the next frame, after React has written the new values
     * into the hidden inputs — requestSubmit reads the DOM, not state.
     */
    requestAnimationFrame(() => form.current?.requestSubmit());
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={open}
        aria-label={`Dress ${name}`}
        title="Change this card's border and holo"
        className="w-full shrink-0 cursor-pointer rounded-[7px] transition-transform duration-[var(--duration-base)] hover:ring-2 hover:ring-accent/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:scale-95"
      >
        <CosmeticCard
          imageUrl={imageUrl}
          name={name}
          number={number}
          imagesEnabled={imagesEnabled}
          frame={frame}
          holo={holo}
          effect={effect}
          className="w-full"
        />
      </button>

      <dialog
        ref={dialog}
        aria-label={`Dressing ${name}`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="m-auto max-h-[92dvh] w-[min(92vw,26rem)] overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-[2px]"
      >
        <div
          ref={panel}
          className="flex max-h-[88dvh] flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-5 text-text-primary"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-semibold">{name}</p>
              <p className="font-mono text-xs text-text-muted">{number}</p>
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

          {/* The card, big, wearing the picks as they land. */}
          <CosmeticCard
            imageUrl={imageUrl}
            name={name}
            number={number}
            imagesEnabled={imagesEnabled}
            frame={picked.frame}
            holo={picked.holo}
            effect={effect}
            className="mx-auto w-40"
          />

          {/* The saving form: hidden, submitted by every pick. */}
          <form ref={form} action={action} className="hidden">
            <input type="hidden" name="entryId" value={entryId} />
            <input type="hidden" name="frame" value={picked.frame ?? ""} />
            <input type="hidden" name="holo" value={picked.holo ?? ""} />
          </form>

          <DressingPicker
            imageUrl={imageUrl}
            name={name}
            number={number}
            imagesEnabled={imagesEnabled}
            frames={frames}
            holos={holos}
            frame={picked.frame}
            holo={picked.holo}
            effect={effect}
            onPick={pick}
          />

          <form action={allAction} className="border-t border-border pt-3">
            <input type="hidden" name="frame" value={picked.frame ?? ""} />
            <input type="hidden" name="holo" value={picked.holo ?? ""} />
            <ApplyAll saved={allState.status === "equipped"} />
          </form>

          <Status state={allState.status !== "idle" ? allState : state} />
        </div>
      </dialog>
    </>
  );
}

/** Its own component so useFormStatus reports on the right form. */
function ApplyAll({ saved }: { saved: boolean }) {
  /* The button narrates its own work - the founder's ask: press it and
     it says Applying, then Saved, right where the thumb already is. */
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-[var(--radius-control)] border border-border bg-elevated px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong disabled:opacity-70"
      >
        {pending ? "Applying…" : saved ? "Saved!" : "Apply to all cards"}
      </button>
      <p className="text-xs text-text-muted">
        Every card on your shelf wears this border and holo, and new cards will too.
      </p>
    </div>
  );
}

function Status({ state }: { state: ShopState }) {
  if (state.status === "idle") return null;

  return (
    <p
      role="status"
      className={cn(
        "text-sm",
        state.status === "error" ? "text-danger" : "text-success",
      )}
    >
      {state.status === "error"
        ? state.message
        : state.status === "equipped"
          ? `${state.name} updated.`
          : "Saved."}
    </p>
  );
}
