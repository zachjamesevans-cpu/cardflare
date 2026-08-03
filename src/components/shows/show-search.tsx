"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, Store } from "lucide-react";

import { TextInput } from "@/components/ui/controls";
import { Badge, Card } from "@/components/ui/card";
import { searchShowCardsAction } from "@/lib/shows/actions";
import { slabLabel, type VendorAvailability } from "@/lib/shows/schema";
import {
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  type CardResult,
} from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * The attendee's search: "who at this show has my card, and where are they
 * sitting?"
 *
 * Same debounce discipline as the room's card search, but the answer is
 * different in kind: not "pick this card" but "walk to booth A12". The booth
 * is the biggest thing in each result because it is the one thing somebody
 * standing in a convention hall actually writes down. **No prices anywhere**
 * — what a card costs is a conversation at the booth, per PRODUCT.md.
 */

const DEBOUNCE_MS = 250;

type Status = "idle" | "loading" | "ready" | "empty" | "error";

function VendorRow({ vendor }: { vendor: VendorAvailability }) {
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.06] px-3 py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-accent">
        <MapPin className="size-4" aria-hidden="true" />
        Booth {vendor.booth}
      </span>

      <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-primary">
        <Store className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        <span className="truncate">{vendor.vendorName}</span>
      </span>

      <span className="flex w-full flex-wrap gap-1.5 text-xs">
        {vendor.items.map((item, index) => (
          <span
            key={index}
            className="rounded-full border border-border bg-elevated px-2 py-0.5 text-text-secondary"
          >
            {slabLabel(item.form, item.grader, item.grade)}
            {item.quantity > 1 && ` ×${item.quantity}`}
            {item.printingLabel && ` · ${item.printingLabel}`}
          </span>
        ))}
      </span>
    </li>
  );
}

function ResultRow({
  card,
  vendors,
}: {
  card: CardResult;
  vendors: VendorAvailability[];
}) {
  return (
    <li className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 first:pt-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="font-semibold text-text-primary">{card.exactName}</p>
        <p className="font-mono text-xs text-text-muted">{card.canonicalCardNumber}</p>
        {vendors.length > 0 ? (
          <Badge>
            {vendors.length === 1
              ? "1 booth has it"
              : `${vendors.length} booths have it`}
          </Badge>
        ) : (
          <span className="text-xs text-text-muted">
            Nobody at this show has listed it
          </span>
        )}
      </div>

      {vendors.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {vendors.map((vendor) => (
            <VendorRow key={vendor.storeId} vendor={vendor} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ShowSearch({ code }: { code: string }) {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState<{
    query: string;
    kind: Exclude<Status, "idle" | "loading">;
    results: CardResult[];
    availability: Record<string, VendorAvailability[]>;
    message: string | null;
  } | null>(null);

  const inputId = useId();
  const requestId = useRef(0);

  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;

  const status: Status = tooShort
    ? "idle"
    : settled?.query === trimmed
      ? settled.kind
      : "loading";

  useEffect(() => {
    if (tooShort) return;

    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      const response = await searchShowCardsAction(code, trimmed);
      if (id !== requestId.current) return;

      if (response.status === "ok") {
        setSettled({
          query: trimmed,
          kind: response.results.length === 0 ? "empty" : "ready",
          results: response.results,
          availability: response.availability,
          message: null,
        });
        return;
      }

      setSettled({
        query: trimmed,
        kind: "error",
        results: [],
        availability: {},
        message: response.message,
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, tooShort, code]);

  const results = status === "ready" && settled ? settled.results : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          What are you hunting?
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
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={MAX_QUERY_LENGTH}
            placeholder="OP01-024, or Luffy"
            className="pr-10 pl-10"
          />
          {status === "loading" && (
            <Loader2
              aria-hidden="true"
              className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-text-muted"
            />
          )}
        </div>

        <p className="text-xs text-text-muted">
          Search a card and see which booths have it — raw singles and graded slabs.
        </p>
      </div>

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

      {status === "empty" && (
        <Card className="py-8 text-center text-text-secondary">
          No matching cards found. Check the name or card number and try again.
        </Card>
      )}

      {status === "ready" && (
        <Card className={cn("p-4", results.length === 0 && "hidden")}>
          <ul className="flex flex-col">
            {results.map((card) => (
              <ResultRow
                key={card.id}
                card={card}
                vendors={settled?.availability[card.id] ?? []}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
