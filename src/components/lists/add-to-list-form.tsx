"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { Card } from "@/components/ui/card";
import { addToListAction } from "@/lib/lists/actions";
import { saveWantAction } from "@/lib/players/account-actions";
import {
  LIST_IDLE,
  MAX_DECK_LABEL,
  MAX_NOTE,
  type ListKind,
  type ListState,
} from "@/lib/lists/schema";
import { printingLabel, type CardPrinting, type CardResult } from "@/lib/cards/schema";

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

function Outcome({ state, saved = false }: { state: ListState; saved?: boolean }) {
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
          : saved
            ? `${state.cardName || "That card"} saved to your list. Search for your next card below.`
            : state.kind === "flare"
              ? `${state.cardName || "That card"} posted. Search for your next card below.`
              : `${state.cardName || "That card"} added.`}
      </span>
    </p>
  );
}

export function AddToListForm({
  code,
  kind,
  imagesEnabled,
  target = "room",
  footer,
}: {
  code: string;
  kind: ListKind;
  imagesEnabled: boolean;
  /**
   * Where the card lands. "room" is the board in front of you; "list"
   * is the account's saved wants, for a player with no room open — the
   * couch case, which used to have nowhere to go but a stale room.
   */
  target?: "room" | "list";
  /**
   * A row renting the bottom of this card, under the form. Server-
   * rendered by the page (the open-to-trades switch lives here), so the
   * founder's rule holds: one block for the two answers to "what are
   * you here for?", without this form knowing what its tenant does.
   */
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(
    target === "list" ? saveWantAction : addToListAction,
    LIST_IDLE,
  );

  /*
   * `printingId` rides along from the search: tapping a specific version in
   * the expanded list arrives here with that printing already chosen, so
   * nobody picks the alternate art twice. An empty string is "any printing" —
   * the same value the select's default option posts.
   */
  const [picked, setPicked] = useState<{
    card: CardResult;
    printingId: string;
  } | null>(null);

  /*
   * The deck name survives the post on purpose. Somebody building an RG
   * Luffy types the name once and posts fourteen cards; the form remounts
   * per card (see the `key` below), so the draft lives out here and comes
   * back as the next card's default.
   */
  const [deckDraft, setDeckDraft] = useState("");

  /*
   * Picking a card collapses the tall results list into a short form,
   * which yanks everything below it upward while the browser holds its
   * scroll offset — a beta tester reported the page "teleporting" down.
   * Anchoring the panel back into view on each pick keeps the form
   * exactly where the eye already was.
   */
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (picked) {
      panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [picked]);

  /*
   * A successful post hands the screen back to the search. Keeping the
   * posted card up, with its "Change" button still showing, read as if
   * the post itself wanted changing; the founder called it out. The
   * banner above says what just posted, and the search below is the
   * "next card" the person actually wants now.
   *
   * Adjusted during render, the way React documents deriving state from
   * a changed input: each action result clears the picker exactly once,
   * so a card picked afterwards is never re-cleared by a re-render.
   */
  const [clearedFor, setClearedFor] = useState<ListState>(state);
  if (state !== clearedFor) {
    setClearedFor(state);
    if (state.status === "added") setPicked(null);
  }

  const copy =
    target === "list"
      ? {
          title: "Save to your list",
          hint: "No room open right now, so this waits on your account. Every room you join offers to post it.",
          submit: "Save to my list",
        }
      : COPY[kind];

  return (
    <Card className="flex flex-col gap-4">
      {/* Zero-height scroll anchor: the Card itself may not forward refs. */}
      <div ref={panel} aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-text-primary">{copy.title}</h3>
        <p className="text-sm text-text-secondary">{copy.hint}</p>
      </div>

      <Outcome state={state} saved={target === "list"} />

      {!picked ? (
        <CardSearch
          imagesEnabled={imagesEnabled}
          onSelect={(card: CardResult, printing?: CardPrinting) =>
            setPicked({ card, printingId: printing?.id ?? "" })
          }
        />
      ) : (
        <form
          action={formAction}
          className="flex flex-col gap-4"
          /*
           * Remounted whenever the picked card changes, so the quantity, note
           * and printing never carry over from the previous card — React keeps
           * an uncontrolled form's values across a re-render otherwise.
           */
          key={`${picked.card.id}-${picked.printingId}`}
        >
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="cardId" value={picked.card.id} />
          <input type="hidden" name="cardName" value={picked.card.exactName} />

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-semibold text-text-primary">
                {picked.card.exactName}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {picked.card.canonicalCardNumber}
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
           * "Any printing" is first in the list and the default for a plain
           * row tap — it is what most people mean, and defaulting to a
           * specific art would quietly make every request narrower than
           * intended. Tapping a version in the search preselects it here,
           * and the hint under the select is how "any printing" stays
           * discoverable on exactly that path.
           */}
          {picked.card.printings.length > 1 && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">Printing</span>
              <Select name="printingId" defaultValue={picked.printingId}>
                <option value="">Any printing</option>
                {picked.card.printings.map((printing) => (
                  <option key={printing.id} value={printing.id}>
                    {printingLabel(printing, picked.card.exactName) ?? "This printing"}
                  </option>
                ))}
              </Select>
              {picked.printingId !== "" && (
                <span className="text-xs text-text-muted">
                  Asking for this exact version. Switch to &ldquo;Any printing&rdquo;
                  above if any art will do, since more people can answer that.
                </span>
              )}
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
                  Optional, e.g. &ldquo;NM only&rdquo;
                </span>
              </span>
              <TextInput name="note" maxLength={MAX_NOTE} />
            </label>
          </div>

          {kind === "flare" && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">
                Building a deck?{" "}
                <span className="font-normal text-text-muted">
                  Optional, e.g. &ldquo;RG Luffy&rdquo;
                </span>
              </span>
              <TextInput
                name="deckLabel"
                maxLength={MAX_DECK_LABEL}
                defaultValue={deckDraft}
                onChange={(event) => setDeckDraft(event.target.value)}
              />
              <span className="text-xs text-text-muted">
                Cards with the same deck name show as one folder on the board. The name
                sticks around so you can post the whole deck.
              </span>
            </label>
          )}

          <div>
            <SubmitButton label={copy.submit} />
          </div>
        </form>
      )}

      {footer}
    </Card>
  );
}
