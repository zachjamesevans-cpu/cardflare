"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, CircleHelp } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { OtherMatch, PrintingChips, ScannedCard } from "@/components/cards/scan-card";
import { Button } from "@/components/ui/button";
import { FullScreen } from "@/components/ui/full-screen";
import {
  FIND_THE_CARD,
  LEAVE_EMPTY,
  NOT_SURE,
  NOT_THIS_CARD,
  OTHER_MATCHES,
  OTHER_PRINTING,
  OUR_MATCH,
  POCKETS_PER_PAGE,
  POCKET_EMPTY,
  POCKET_TAKEN,
  POCKET_UNREAD,
  THATS_IT,
  YOUR_PHOTO,
} from "@/lib/cards/scan-rules";
import type { CardResult } from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * The card viewer: one scanned card, full screen, and what to do with
 * it. The founder (2026-10-09): "instead of clicking them and scrolling
 * down to see which card was selected, it should just have a popup full
 * card viewer and a contextual menu there. i didn't even know i had to
 * scroll down." Used by both the single scan's answer and the page
 * check, so the two ask the same question the same way, as the app's
 * viewer does:
 *
 * 1. "Your photo" beside "Our match", the match's name and number under
 *    it; on a narrow screen one at a time, a tap flipping between them.
 *    "Not sure. Check this one." and the reader's note on top when the
 *    careful reader was unsure; the note under the match otherwise.
 * 2. The menu, in this order: That's it, Other printing (the printing
 *    chips), Not this card (the other guesses as tiles, then Find the
 *    card, the search with the read name already typed) and, on a page,
 *    Leave empty.
 * 3. On a page, the arrows, the keyboard's arrows and a swipe step to
 *    the pocket before or after, across every page; "Page 4" and nine
 *    dots say where. That's it keeps the card and steps on.
 *
 * Every word is from scan-rules.ts, which the app mirrors.
 */

/** The card a pocket or a scan will be added with; null leaves it empty. */
export type Choice = { card: CardResult; printingId: string | null } | null;

/** One card to look at. */
export interface ViewerItem {
  key: string;
  /** Where it sits on a scanned page; null for a single card. */
  place: { page: number; slot: number } | null;
  /** The player's own photo of it. */
  photo: string | null;
  /** The card it will be added as. */
  choice: Choice;
  /** The reader's guesses, best first. */
  matches: readonly { card: CardResult; printingId: string | null }[];
  /** A card read, one that could not be, or a pocket with nothing in it. */
  state: "found" | "unread" | "empty";
  /** False when the careful reader was not sure. */
  sure?: boolean;
  /** How it decided, in a few words. */
  note?: string;
  /** The name read off the card, for the search. */
  lookFor: string;
  /** The binder already has a card in this pocket. */
  taken?: boolean;
}

/** How far a finger has to travel sideways to step to the next card. */
export const SWIPE_PX = 48;

export function CardViewer({
  label,
  items,
  at,
  onAt,
  imagesEnabled,
  playerGames,
  onChoose,
  onConfirm,
  onLeaveEmpty,
  onClose,
}: {
  /** What a screen reader hears the viewer called. */
  label: string;
  items: readonly ViewerItem[];
  /** The one on screen. */
  at: number;
  onAt: (at: number) => void;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  /** Another guess, printing or searched card for the one on screen. */
  onChoose: (choice: Choice) => void;
  /** That's it. */
  onConfirm: () => void;
  /** A page's pocket only: nothing goes in it. */
  onLeaveEmpty?: () => void;
  /** Back to the camera, or to the check's grid. */
  onClose: () => void;
}) {
  const item = items[at];
  const steps = items.length > 1;
  const step = (by: -1 | 1) => {
    const next = at + by;
    if (next >= 0 && next < items.length) onAt(next);
  };
  const touch = useRef<{ x: number; y: number } | null>(null);

  const keys = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (!steps) return;
    /* The search's field keeps its own arrows. */
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  };

  if (!item) return null;

  return (
    <FullScreen label={label} onClose={onClose} onKeyDown={keys}>
      <div
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 pt-10"
        onTouchStart={(event) => {
          const finger = event.touches[0];
          touch.current = finger ? { x: finger.clientX, y: finger.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const from = touch.current;
          const finger = event.changedTouches[0];
          touch.current = null;
          if (!steps || !from || !finger) return;
          const dx = finger.clientX - from.x;
          const dy = finger.clientY - from.y;
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
          step(dx < 0 ? 1 : -1);
        }}
      >
        {item.place && <Whereabouts page={item.place.page} slot={item.place.slot} />}

        <div className="flex items-center gap-2">
          {steps && (
            <StepArrow label="Previous" disabled={at === 0} onClick={() => step(-1)}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </StepArrow>
          )}
          {/* Keyed by the card, so a new card starts with the menu shut. */}
          <Shown
            key={item.key}
            item={item}
            imagesEnabled={imagesEnabled}
            playerGames={playerGames}
            onChoose={onChoose}
            onConfirm={onConfirm}
            onLeaveEmpty={onLeaveEmpty}
          />
          {steps && (
            <StepArrow
              label="Next"
              disabled={at === items.length - 1}
              onClick={() => step(1)}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </StepArrow>
          )}
        </div>
      </div>
    </FullScreen>
  );
}

/** "Page 4" and nine dots, the one on screen lit. */
function Whereabouts({ page, slot }: { page: number; slot: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <h2 className="text-sm font-semibold text-text-primary tabular-nums">
        Page {page}
      </h2>
      <ol aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: POCKETS_PER_PAGE }, (_, dot) => (
          <li
            key={dot}
            className={cn(
              "size-1.5 rounded-full",
              dot === slot ? "bg-accent" : "bg-border-strong",
            )}
          />
        ))}
      </ol>
    </div>
  );
}

function StepArrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 shrink-0 cursor-pointer items-center justify-center self-start rounded-full border border-border bg-elevated text-text-primary transition-colors hover:border-border-strong disabled:cursor-default disabled:opacity-30 sm:mt-40"
    >
      {children}
    </button>
  );
}

/** One card: the two faces, the reader's doubts, and the menu. */
function Shown({
  item,
  imagesEnabled,
  playerGames,
  onChoose,
  onConfirm,
  onLeaveEmpty,
}: {
  item: ViewerItem;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  onChoose: (choice: Choice) => void;
  onConfirm: () => void;
  onLeaveEmpty?: () => void;
}) {
  const { choice } = item;
  /* The menu's open part: the printings, the other guesses, or the search. */
  const [menu, setMenu] = useState<"printing" | "other" | "search" | null>(null);
  /* On a narrow screen, the face showing. */
  const [face, setFace] = useState<"photo" | "match">("match");
  const unsure = item.sure === false;
  const others = item.matches.filter((match) => match.card.id !== choice?.card.id);
  const choose = (next: Choice) => {
    onChoose(next);
    setMenu(null);
    setFace("match");
  };
  const flip = () => item.photo && setFace(face === "match" ? "photo" : "match");

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {unsure && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="flex items-start gap-1.5 text-text-secondary">
            <CircleHelp
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            {NOT_SURE}
          </p>
          {item.note && <p className="text-xs text-text-muted">{item.note}</p>}
        </div>
      )}
      {item.taken && (
        <p className="flex items-start gap-1.5 text-sm text-text-secondary">
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          {POCKET_TAKEN}
        </p>
      )}

      {/* On a narrow screen the two faces take turns: these say which. */}
      {item.photo && (
        <div
          role="group"
          className="grid grid-cols-2 gap-1 self-center rounded-full border border-border bg-surface p-1 sm:hidden"
        >
          {(
            [
              ["photo", YOUR_PHOTO],
              ["match", OUR_MATCH],
            ] as const
          ).map(([id, word]) => (
            <button
              key={id}
              type="button"
              aria-pressed={face === id}
              onClick={() => setFace(id)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors",
                face === id
                  ? "bg-elevated text-text-primary"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {word}
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid gap-4", item.photo && "sm:grid-cols-2")}>
        {item.photo && (
          <Face word={YOUR_PHOTO} showing={face === "photo"}>
            <button
              type="button"
              onClick={flip}
              className="block w-full max-w-64 cursor-pointer sm:cursor-default"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photo}
                alt={YOUR_PHOTO}
                className="aspect-[63/88] w-full rounded-[8px] border border-border bg-black object-contain"
              />
            </button>
          </Face>
        )}
        <Face word={OUR_MATCH} showing={!item.photo || face === "match"}>
          {choice ? (
            <button
              type="button"
              onClick={flip}
              disabled={!item.photo}
              className="block w-full cursor-pointer disabled:cursor-default sm:cursor-default"
            >
              <ScannedCard
                card={choice.card}
                printingId={choice.printingId}
                imagesEnabled={imagesEnabled}
                className="w-full max-w-64"
              />
            </button>
          ) : (
            <div className="flex aspect-[63/88] w-full max-w-64 items-center justify-center rounded-[8px] border border-dashed border-border-strong bg-surface px-4 text-center">
              {item.state === "unread" ? (
                <span className="flex flex-col items-center gap-2">
                  <span className="text-4xl font-semibold text-text-secondary">?</span>
                  <span className="text-sm text-text-primary">{POCKET_UNREAD}</span>
                </span>
              ) : (
                <span className="text-sm text-text-muted">{POCKET_EMPTY}</span>
              )}
            </div>
          )}
        </Face>
      </div>

      {/* The reader's own words on how it decided, under its guess. */}
      {!unsure && item.note && (
        <p className="text-center text-xs text-text-muted">{item.note}</p>
      )}

      {/* The menu, in the app's order. */}
      <div className="flex flex-wrap justify-center gap-2">
        {(choice || item.state === "empty") && (
          <Button type="button" onClick={onConfirm}>
            {THATS_IT}
          </Button>
        )}
        {choice && choice.card.printings.length > 1 && (
          <Button
            type="button"
            variant="secondary"
            aria-expanded={menu === "printing"}
            onClick={() => setMenu(menu === "printing" ? null : "printing")}
          >
            {OTHER_PRINTING}
          </Button>
        )}
        {choice ? (
          <Button
            type="button"
            variant="secondary"
            aria-expanded={menu === "other" || menu === "search"}
            onClick={() => setMenu(menu === "other" ? null : "other")}
          >
            {NOT_THIS_CARD}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            aria-expanded={menu === "search"}
            onClick={() => setMenu(menu === "search" ? null : "search")}
          >
            {FIND_THE_CARD}
          </Button>
        )}
        {onLeaveEmpty && choice && (
          <Button type="button" variant="ghost" onClick={onLeaveEmpty}>
            {LEAVE_EMPTY}
          </Button>
        )}
      </div>

      {menu === "printing" && choice && (
        <Popover>
          <PrintingChips
            card={choice.card}
            printingId={choice.printingId}
            onPrinting={(printingId) => choose({ card: choice.card, printingId })}
          />
        </Popover>
      )}

      {menu === "other" && (
        <Popover>
          {others.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-muted">{OTHER_MATCHES}</p>
              <ul className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
                {others.map((match) => (
                  <li key={match.card.id} className="shrink-0">
                    <OtherMatch
                      card={match.card}
                      imagesEnabled={imagesEnabled}
                      onPick={() =>
                        choose({ card: match.card, printingId: match.printingId })
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button type="button" variant="secondary" onClick={() => setMenu("search")}>
            {FIND_THE_CARD}
          </Button>
        </Popover>
      )}

      {/* The site's own search, the read name already typed. */}
      {menu === "search" && (
        <Popover>
          <CardSearch
            imagesEnabled={imagesEnabled}
            playerGames={playerGames}
            autoFocus
            initialQuery={item.lookFor}
            onSelect={(card, printing) =>
              choose({ card, printingId: printing?.id ?? null })
            }
          />
        </Popover>
      )}
    </div>
  );
}

/** One of the two faces, under its name; on a narrow screen, only the one showing. */
function Face({
  word,
  showing,
  children,
}: {
  word: string;
  showing: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={word}
      className={cn("flex-col items-center gap-2", showing ? "flex" : "hidden sm:flex")}
    >
      <h3 className="hidden text-xs font-semibold tracking-wide text-text-muted uppercase sm:block">
        {word}
      </h3>
      {children}
    </section>
  );
}

/** The menu's open part, under its buttons. */
function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-panel)]">
      {children}
    </div>
  );
}
