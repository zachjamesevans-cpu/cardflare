"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  nudgeWantQuantityAction,
  removeWantAction,
} from "@/lib/players/account-actions";

/**
 * The hunting panel's verbs, with every tap acknowledged.
 *
 * The founder's report: tapping minus or Remove "stalls for a second",
 * because these shipped as plain forms with no pending state while the
 * board's Remove had already learned the grey-and-spinner veil. Every
 * control here now drops that veil over its whole row the instant it is
 * pressed, so the wait reads as working instead of frozen.
 *
 * And minus counts all the way down: at one, the minus button becomes
 * the remove — one gesture from four copies to none, no dead-ends. The
 * quantity action clamps at one server-side, so the client routes the
 * last step to the remove action instead.
 */

function PendingVeil() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-0 z-30 flex items-center justify-center rounded-[8px] bg-canvas/60 backdrop-grayscale"
      >
        <Loader2 className="size-5 animate-spin text-accent" />
      </span>
      <span role="status" className="sr-only">
        Updating your list
      </span>
    </>
  );
}

export function WantNudge({
  code,
  wantId,
  delta,
  quantity,
  cardName,
}: {
  code: string;
  wantId: string;
  delta: 1 | -1;
  quantity: number;
  cardName: string;
}) {
  /* The last minus is a removal, said plainly to assistive tech too. */
  const removes = delta < 0 && quantity <= 1;

  return (
    <form action={removes ? removeWantAction : nudgeWantQuantityAction}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="wantId" value={wantId} />
      {!removes && <input type="hidden" name="delta" value={delta} />}
      <PendingVeil />
      <button
        type="submit"
        disabled={delta > 0 && quantity >= 99}
        aria-label={
          removes
            ? `Remove ${cardName}`
            : delta < 0
              ? `One fewer ${cardName}`
              : `One more ${cardName}`
        }
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

export function WantRemove({ code, wantId }: { code: string; wantId: string }) {
  return (
    <form action={removeWantAction} className="ml-auto shrink-0">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="wantId" value={wantId} />
      <PendingVeil />
      <Button type="submit" variant="ghost" size="sm" className="-mr-3.5">
        Remove
      </Button>
    </form>
  );
}
