"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Handshake, Loader2, Minus, Plus, X } from "lucide-react";

import { offerTradeAction, withdrawOfferAction } from "@/lib/matching/actions";

/**
 * The carousel tile's pledge control: a small handshake button, the
 * founder's pick over a text link — at tile size an icon reads faster
 * than words, and the handshake is already the offer's mark elsewhere.
 *
 * Fresh pledge, one copy asked: the tap is the pledge. Anything with a
 * count to choose opens the stepper — and the stepper is an overlay
 * panel ON the card art, not an inline expansion. The founder's
 * screenshots showed why: expanding in the flow shoved neighbouring
 * tiles' buttons around, and the rail's alignment is the whole point.
 * The panel floats above the tile (`z-20` against the li's `relative`),
 * the button underneath never moves, and tapping the button again
 * closes the panel.
 *
 * A standing pledge keeps the button, filled in — committing should not
 * take the control away. Reopening starts at your promised count, and
 * stepping to zero turns the check into a withdraw. While anything is
 * in flight the tile greys out under a spinner, because a silent button
 * reads as broken.
 */

function PendingOverlay() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 z-30 flex items-center justify-center rounded-[8px] bg-canvas/60"
    >
      <Loader2 className="size-5 animate-spin text-accent" />
    </span>
  );
}

/**
 * Grey means "you could", green means "you are" — the founder's rule,
 * and the classic one: neutral is an available action, colour is a
 * state change. The card carries everyone else's status (fan, chip,
 * grayscale); the button's colour answers exactly one question, is
 * the viewer on this hunt.
 */
function HandshakeFace({ offered }: { offered: boolean }) {
  return (
    <span
      className={`flex h-7 w-full items-center justify-center rounded-[6px] border transition-colors ${
        offered
          ? "border-accent bg-accent/25 text-accent"
          : "border-border text-text-muted hover:border-border-strong hover:text-text-secondary"
      }`}
    >
      <Handshake className="size-4" aria-hidden="true" />
    </span>
  );
}

function HandshakeSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="w-full disabled:opacity-60"
    >
      <HandshakeFace offered={false} />
    </button>
  );
}

export function QuickPledge({
  code,
  flareId,
  early = false,
  flareQuantity = 1,
  offered = false,
  ownQuantity = 1,
}: {
  code: string;
  flareId: string;
  early?: boolean;
  /** How many the Flare asks for; above one, the tap asks "how many". */
  flareQuantity?: number;
  /** The viewer's pledge is already standing: filled button, editable. */
  offered?: boolean;
  /** How many the standing pledge promised, the stepper's start. */
  ownQuantity?: number;
}) {
  const [picking, setPicking] = useState(false);
  const [count, setCount] = useState(Math.max(offered ? ownQuantity : 1, 1));

  const label = early ? "I got you" : "I got it";

  /* A fresh pledge on a one-of needs no conversation: the tap is it. */
  if (!offered && flareQuantity <= 1) {
    return (
      <form action={offerTradeAction}>
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="flareId" value={flareId} />
        <PendingOverlay />
        <HandshakeSubmit label={label} />
      </form>
    );
  }

  /* Zero is a real answer once a pledge stands: the check withdraws it. */
  const floor = offered ? 0 : 1;
  const withdrawing = offered && count === 0;

  return (
    <>
      {picking && (
        <div className="absolute inset-x-0 top-0 z-20 flex aspect-[63/88] flex-col items-center justify-center gap-1.5 rounded-[7px] border border-border bg-canvas/95">
          <button
            type="button"
            onClick={() => setPicking(false)}
            aria-label="Never mind"
            className="absolute top-1 right-1 text-text-muted hover:text-text-secondary"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>

          <form
            action={withdrawing ? withdrawOfferAction : offerTradeAction}
            className="flex flex-col items-center gap-1.5"
          >
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="flareId" value={flareId} />
            {!withdrawing && <input type="hidden" name="quantity" value={count} />}
            <PendingOverlay />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCount((n) => Math.max(floor, n - 1))}
                aria-label="One fewer"
                className="flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-border text-text-secondary"
              >
                <Minus className="size-3" aria-hidden="true" />
              </button>
              <span className="min-w-4 text-center text-xs font-bold text-text-primary tabular-nums">
                {count}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCount((n) => Math.min(Math.max(flareQuantity, 1), n + 1))
                }
                aria-label="One more"
                className="flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-border text-text-secondary"
              >
                <Plus className="size-3" aria-hidden="true" />
              </button>
            </div>

            <button
              type="submit"
              aria-label={
                withdrawing ? "Take the pledge back" : `${label}, bringing ${count}`
              }
              className={`flex h-5 w-11 items-center justify-center rounded-[4px] text-[10px] font-semibold ${
                withdrawing
                  ? "border border-border text-text-secondary"
                  : "bg-accent text-accent-contrast"
              }`}
            >
              {withdrawing ? "Undo" : <Check className="size-3" aria-hidden="true" />}
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setPicking((open) => !open)}
        aria-label={offered ? "Change your pledge" : label}
        title={offered ? "Change your pledge" : label}
        className="w-full"
      >
        <HandshakeFace offered={offered} />
      </button>
    </>
  );
}
