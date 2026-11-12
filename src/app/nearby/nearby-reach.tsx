"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Circle, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { LOCAL_RADII } from "@/lib/local/shared";

import { setNearbyRadiusAction } from "./actions";

/**
 * Nearby's reach: the line that says where it is looking and how far,
 * and the button that looks further when nobody is close.
 *
 * The app's half is mobile/src/nearby-parts.tsx (`NearbyHeader`) and
 * the empty room in mobile/src/screens/home.tsx: the same words, the
 * same four distances, the same order. A client module because both
 * are taps that save and then wait for the page to come back.
 */

/** The four distances as the sheet says them. */
function withinLabel(miles: number): string {
  return `Within ${miles} miles`;
}

/** "Near you · 50 mi": where Nearby is looking, and how far. */
export function NearbyHeader({ miles }: { miles: number | null }) {
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  /* The line changes the moment a distance is tapped; the list under it
     follows when the server has looked again. */
  const [shown, setShown] = useOptimistic(miles);
  const [error, setError] = useState<string | null>(null);

  const choose = (radius: number) => {
    setPicking(false);
    start(async () => {
      setShown(radius);
      setError(null);
      const result = await setNearbyRadiusAction(radius);
      if (!result.ok) setError(result.error ?? "Could not save that.");
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPicking(true)}
        aria-haspopup="dialog"
        aria-busy={pending}
        aria-label={`Showing what is near you${shown ? ` within ${shown} miles` : ""}. Change distance`}
        className="flex cursor-pointer items-center gap-1.5 self-start rounded-full text-[15px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <MapPin className="size-4 text-accent" aria-hidden="true" />
        <span className="font-bold text-text-primary">Near you</span>
        <span className="text-text-secondary">
          {shown ? `· ${shown} mi` : "· Distance"}
        </span>
        <ChevronDown className="size-3.5 text-text-secondary" aria-hidden="true" />
      </button>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Change distance">
        <ul className="flex flex-col">
          {LOCAL_RADII.map((each) => {
            const on = each === shown;
            const Mark = on ? CheckCircle2 : Circle;
            return (
              <li key={each}>
                <button
                  type="button"
                  onClick={() => choose(each)}
                  aria-pressed={on}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2 py-3 text-left text-text-primary transition-colors hover:bg-elevated"
                >
                  <Mark
                    className={cn("size-4", on ? "text-accent" : "text-text-muted")}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{withinLabel(each)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

/** "Look within 100 miles", under an empty Nearby: the widest reach,
    offered while it is not already on. */
export function LookFurtherButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setNearbyRadiusAction(100);
            if (!result.ok) setError(result.error ?? "Could not save that.");
          })
        }
      >
        Look within 100 miles
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
