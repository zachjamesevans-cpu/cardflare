"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import {
  DressingPicker,
  type DressingOption,
} from "@/components/players/dressing-picker";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { addShowcaseAction } from "@/lib/players/profile-actions";
import type { CardPrinting, CardResult } from "@/lib/cards/schema";

/**
 * Putting a card on the shelf, dressed before it ever shows.
 *
 * Two steps now, the founder's spec: find the card, then choose which
 * border and holo it wears — previewed on the card's own art with the
 * same carousel pickers the per-card editor uses — and only then does it
 * land on the shelf. The picks start at the profile's defaults, so
 * somebody who does not care taps straight through Add and gets exactly
 * what they got before.
 *
 * Tapping a specific printing puts that artwork up. Tapping the row
 * itself puts the card up with no printing chosen, which renders as the
 * placeholder — honest, and better than picking an alternate art the
 * player did not ask for.
 *
 * Closed by default. Nine cards fit on this shelf and most visits change
 * none of them, so a permanently open search would be the loudest thing
 * on a page that is mostly for looking at.
 *
 * On the profile it is folded behind a "+" tile at the end of the
 * shelf itself (`tile`), the profile IA round's call: "fewer giant
 * bordered boxes". The tile opens the same two steps in a sheet over
 * the page, since a form cannot unfold inside a shelf that scrolls
 * sideways. Without `tile` it is the button and the inline form it
 * always was.
 */
export function AddShowcaseForm({
  imagesEnabled,
  playerGames = [],
  frames,
  holos,
  defaultFrame,
  defaultHolo,
  effect,
  tile = false,
}: {
  imagesEnabled: boolean;
  /** The reader's sign-up games, for the search's default chip. */
  playerGames?: readonly string[];
  /** Owned dressing options, the free items included. */
  frames: DressingOption[];
  holos: DressingOption[];
  /** The profile defaults, where the picker starts. */
  defaultFrame: string | null;
  defaultHolo: string | null;
  /** Profile-wide, worn in previews so they stay honest. */
  effect: string | null;
  /** A "+" tile on the shelf that opens the form in a sheet. */
  tile?: boolean;
}) {
  const [open, setOpen] = useState(false);

  /** The card chosen in step one, waiting to be dressed. */
  const [chosen, setChosen] = useState<{
    card: CardResult;
    printing: CardPrinting | null;
  } | null>(null);

  const [picked, setPicked] = useState({ frame: defaultFrame, holo: defaultHolo });

  const form = useRef<HTMLFormElement>(null);

  const reset = () => {
    setChosen(null);
    setPicked({ frame: defaultFrame, holo: defaultHolo });
  };

  const close = () => {
    reset();
    setOpen(false);
  };

  if (!open && !tile) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add a card
      </Button>
    );
  }

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-secondary">
          {chosen ? "Dress it before it goes up" : "Search for a card to show off"}
        </p>
        {!tile && (
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>

      {/*
       * The form carries only hidden inputs; the steps fill them in.
       * Keeping it a real form means the whole thing still works as a
       * plain POST, and the Server Action re-derives the player from
       * the session rather than trusting anything in here.
       */}
      <form
        ref={form}
        action={addShowcaseAction}
        className="hidden"
        onSubmit={() => {
          /*
           * Closed on submit rather than left open with an "added"
           * message. The shelf is right above this and repaints with
           * the new card on it, which says the same thing more
           * convincingly than any toast.
           */
          reset();
          setOpen(false);
        }}
      >
        <input type="hidden" name="cardId" value={chosen?.card.id ?? ""} />
        <input type="hidden" name="printingId" value={chosen?.printing?.id ?? ""} />
        <input type="hidden" name="frame" value={picked.frame ?? ""} />
        <input type="hidden" name="holo" value={picked.holo ?? ""} />
      </form>

      {!chosen ? (
        <CardSearch
          imagesEnabled={imagesEnabled}
          playerGames={playerGames}
          onSelect={(card, printing) => setChosen({ card, printing: printing ?? null })}
          autoFocus
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* The card as it will land, wearing the picks live. */}
          <CosmeticCard
            imageUrl={chosen.printing?.imageUrl ?? null}
            name={chosen.card.exactName}
            number={chosen.card.canonicalCardNumber}
            imagesEnabled={imagesEnabled}
            frame={picked.frame}
            holo={picked.holo}
            effect={effect}
            className="mx-auto w-40"
          />

          <DressingPicker
            imageUrl={chosen.printing?.imageUrl ?? null}
            name={chosen.card.exactName}
            number={chosen.card.canonicalCardNumber}
            imagesEnabled={imagesEnabled}
            frames={frames}
            holos={holos}
            frame={picked.frame}
            holo={picked.holo}
            effect={effect}
            onPick={setPicked}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => form.current?.requestSubmit()}
            >
              Add to showcase
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Pick a different card
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (!tile) return body;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add a card"
        className="flex aspect-[63/88] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[6px] border-2 border-dashed border-border-strong bg-elevated/40 text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
      >
        <span aria-hidden="true" className="text-2xl leading-none font-light">
          +
        </span>
        <span className="text-[10px] font-semibold">Add</span>
      </button>
      <Sheet open={open} onClose={close} title="Add to showcase">
        {body}
      </Sheet>
    </>
  );
}
