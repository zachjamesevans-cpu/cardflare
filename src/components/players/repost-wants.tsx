"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, History, Loader2 } from "lucide-react";

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
 * "Post these Flares again?" — the payoff of an account.
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
  /** Outstanding asks, resolved by the page: name plus printing label. */
  wants: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(repostWantsAction, REPOST_IDLE);

  /*
   * "Never mind" is a real answer. Without it the panel could only be
   * obeyed, which made a suggestion feel like a demand; the founder
   * called it out. Dismissal is per visit, not forever: the wants are
   * still saved, and next event the question is fresh.
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
    <Card className="flex flex-col gap-3 border-accent/30">
      <div className="flex items-center gap-2">
        <History className="size-4 text-accent" aria-hidden="true" />
        <p className="font-semibold text-text-primary">
          Still hunting these from last time?
        </p>
      </div>

      <p className="text-sm text-text-secondary">
        {wants.map((want) => want.label).join(" · ")}
      </p>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
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
