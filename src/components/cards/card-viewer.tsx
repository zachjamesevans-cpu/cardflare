"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, CircleHelp } from "lucide-react";

import { OtherMatch, PrintingChips, ScannedCard } from "@/components/cards/scan-card";
import { CardPicker } from "@/components/flares/card-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FullScreen } from "@/components/ui/full-screen";
import {
  FIND_THE_CARD,
  LEAVE_EMPTY,
  MIGHT_BE_THESE,
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
 *    card) and, on a page, Leave empty. A pocket the reader could not
 *    place shows what it might be first, "Might be one of these", the
 *    catalogue's closest cards to what it saw, then Find the card.
 * 3. Find the card is the Flare composer's own picker (`CardPicker`),
 *    presented the way the composer presents it, the read name already
 *    typed. The founder: the Flare screen's picker "down to the pixel",
 *    except that "it's just one card, so adding the card should close
 *    that screen." So it picks one card, and the tap closes it.
 * 4. On a page, the arrows, the keyboard's arrows and a swipe step to
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
  /**
   * An unread pocket only: the catalogue's closest cards to what the
   * reader saw, for "Might be one of these".
   */
  suggestions?: readonly { card: CardResult; printingId: string | null }[];
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
  /* Find the card: the picker over the card, until a card or Back. */
  const [picking, setPicking] = useState(false);

  const keys = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (!steps || picking) return;
    /* The search's field keeps its own arrows. */
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  };

  if (!item) return null;

  /* One screen throughout, so the picker swaps in without the dialog closing. */
  return (
    <FullScreen
      label={label}
      /* While picking, the X and Escape go back to the card, as Back does. */
      onClose={picking ? () => setPicking(false) : onClose}
      onKeyDown={keys}
    >
      {picking ? (
        /* As the Flare composer presents it: its column, in a Card. */
        <div className="mx-auto flex w-full max-w-2xl flex-col pt-10">
          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <CardPicker
              imagesEnabled={imagesEnabled}
              playerGames={playerGames}
              title={FIND_THE_CARD}
              initialQuery={item.lookFor}
              onPickOne={(card, printing) => {
                onChoose({ card, printingId: printing?.id ?? null });
                setPicking(false);
              }}
              onDone={() => setPicking(false)}
            />
          </Card>
        </div>
      ) : (
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
              onChoose={onChoose}
              onConfirm={onConfirm}
              onLeaveEmpty={onLeaveEmpty}
              onFind={() => setPicking(true)}
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
      )}
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
  onChoose,
  onConfirm,
  onLeaveEmpty,
  onFind,
}: {
  item: ViewerItem;
  imagesEnabled: boolean;
  onChoose: (choice: Choice) => void;
  onConfirm: () => void;
  onLeaveEmpty?: () => void;
  /** Find the card: the picker, over the card. */
  onFind: () => void;
}) {
  const { choice } = item;
  /* The menu's open part: the printings or the other guesses. */
  const [menu, setMenu] = useState<"printing" | "other" | null>(null);
  /* On a narrow screen, the face showing. */
  const [face, setFace] = useState<"photo" | "match">("match");
  const unsure = item.sure === false;
  const others = item.matches.filter((match) => match.card.id !== choice?.card.id);
  /* What an unread pocket might be: the catalogue's closest cards. */
  const suggestions = item.state === "unread" ? (item.suggestions ?? []) : [];
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

      {/*
       * A pocket the reader could not place: what it might be, each a
       * tap to choose, as a found pocket's other guesses are, the one
       * chosen lit. Over the menu, so Find the card stays below.
       */}
      {suggestions.length > 0 && (
        <Popover>
          <Guesses
            word={MIGHT_BE_THESE}
            guesses={suggestions}
            named
            chosen={choice?.card.id ?? null}
            imagesEnabled={imagesEnabled}
            onPick={choose}
          />
        </Popover>
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
            aria-expanded={menu === "other"}
            onClick={() => setMenu(menu === "other" ? null : "other")}
          >
            {NOT_THIS_CARD}
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onFind}>
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
            <Guesses
              word={OTHER_MATCHES}
              guesses={others}
              imagesEnabled={imagesEnabled}
              onPick={choose}
            />
          )}
          {/* The Flare composer's picker, over the card, the read name typed. */}
          <Button type="button" variant="secondary" onClick={onFind}>
            {FIND_THE_CARD}
          </Button>
        </Popover>
      )}
    </div>
  );
}

/** Other cards it could be, as small tiles under their heading; a tap chooses one. */
function Guesses({
  word,
  guesses,
  chosen = null,
  named = false,
  imagesEnabled,
  onPick,
}: {
  word: string;
  guesses: readonly { card: CardResult; printingId: string | null }[];
  /** The card the pocket has now, lit among them. */
  chosen?: string | null;
  /**
   * Suggestions: each with its name, in a row that wraps rather than
   * scrolls, as the app draws them.
   */
  named?: boolean;
  imagesEnabled: boolean;
  onPick: (choice: Choice) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-muted">{word}</p>
      <ul
        className={cn(
          "flex gap-2",
          named
            ? "flex-wrap"
            : "[scrollbar-width:none] overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden",
        )}
      >
        {guesses.map((match) => (
          <li key={match.card.id} className="shrink-0">
            <OtherMatch
              card={match.card}
              chosen={chosen === null ? undefined : match.card.id === chosen}
              named={named}
              imagesEnabled={imagesEnabled}
              onPick={() => onPick({ card: match.card, printingId: match.printingId })}
            />
          </li>
        ))}
      </ul>
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
