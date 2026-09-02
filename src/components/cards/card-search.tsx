"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight, Loader2, Lock, Search } from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { TextInput } from "@/components/ui/controls";
import { Card } from "@/components/ui/card";
import { searchCardsAction } from "@/lib/cards/actions";
import {
  ALL_GAMES,
  resolveGameScope,
  searchPlaceholder,
  type GameScope,
} from "@/lib/cards/game-scope";
import { gameShortName, type GameSlug } from "@/lib/players/games-catalog";
import { parseCardQuery } from "@/lib/cards/query";
import {
  highlightParts,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  pickBasePrinting,
  printingLabel,
  type CardPrinting,
  type CardResult,
} from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * Long enough that a phone keyboard's word-at-a-time typing does not fire a
 * query per character, short enough that the list feels live.
 */
const DEBOUNCE_MS = 250;

type Status = "idle" | "loading" | "ready" | "empty" | "pool-empty" | "error";

/** Where this device keeps the chip the reader last tapped. */
const REMEMBERED_GAME_KEY = "cf-search-game";

function rememberedGame(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED_GAME_KEY);
  } catch {
    return null;
  }
}

/*
 * The remembered chip as an external store, so the component reads it
 * with `useSyncExternalStore` — the server snapshot is null, the first
 * client paint matches it, and no effect has to set state to catch up.
 */
const rememberedListeners = new Set<() => void>();

function subscribeRemembered(listener: () => void): () => void {
  rememberedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    rememberedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function rememberGame(value: string): void {
  try {
    window.localStorage.setItem(REMEMBERED_GAME_KEY, value);
  } catch {
    /* Private mode, or storage refused: the choice lasts the page. */
  }
  for (const listener of rememberedListeners) listener();
}

/**
 * The game chips above the search.
 *
 * The same chip as the composer's trade/cash toggles — rounded, accent
 * border and tint when on, muted when off — so the search stops being
 * the one control with its own look. One row that wraps, "All games"
 * first, the reader's own games next, the rest after.
 *
 * Locked (inside a room scanned from a tournament's screen) the row is
 * one chip with a lock on it and nothing to tap: the code decided.
 */
function GameChips({
  scope,
  onPick,
}: {
  scope: GameScope;
  onPick: (game: GameSlug | null) => void;
}) {
  const base =
    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors";
  const on = "border-accent bg-accent/15 text-text-primary";
  const off = "border-border text-text-muted hover:text-text-secondary";

  if (scope.locked && scope.selected) {
    return (
      <p className="flex flex-wrap gap-2" aria-label="Search scope">
        <span className={cn(base, on)}>
          <Lock className="size-3.5 text-accent" aria-hidden="true" />
          {gameShortName(scope.selected)} cards only
        </span>
      </p>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Which game to search"
      className="flex flex-wrap gap-2"
    >
      <button
        type="button"
        role="radio"
        aria-checked={scope.selected === null}
        onClick={() => onPick(null)}
        className={cn(base, scope.selected === null ? on : off)}
      >
        All games
      </button>
      {scope.chips.map((game) => {
        const active = scope.selected === game;
        return (
          <button
            key={game}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(game)}
            className={cn(base, active ? on : off)}
          >
            {gameShortName(game)}
          </button>
        );
      })}
    </div>
  );
}

function Highlighted({ text, term }: { text: string; term: string }) {
  return (
    <>
      {highlightParts(text, term).map((part, index) =>
        part.match ? (
          <mark key={index} className="bg-accent/25 text-text-primary">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** The stats that apply differ by card type, so only present ones render. */
function Stats({ card }: { card: CardResult }) {
  const stats = [
    card.cost !== null && { label: "Cost", value: card.cost },
    card.life !== null && { label: "Life", value: card.life },
    card.power !== null && { label: "Power", value: card.power },
    card.counter ? { label: "Counter", value: card.counter } : false,
  ].filter(Boolean) as { label: string; value: number }[];

  if (stats.length === 0) return null;

  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {stats.map((stat) => (
        <div key={stat.label} className="flex gap-1">
          <dt className="text-text-muted">{stat.label}</dt>
          <dd className="text-text-secondary tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every printing of a card, revealed on request.
 *
 * A card number is one gameplay identity but can be several physical cards —
 * OP12-034 Perona exists as a base art and an alternate art, and which one
 * someone is hunting is the entire point of a trade. They used to render as
 * chips inside every result row, which on a phone wrapped into a scattered
 * column of artwork and made five Peronas read as five unrelated cards. The
 * founder called it clutter, and it was: the list's job is "which card",
 * and "which version" is a question for after that — the Flare form asks it
 * properly, and this list answers it on a tap for the curious.
 */
function PrintingList({
  card,
  imagesEnabled,
  onPick,
  composerFor = null,
  composer = null,
}: {
  card: CardResult;
  imagesEnabled: boolean;
  /** The printing id whose row is currently hosting the composer. */
  composerFor?: string | null;
  /** Rendered under that row, so the controls land under the thumb. */
  composer?: React.ReactNode;
  /**
   * Supplied when the search is a picker. Tapping a version then selects the
   * card *with that printing*, so someone hunting the parallel art is not
   * made to pick the card, open a dropdown, and find the art a second time.
   */
  onPick?: (printing: CardPrinting) => void;
}) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Versions">
      {card.printings.map((printing, index) => {
        const label = printingLabel(printing, card.exactName) ?? "Standard printing";

        const hosting = composerFor === printing.id;

        return (
          <li
            key={`${printing.setCode}-${printing.rarity}-${index}`}
            className={cn(
              "rounded-[var(--radius-control)] border bg-elevated",
              hosting ? "border-accent/50" : "border-border",
            )}
          >
            <div className="flex items-center gap-2.5 px-1.5 py-1.5">
              {/*
               * The art is its own control, so an alternate art can be
               * looked at properly before it is chosen. That is the whole
               * reason somebody opened this list.
               */}
              {/*
               * Boxed to a fixed width on purpose. `thumbClassName` makes
               * the zoom's own button `w-full` — right for the carousel,
               * where the tile is art-first — so without this wrapper the
               * picture swallows the row and the label it sits beside
               * collapses to nothing. Measured: 342px of art, 0px of text.
               */}
              <span className="w-9 shrink-0">
                <CardImageZoom
                  imageUrl={printing.imageUrl}
                  exactName={card.exactName}
                  cardNumber={card.canonicalCardNumber}
                  enabled={imagesEnabled}
                  caption={label}
                  thumbClassName="w-full"
                />
              </span>

              {onPick ? (
                <button
                  type="button"
                  onClick={() => onPick(printing)}
                  aria-expanded={composer ? hosting : undefined}
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] py-1 text-left text-xs leading-snug text-text-secondary transition-colors hover:text-text-primary"
                >
                  {label}
                </button>
              ) : (
                <span className="min-w-0 flex-1 text-left text-xs leading-snug text-text-secondary">
                  {label}
                </span>
              )}
            </div>

            {/* Attached to this exact version, which is the point. */}
            {hosting && composer}
          </li>
        );
      })}
    </ul>
  );
}

function Row({
  card,
  term,
  imagesEnabled,
  active,
  onSelect,
  id,
  composerFor = null,
  composer = null,
}: {
  card: CardResult;
  term: string;
  imagesEnabled: boolean;
  active: boolean;
  onSelect?: (card: CardResult, printing?: CardPrinting) => void;
  id: string;
  /**
   * Where the composer belongs in this result, if anywhere: `""` for the
   * card itself (any printing), or a printing id for one version.
   */
  composerFor?: string | null;
  composer?: React.ReactNode;
}) {
  /*
   * The headline is the base printing, not whichever set code sorted first —
   * otherwise a card whose alternate art happens to come from an earlier set
   * leads with the alternate art. Unless the QUERY asked for a version:
   * "zoro manga" fronts each card's manga art, which is what the person
   * typing it is trying to look at.
   */
  const ask = parseCardQuery(term).filters.variant;
  const printing = pickBasePrinting(card.printings, card.exactName, ask);
  const label = printing ? printingLabel(printing, card.exactName) : null;
  const manyPrintings = card.printings.length > 1;

  /*
   * Collapsed by default, per founder feedback: one card, one row, base art.
   * A sibling of the select button rather than a child — a button inside a
   * button is invalid HTML, and the two answer different questions.
   */
  const [showVersions, setShowVersions] = useState(false);

  /* Folding the list shut while it holds the open composer would take the
     controls out from under the thumb that just used them. */
  const versionsOpen = showVersions || Boolean(composer && composerFor);

  /*
   * One quiet line under the name: number, type, colours — and the printing
   * label when there is only one. These used to float in their own column on
   * the right, which at phone width read as debris orbiting the row.
   */
  // No separate rarity element: `printingLabel` already carries it, and the
  // old row printed it twice.
  const meta = [
    manyPrintings ? null : label,
    card.cardType,
    card.colors.length > 0 ? card.colors.join(" / ") : null,
  ].filter((part): part is string => !!part);

  return (
    /*
     * One card, one block, every block the same. The founder's ask was
     * to bring the board's own language up here: a bordered block with a
     * header and a chevron that folds more open is what a deck folder, a
     * player's nest and the posting form's details all already look
     * like, so the search stops being the one screen with its own rules.
     */
    <li
      id={id}
      role="option"
      aria-selected={active}
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-surface transition-colors",
        active || (composer && composerFor !== null)
          ? "border-accent/50 bg-accent/[0.06]"
          : "border-border",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {/*
         * The art is its own button now, not part of the select target.
         * The founder's report: you could not look at a card properly
         * from search, which is exactly where you most want to, because
         * the thumbnail lived inside the row's button and a button
         * cannot hold another one.
         */}
        <CardImageZoom
          imageUrl={printing?.imageUrl ?? null}
          exactName={card.exactName}
          cardNumber={card.canonicalCardNumber}
          enabled={imagesEnabled}
          caption={label}
        />

        <button
          type="button"
          onClick={() => onSelect?.(card)}
          aria-expanded={composer ? composerFor === "" : undefined}
          /* Comfortably past 44px tall: a phone target at a busy counter. */
          className="flex min-w-0 flex-1 flex-col gap-1 self-stretch rounded-[var(--radius-control)] text-left"
        >
          <p className="truncate font-semibold text-text-primary">
            <Highlighted text={card.exactName} term={term} />
          </p>

          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-text-muted">
            <span>
              <Highlighted text={card.canonicalCardNumber} term={term} />
            </span>
            {meta.map((part) => (
              <span key={part} className="font-sans">
                {part}
              </span>
            ))}
          </p>

          <Stats card={card} />
        </button>
      </div>

      {/* Opened from the header, so it appears right below it. */}
      {composerFor === "" && composer}

      {manyPrintings && (
        <>
          <button
            type="button"
            onClick={() => setShowVersions((value) => !value)}
            aria-expanded={versionsOpen}
            className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2.5 text-left text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 text-accent transition-transform duration-[var(--duration-base)]",
                versionsOpen && "rotate-90",
              )}
            />
            <span className="min-w-0 flex-1">
              {card.printings.length} versions, alt arts and promos
            </span>
          </button>

          {versionsOpen && (
            <div className="flex flex-col gap-2 border-t border-border p-3">
              {onSelect && (
                <p className="text-xs text-text-muted">
                  Tap a version to ask for that exact one, or the card above to take any
                  printing. Tap any picture to see it full size.
                </p>
              )}
              <PrintingList
                card={card}
                imagesEnabled={imagesEnabled}
                onPick={onSelect && ((printing) => onSelect(card, printing))}
                composerFor={composerFor}
                composer={composer}
              />
            </div>
          )}
        </>
      )}
    </li>
  );
}

export interface CardSearchProps {
  /** Resolved on the server from NEXT_PUBLIC_ENABLE_CARD_IMAGES. */
  imagesEnabled: boolean;
  /**
   * The room's TCG, when the scan said which one. A player who scanned
   * the One Piece tournament's screen searches One Piece cards and
   * nothing else — the whole point of a per-tournament code. Locks the
   * scope: no chips, no widening.
   */
  game?: string | null;
  /**
   * The games the reader said they play at sign-up, in the founder's
   * order. The first is pre-selected and they lead the chip row, so a
   * One Piece player never has to say "One Piece" before searching.
   */
  playerGames?: readonly string[];
  /**
   * Supplied when the search is being used to pick a card. The printing is
   * present only when a specific version was tapped from the expanded list —
   * a plain row tap means "any printing", which stays the default ask.
   */
  onSelect?: (card: CardResult, printing?: CardPrinting) => void;
  autoFocus?: boolean;
  /**
   * A panel to render inside the result that is currently selected,
   * rather than in place of the whole list.
   *
   * The founder's ask: posting a Flare should not send a thumb across
   * the screen. Search knows where the tapped row is; the caller knows
   * what the panel contains. This is the seam between those two.
   */
  composer?: React.ReactNode;
  /**
   * Which result hosts it: `cardId` for any printing, or
   * `cardId + ":" + printingId` for one version. Null closes it.
   */
  composerKey?: string | null;
  /**
   * Bumped by the caller to clear the query and the results.
   *
   * Posting a Flare finishes with the search still showing whatever was
   * typed, often with an alternate-art list hanging open under the card
   * that was just posted. That reads as unfinished. The caller owns
   * "what just happened", so it owns the reset; the same signal pattern
   * the app's post screen already uses.
   */
  resetSignal?: number;
}

/**
 * Reusable card search and selection.
 *
 * Debounced against the local catalog — never the provider. Behaves as a
 * combobox: arrow keys move through results, Enter selects, Escape clears, and
 * the active option is announced through `aria-activedescendant`.
 */
export function CardSearch({
  imagesEnabled,
  game = null,
  playerGames = [],
  onSelect,
  autoFocus = false,
  composer = null,
  composerKey = null,
  resetSignal = 0,
}: CardSearchProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  /*
   * The scope: the room's game when there is one, else the chip tapped
   * last on this device, else the reader's first sign-up game. The
   * remembered chip is read in an effect rather than during render,
   * because localStorage does not exist on the server and the first
   * paint must match it.
   */
  const remembered = useSyncExternalStore(
    subscribeRemembered,
    rememberedGame,
    () => null,
  );

  const scope = resolveGameScope({ roomGame: game, playerGames, remembered });
  const scopedGame = scope.selected;

  const pickGame = (picked: GameSlug | null) => {
    rememberGame(picked ?? ALL_GAMES);
  };

  /*
   * Which query the reader explicitly widened. Keyed to the query
   * rather than held as a flag so typing anything folds the list back
   * to the short view without an effect having to watch for it.
   */
  const [showAllFor, setShowAllFor] = useState<string | null>(null);

  /**
   * The last response, and which query produced it.
   *
   * Held as one value so "are we still waiting" is derived by comparing it to
   * the current input, rather than tracked as a separate flag that has to be
   * kept in step. Nothing is set synchronously inside the effect — doing that
   * triggers a cascading render, and React will tell you so.
   */
  const [settled, setSettled] = useState<{
    query: string;
    kind: Exclude<Status, "idle" | "loading">;
    results: CardResult[];
    message: string | null;
  } | null>(null);

  const listId = useId();
  const inputId = useId();
  /* Guards against an earlier, slower response overwriting a later one. */
  const requestId = useRef(0);

  /*
   * Skips the first run: a mounted, empty search does not need clearing,
   * and doing it anyway would wipe a query typed before hydration.
   */
  const lastReset = useRef(resetSignal);

  useEffect(() => {
    if (resetSignal === lastReset.current) return;
    lastReset.current = resetSignal;
    setQuery("");
    setSettled(null);
    setActive(0);
    setShowAllFor(null);
  }, [resetSignal]);

  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;

  const status: Status = tooShort
    ? "idle"
    : settled?.query === trimmed
      ? settled.kind
      : "loading";

  const results = status === "ready" && settled ? settled.results : [];
  const term = settled?.query ?? "";

  /*
   * Three results, until more are asked for.
   *
   * The founder's report: searching "luffy" quintupled the page, and a
   * wall of twenty expanded blocks is not how anybody reads results —
   * the right card is almost always in the first few, because the
   * ranking is the feature. Keyboard movement and the aria wiring below
   * all run against this visible list, so the arrow keys cannot walk
   * into rows that are not on screen.
   */
  const SHORT_LIST = 3;
  const expanded = showAllFor === term;
  const visible = expanded ? results : results.slice(0, SHORT_LIST);
  const hidden = results.length - visible.length;

  useEffect(() => {
    if (tooShort) return;

    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      const response = await searchCardsAction(trimmed, { game: scopedGame });

      // A response from a superseded keystroke is discarded.
      if (id !== requestId.current) return;

      setActive(0);

      if (response.status === "ok") {
        setSettled({
          query: trimmed,
          kind: response.poolEmpty
            ? "pool-empty"
            : response.results.length === 0
              ? "empty"
              : "ready",
          results: response.results,
          message: null,
        });
        return;
      }

      setSettled({
        query: trimmed,
        kind: "error",
        results: [],
        message: response.message,
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, tooShort, scopedGame]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      return;
    }
    if (visible.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % visible.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + visible.length) % visible.length);
    } else if (event.key === "Enter" && onSelect) {
      event.preventDefault();
      const card = visible[active];
      if (card) onSelect(card);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          Card name or number
        </label>

        <GameChips scope={scope} onPick={pickGame} />

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted"
          />
          <TextInput
            id={inputId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={MAX_QUERY_LENGTH}
            placeholder={searchPlaceholder(scopedGame)}
            className="pr-10 pl-10"
            role="combobox"
            aria-expanded={status === "ready"}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              status === "ready" ? `${listId}-${active}` : undefined
            }
            aria-describedby={`${inputId}-hint`}
          />
          {status === "loading" && (
            <Loader2
              aria-hidden="true"
              className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-text-muted"
            />
          )}
        </div>

        <p id={`${inputId}-hint`} className="text-xs text-text-muted">
          Misspellings are fine, and card numbers work with or without the dash. Add a
          colour, a type or a set to narrow it: &ldquo;luffy leader&rdquo;.
        </p>
      </div>

      {/* Announced politely, so a screen reader hears the count change. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status === "ready" ? `${results.length} cards found` : ""}
        {status === "empty" ? "No matching cards found" : ""}
      </p>

      {status === "error" && (
        <div
          role="alert"
          className="rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {settled?.message}
        </div>
      )}

      {status === "pool-empty" && (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-text-secondary">No cards have been loaded yet.</p>
          <p className="max-w-sm text-sm text-text-muted">
            Card search works as soon as the catalog is synchronised. Nothing is wrong
            with what you typed.
          </p>
        </Card>
      )}

      {status === "empty" && (
        <Card className="py-8 text-center text-text-secondary">
          {scopedGame
            ? `No matching ${gameShortName(scopedGame)} cards found. Check the name or card number${scope.locked ? "" : ", or try All games"}.`
            : "No matching cards found. Check the name or card number and try again."}
        </Card>
      )}

      {status === "ready" && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Card results"
          className="flex flex-col gap-2"
        >
          {visible.map((card, index) => {
            /* "" is the card itself; anything else names one printing. */
            const [keyCard, keyPrinting] = (composerKey ?? "").split(":");
            const mine = composerKey !== null && keyCard === card.id;

            return (
              <Row
                key={card.id}
                id={`${listId}-${index}`}
                card={card}
                term={term}
                imagesEnabled={imagesEnabled}
                active={index === active}
                onSelect={onSelect}
                composerFor={mine ? (keyPrinting ?? "") : null}
                composer={mine ? composer : null}
              />
            );
          })}

          {hidden > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowAllFor(term)}
                className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-border py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <ChevronDown aria-hidden="true" className="size-4 text-accent" />
                View {hidden} more {hidden === 1 ? "result" : "results"}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
