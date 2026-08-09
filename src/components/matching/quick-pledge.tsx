"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Handshake, Loader2, Minus, Plus } from "lucide-react";

import { offerTradeAction, withdrawOfferAction } from "@/lib/matching/actions";

/**
 * The carousel tile's pledge control: a small handshake button, the
 * founder's pick over a text link — at tile size an icon reads faster
 * than words, and the handshake is already the offer's mark elsewhere.
 *
 * Fresh pledge, one copy asked: the tap is the pledge. More than one:
 * the button flips in place to a minimal stepper — minus, count, plus,
 * check — and the check submits. No popover; the tile is the form.
 *
 * A standing pledge keeps the button, filled in — the founder's call:
 * committing should not take the control away. Tapping it reopens the
 * stepper at your current count to change how many you are bringing,
 * and stepping down to zero turns the check into a withdraw. One
 * control, every state of the promise.
 *
 * While anything is in flight the whole tile greys out under a spinner
 * (the overlay anchors to the tile's `relative`), because a silent
 * button reads as broken — the founder felt it on device.
 */

function PendingOverlay() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 z-10 flex items-center justify-center rounded-[8px] bg-canvas/60"
    >
      <Loader2 className="size-5 animate-spin text-accent" />
    </span>
  );
}

function HandshakeFace({ offered }: { offered: boolean }) {
  return (
    <span
      className={`flex h-7 w-full items-center justify-center rounded-[6px] border transition-colors ${
        offered
          ? "border-accent bg-accent/25 text-accent"
          : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
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

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        aria-label={offered ? "Change your pledge" : label}
        title={offered ? "Change your pledge" : label}
        className="w-full"
      >
        <HandshakeFace offered={offered} />
      </button>
    );
  }

  /* Zero is a real answer once a pledge stands: the check withdraws it. */
  const floor = offered ? 0 : 1;
  const withdrawing = offered && count === 0;

  return (
    <form
      action={withdrawing ? withdrawOfferAction : offerTradeAction}
      className="flex h-7 items-center gap-0.5"
    >
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="flareId" value={flareId} />
      {!withdrawing && <input type="hidden" name="quantity" value={count} />}
      <PendingOverlay />
      <button
        type="button"
        onClick={() => setCount((n) => Math.max(floor, n - 1))}
        aria-label="One fewer"
        className="flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-border text-text-secondary"
      >
        <Minus className="size-3" aria-hidden="true" />
      </button>
      <span className="min-w-3 text-center text-[11px] font-semibold text-text-primary tabular-nums">
        {count}
      </span>
      <button
        type="button"
        onClick={() => setCount((n) => Math.min(Math.max(flareQuantity, 1), n + 1))}
        aria-label="One more"
        className="flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-border text-text-secondary"
      >
        <Plus className="size-3" aria-hidden="true" />
      </button>
      <button
        type="submit"
        aria-label={
          withdrawing ? "Take the pledge back" : `${label}, bringing ${count}`
        }
        className={`flex size-5 shrink-0 items-center justify-center rounded-[4px] ${
          withdrawing
            ? "border border-border text-text-secondary"
            : "bg-accent text-accent-contrast"
        }`}
      >
        <Check className="size-3" aria-hidden="true" />
      </button>
    </form>
  );
}
