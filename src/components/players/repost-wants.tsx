"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  Folder,
  History,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  nudgeWantQuantityAction,
  removeWantAction,
  repostWantsAction,
} from "@/lib/players/account-actions";
import { REPOST_IDLE } from "@/lib/players/account-schema";

/** One outstanding ask, as the room resolves it. */
export interface OutstandingWant {
  id: string;
  cardName: string;
  cardNumber: string;
  printingLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  note: string | null;
  deckLabel: string | null;
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending
        ? "Posting…"
        : `Post ${count === 1 ? "it" : `all ${count}`} to this room`}
    </Button>
  );
}

/**
 * Plus, minus and remove: a saved want is editable where it is read.
 *
 * The founder's ask — the panel should not be a read-only reminder you
 * have to leave in order to correct. Each control is its own tiny form
 * posting to a Server Action, so the list is still server-rendered and
 * the numbers can never drift from the database.
 */
function Nudge({
  code,
  wantId,
  delta,
  label,
  disabled = false,
  children,
}: {
  code: string;
  wantId: string;
  delta: number;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={nudgeWantQuantityAction}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="wantId" value={wantId} />
      <input type="hidden" name="delta" value={delta} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={label}
        className="flex size-7 items-center justify-center rounded-[6px] border border-border text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
      >
        {children}
      </button>
    </form>
  );
}

function WantRow({
  code,
  want,
  imagesEnabled,
}: {
  code: string;
  want: OutstandingWant;
  imagesEnabled: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <CardImageZoom
          imageUrl={want.imageUrl}
          exactName={want.cardName}
          cardNumber={want.cardNumber}
          enabled={imagesEnabled}
          anyPrinting={!want.printingLabel}
          caption={want.printingLabel ?? "Any printing"}
          note={want.note}
          lookingFor={want.quantity}
          thumbClassName="w-10"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/*
           * Name and Remove share one baseline row, the same correction
           * the Flare board got: two columns aligned by their box tops
           * put the word "Remove" a few pixels below the card's name,
           * and a rail of them read as crooked.
           */}
          <div className="flex items-baseline gap-x-2">
            <p className="min-w-0 font-semibold text-text-primary">{want.cardName}</p>
            <form action={removeWantAction} className="ml-auto shrink-0">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="wantId" value={want.id} />
              <Button type="submit" variant="ghost" size="sm" className="-mr-3.5">
                Remove
              </Button>
            </form>
          </div>

          <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-text-muted">
            <span>{want.cardNumber}</span>
            <span className="font-sans">{want.printingLabel ?? "Any printing"}</span>
          </p>

          {want.note && (
            <p className="text-sm text-text-secondary italic">{want.note}</p>
          )}

          {want.deckLabel && (
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <Folder className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              {want.deckLabel}
            </p>
          )}

          <div className="mt-1 flex items-center gap-2">
            <Nudge
              code={code}
              wantId={want.id}
              delta={-1}
              label={`One fewer ${want.cardName}`}
              disabled={want.quantity <= 1}
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </Nudge>
            <span className="min-w-6 text-center text-sm font-semibold text-text-primary tabular-nums">
              {want.quantity}
            </span>
            <Nudge
              code={code}
              wantId={want.id}
              delta={1}
              label={`One more ${want.cardName}`}
              disabled={want.quantity >= 99}
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </Nudge>
            <span className="text-xs text-text-muted">
              {want.quantity === 1 ? "copy" : "copies"}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * "Still hunting these?" — the payoff of an account, folded shut.
 *
 * Third surface to wear the same gesture, and the founder's point: a
 * header with a count and a chevron now means "there is more inside"
 * everywhere in CardFlare — the room's roster, a player's section of
 * the board, and this. Learn it once. The header is one line, never
 * two: the question used to be long enough to wrap the count onto its
 * own row, which is what made this tile look unlike the other two.
 *
 * Open, it is the stacked board in miniature — art, name, number,
 * printing, note, folder — plus the controls the board has no business
 * carrying: the quantity of a *saved* ask, and dropping it for good.
 *
 * Shown only when the signed-in player has saved wants that are not
 * already on this board. One tap posts the lot; the panel disappears on
 * the re-render because nothing is outstanding any more.
 */
export function RepostWants({
  code,
  wants,
  imagesEnabled,
}: {
  code: string;
  /** Outstanding asks, resolved by the page. */
  wants: OutstandingWant[];
  /** Resolved on the server from NEXT_PUBLIC_ENABLE_CARD_IMAGES. */
  imagesEnabled: boolean;
}) {
  const [state, formAction] = useActionState(repostWantsAction, REPOST_IDLE);
  const [open, setOpen] = useState(false);

  /*
   * "Never mind" is a real answer. Without it the panel could only be
   * obeyed, which made a suggestion feel like a demand. Dismissal is
   * per visit: the wants are still saved, and the next event asks again.
   */
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (state.status === "posted") {
    return (
      <Card className="flex items-center gap-3 border-accent/30 bg-accent/[0.06]">
        <CheckCircle2 className="size-5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-sm text-text-secondary">
          {state.count === 0
            ? "Everything you are hunting is already on the board."
            : `${state.count} ${state.count === 1 ? "Flare" : "Flares"} posted. The room can see what you are hunting.`}
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col border-accent/30">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="flex min-w-0 items-center gap-2 font-semibold text-text-primary">
          <History className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate">Still hunting these?</span>
        </h2>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-text-muted tabular-nums">
            {wants.length} {wants.length === 1 ? "card" : "cards"}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 text-text-muted transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="flex flex-col pt-4">
            {wants.map((want) => (
              <WantRow
                key={want.id}
                code={code}
                want={want}
                imagesEnabled={imagesEnabled}
              />
            ))}
          </ul>
        </div>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-3 pt-3">
        <input type="hidden" name="code" value={code} />
        <SubmitButton count={wants.length} />
        <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
          Never mind
        </Button>
        {state.status === "error" && (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        )}
      </form>
    </Card>
  );
}
