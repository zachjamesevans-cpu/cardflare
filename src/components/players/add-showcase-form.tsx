"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { addShowcaseAction } from "@/lib/players/profile-actions";
import type { CardPrinting, CardResult } from "@/lib/cards/schema";

/**
 * Putting a card on the shelf.
 *
 * The same search the Flare composer uses, doing a different job: a
 * showcase is "this is what I am proud of", not "I will let this go".
 * Nothing here creates a Flare, nobody can pledge on the result, and it
 * outlives the event — which is why it lives on the profile rather than
 * on a board.
 *
 * Tapping a specific printing puts that artwork up. Tapping the row
 * itself puts the card up with no printing chosen, which renders as the
 * placeholder — honest, and better than picking an alternate art the
 * player did not ask for.
 *
 * Closed by default. Nine cards fit on this shelf and most visits change
 * none of them, so a permanently open search would be the loudest thing
 * on a page that is mostly for looking at.
 */
export function AddShowcaseForm({ imagesEnabled }: { imagesEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const cardId = useRef<HTMLInputElement>(null);
  const printingId = useRef<HTMLInputElement>(null);

  const submit = (card: CardResult, printing?: CardPrinting) => {
    if (!cardId.current || !printingId.current) return;

    cardId.current.value = card.id;
    printingId.current.value = printing?.id ?? "";
    form.current?.requestSubmit();

    /*
     * Closed on submit rather than left open with a "added" message.
     * The shelf is right above this and repaints with the new card on
     * it, which says the same thing more convincingly than any toast.
     */
    setOpen(false);
  };

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add a card
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-secondary">
          Search for a card to show off
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close the search</span>
        </Button>
      </div>

      {/*
       * The form carries only hidden inputs; the search fills them in and
       * submits. Keeping it a real form means the whole thing still works
       * as a plain POST, and the Server Action re-derives the player from
       * the session rather than trusting anything in here.
       */}
      <form ref={form} action={addShowcaseAction} className="hidden">
        <input ref={cardId} type="hidden" name="cardId" />
        <input ref={printingId} type="hidden" name="printingId" />
      </form>

      <CardSearch imagesEnabled={imagesEnabled} onSelect={submit} autoFocus />
    </div>
  );
}
