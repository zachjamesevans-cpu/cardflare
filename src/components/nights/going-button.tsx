"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { goingAction } from "@/lib/events/going-actions";
import { GOING, goingLine, YOURE_GOING } from "@/lib/events/going-copy";

/**
 * Going, or You're going: one button, the same words on both platforms.
 *
 * The founder: "you just say you're going to an event. Or a tournament
 * night. That room stays 'open' and anyone can go into there and see
 * who is looking for which cards before the tournament or event
 * starts." This is the one tap. It flips the moment it is pressed and
 * settles on what the server says, the way the Follow button does, so
 * a tap on a phone in a shop reads as done rather than stuck. If the
 * write fails the label and the count go back to the truth.
 *
 * Two shapes. The full one carries the count beside it, because the
 * two move together: the tap that turns Going on is the tap that makes
 * it "3 going" instead of "2 going". The compact one is for a line
 * that already says how many are going in its own words (the Nights
 * card and the night's header): a lime chip that says "Going" until
 * it is pressed, then a check and the same word, which presses off
 * again. Nights round 2: "'Going' with a check when youGoing, else the
 * Going button in its chip size."
 *
 * Signed out, the button is a door to sign in that comes back here.
 * A button that cannot work is a lie, and a guest cannot be on a
 * roster that links to binders they do not have.
 *
 * The app's going-button.tsx is the same control with the same words;
 * tests/unit/nights-parity.test.ts holds the two together.
 */

/** The compact chip, when it is not yet pressed: a small lime pill. */
const CHIP =
  "inline-flex h-6 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-55";

/** The compact chip once pressed: the check and the word, in the accent. */
const CHIP_ON =
  "inline-flex h-6 cursor-pointer items-center gap-1 rounded-full text-xs font-semibold text-accent transition-colors hover:text-accent-hover disabled:pointer-events-none disabled:opacity-55";

export function GoingButton({
  eventId,
  youGoing,
  goingCount,
  signedIn,
  next,
  size = "sm",
  compact = false,
  className,
}: {
  eventId: string;
  /** Whether the viewer is on this night's roster. */
  youGoing: boolean;
  /** How many are, the viewer included. */
  goingCount: number;
  /** A signed-in account can say Going; anyone else gets the sign-in door. */
  signedIn: boolean;
  /** Where to come back to after signing in, e.g. `/e/MOX7VG`. */
  next: string;
  size?: "sm" | "md";
  /**
   * The chip: no count of its own, "Going" as a small pill, the check
   * and the word once pressed. For a line that says the count itself.
   */
  compact?: boolean;
  className?: string;
}) {
  const [going, setGoing] = useState(youGoing);
  const [count, setCount] = useState(goingCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* The server's truth, when a refresh brings a newer one and no tap
     is in flight to argue with it: the room re-reads itself on a
     timer, and a count painted an hour ago is the wrong count. */
  const [seen, setSeen] = useState({ youGoing, goingCount });
  if (seen.youGoing !== youGoing || seen.goingCount !== goingCount) {
    setSeen({ youGoing, goingCount });
    if (!pending) {
      setGoing(youGoing);
      setCount(goingCount);
    }
  }

  if (!signedIn) {
    if (compact) {
      return (
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className={cn(CHIP, className)}
        >
          {GOING}
        </Link>
      );
    }
    return (
      <span className={cn("flex flex-wrap items-center gap-3", className)}>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className={buttonStyles("primary", size)}
        >
          {GOING}
        </Link>
        <span className="text-sm text-text-secondary tabular-nums">
          {goingLine(goingCount)}
        </span>
      </span>
    );
  }

  const toggle = () => {
    if (pending) return;
    const nextGoing = !going;
    const before = { going, count };
    setGoing(nextGoing);
    setCount(Math.max(0, count + (nextGoing ? 1 : -1)));
    setError(null);
    startTransition(async () => {
      try {
        const result = await goingAction(eventId, nextGoing);
        if (result.ok) {
          setGoing(result.youGoing);
          setCount(result.goingCount);
        } else {
          setGoing(before.going);
          setCount(before.count);
          setError(result.message);
        }
      } catch {
        setGoing(before.going);
        setCount(before.count);
        setError("That didn't save. Try again in a moment.");
      }
    });
  };

  const Icon = pending ? Loader2 : going ? Check : null;

  if (compact) {
    return (
      <span className={cn("flex flex-col gap-1", className)}>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={going}
          disabled={pending}
          className={going ? CHIP_ON : CHIP}
        >
          {Icon && (
            <Icon
              className={cn("size-3.5", pending && "animate-spin")}
              aria-hidden="true"
            />
          )}
          {GOING}
        </button>
        {error && (
          <span role="alert" className="text-xs text-danger">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <span className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={going}
          disabled={pending}
          className={buttonStyles(going ? "secondary" : "primary", size)}
        >
          {Icon && (
            <Icon
              className={cn("size-4", pending && "animate-spin")}
              aria-hidden="true"
            />
          )}
          {going ? YOURE_GOING : GOING}
        </button>
        <span className="text-sm text-text-secondary tabular-nums">
          {goingLine(count)}
        </span>
      </span>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
