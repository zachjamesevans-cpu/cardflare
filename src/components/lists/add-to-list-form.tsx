"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { Card } from "@/components/ui/card";
import { addToListAction } from "@/lib/lists/actions";
import { LIST_IDLE, MAX_NOTE, type ListKind, type ListState } from "@/lib/lists/schema";
import { printingLabel, type CardResult } from "@/lib/cards/schema";

/**
 * Adding a card to a Flare list or a Have list.
 *
 * Search first, then confirm. Picking the card is the hard part on a phone at
 * a counter, so it gets the whole screen until it is done; quantity, printing
 * and note only appear once there is something to attach them to.
 *
 * This is what `CardSearch`'s `onSelect` was built for in Milestone 5.
 */

const COPY: Record<ListKind, { title: string; hint: string; submit: string }> = {
  flare: {
    title: "Post a Flare",
    hint: "Everyone in this room can see what you are looking for.",
    submit: "Post Flare",
  },
  have: {
    title: "Add a card you have",
    hint: "Only you can see your Have list. Nobody is told what you are carrying.",
    submit: "Add to my list",
  },
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Outcome({ state }: { state: ListState }) {
  if (state.status === "idle") return null;

  const isError = state.status === "error";

  return (
    <p
      role="status"
      className={
        isError
          ? "flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          : "flex items-start gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
      }
    >
      {isError ? (
        <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      )}
      <span>
        {state.status === "error"
          ? state.message
          : `${state.cardName || "That card"} added.`}
      </span>
    </p>
  );
}

export function AddToListForm({
  code,
  kind,
  imagesEnabled,
}: {
  code: string;
  kind: ListKind;
  imagesEnabled: boolean;
}) {
  const [state, formAction] = useActionState(addToListAction, LIST_IDLE);
  const [picked, setPicked] = useState<CardResult | null>(null);

  const copy = COPY[kind];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-text-primary">{copy.title}</h3>
        <p className="text-sm text-text-secondary">{copy.hint}</p>
      </div>

      <Outcome state={state} />

      {!picked ? (
        <CardSearch imagesEnabled={imagesEnabled} onSelect={setPicked} />
      ) : (
        <form
          action={formAction}
          className="flex flex-col gap-4"
          /*
           * Remounted whenever the picked card changes, so the quantity, note
           * and printing never carry over from the previous card — React keeps
           * an uncontrolled form's values across a re-render otherwise.
           */
          key={picked.id}
        >
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="cardId" value={picked.id} />
          <input type="hidden" name="cardName" value={picked.exactName} />

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-semibold text-text-primary">
                {picked.exactName}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {picked.canonicalCardNumber}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPicked(null)}
            >
              Change
            </Button>
          </div>

          {/*
           * "Any printing" first and selected by default. It is what most
           * people mean, and defaulting to a specific art would quietly make
           * every request narrower than intended.
           */}
          {picked.printings.length > 1 && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">Printing</span>
              <Select name="printingId" defaultValue="">
                <option value="">Any printing</option>
                {picked.printings.map((printing) => (
                  <option key={printing.id} value={printing.id}>
                    {printingLabel(printing, picked.exactName) ?? "This printing"}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">How many</span>
              <TextInput
                name="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                defaultValue={1}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">
                Note{" "}
                <span className="font-normal text-text-muted">
                  Optional — e.g. &ldquo;NM only&rdquo;
                </span>
              </span>
              <TextInput name="note" maxLength={MAX_NOTE} />
            </label>
          </div>

          <div>
            <SubmitButton label={copy.submit} />
          </div>
        </form>
      )}
    </Card>
  );
}
