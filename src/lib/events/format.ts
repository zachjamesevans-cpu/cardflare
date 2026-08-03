import { instantToLocal, localToInstant, zoneAbbreviation } from "@/lib/time/zone";

/**
 * Event times, read and written in the store's own zone.
 *
 * These used to be UTC throughout, labelled as such so at least nothing lied.
 * It still meant a store in Texas read its own Friday schedule as "6:00 PM
 * UTC" — and worse, the times going *in* were misread. See
 * `src/lib/time/zone.ts` for that half.
 *
 * Every function takes the zone explicitly rather than reaching for a default.
 * A default is how a page quietly renders somebody else's schedule in the
 * wrong zone and nobody notices, because the number still looks like a time.
 */
const FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** The longest an event may run. Guards a typo, not a policy. */
export const MAX_DURATION_HOURS = 24;

/** The same calendar day *in the store's zone*, which is the day it feels like. */
function sameDayIn(start: Date, end: Date, timeZone: string): boolean {
  return (
    instantToLocal(start, timeZone).slice(0, 10) ===
    instantToLocal(end, timeZone).slice(0, 10)
  );
}

/**
 * A room's window, in the store's zone.
 *
 * `endsAt` is null while a walk-in room is still running — it has no planned
 * finish, and one is stamped only when it closes. "Open since" is the honest
 * rendering of that, rather than inventing a finishing time to keep the
 * formatting simple.
 *
 * The zone abbreviation is shown rather than the IANA name: "CDT" is what a
 * store owner would say out loud, and it changes with the season, so it also
 * quietly confirms the daylight-saving side is right.
 */
export function formatEventWindow(
  startsAt: string,
  endsAt: string | null,
  timeZone: string,
): string {
  const start = new Date(startsAt);
  const options = { ...FORMAT, timeZone };
  const zone = zoneAbbreviation(start, timeZone);

  if (!endsAt) {
    return `Open since ${new Intl.DateTimeFormat("en-US", options).format(start)} ${zone}`;
  }

  const end = new Date(endsAt);
  const startLabel = new Intl.DateTimeFormat("en-US", options).format(start);

  const endLabel = new Intl.DateTimeFormat("en-US", {
    ...options,
    ...(sameDayIn(start, end, timeZone)
      ? { weekday: undefined, day: undefined, month: undefined }
      : {}),
  }).format(end);

  return `${startLabel} – ${endLabel} ${zoneAbbreviation(end, timeZone)}`;
}

/** Value for a `datetime-local` input, which wants "YYYY-MM-DDTHH:mm". */
export function toDateTimeLocal(date: Date, timeZone: string): string {
  return instantToLocal(date, timeZone);
}

/**
 * A sensible default window: the next whole hour in the store's zone, running
 * four hours.
 *
 * Rounded on the *local* clock rather than on UTC, because a zone offset by
 * half an hour would otherwise prefill 6:30 when the store meant 7:00.
 */
export function defaultEventWindow(timeZone: string, now: Date = new Date()) {
  const local = instantToLocal(now, timeZone);
  const nextHour = `${local.slice(0, 13)}:00`;

  const start =
    localToInstant(nextHour, timeZone) ?? new Date(now.getTime() + 60 * 60 * 1000);
  start.setTime(start.getTime() + 60 * 60 * 1000);

  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);

  return {
    startsAt: toDateTimeLocal(start, timeZone),
    endsAt: toDateTimeLocal(end, timeZone),
  };
}

/** What went wrong turning two typed times into a window. */
export type WindowProblem = { field: "startsAt" | "endsAt"; message: string };

export type EventWindow =
  { ok: true; startsAt: Date; endsAt: Date } | { ok: false; problem: WindowProblem };

/**
 * Turns the two typed times into real instants, and checks them as instants.
 *
 * Kept out of the Zod schema because it needs the store's zone, which is not
 * in the form and must not be — it comes from the store row the server
 * resolved, so a submitted zone cannot move somebody else's event.
 *
 * The ordering and duration checks run on the converted instants rather than
 * on the typed strings. Across a daylight-saving change those differ: a window
 * that reads as four hours on the wall clock is three or five real ones, and
 * the string comparison would have been checking the wrong thing.
 */
export function eventWindowIn(
  startsAtLocal: string,
  endsAtLocal: string,
  timeZone: string,
): EventWindow {
  const startsAt = localToInstant(startsAtLocal, timeZone);
  const endsAt = localToInstant(endsAtLocal, timeZone);

  if (!startsAt) {
    return {
      ok: false,
      problem: { field: "startsAt", message: "Please choose a valid date and time." },
    };
  }

  if (!endsAt) {
    return {
      ok: false,
      problem: { field: "endsAt", message: "Please choose a valid date and time." },
    };
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    return {
      ok: false,
      problem: {
        field: "endsAt",
        message: "The end time must be after the start time.",
      },
    };
  }

  if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_HOURS * 60 * 60 * 1000) {
    return {
      ok: false,
      problem: {
        field: "endsAt",
        message: `An event cannot run longer than ${MAX_DURATION_HOURS} hours.`,
      },
    };
  }

  return { ok: true, startsAt, endsAt };
}
