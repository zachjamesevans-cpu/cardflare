"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Undo2 } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/cn";
import { wantsLine } from "@/lib/feed/offer-copy";
import { setFlareFoundAction } from "@/lib/players/hunt-actions";
import type { FeedCard } from "@/lib/feed/repository";

/**
 * "Update progress", behind the menu on your own post in the Feed.
 *
 * The same ticks the profile's hunt panel makes, addressed by the Flare
 * instead of the request: the server maps a hunt-linked Flare onto its
 * request, so a copy marked here is the same copy the profile shows.
 * One stepper per card, the only control, and Undo for a few seconds
 * after each change. The audit of 2026-10-03 found the plus-one button
 * beside the stepper's plus to be the same button twice, so it went.
 */

const UNDO_MS = 6000;

export function FlareProgressSheet({
  open,
  onClose,
  cards,
}: {
  open: boolean;
  onClose: () => void;
  cards: FeedCard[];
}) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [lastChange, setLastChange] = useState<{
    flareId: string;
    previous: number;
    cardName: string;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const rows = cards.flatMap((card) => {
    if (!card.flareId) return [];
    const needed = card.quantity ?? 1;
    const serverFound = needed - (card.remaining ?? needed);
    const found = overrides[card.flareId] ?? serverFound;
    return [{ card, flareId: card.flareId, needed, found, remaining: needed - found }];
  });
  const allFound = rows.length > 0 && rows.every((row) => row.remaining === 0);
  const neededCopies = rows.reduce((sum, row) => sum + row.needed, 0);
  const foundCopies = rows.reduce((sum, row) => sum + row.found, 0);

  const write = (row: (typeof rows)[number], value: number, record = true) => {
    const next = Math.max(0, Math.min(row.needed, Math.round(value)));
    if (next === row.found) return;
    const previous = row.found;
    setOverrides((current) => ({ ...current, [row.flareId]: next }));
    setError(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (record) {
      setLastChange({ flareId: row.flareId, previous, cardName: row.card.cardName });
      undoTimer.current = setTimeout(() => setLastChange(null), UNDO_MS);
    } else {
      setLastChange(null);
    }
    start(async () => {
      const result = await setFlareFoundAction(row.flareId, next);
      if (!result.ok) {
        setOverrides((current) => ({ ...current, [row.flareId]: previous }));
        setError(result.error);
        setLastChange(null);
        return;
      }
      if (typeof result.found === "number") {
        const found = result.found;
        setOverrides((current) => ({ ...current, [row.flareId]: found }));
      }
    });
  };

  const undo = () => {
    if (!lastChange) return;
    const row = rows.find((entry) => entry.flareId === lastChange.flareId);
    if (row) write(row, lastChange.previous, false);
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Update progress">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-text-secondary tabular-nums">
            {foundCopies} of {neededCopies} {neededCopies === 1 ? "copy" : "copies"}{" "}
            collected
          </p>
          {allFound && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Check className="size-4" aria-hidden="true" />
              All found
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {lastChange && (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-text-secondary">
                Updated {lastChange.cardName}
              </span>
              <button
                type="button"
                onClick={undo}
                className="flex shrink-0 cursor-pointer items-center gap-1 font-semibold text-accent hover:underline"
              >
                <Undo2 className="size-4" aria-hidden="true" />
                Undo
              </button>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.flareId}
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-2.5",
                  row.remaining === 0 && "opacity-80",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated">
                    {row.card.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={row.card.imageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {row.card.cardName}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {row.card.cardNumber} · {row.card.printingLabel ?? "Any printing"}
                    </p>
                    <p className="flex flex-wrap gap-x-2 text-xs tabular-nums">
                      <span className="text-text-secondary">
                        {row.found} of {row.needed} found
                      </span>
                      <span className="font-semibold text-accent">
                        {wantsLine(row.needed, row.remaining)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-[3.25rem]">
                  <Stepper
                    value={row.found}
                    min={0}
                    max={row.needed}
                    disabled={pending}
                    label={`copies of ${row.card.cardName} found`}
                    onChange={(value) => write(row, value)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}
