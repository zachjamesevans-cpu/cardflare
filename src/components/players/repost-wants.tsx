"use client";

import { useActionState, useState, type ReactNode } from "react";
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
 * "Still hunting these?" — the payoff of an account, folded shut.
 *
 * Closed, this tile is EXACTLY the roster's silhouette: icon, question,
 * count, chevron, one line, nothing else. The founder's screenshot of
 * the previous cut had the Post button and a "Never mind" sitting under
 * the header, which made this the one fat tile in a column of thin
 * ones. Both moved: Post lives inside the fold with the list it posts,
 * and "Never mind" is gone entirely — a tile that starts closed no
 * longer needs a second way to be ignored.
 *
 * The rows arrive as server-rendered children, the same slot pattern
 * GroupView uses for the board. That is deliberate twice over: the rows
 * share the stacked Flare row's exact anatomy (built next to it, in the
 * same terms), and they render on the same server path as the board
 * that demonstrably works, rather than as a client-side lookalike that
 * can drift or fail on its own.
 *
 * Shown only when the signed-in player has saved wants that are not
 * already on this board. One tap posts the lot; the panel disappears on
 * the re-render because nothing is outstanding any more.
 */
export function RepostWants({
  code,
  count,
  children,
}: {
  code: string;
  /** Outstanding asks, so the header can count without seeing the rows. */
  count: number;
  /** The rows, server-rendered by WantEntries. */
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(repostWantsAction, REPOST_IDLE);
  const [open, setOpen] = useState(false);

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
    <Card className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="flex min-w-0 items-center gap-2 font-semibold text-text-primary">
          <History className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="truncate">Still hunting these?</span>
        </h2>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-text-muted tabular-nums">
            {count} {count === 1 ? "card" : "cards"}
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
          {children}

          <form action={formAction} className="flex flex-wrap items-center gap-3 pt-3">
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
    </Card>
  );
}
