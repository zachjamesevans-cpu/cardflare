"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { TextInput } from "@/components/ui/controls";
import { Card } from "@/components/ui/card";
import { searchCardsAction } from "@/lib/cards/actions";
import {
  highlightParts,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  pickBasePrinting,
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
}: {
  card: CardResult;
  imagesEnabled: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Versions">
      {card.printings.map((printing, index) => (
        <li
          key={`${printing.setCode}-${printing.rarity}-${index}`}
          className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-border bg-elevated px-1.5 py-1.5"
        >
          <CardThumbnail
            imageUrl={printing.imageUrl}
            exactName={card.exactName}
            cardNumber={card.canonicalCardNumber}
            enabled={imagesEnabled}
            className="w-9"
          />
          <span className="min-w-0 text-xs leading-snug text-text-secondary">
            {printingLabel(printing, card.exactName) ?? "Standard printing"}
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
  /*
   * The headline is the base printing, not whichever set code sorted first —
   * otherwise a card whose alternate art happens to come from an earlier set
   * leads with the alternate art.
   */
  const printing = pickBasePrinting(card.printings, card.exactName);
  const label = printing ? printingLabel(printing, card.exactName) : null;
  const manyPrintings = card.printings.length > 1;

  /*
   * Collapsed by default, per founder feedback: one card, one row, base art.
   * A sibling of the select button rather than a child — a button inside a
   * button is invalid HTML, and the two answer different questions.
   */
  const [showVersions, setShowVersions] = useState(false);

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
        className="flex w-full items-start gap-3 px-2 pt-3 pb-2 text-left"
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
        </div>
      </button>

      {manyPrintings && (
        <div className="flex flex-col gap-2 px-2 pb-3 pl-[4.75rem]">
          <button
            type="button"
            onClick={() => setShowVersions((value) => !value)}
            aria-expanded={showVersions}
            className="flex w-fit items-center gap-1 text-xs font-medium text-text-muted underline-offset-4 transition-colors hover:text-text-secondary hover:underline"
          >
            {showVersions
              ? "Hide versions"
              : `${card.printings.length} versions — alt arts and promos`}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3.5 transition-transform duration-[var(--duration-base)]",
                showVersions && "rotate-180",
              )}
            />
          </button>

          {showVersions && <PrintingList card={card} imagesEnabled={imagesEnabled} />}
        </div>
      )}
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
