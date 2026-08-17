"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ClipboardList, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea, TextInput } from "@/components/ui/controls";
import {
  DECK_IMPORT_IDLE,
  DECK_LIST_MAX,
  parseDeckList,
  type DeckImportState,
} from "@/lib/players/deck-list";
import { importDeckListAction } from "@/lib/players/account-actions";

/**
 * Paste a deck, get a want list.
 *
 * The fast way to post a lot of cards before a release, and the founder's
 * ask for OP-17 week: "we need a way to post multiple flares at once —
 * such as if you're building a massive deck."
 *
 * Pasting rather than a grid of tick boxes, because a deck already
 * exists as text. It comes out of a builder, a Discord message or a
 * friend's screenshot as a list of numbers, and somewhere to put that is
 * faster than twenty-four perfect checkboxes.
 *
 * What lands here are WANTS, not Flares. A deck is written at home and
 * posted at a counter, often days apart; the room's "still hunting
 * these?" panel posts the lot as one batch when the player walks in,
 * which is what makes it one notification and one Feed item.
 */
export function DeckListForm() {
  const [state, action] = useActionState<DeckImportState, FormData>(
    importDeckListAction,
    DECK_IMPORT_IDLE,
  );

  const [list, setList] = useState("");

  /* Counted here as it is typed, so "how many is this?" is answered
     before a round trip rather than after one. */
  const { lines, unreadable } = parseDeckList(list);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="deck-list" className="text-sm font-medium text-text-secondary">
          Your list
        </label>
        <Textarea
          id="deck-list"
          name="list"
          required
          rows={8}
          spellCheck={false}
          value={list}
          onChange={(event) => setList(event.target.value)}
          className="font-mono text-xs"
          placeholder={"4x OP17-001\n2x OP17-005\nOP17-013"}
        />
        <p className="text-xs text-text-muted">
          One card per line. Counts in front or behind both work, and anything after the
          number is ignored, so a list copied straight out of a deck builder goes in as
          it is.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deck-label" className="text-sm font-medium text-text-secondary">
          Call it something (optional)
        </label>
        <TextInput
          id="deck-label"
          name="deckLabel"
          maxLength={40}
          placeholder="Red Luffy"
        />
        <p className="text-xs text-text-muted">
          Groups these on a board and in the Feed, so the room sees one hunt rather than
          a pile of loose cards.
        </p>
      </div>

      {lines.length > 0 && (
        <p className="text-sm text-text-secondary tabular-nums">
          {lines.length} card{lines.length === 1 ? "" : "s"} read
          {lines.length >= DECK_LIST_MAX ? ` (the most one paste takes)` : ""}
          {unreadable.length > 0
            ? ` · ${unreadable.length} line${unreadable.length === 1 ? "" : "s"} with no card number`
            : ""}
        </p>
      )}

      <SaveButton count={lines.length} />

      {state.status === "error" && (
        <p role="status" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      {state.status === "saved" && (
        <div className="flex flex-col gap-1.5">
          <p role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-3.5" aria-hidden="true" />
            {state.saved} card{state.saved === 1 ? "" : "s"} saved to your list.
          </p>
          <p className="text-xs text-text-muted">
            Walk into any room and it will offer to post them all at once.
          </p>
          {state.unknown.length > 0 && (
            /* Named, not counted. A number tells you something went
               wrong; the numbers tell you which ones to go back for —
               and for an unreleased set, which ones are not in the
               catalogue yet. */
            <p className="text-xs text-danger">
              Not in the catalogue: {state.unknown.slice(0, 12).join(", ")}
              {state.unknown.length > 12
                ? ` and ${state.unknown.length - 12} more`
                : ""}
            </p>
          )}
          {state.atCap && (
            <p className="text-xs text-danger">
              Your want list is full, so the rest were not saved.
            </p>
          )}
        </div>
      )}
    </form>
  );
}

function SaveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || count === 0} className="w-fit">
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <ClipboardList className="size-4" aria-hidden="true" />
      )}
      {pending
        ? "Saving…"
        : count === 0
          ? "Paste a list first"
          : `Save ${count} to my list`}
    </Button>
  );
}
