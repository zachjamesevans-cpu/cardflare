"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { EmberBadge } from "@/components/players/ember-badge";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * A player, looked at without leaving the room.
 *
 * The founder's ask: tapping somebody on the roster used to navigate to
 * their profile page, which is the one thing nobody at a trade table
 * wants — the room is where the deal is happening. So the tap opens a
 * popup instead: their picture wearing their frame, their badge, their
 * showcase, and a button to the full page for whoever actually wants to
 * leave.
 *
 * The showcase is fetched when the popup first opens, not with the room.
 * A roster of twelve would otherwise load twelve shelves of card images
 * on page load to serve the one somebody taps — the same economics as
 * the card zoom's lazy image, applied one level up.
 *
 * The dialog grows out of the row that was tapped, with the same timing
 * and easing as the card viewer, because two kinds of popup with two
 * kinds of movement would read as two different apps.
 */

/** Same movement as CardImageZoom, deliberately. */
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

interface PeekProfile {
  displayName: string;
  avatarUrl: string | null;
  embersEarned: number;
  frame: string | null;
  holo: string | null;
  effect: string | null;
  showcase: { id: string; name: string; number: string; imageUrl: string | null }[];
}

/** The mini profile shows exactly this many showcase slots, always. */
const PEEK_SHELF = 5;

export function PlayerPeek({
  playerId,
  displayName,
  seed,
  avatarUrl,
  frame,
  isYou = false,
  dimmed = false,
  imagesEnabled,
  className,
  nameClassName,
}: {
  playerId: string;
  displayName: string;
  seed: string;
  avatarUrl: string | null;
  frame: string | null;
  isYou?: boolean;
  /** Away players read as away on the trigger, same as before. */
  dimmed?: boolean;
  imagesEnabled: boolean;
  /** Extra classes for the trigger, so each surface controls its layout. */
  className?: string;
  /** Extra classes for the name, e.g. the board header's bolder face. */
  nameClassName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const running = useRef<Animation | null>(null);
  const backdropRunning = useRef<Animation | null>(null);

  /** Fetched once, kept for reopens — a shelf does not change mid-room. */
  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const requested = useRef(false);

  const load = useCallback(() => {
    if (requested.current) return;
    requested.current = true;

    void fetch(`/api/players/${encodeURIComponent(playerId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        setProfile((await response.json()) as PeekProfile);
      })
      .catch(() => {
        setFailed(true);
        /* Allow another attempt on the next open. */
        requested.current = false;
      });
  }, [playerId]);

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

  const open = useCallback(() => {
    const element = dialog.current;
    const box = panel.current;
    const from = opener.current?.getBoundingClientRect();

    if (!element) return;

    stopAnimation();
    setFailed(false);
    load();
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
  }, [fadeBackdrop, load, reducedMotion, stopAnimation]);

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

  /* A stale close animation must not survive into the next open. */
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

  const worn = profile;

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={open}
        className={cn(
          "flex min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
          className,
        )}
      >
        <PlayerAvatar
          displayName={displayName}
          seed={seed}
          avatarUrl={avatarUrl}
          frame={frame}
          size="sm"
          className={dimmed ? "opacity-50" : undefined}
        />
        <span className="min-w-0 flex-1 truncate text-text-secondary">
          <span
            className={cn(
              "underline-offset-4 hover:underline",
              !dimmed && "text-text-primary",
              nameClassName,
            )}
          >
            {displayName}
          </span>
          {isYou && <span className="font-normal text-text-muted"> · you</span>}
        </span>
      </button>

      <dialog
        ref={dialog}
        aria-label={`${displayName}'s profile`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="m-auto max-h-[92dvh] w-[min(92vw,24rem)] overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-[2px]"
      >
        <div
          ref={panel}
          className="flex max-h-[88dvh] flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-5 text-text-primary"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <PlayerAvatar
                displayName={displayName}
                seed={seed}
                avatarUrl={worn?.avatarUrl ?? avatarUrl}
                frame={worn?.frame ?? frame}
                className="size-14 text-lg"
              />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate font-semibold">{displayName}</p>
                {worn && <EmberBadge earned={worn.embersEarned} />}
              </div>
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

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-text-primary">Showcase</p>

            {failed ? (
              <p className="text-sm text-text-muted">
                Could not load their showcase right now. Their full profile may still
                work.
              </p>
            ) : !worn ? (
              <p className="text-sm text-text-muted">Loading their showcase…</p>
            ) : worn.showcase.length === 0 ? (
              <p className="text-sm text-text-muted">Nothing on their shelf yet.</p>
            ) : (
              /*
               * Exactly five slots, always — the founder's spec for the
               * mini profile. Five cards fit one row at the carousel's
               * own card width; the full shelf lives on the full
               * profile, which is what the button below is for. A
               * shorter shelf keeps its empty slots drawn, so five
               * cards and two cards occupy the same, evenly spaced row.
               */
              <ul className="grid grid-cols-5 gap-2">
                {worn.showcase.slice(0, PEEK_SHELF).map((entry) => (
                  <li key={entry.id}>
                    {/* The board's viewer again, opened from the dressed
                        card — the same tap does the same thing here as
                        everywhere else. */}
                    <CardImageZoom
                      imageUrl={entry.imageUrl}
                      exactName={entry.name}
                      cardNumber={entry.number}
                      enabled={imagesEnabled}
                      thumbClassName="w-full"
                      thumb={
                        <CosmeticCard
                          imageUrl={entry.imageUrl}
                          name={entry.name}
                          number={entry.number}
                          imagesEnabled={imagesEnabled}
                          frame={worn.frame}
                          holo={worn.holo}
                          effect={worn.effect}
                          className="w-full"
                        />
                      }
                    />
                  </li>
                ))}
                {Array.from({
                  length: Math.max(0, PEEK_SHELF - worn.showcase.length),
                }).map((_, index) => (
                  <li key={`empty-${index}`} aria-hidden="true">
                    <span className="block aspect-[60/84] w-full rounded-[6px] border border-dashed border-border" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link href={`/p/${playerId}`} className={buttonStyles("secondary", "sm")}>
            View full profile
          </Link>
        </div>
      </dialog>
    </>
  );
}
