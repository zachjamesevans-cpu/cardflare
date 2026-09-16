"use client";

import { useState } from "react";
import { Flame } from "lucide-react";

import { NearbyCard } from "@/components/nearby/nearby-card";
import { buttonStyles } from "@/components/ui/button";

/**
 * Nearby matching, folded to one line above the composer.
 *
 * "Nearby matching: On · ZIP 98101 · Change" is everything somebody
 * needs to know on the way to posting; the full card, with the switch
 * and the ZIP field, opens only when they press it. Same behaviour
 * underneath: the card is the same component, and its action repaints
 * this page, so the line is never stale after a change.
 */
export function NearbyRow({
  enabled,
  postalCode,
}: {
  enabled: boolean;
  postalCode: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="flex flex-col gap-2">
        <NearbyCard enabled={enabled} postalCode={postalCode} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonStyles("ghost", "sm")}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-left text-sm shadow-[var(--shadow-card)] transition-colors hover:border-border-strong"
    >
      <Flame className="size-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-text-secondary">
        Nearby matching:{" "}
        <span className="font-semibold text-text-primary">
          {enabled ? "On" : "Off"}
        </span>
        {enabled && postalCode && (
          <span className="tabular-nums"> · ZIP {postalCode}</span>
        )}
      </span>
      <span className="shrink-0 font-semibold text-accent">Change</span>
    </button>
  );
}
