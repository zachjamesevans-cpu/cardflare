"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheck, CircleX, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { importCatalogueSetAction } from "@/lib/cards/sync-actions";
import { CATALOGUE_SOURCES } from "@/lib/cards/providers/registry";
import {
  describeCounts,
  SYNC_IDLE,
  type SyncActionState,
} from "@/lib/cards/sync-state";
import { gameLabel } from "@/lib/players/games-catalog";

/**
 * Bringing a set of Magic, Pokémon, Flesh and Blood or Riftbound into
 * the catalogue from its public source.
 *
 * The same three controls as every other admin form — a select, a text
 * field, a button — and the same outcome line the One Piece sync uses,
 * so the console keeps one voice. The game picks the source; the
 * operator never types a URL.
 */

function SubmitButton({ sourceName }: { sourceName: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Importing…" : `Import from ${sourceName}`}
    </Button>
  );
}

function Outcome({ state }: { state: SyncActionState }) {
  if (state.status === "idle") return null;

  const { Icon, tone, border, body } =
    state.status === "success"
      ? {
          Icon: CircleCheck,
          tone: "text-accent",
          border: "border-accent/30 bg-accent/[0.07]",
          body: `Import finished: ${describeCounts(state.counts)}.${
            state.counts.recordsFailed > 0
              ? " Rejected records are in card_sync_failures."
              : ""
          }`,
        }
      : state.status === "failed"
        ? {
            Icon: TriangleAlert,
            tone: "text-warning",
            border: "border-warning/30 bg-warning/[0.07]",
            body: state.message,
          }
        : {
            Icon: CircleX,
            tone: "text-danger",
            border: "border-danger/40 bg-danger/10",
            body: state.message,
          };

  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-[var(--radius-control)] border px-4 py-3 text-sm text-text-secondary ${border}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span>{body}</span>
    </p>
  );
}

export function CatalogueImportForm() {
  const [state, formAction] = useActionState(importCatalogueSetAction, SYNC_IDLE);
  const [game, setGame] = useState<string>(CATALOGUE_SOURCES[0].game);

  const source =
    CATALOGUE_SOURCES.find((entry) => entry.game === game) ?? CATALOGUE_SOURCES[0];

  return (
    <div className="flex flex-col gap-4">
      <Outcome state={state} />

      <form action={formAction} className="flex flex-col gap-5">
        <Field
          name="game"
          label="Game"
          hint={`Read from ${source.sourceName}. Card data and picture links only; no prices.`}
        >
          <Select
            {...fieldIds("game")}
            name="game"
            value={game}
            onChange={(event) => setGame(event.target.value)}
          >
            {CATALOGUE_SOURCES.map((entry) => (
              <option key={entry.game} value={entry.game}>
                {gameLabel(entry.game)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          name="setCode"
          label={source.wholeGame ? "Set code (optional)" : "Set code"}
          hint={source.setCodeHint}
        >
          <TextInput
            {...fieldIds("setCode")}
            name="setCode"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            placeholder={source.wholeGame ? "Blank for everything" : ""}
            required={!source.wholeGame}
          />
        </Field>

        <div>
          <SubmitButton sourceName={source.sourceName} />
        </div>
      </form>

      <p className="border-t border-border pt-3 text-xs text-text-muted">
        Same tables as the sync above, keyed by game and card number, so a set can be
        imported again to pick up corrections. Pictures are linked from the source and
        drawn only when NEXT_PUBLIC_ENABLE_CARD_IMAGES is on.
      </p>
    </div>
  );
}
