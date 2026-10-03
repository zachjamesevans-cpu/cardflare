"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import { setPackedAction } from "@/lib/events/night-actions";
import {
  bringLine,
  PACKED,
  VIEW_LIST,
  wantedByLine,
  WHAT_TO_BRING,
} from "@/lib/events/night-copy";
import type { BringCard } from "@/lib/events/night-matches";

/** How many cards the night page shows before "View list". */
export const INLINE_BRING = 3;

/**
 * What to bring: the cards in your Trade binder that somebody at this
 * night is hunting, as a checklist you tick as you pack.
 *
 * The founder (2026-10-03): "Helps users prepare before leaving. If
 * attendees are hunting cards in the user's Trade Binder, show those
 * cards... Allow marking cards 'Packed ✓'. A simple checklist."
 *
 * Three rows inline and View list for the rest, in place. Packed is a
 * checkbox per card that paints the moment it is pressed and persists
 * on the server (night_packing), so the list a player ticked on the
 * sofa is still ticked on the phone in the car. A failed save flips
 * the box back and says so. Drawn only when there is something to
 * bring: an empty checklist is a card with nothing in it. The app's
 * what-to-bring.tsx draws the same rows with the same words;
 * tests/unit/nights2-parity.test.ts holds the two together.
 */
export function WhatToBring({
  eventId,
  bring,
}: {
  eventId: string;
  bring: BringCard[];
}) {
  const [open, setOpen] = useState(false);
  const [packed, setPacked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(bring.map((row) => [row.card.cardId, row.packed])),
  );
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  if (bring.length === 0) return null;

  const rows = open ? bring : bring.slice(0, INLINE_BRING);
  const hidden = bring.length - rows.length;

  const toggle = (cardId: string) => {
    const next = !(packed[cardId] ?? false);
    setPacked((current) => ({ ...current, [cardId]: next }));
    setError(null);
    start(async () => {
      try {
        const result = await setPackedAction(eventId, cardId, next);
        if (!result.ok) throw new Error("not saved");
      } catch {
        setPacked((current) => ({ ...current, [cardId]: !next }));
        setError("That didn't save. Try again in a moment.");
      }
    });
  };

  return (
    <section className="flex flex-col gap-2" aria-labelledby="what-to-bring">
      <h2
        id="what-to-bring"
        className="text-xs font-semibold tracking-wide text-text-muted uppercase"
      >
        {WHAT_TO_BRING}
      </h2>
      <p className="text-sm text-text-secondary">{bringLine(bring.length)}</p>

      <ul className="flex flex-col divide-y divide-border">
        {rows.map(({ card, wantedBy }) => {
          const on = packed[card.cardId] ?? false;
          return (
            <li key={card.cardId} className="flex items-center gap-3 py-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={`${PACKED}: ${card.name} ${card.number}`}
                onClick={() => toggle(card.cardId)}
                className={cn(
                  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                  on
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border-strong bg-canvas text-transparent hover:border-accent",
                )}
              >
                <Check className="size-4" aria-hidden="true" />
              </button>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "flex items-baseline gap-x-2 text-sm",
                    on ? "text-text-muted line-through" : "text-text-primary",
                  )}
                >
                  <span className="truncate font-semibold">{card.name}</span>
                  <span className="shrink-0 font-mono text-xs text-text-muted">
                    {card.number}
                  </span>
                </span>
                <span className="text-xs text-text-muted">
                  {wantedByLine(wantedBy)}
                </span>
              </span>
              {on && (
                <span className="shrink-0 text-xs font-semibold text-accent">
                  {PACKED}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {(hidden > 0 || open) && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="self-start text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          {open ? "Show less" : VIEW_LIST}
        </button>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
