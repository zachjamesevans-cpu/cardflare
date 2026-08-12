import { ArrowLeftRight } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * "This player will look at anything", said next to their name.
 *
 * Being open to trades is a fact about a person, not a thing they
 * posted, and the board used to treat it as a post: a full row with its
 * own card mark, and for somebody who had posted nothing else, an
 * entire section of the board to say one short sentence. The founder's
 * correction, and the right one — it belongs on the name, the way the
 * room roster has always shown it.
 *
 * Deliberately the same icon and the same words the roster already
 * uses, so the two surfaces are not two dialects of the same fact.
 */
export function OpenToTradesTag({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1 text-xs text-accent", className)}
    >
      <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden="true" />
      Open to trades
    </span>
  );
}
