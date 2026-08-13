import { Flame } from "lucide-react";

import { cn } from "@/lib/cn";
import { emberTier } from "@/lib/players/ember-rules";

/**
 * A player's lifetime Embers, wherever their name appears.
 *
 * The public half of the founder's two-number rule, and the reason that
 * rule exists: this number only ever goes up, so it means "this person
 * trades" and nothing else. The spendable balance is deliberately not
 * renderable by this component — there is no prop for it — so a badge
 * can never accidentally publish what somebody has left.
 *
 * Two sizes. `sm` is the one that rides beside a name in a roster or on
 * the Flare board, where it has to read at a glance and take almost no
 * width; `md` is the profile's own.
 */
export function EmberBadge({
  earned,
  size = "sm",
  showTier = false,
  className,
}: {
  earned: number;
  size?: "sm" | "md";
  /** Spells out the tier name. Worth the width on a profile, not in a list. */
  showTier?: boolean;
  className?: string;
}) {
  const tier = emberTier(earned);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/25 bg-accent/10 font-semibold text-accent tabular-nums",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm",
        className,
      )}
      /* The number alone is a mystery out of context; the title says
         what it counts. Assistive technology gets the same sentence. */
      title={`${earned.toLocaleString()} Embers earned · ${tier}`}
    >
      <Flame aria-hidden="true" className={size === "sm" ? "size-3" : "size-4"} />
      {earned.toLocaleString()}
      {showTier && <span className="font-medium opacity-80">· {tier}</span>}
      <span className="sr-only"> Embers earned, {tier}</span>
    </span>
  );
}
