"use client";

import { useState, useTransition } from "react";
import { Flame } from "lucide-react";

import { PostalAsk } from "@/components/feed/postal-ask";
import { Card } from "@/components/ui/card";
import { setNearbyMatchingAction } from "@/lib/nearby/actions";
import { cn } from "@/lib/cn";

/**
 * The Nearby matching switch, on the Flare tab above the two lists.
 *
 * One toggle for both directions: your Flares against cards people
 * nearby will trade, and your marked cards against their Flares. The
 * copy says the one thing that matters about privacy, that only the
 * two people in a match ever see it. A ZIP is asked for right here
 * when there is none, because without one nothing can match and a
 * switch that does nothing is worse than no switch.
 */
export function NearbyCard({
  enabled: initial,
  postalCode,
}: {
  enabled: boolean;
  postalCode: string | null;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flip = () => {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setNearbyMatchingAction(next);
      if (!result.ok) {
        setEnabled(!next);
        setError(result.message);
      }
    });
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Flame className="size-4 text-accent" aria-hidden="true" />
            Nearby matching
          </p>
          <p className="text-xs text-text-secondary">
            Match your Flares with cards people near you will trade, and theirs with
            yours. Only the two of you ever see a match.
          </p>
        </div>
        <Toggle on={enabled} pending={pending} onClick={flip} label="Nearby matching" />
      </div>

      {/* The ZIP field is here whenever the switch is on, filled with
          what is saved: "Change" on the folded row has to lead
          somewhere, and a card that only asked when there was nothing
          to change would be a dead end for the one thing it promised.
          Clearing the field is allowed on purpose, since an emptied
          ZIP is how a player takes their location back. */}
      {enabled && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-sm text-text-secondary">
            {postalCode
              ? "Matching around this ZIP. Change it here."
              : "Nearby needs to know roughly where you are. Just the ZIP."}
          </p>
          <PostalAsk defaultValue={postalCode ?? ""} allowClear submitLabel="Save" />
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

/**
 * A switch, drawn as one. The website had no toggle control; every
 * on/off so far was a button that said the opposite. A per-card list
 * of those reads as a column of arguments, so this is a pill.
 */
export function Toggle({
  on,
  pending = false,
  onClick,
  label,
}: {
  on: boolean;
  pending?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      onClick={onClick}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
        on ? "border-accent bg-accent" : "border-border-strong bg-elevated",
        pending && "opacity-60",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 size-5.5 rounded-full transition-[left]",
          on ? "left-[calc(100%-1.5rem)] bg-accent-contrast" : "left-0.5 bg-text-muted",
        )}
      />
    </button>
  );
}
