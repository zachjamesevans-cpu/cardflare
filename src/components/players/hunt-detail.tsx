"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Undo2 } from "lucide-react";

import { useSelection, type OfferLine } from "@/components/flares/offer-review";
import { Button } from "@/components/ui/button";
import { Select, TextInput, Textarea } from "@/components/ui/controls";
import { reviewLabel, selectionSummary } from "@/lib/feed/offer-copy";
import { setRequestFoundAction, updateHuntAction } from "@/lib/players/hunt-actions";
import { offerOnHuntAction } from "@/lib/players/hunt-offer-actions";
import type { HuntOfferOutcome } from "@/lib/players/hunt-offers";
import type { Hunt, HuntCard } from "@/lib/players/hunts";

/**
 * What a hunt's page is made of, under the drawing.
 *
 * The hunt is drawn like a binder now (hunt-binder.tsx): pockets, not
 * rows. What stays here is everything that is not the drawing: the
 * owner's progress writes with their Undo, the visitor's selection
 * and the one send that answers it, the progress bar, the offer
 * footer, the edit form and the line that says where each card went.
 * The rows that used to be drawn from here are gone; nothing drew
 * them but the hunt.
 *
 * The owner ticks copies off, one at a time or several at once, and
 * can take the last change back for a few seconds. A visitor picks
 * the cards they have and how many, and one send answers the lot:
 * cards with a Flare up are offered on their posts, the rest go to the
 * owner as one direct message. A hunt is a standing want, so EVERY
 * open card can be answered, posted or not. The two never share a
 * control: nothing an owner can press is drawn for anyone else, and
 * the server refuses it anyway.
 *
 * Progress is COPIES; the pockets are CARDS. "5 of 10 copies
 * collected" across "3 cards" - the words never swap.
 */

/* The same caps as lib/players/hunts.ts, which is server-only and so
   cannot be imported here. The server clamps regardless. */
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;
/** How long Undo stays on offer after a change. */
const UNDO_MS = 6000;

/** A hunt's card with whatever this screen has written on top of the server's copy. */
export type LiveHuntCard = HuntCard;

/**
 * The owner's progress: the hunt's cards with the screen's own writes
 * on top, the write itself, and the Undo that takes the last one
 * back. Found and remaining follow from the one number.
 */
export function useHuntProgress(hunt: Hunt) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [lastChange, setLastChange] = useState<{
    requestId: string;
    previous: number;
    cardName: string;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const cards: LiveHuntCard[] = hunt.cards.map((card) => {
    const foundCopies = overrides[card.requestId] ?? card.foundCopies;
    const remaining = card.needed - foundCopies;
    return { ...card, foundCopies, remaining, found: remaining === 0 };
  });

  const write = (card: HuntCard, value: number, record = true) => {
    const previous = overrides[card.requestId] ?? card.foundCopies;
    const next = Math.max(card.tradedCopies, Math.min(card.needed, Math.round(value)));
    if (next === previous) return;
    setOverrides((current) => ({ ...current, [card.requestId]: next }));
    setError(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (record) {
      setLastChange({ requestId: card.requestId, previous, cardName: card.cardName });
      undoTimer.current = setTimeout(() => setLastChange(null), UNDO_MS);
    } else {
      setLastChange(null);
    }
    start(async () => {
      const result = await setRequestFoundAction(card.requestId, next);
      if (!result.ok) {
        setOverrides((current) => ({ ...current, [card.requestId]: previous }));
        setError(result.error);
        setLastChange(null);
        return;
      }
      if (typeof result.found === "number") {
        const found = result.found;
        setOverrides((current) => ({ ...current, [card.requestId]: found }));
      }
    });
  };

  const undo = () => {
    if (!lastChange) return;
    const card = hunt.cards.find((row) => row.requestId === lastChange.requestId);
    if (card) write(card, lastChange.previous, false);
  };

  return { cards, write, undo, lastChange, error, pending };
}

/**
 * A visitor's offer on the hunt: the picks, keyed by the REQUEST,
 * which every card has, so a card nobody has flared yet can be
 * answered like any other; the lines the review lists; and the one
 * send. The server decides whether each card is offered on a post or
 * sent as a message.
 */
export function useHuntOffer(hunt: Hunt, cards: LiveHuntCard[]) {
  const [review, setReview] = useState(false);
  /* What the last send did, shown under the pages once the sheet is
     closed. The sheet itself is remounted on each send so it opens
     fresh next time. */
  const [sent, setSent] = useState<Extract<HuntOfferOutcome, { ok: true }> | null>(
    null,
  );
  const [reviewKey, setReviewKey] = useState(0);

  const remainingFor = (requestId: string) =>
    cards.find((card) => card.requestId === requestId)?.remaining ?? 0;
  const selection = useSelection(remainingFor);
  const lines: OfferLine[] = Object.entries(selection.selected).flatMap(
    ([requestId, quantity]) => {
      const card = cards.find((row) => row.requestId === requestId);
      return card
        ? [
            {
              key: requestId,
              name: card.cardName,
              imageUrl: card.imageUrl,
              printingLabel: card.printingLabel,
              quantity,
              max: card.remaining,
            },
          ]
        : [];
    },
  );

  /* The server names a refused card "Name (Number)"; the review sheet
     keys them, so the names are turned back into keys for it. */
  const keysFor = (names: string[]) =>
    names.flatMap((name) => {
      const card = cards.find(
        (row) =>
          `${row.cardName} (${row.cardNumber})` === name || row.cardName === name,
      );
      return card ? [card.requestId] : [];
    });

  const submit = async (message: string) => {
    const outcome = await offerOnHuntAction(
      hunt.id,
      lines.map((line) => ({ requestId: line.key, quantity: line.quantity })),
      message,
    );
    if (outcome.ok) setSent(outcome);
    return { ...outcome, refused: keysFor(outcome.refused) };
  };

  /* Sent: the sheet closes and the summary below takes over. */
  const onSent = () => {
    selection.clear();
    setReview(false);
    setReviewKey((value) => value + 1);
  };

  return { selection, lines, submit, onSent, review, setReview, sent, reviewKey };
}

/**
 * What one send did: the cards offered on posts, the ones that went
 * to the owner as a message, and any the server could not take. Said
 * in full, because a visitor who picked three cards and sees "sent"
 * deserves to know where each one went.
 */
export function HuntSentLine({
  outcome,
  ownerName,
}: {
  outcome: Extract<HuntOfferOutcome, { ok: true }>;
  ownerName: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-accent/40 bg-accent/5 px-3 py-2 text-sm"
    >
      {outcome.offered > 0 && (
        <p className="flex items-center gap-2 font-semibold text-accent">
          <Check className="size-4" aria-hidden="true" />
          Offered {outcome.offered} {outcome.offered === 1 ? "card" : "cards"}.
        </p>
      )}
      {outcome.messaged > 0 && outcome.threadId && (
        <p className="flex items-center gap-2 font-semibold text-accent">
          <Check className="size-4" aria-hidden="true" />
          <Link
            href={`/local?thread=${encodeURIComponent(outcome.threadId)}`}
            className="hover:underline"
          >
            Sent to {ownerName} in Messages
          </Link>
        </p>
      )}
      {outcome.refused.length > 0 && (
        <p className="text-text-secondary">
          {outcome.refused.join(", ")} {outcome.refused.length === 1 ? "was" : "were"}{" "}
          answered while you were writing, so{" "}
          {outcome.refused.length === 1 ? "that one" : "those"} did not go.
        </p>
      )}
    </div>
  );
}

/** "Updated Nami", and the Undo that takes it back, for a few seconds. */
export function UndoLine({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-text-secondary">{label}</span>
      <button
        type="button"
        onClick={onUndo}
        className="flex shrink-0 cursor-pointer items-center gap-1 font-semibold text-accent hover:underline"
      >
        <Undo2 className="size-4" aria-hidden="true" />
        Undo
      </button>
    </div>
  );
}

/** "5 of 10 copies collected", and the bar that says the same. */
export function HuntProgress({ found, needed }: { found: number; needed: number }) {
  const percent = needed > 0 ? Math.round((found / needed) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-text-secondary tabular-nums">
        {found} of {needed} {needed === 1 ? "copy" : "copies"} collected
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={found}
        aria-label="Copies collected"
        className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** The bar at the foot of a visitor's pick: what is chosen, and the way on. */
export function HuntOfferFooter({
  cards,
  copies,
  onContinue,
}: {
  cards: number;
  copies: number;
  onContinue: () => void;
}) {
  return (
    <div className="sticky bottom-24 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-accent/40 bg-surface/95 p-3 shadow-[var(--shadow-card)] backdrop-blur">
      <p className="min-w-0 text-sm font-semibold text-text-primary tabular-nums">
        {selectionSummary(cards, copies)}
      </p>
      <Button type="button" size="sm" onClick={onContinue} className="shrink-0">
        {reviewLabel(cards)}
      </Button>
    </div>
  );
}

/** Name, description and who can see it. The owner only. */
export function HuntEditForm({ hunt, onDone }: { hunt: Hunt; onDone: () => void }) {
  const [name, setName] = useState(hunt.name);
  const [description, setDescription] = useState(hunt.description ?? "");
  const [visibility, setVisibility] = useState(hunt.visibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setError(null);
        start(async () => {
          const result = await updateHuntAction(hunt.id, {
            name,
            description: description || null,
            visibility,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onDone();
        });
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Name</span>
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">
          Description <span className="font-normal text-text-muted">Optional</span>
        </span>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={2}
          className="min-h-0"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Who can see it</span>
        <Select
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value === "private" ? "private" : "public")
          }
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </Select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || name.trim().length === 0}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
