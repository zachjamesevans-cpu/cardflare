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
 * The count rides with the button because the two move together: the
 * tap that turns Going on is the tap that makes it "3 going" instead
 * of "2 going", and a count painted by the page would lag the button
 * until the server round trip came back.
 *
 * Signed out, the button is a door to sign in that comes back here.
 * A button that cannot work is a lie, and a guest cannot be on a
 * roster that links to binders they do not have.
 *
 * The app's going-button.tsx is the same control with the same words;
 * tests/unit/nights-parity.test.ts holds the two together.
 */
export function GoingButton({
  eventId,
  youGoing,
  goingCount,
  signedIn,
  next,
  size = "sm",
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
