/**
 * Event time formatting.
 *
 * Server-rendered and therefore formatted in the server's zone, which on
 * Vercel is UTC. That is wrong for a store in Texas reading its own schedule,
 * and is the single biggest thing to fix before a second pilot in another
 * timezone — see ROADMAP.md. The label says UTC rather than quietly implying
 * local time, so what is shown is at least unambiguous.
 */
const FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
};

/**
 * A room's window.
 *
 * `endsAt` is null while a walk-in room is still running — it has no planned
 * finish, and one is stamped only when it closes. "Open since" is the honest
 * rendering of that, rather than inventing a finishing time to keep the
 * formatting simple.
 */
export function formatEventWindow(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);

  if (!endsAt) {
    return `Open since ${new Intl.DateTimeFormat("en-US", FORMAT).format(start)} UTC`;
  }

  const end = new Date(endsAt);

  const startLabel = new Intl.DateTimeFormat("en-US", FORMAT).format(start);
  const sameDay = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);

  const endLabel = new Intl.DateTimeFormat("en-US", {
    ...FORMAT,
    ...(sameDay ? { weekday: undefined, day: undefined, month: undefined } : {}),
  }).format(end);

  return `${startLabel} – ${endLabel} UTC`;
}

/** Value for a `datetime-local` input, which wants "YYYY-MM-DDTHH:mm". */
export function toDateTimeLocal(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/** A sensible default window: the next whole hour, running four hours. */
export function defaultEventWindow(now: Date = new Date()) {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  start.setUTCHours(start.getUTCHours() + 1);

  const end = new Date(start);
  end.setUTCHours(end.getUTCHours() + 4);

  return { startsAt: toDateTimeLocal(start), endsAt: toDateTimeLocal(end) };
}
