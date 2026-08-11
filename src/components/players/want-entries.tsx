import { Minus, Plus } from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { Button } from "@/components/ui/button";
import {
  nudgeWantQuantityAction,
  removeWantAction,
} from "@/lib/players/account-actions";

/** One outstanding ask, as the room page resolves it. */
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

/**
 * The rows inside "Still hunting these?", as Server Components.
 *
 * Line for line the stacked Flare row's anatomy — same thumbnail size,
 * same name-and-Remove baseline line, same mono number and printing
 * line, same italic note — because the founder's spec is that opening
 * this panel should read as the stacked view everyone already knows.
 * Being built in the same terms on the same server path as the board
 * is also what keeps the two from drifting apart again: the previous
 * cut re-drew this list client-side and shipped a browser rendering
 * the rows with their text missing.
 *
 * The one addition is the pair of verbs a *saved* ask needs and a
 * room's Flare does not: a plus/minus on the quantity, and a Remove
 * that drops the want from the account for good. Both are plain forms
 * posting to Server Actions, so the list ships no JavaScript and every
 * number on screen is the database's.
 */
export function WantEntries({
  code,
  wants,
  imagesEnabled,
}: {
  code: string;
  wants: OutstandingWant[];
  /** Resolved on the server from NEXT_PUBLIC_ENABLE_CARD_IMAGES. */
  imagesEnabled: boolean;
}) {
  return (
    <ul className="flex flex-col pt-4">
      {wants.map((want) => (
        <li
          key={want.id}
          className="flex flex-col border-t border-border py-3 first:border-t-0 first:pt-0"
        >
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
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {/* Name and Remove share one baseline, the board's rule. */}
              <div className="flex items-baseline gap-x-2">
                <p className="min-w-0 font-semibold text-text-primary">
                  {want.cardName}
                </p>
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
                <span className="font-sans">
                  {want.printingLabel ?? "Any printing"}
                </span>
                {want.deckLabel && <span className="font-sans">{want.deckLabel}</span>}
              </p>

              {want.note && (
                <p className="text-sm text-text-secondary italic">{want.note}</p>
              )}

              {/*
               * The quantity, shown once, where it can be changed. The
               * board writes ×4 beside the name; here that number is a
               * setting rather than a fact, so it sits between the two
               * buttons that move it. Minus at one is disabled rather
               * than a deletion — removal has its own word above.
               */}
              <div className="mt-1 flex items-center gap-1.5">
                <QuantityNudge
                  code={code}
                  wantId={want.id}
                  delta={-1}
                  label={`One fewer ${want.cardName}`}
                  disabled={want.quantity <= 1}
                />
                <span className="w-7 text-center text-sm font-semibold text-text-primary tabular-nums">
                  {want.quantity}
                </span>
                <QuantityNudge
                  code={code}
                  wantId={want.id}
                  delta={1}
                  label={`One more ${want.cardName}`}
                  disabled={want.quantity >= 99}
                />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuantityNudge({
  code,
  wantId,
  delta,
  label,
  disabled,
}: {
  code: string;
  wantId: string;
  delta: number;
  label: string;
  disabled: boolean;
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
        {delta < 0 ? (
          <Minus className="size-3.5" aria-hidden="true" />
        ) : (
          <Plus className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}
