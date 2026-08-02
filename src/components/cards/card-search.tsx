"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { TextInput } from "@/components/ui/controls";
import { Badge, Card } from "@/components/ui/card";
import { searchCardsAction } from "@/lib/cards/actions";
import {
  highlightParts,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  printingLabel,
  type CardResult,
} from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * Long enough that a phone keyboard's word-at-a-time typing does not fire a
 * query per character, short enough that the list feels live.
 */
const DEBOUNCE_MS = 250;

type Status = "idle" | "loading" | "ready" | "empty" | "pool-empty" | "error";

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
 * Every printing of a card, side by side.
 *
 * A card number is one gameplay identity but can be several physical cards —
 * OP12-034 Perona exists as a base art and an alternate art, and which one
 * someone is hunting is the entire point of a trade. Showing only the first
 * printing hid the other completely.
 *
 * Not interactive: the whole row is already a button, and a button inside a
 * button is invalid. Choosing a specific printing belongs with Flares, where
 * there is something to choose it *for*.
 */
function PrintingStrip({
  card,
  imagesEnabled,
  term,
}: {
  card: CardResult;
  imagesEnabled: boolean;
  term: string;
}) {
  return (
    <ul className="mt-1 flex flex-wrap gap-2" aria-label="Printings">
      {card.printings.map((printing, index) => (
        <li
          key={`${printing.setCode}-${printing.rarity}-${index}`}
          className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated py-1 pr-2.5 pl-1"
        >
          <CardThumbnail
            imageUrl={printing.imageUrl}
            exactName={card.exactName}
            cardNumber={card.canonicalCardNumber}
            enabled={imagesEnabled}
            className="w-8"
          />
          <span className="text-xs text-text-secondary">
            {printingLabel(printing, card.exactName) ?? (
              <Highlighted text={card.canonicalCardNumber} term={term} />
            )}
          </span>
        </li>
      ))}
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
}: {
  card: CardResult;
  term: string;
  imagesEnabled: boolean;
  active: boolean;
  onSelect?: (card: CardResult) => void;
  id: string;
}) {
  const printing = card.printings[0];
  const label = printing ? printingLabel(printing, card.exactName) : null;
  // With several printings the strip below carries the detail, so repeating
  // the first one's label and the card's rarity up here only adds noise.
  const manyPrintings = card.printings.length > 1;

  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      className={cn(
        "rounded-[var(--radius-control)] border transition-colors",
        active ? "border-accent/50 bg-accent/[0.06]" : "border-transparent",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect?.(card)}
        /* Comfortably past 44px tall: a phone target at a busy counter. */
        className="flex w-full items-center gap-3 px-2 py-3 text-left"
      >
        <CardThumbnail
          imageUrl={printing?.imageUrl ?? null}
          exactName={card.exactName}
          cardNumber={card.canonicalCardNumber}
          enabled={imagesEnabled}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-semibold text-text-primary">
            <Highlighted text={card.exactName} term={term} />
          </p>

          <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-text-muted">
            <span>
              <Highlighted text={card.canonicalCardNumber} term={term} />
            </span>
            {manyPrintings ? (
              <span className="font-sans">{card.printings.length} versions</span>
            ) : (
              <>
                {label && <span className="font-sans">{label}</span>}
                {card.rarity && <span className="font-sans">{card.rarity}</span>}
              </>
            )}
          </p>

          <Stats card={card} />

          {manyPrintings && (
            <PrintingStrip card={card} imagesEnabled={imagesEnabled} term={term} />
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {card.cardType && <Badge tone="neutral">{card.cardType}</Badge>}
          {card.colors.length > 0 && (
            <span className="text-xs text-text-muted">{card.colors.join("/")}</span>
          )}
        </div>
      </button>
    </li>
  );
}

export interface CardSearchProps {
  /** Resolved on the server from NEXT_PUBLIC_ENABLE_CARD_IMAGES. */
  imagesEnabled: boolean;
  /** Supplied when the search is being used to pick a card. */
  onSelect?: (card: CardResult) => void;
  autoFocus?: boolean;
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
  onSelect,
  autoFocus = false,
}: CardSearchProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

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

  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;

  const status: Status = tooShort
    ? "idle"
    : settled?.query === trimmed
      ? settled.kind
      : "loading";

  const results = status === "ready" && settled ? settled.results : [];
  const term = settled?.query ?? "";

  useEffect(() => {
    if (tooShort) return;

    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      const response = await searchCardsAction(trimmed);

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
  }, [trimmed, tooShort]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      return;
    }
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && onSelect) {
      event.preventDefault();
      const card = results[active];
      if (card) onSelect(card);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          Card name or number
        </label>

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
            placeholder="OP01-024, or Luffy"
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
          Misspellings are fine. Card numbers work with or without the dash.
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
          No matching cards found. Check the name or card number and try again.
        </Card>
      )}

      {status === "ready" && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Card results"
          className="flex flex-col gap-1"
        >
          {results.map((card, index) => (
            <Row
              key={card.id}
              id={`${listId}-${index}`}
              card={card}
              term={term}
              imagesEnabled={imagesEnabled}
              active={index === active}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
