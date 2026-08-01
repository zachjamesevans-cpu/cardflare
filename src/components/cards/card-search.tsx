"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/card";
import { searchCardsAction } from "@/lib/cards/actions";
import {
  CARD_SEARCH_IDLE,
  CATEGORY_LABELS,
  MAX_QUERY_LENGTH,
  printingLabel,
  type CardResult,
  type CardSearchState,
} from "@/lib/cards/schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Search className="size-4" aria-hidden="true" />
      )}
      {pending ? "Searching…" : "Search"}
    </Button>
  );
}

/** The stats that apply differ by category, so only the present ones render. */
function Stats({ card }: { card: CardResult }) {
  const stats = [
    card.cost !== null && { label: "Cost", value: card.cost },
    card.life !== null && { label: "Life", value: card.life },
    card.power !== null && { label: "Power", value: card.power },
    card.counter !== null && { label: "Counter", value: card.counter },
    card.attribute && { label: "Attribute", value: card.attribute },
  ].filter(Boolean) as { label: string; value: string | number }[];

  if (stats.length === 0) return null;

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {stats.map((stat) => (
        <div key={stat.label} className="flex gap-1.5">
          <dt className="text-text-muted">{stat.label}</dt>
          <dd className="font-medium text-text-secondary tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CardHit({ card }: { card: CardResult }) {
  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold text-text-primary">{card.name}</h3>
          <p className="font-mono text-sm text-text-muted">{card.code}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {card.colors.map((color) => (
            <Badge key={color} tone="neutral">
              {color}
            </Badge>
          ))}
          <Badge>{CATEGORY_LABELS[card.category]}</Badge>
        </div>
      </div>

      <Stats card={card} />

      {card.types.length > 0 && (
        <p className="text-sm text-text-muted">{card.types.join(" · ")}</p>
      )}

      {card.printings.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <p className="text-xs font-medium text-text-muted uppercase">Printings</p>
          <ul className="flex flex-wrap gap-2">
            {card.printings.map((printing) => (
              <li
                key={`${printing.setCode}-${printing.variant ?? "base"}`}
                className="rounded-[var(--radius-control)] border border-border bg-elevated px-2.5 py-1 text-sm text-text-secondary"
              >
                {printingLabel(printing)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Results({ state }: { state: CardSearchState }) {
  if (state.status !== "results") return null;

  /*
   * An empty card pool is a setup step nobody has run, not a failed search.
   * Saying "no card matches that" would send a player looking for their typo.
   */
  if (state.poolEmpty) {
    return (
      <Card className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-text-secondary">No cards have been loaded yet.</p>
        <p className="max-w-sm text-sm text-text-muted">
          Card search will work as soon as the One Piece card list is imported. Nothing
          is wrong with what you typed.
        </p>
      </Card>
    );
  }

  if (state.results.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-text-secondary">
          No card matches <span className="text-text-primary">{state.query}</span>.
        </p>
        <p className="text-sm text-text-muted">
          Try the card number, or fewer letters of the name.
        </p>
      </Card>
    );
  }

  return (
    <>
      <p role="status" className="text-sm text-text-muted">
        {state.results.length} {state.results.length === 1 ? "card" : "cards"} for{" "}
        <span className="text-text-secondary">{state.query}</span>
      </p>
      <ul className="flex flex-col gap-3">
        {state.results.map((card) => (
          <CardHit key={card.id} card={card} />
        ))}
      </ul>
    </>
  );
}

export function CardSearch() {
  const [state, formAction] = useActionState<CardSearchState, FormData>(
    searchCardsAction,
    CARD_SEARCH_IDLE,
  );

  const error = state.status === "error" ? state.message : undefined;
  const query = state.status === "idle" ? "" : state.query;

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <Field
          name="query"
          label="Card name or number"
          hint="Misspellings are fine — “monkey d luff” finds Luffy."
          error={error}
        >
          <div className="flex gap-3">
            <TextInput
              {...fieldIds("query")}
              name="query"
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_QUERY_LENGTH}
              defaultValue={query}
              placeholder="OP01-024, or Luffy"
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy("query", !!error, true)}
            />
            <SubmitButton />
          </div>
        </Field>
      </form>

      <Results state={state} />
    </div>
  );
}
