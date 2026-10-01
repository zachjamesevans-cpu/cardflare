"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

/** "9 cards you are still after are not posted here", or the singular. */
export function outstandingLine(count: number): string {
  return count === 1
    ? "1 card you are still after is not posted here"
    : `${count} cards you are still after are not posted here`;
}

/**
 * The foot of the board card: the payoff of an account, folded shut.
 *
 * One elevated row at the bottom of "Flares in the room": the count of
 * saved cards not yet on this board on the left, "Post them" in the
 * accent on the right. It used to be a folded card of its own above
 * the board, and the founder's read of the Room tab was that it was
 * one block too many. Tapping the row opens
 * it in place into the rows and the one button that posts the lot,
 * and the accent text turns into a chevron while it is open.
 *
 * The rows arrive as server-rendered children, the same slot pattern
 * GroupView uses for the board. That is deliberate twice over: the rows
 * share the stacked Flare row's exact anatomy (built next to it, in the
 * same terms), and they render on the same server path as the board
 * that demonstrably works, rather than as a client-side lookalike that
 * can drift or fail on its own.
 *
 * Shown only when the signed-in player has saved wants that are not
 * already on this board. One tap posts the lot; the row disappears on
 * the re-render because nothing is outstanding any more.
 */
export function RepostWants({
  code,
  count,
  children,
}: {
  code: string;
  /** Outstanding asks, so the row can count without seeing the rows. */
  count: number;
  /** The rows, server-rendered by WantEntries. */
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(repostWantsAction, REPOST_IDLE);
  const [open, setOpen] = useState(false);

  if (state.status === "posted") {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.06] px-3 py-2.5">
        <CheckCircle2 className="size-5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-sm text-text-secondary">
          {state.count === 0
            ? "Everything you are looking for is already on the board."
            : `${state.count} ${state.count === 1 ? "Flare" : "Flares"} posted. The room can see what you are looking for.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-[var(--radius-control)] border border-border bg-elevated">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 text-sm font-semibold text-text-primary">
          {outstandingLine(count)}
        </span>
        {open ? (
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 rotate-180 text-text-muted transition-transform duration-300"
          />
        ) : (
          <span className="shrink-0 text-sm font-bold text-accent">
            {count === 1 ? "Post it" : "Post them"}
          </span>
        )}
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-3 pt-3 pb-3">
            {children}

            <form
              action={formAction}
              className="flex flex-wrap items-center gap-3 pt-3"
            >
              <input type="hidden" name="code" value={code} />
              <SubmitButton count={count} />
              {state.status === "error" && (
                <p role="alert" className="text-sm text-danger">
                  {state.message}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
