"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, ChevronDown, History, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { repostWantsAction } from "@/lib/players/account-actions";
import { REPOST_IDLE } from "@/lib/players/account-schema";

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
 * "Post these Flares again?" — the payoff of an account, folded shut.
 *
 * Third surface to wear the same gesture, and the founder's point: a
 * header with a count and a chevron now means "there is more inside"
 * everywhere in CardFlare — the room's roster, a player's section of
 * the board, and this. Learn it once.
 *
 * Shown only when the signed-in player has saved wants that are not
 * already on this board. One tap posts the lot; the panel disappears on
 * the re-render because nothing is outstanding any more.
 */
export function RepostWants({
  code,
  wants,
}: {
  code: string;
  /** Outstanding asks, resolved by the page. */
  wants: { id: string; label: string; quantity: number; deckLabel: string | null }[];
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
        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <History className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="font-semibold text-text-primary">
            Still hunting these from last time?
          </span>
        </span>
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
          <ul className="flex flex-col pt-3">
            {wants.map((want) => (
              <li
                key={want.id}
                className="flex flex-wrap items-baseline gap-x-2 border-t border-border py-2 text-sm first:border-t-0 first:pt-0"
              >
                <span className="text-text-primary">{want.label}</span>
                {want.quantity > 1 && (
                  <span className="text-text-muted tabular-nums">×{want.quantity}</span>
                )}
                {want.deckLabel && (
                  <span className="text-xs text-text-muted">{want.deckLabel}</span>
                )}
              </li>
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
