import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmBinderAction } from "@/lib/lists/actions";

/**
 * "Still carrying these?"
 *
 * Shown once on arriving at an event, when the binder was last confirmed
 * before this event began. One tap and it is not shown again for the rest of
 * the night, however many times the page is reloaded.
 *
 * This is what makes a binder that follows a player between events safe to
 * match against. Without it the list quietly rots: someone gets told "Zach has
 * this", walks over, and finds he traded it last week. One wrong match costs
 * more trust than ten missed ones, so freshness has to be a fact somebody
 * stated rather than an assumption.
 *
 * Editing is the same list below, so there is no "let me check" button here —
 * ignoring this card and going straight to the list does the right thing.
 */
export function ConfirmBinder({ code, count }: { code: string; count: number }) {
  return (
    <Card className="flex flex-col gap-4 border-accent/30 bg-accent/[0.05] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <PackageCheck
          className="mt-0.5 size-5 shrink-0 text-accent"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">
            Still carrying these {count} {count === 1 ? "card" : "cards"}?
          </p>
          <p className="text-sm text-text-secondary">
            Confirming keeps you matchable. Anything you have traded away, remove below.
          </p>
        </div>
      </div>

      <form action={confirmBinderAction} className="shrink-0">
        <input type="hidden" name="code" value={code} />
        <Button type="submit">Yes, all of them</Button>
      </form>
    </Card>
  );
}
