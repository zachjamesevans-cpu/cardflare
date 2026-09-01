"use client";

import { useState, useTransition } from "react";
import {
  ArrowUpRight,
  Banknote,
  Handshake,
  Loader2,
  Minus,
  Plus,
  Search,
} from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { PostalAsk } from "@/components/feed/postal-ask";
import { IconChip, Segment, composerKeyFor } from "@/components/lists/add-to-list-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { printingLabel, type CardPrinting, type CardResult } from "@/lib/cards/schema";
import { postAreaFlareAction } from "@/lib/local/actions";

/** A deck is fifty-one plus a leader; nobody hunts more of one card. */
const MAX_QUANTITY = 20;

/**
 * Saying what you are hunting, without being in a room.
 *
 * THE SAME COMPOSER THE BOARD HAS, and that is the whole design. The
 * first cut was two taps with defaults for everything — search, tap,
 * posted — which read as fast and was wrong twice over: a Flare that
 * cannot name an alternate art is not the Flare somebody meant to post,
 * and a Local that asks a different set of questions to the room teaches
 * two products. So the sections, their order and their words are the
 * room's: direction, then how many and the terms, with the printing
 * chosen from the versions and their art.
 *
 * The controls are literally the room's, imported rather than copied.
 * Two composers that merely look alike drift the first time one of them
 * is improved.
 *
 * It posts, it never publishes a list. A saved want stays private; this
 * is the deliberate act of being visible, and the choosing is the point.
 */
export function PostAreaFlare({
  imagesEnabled,
  at,
  onPosted,
}: {
  imagesEnabled: boolean;
  /**
   * Where the reader is browsing from, when they granted the browser
   * their location. Local accepts either this or the profile's ZIP as an
   * origin, so posting has to accept both too.
   */
  at?: { latitude: number; longitude: number } | null;
  /** Refresh the list, so the new Flare appears where it will live. */
  onPosted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{
    card: CardResult;
    printingId: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /* The one refusal that is not a fault: it has a fix, and the fix goes
     here rather than in a sentence pointing somewhere else. */
  const [needsPostal, setNeedsPostal] = useState(false);
  const [pending, startTransition] = useTransition();

  const post = (
    card: CardResult,
    printingId: string,
    fields: {
      showcase: boolean;
      quantity: number;
      acceptsTrade: boolean;
      acceptsCash: boolean;
      note: string;
    },
  ) => {
    setMessage(null);
    setFailed(false);
    setNeedsPostal(false);

    startTransition(async () => {
      const result = await postAreaFlareAction(
        {
          cardId: card.id,
          printingId: printingId || null,
          quantity: fields.quantity,
          note: fields.note.trim() || null,
          intent: fields.showcase ? "showcase" : "want",
          acceptsTrade: fields.acceptsTrade,
          acceptsCash: fields.acceptsCash,
        },
        at ?? null,
      );

      if (result.ok) {
        setPicked(null);
        setOpen(false);
        setMessage(`${card.exactName} is up. People near you can see it now.`);
        onPosted();
        return;
      }

      setFailed(true);
      setNeedsPostal(result.reason === "no-postal-code");
      setMessage(result.message);
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-text-primary">What are you hunting?</p>
        <p className="text-xs text-text-muted">
          Post it here and anyone near you can say they have it. No room needed.
        </p>
      </div>

      {open ? (
        <div className="flex flex-col gap-3">
          <CardSearch
            imagesEnabled={imagesEnabled}
            autoFocus
            /* A row tap means "any printing"; tapping a version names it.
               The same contract the room's search has always had. */
            onSelect={(card: CardResult, printing?: CardPrinting) => {
              const key = `${card.id}:${printing?.id ?? ""}`;
              setPicked((current) =>
                current && composerKeyFor(current) === key
                  ? null
                  : { card, printingId: printing?.id ?? "" },
              );
            }}
            composerKey={picked ? composerKeyFor(picked) : null}
            composer={
              picked ? (
                <AreaComposer
                  key={composerKeyFor(picked)}
                  picked={picked}
                  pending={pending}
                  onPost={(fields) => post(picked.card, picked.printingId, fields)}
                />
              ) : null
            }
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPicked(null);
            }}
            className="self-start text-xs text-text-muted underline underline-offset-2 hover:text-text-secondary"
          >
            Never mind
          </button>
        </div>
      ) : (
        <Button
          type="button"
          className="w-full sm:w-auto sm:self-start"
          onClick={() => {
            setMessage(null);
            setOpen(true);
          }}
        >
          <Search className="size-4" aria-hidden="true" />
          Post a card
        </Button>
      )}

      {message && (
        /* A refusal and a confirmation are different things and get
           different colours. */
        <p className={failed ? "text-sm text-danger" : "text-sm text-accent"}>
          {message}
        </p>
      )}

      {/*
       * Telling somebody to say where they are and leaving them on a
       * screen with no field to say it in is how a two-tap feature
       * becomes a dead end — and on the live site it was one. The ask
       * belongs here, beside the card they were trying to post.
       */}
      {needsPostal && <PostalAsk />}
    </Card>
  );
}

/**
 * The panel that opens inside the tapped result.
 *
 * Direction first, because it decides whether somebody walks over to
 * offer or to ask; then the one row of everything a post settles by
 * tapping. The board's order, and the board's words.
 */
function AreaComposer({
  picked,
  pending,
  onPost,
}: {
  picked: { card: CardResult; printingId: string };
  pending: boolean;
  onPost: (fields: {
    showcase: boolean;
    quantity: number;
    acceptsTrade: boolean;
    acceptsCash: boolean;
    note: string;
  }) => void;
}) {
  const { card, printingId } = picked;
  const [showcase, setShowcase] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [acceptsTrade, setAcceptsTrade] = useState(true);
  const [acceptsCash, setAcceptsCash] = useState(false);
  const [note, setNote] = useState("");

  const printing = printingId
    ? (card.printings.find((entry) => entry.id === printingId) ?? null)
    : null;

  const which = printing
    ? (printingLabel(printing, card.exactName) ?? "This printing")
    : "Any printing";

  return (
    <div className="flex slide-open flex-col gap-2 border-t border-border p-3">
      <fieldset>
        <legend className="sr-only">
          Are you looking for this card or letting it go?
        </legend>
        <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-elevated p-1">
          <Segment
            name="areaIntent"
            value="want"
            checked={!showcase}
            onSelect={() => setShowcase(false)}
            icon={Search}
          >
            I want this
          </Segment>
          <Segment
            name="areaIntent"
            value="showcase"
            checked={showcase}
            onSelect={() => setShowcase(true)}
            icon={ArrowUpRight}
          >
            I have this
          </Segment>
        </div>
      </fieldset>

      <p className="text-xs text-text-muted">{which}</p>

      {/* One line for everything a post decides by tapping: how many, the
          terms, and Post itself, under the same thumb. */}
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            aria-label="One fewer"
            className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-text-secondary disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <output
            aria-live="polite"
            className="min-w-7 text-center font-semibold text-text-primary tabular-nums"
          >
            {quantity}
          </output>
          <button
            type="button"
            onClick={() => setQuantity(Math.min(MAX_QUANTITY, quantity + 1))}
            disabled={quantity >= MAX_QUANTITY}
            aria-label="One more"
            className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-text-secondary disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>

        <fieldset className="flex shrink-0 items-center gap-1">
          <legend className="sr-only">
            {showcase
              ? "Will you trade this card away, sell it, or either?"
              : "Will you trade for this card, buy it, or either?"}
          </legend>
          {/* Never both off: a Flare nobody can answer is not a Flare. */}
          <IconChip
            name="areaAcceptsTrade"
            checked={acceptsTrade}
            onToggle={() => setAcceptsTrade(!acceptsTrade || !acceptsCash)}
            icon={Handshake}
            label="Trade"
          />
          <IconChip
            name="areaAcceptsCash"
            checked={acceptsCash}
            onToggle={() => setAcceptsCash(!acceptsCash || !acceptsTrade)}
            icon={Banknote}
            label="Cash"
          />
        </fieldset>

        <Button
          type="button"
          className="ml-auto"
          disabled={pending}
          onClick={() =>
            onPost({ showcase, quantity, acceptsTrade, acceptsCash, note })
          }
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={280}
        placeholder="Note (optional)"
        className="w-full rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      />
    </div>
  );
}
