import { Crosshair } from "lucide-react";

import type { Hunt } from "@/lib/players/hunts";

/**
 * Somebody's hunts, on their profile.
 *
 * The founder: "I can go to someone's proifle and they can have a
 * section for their flaregroups with cards they already found, and cards
 * they're still looking for... see like 'Sabo' with the cards, quantit
 * theyre still looking for, and the cards tehy've already found."
 *
 * So each row is a name and two numbers, and the two numbers are the
 * whole point: what is left says whether you can help, and what is found
 * says whether the hunt is worth reading at all. A hunt with nothing
 * left is not hidden - finishing one is the good outcome, and a profile
 * that quietly drops them would only ever show unfinished work.
 *
 * NOTHING IS CHECKED OFF BY HAND. A card moves from looking to found
 * when the trade that got it is confirmed, which is the one moment we
 * can be sure actually happened. A tick box would be a second thing to
 * keep in step with the first.
 */
export function HuntsPanel({
  hunts,
  limit,
  yours,
}: {
  hunts: Hunt[];
  /** How many they may keep, when it is worth saying. */
  limit?: number;
  yours?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-text-primary">
          <Crosshair className="size-4 text-accent" aria-hidden="true" />
          Hunts
        </p>
        {limit ? (
          <p className="text-xs text-text-muted tabular-nums">
            {hunts.length} of {limit}
          </p>
        ) : null}
      </div>

      {hunts.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {yours
            ? "Name a group when you post and every card you add joins it. The set shows up here, with what is left and what you have found."
            : "No hunts yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {hunts.map((hunt) => (
            <li
              key={hunt.name}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2.5"
            >
              <span className="min-w-0 truncate font-semibold text-text-primary">
                {hunt.name}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                {hunt.looking > 0 ? (
                  <span className="text-accent">{lookingLabel(hunt)}</span>
                ) : (
                  <span className="text-text-muted">All found</span>
                )}
                {hunt.found > 0 ? (
                  <span className="text-text-muted">· {hunt.found} found</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "3 left", or "3 left (5 copies)" when somebody wants more than one of
 * something. The copies only appear when they differ from the card
 * count, because "3 left (3 copies)" is the same fact twice.
 */
export function lookingLabel(hunt: Hunt): string {
  if (hunt.lookingCopies > hunt.looking) {
    return `${hunt.looking} left · ${hunt.lookingCopies} copies`;
  }
  return `${hunt.looking} left`;
}
