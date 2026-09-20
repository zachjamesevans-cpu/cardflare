"use client";

import { useState } from "react";

import { TextInput } from "@/components/ui/controls";
import { TCG_GAMES, type GameSlug } from "@/lib/players/games-catalog";
import { DAY_NAMES, type StoreHours } from "@/lib/stores/hours";

/**
 * The hours, seven rows, and the games, six boxes: the two fields of
 * the store page that are not a line of text.
 *
 * Both live inside the page form and post with it, so there is one
 * Save. The hours are controlled because "Same as Monday" has to be
 * able to write six rows at once; the games are plain checkboxes.
 *
 * NOTHING IS POSTED UNTIL THE OWNER SAYS THE SHOP HAS HOURS. A form
 * that prefilled 11 to 9 on every day and posted it with the rest of
 * the page would put invented hours on a real shop's door the first
 * time its owner saved a phone number. So the rows sit behind one box,
 * and an unticked box posts no hours at all, which the schema reads as
 * "not set".
 */

type DayDraft = { closed: boolean; open: string; close: string };

/** A fresh row: the hours a card shop most often keeps. A starting point, not a fact. */
const FRESH: DayDraft = { closed: false, open: "11:00", close: "21:00" };

/* Monday first on the form, the way a sign on the door reads. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const LONG_DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function draftFrom(hours: StoreHours | null): DayDraft[] {
  return DAY_NAMES.map((_, day) => {
    const entry = hours?.[day];
    return entry ? { closed: false, ...entry } : { ...FRESH, closed: hours !== null };
  });
}

export function HoursFields({ hours }: { hours: StoreHours | null }) {
  const [set, setSet] = useState(hours !== null);
  const [days, setDays] = useState<DayDraft[]>(() => draftFrom(hours));

  const patch = (day: number, change: Partial<DayDraft>) =>
    setDays((current) =>
      current.map((entry, at) => (at === day ? { ...entry, ...change } : entry)),
    );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-text-secondary">Hours</legend>

      <label className="flex items-start gap-3 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={set}
          onChange={(event) => setSet(event.currentTarget.checked)}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="font-medium text-text-primary">Show opening hours.</span>{" "}
          Players see whether you are open right now.
        </span>
      </label>

      {set && (
        <div className="flex flex-col gap-2">
          {ORDER.map((day) => {
            const entry = days[day];
            return (
              <div
                key={day}
                className="grid grid-cols-[4.5rem_auto_1fr_1fr] items-center gap-2 text-sm"
              >
                <span className="font-medium text-text-primary">{DAY_NAMES[day]}</span>
                <label className="flex items-center gap-1.5 text-text-secondary">
                  <input
                    type="checkbox"
                    name={`hours.${day}.closed`}
                    checked={entry.closed}
                    onChange={(event) =>
                      patch(day, { closed: event.currentTarget.checked })
                    }
                    className="size-4 accent-accent"
                  />
                  Closed
                </label>
                <TextInput
                  type="time"
                  name={`hours.${day}.open`}
                  aria-label={`${LONG_DAY[day]} opens at`}
                  value={entry.open}
                  disabled={entry.closed}
                  required={!entry.closed}
                  onChange={(event) => patch(day, { open: event.currentTarget.value })}
                  className="px-2 py-2 text-sm disabled:opacity-40"
                />
                <TextInput
                  type="time"
                  name={`hours.${day}.close`}
                  aria-label={`${LONG_DAY[day]} closes at`}
                  value={entry.close}
                  disabled={entry.closed}
                  required={!entry.closed}
                  onChange={(event) => patch(day, { close: event.currentTarget.value })}
                  className="px-2 py-2 text-sm disabled:opacity-40"
                />
              </div>
            );
          })}

          <button
            type="button"
            className="self-start text-sm font-semibold text-accent underline-offset-4 hover:underline"
            onClick={() =>
              setDays((current) =>
                current.map((entry, at) => (at === 1 ? entry : { ...current[1] })),
              )
            }
          >
            Same as Monday, every day
          </button>
        </div>
      )}
    </fieldset>
  );
}

export function GamesFields({ games }: { games: GameSlug[] }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-text-secondary">
        Games you run
        <span className="ml-1.5 text-xs font-normal text-text-muted">Optional</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {TCG_GAMES.map((game) => (
          <label
            key={game.slug}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1.5 text-sm text-text-secondary has-[:checked]:border-accent has-[:checked]:text-text-primary"
          >
            <input
              type="checkbox"
              name="games"
              value={game.slug}
              defaultChecked={games.includes(game.slug)}
              className="size-4 accent-accent"
            />
            {game.shortName}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
