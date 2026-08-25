/**
 * Converting between a wall-clock time somebody typed and an instant.
 *
 * An event happens at a place, and the place has a timezone. A store owner in
 * Austin typing "6:00 PM" means six in the evening in Austin, on whichever
 * side of a daylight-saving change that date falls. Everything here exists to
 * hold that one idea correctly.
 *
 * The bug this replaces was worse than a formatting problem. `datetime-local`
 * submits "2026-09-12T18:00" with no zone at all, and `Date.parse` reads a
 * bare string like that in the *server's* zone — UTC on Vercel. So a store
 * typing 6pm stored 18:00 UTC, which is one in the afternoon in Austin. The
 * displayed "6:00 PM UTC" was honest about the number and wrong about the
 * event.
 *
 * No date library. `Intl` already carries the full IANA database, and the two
 * functions below are the whole of what cardflare needs — a dependency here
 * would be several hundred kilobytes to avoid forty lines that can be tested
 * exactly.
 *
 * Free of server-only imports so it stays directly unit-testable.
 */

/** The shape `datetime-local` submits, and the only shape accepted. */
const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const UTC = "UTC";

/**
 * Whether a string names a timezone this runtime knows.
 *
 * Checked by asking `Intl` to use it rather than against a hardcoded list: the
 * IANA database changes, and a list in here would rot. Zone names arrive from
 * a form, so this is a validation boundary, not a formality.
 */
export function isValidTimeZone(value: string): boolean {
  if (!value) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every zone a picker should offer, with the current one guaranteed present.
 *
 * `Intl.supportedValuesOf` lists canonical zone names and **does not include
 * "UTC"** — which is the column default, so an unset store's `<select>` had
 * nothing matching its own value and the browser silently preselected the
 * first option in the list, Africa/Abidjan. Saving that would have set a zone
 * the store never chose. It happens to share UTC's offset, so the times would
 * have looked right while the label lied.
 *
 * The same applies to any zone dropped from a future IANA release: whatever
 * the store is on now stays selectable, so opening the form can never quietly
 * change it.
 */
export function knownTimeZones(current?: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  if (!current || zones.includes(current)) return [UTC, ...zones];

  return [UTC, ...(current === UTC ? [] : [current]), ...zones];
}

/**
 * How far ahead of UTC a zone is at a given instant, in milliseconds.
 *
 * Derived by asking `Intl` what the wall clock reads there and subtracting.
 *
 * `hourCycle: "h23"` rather than `hour12: false`. The two are not the same:
 * `hour12: false` has historically selected the h24 cycle in some
 * implementations, which renders midnight as "24" and puts the result a day
 * out for one hour in every twenty-four. Asking for h23 by name is the
 * spec-correct way to get 0–23, and it removes the need for a defensive
 * modulo that no test on a compliant runtime could ever exercise.
 */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const wallClock = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour"),
    at("minute"),
    at("second"),
  );

  // Milliseconds are not in the parts, so compare on whole seconds.
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Turns a typed wall-clock time in a zone into the instant it names.
 *
 * Two passes, and the second one is not optional. The first guess uses the
 * offset in force at the *wrong* instant — the typed time read as UTC — which
 * is off by an hour whenever that guess lands on the other side of a
 * daylight-saving change from the real answer. Re-reading the offset at the
 * candidate instant corrects it.
 *
 * Returns null for anything that is not the shape `datetime-local` submits, or
 * for a zone this runtime does not know. Both arrive from a form.
 */
export function localToInstant(local: string, timeZone: string): Date | null {
  if (!LOCAL_PATTERN.test(local)) return null;
  if (!isValidTimeZone(timeZone)) return null;

  const asIfUtc = Date.parse(`${local}:00.000Z`);
  if (Number.isNaN(asIfUtc)) return null;

  const firstGuess = asIfUtc - offsetMsAt(new Date(asIfUtc), timeZone);
  const corrected = asIfUtc - offsetMsAt(new Date(firstGuess), timeZone);

  return new Date(corrected);
}

/**
 * Turns an instant back into the wall-clock string a `datetime-local` wants.
 *
 * The inverse of `localToInstant`, used to prefill the form with a sensible
 * default and to edit an existing event without shifting it.
 */
export function instantToLocal(instant: Date, timeZone: string): string {
  const shifted = new Date(instant.getTime() + offsetMsAt(instant, timeZone));

  return shifted.toISOString().slice(0, 16);
}

/**
 * The same wall-clock time, some days later, in a zone.
 *
 * How a recurring event rolls forward: "+7 × 24 hours" is wrong twice a
 * year — a 6pm Wednesday event crossing a daylight-saving change would
 * drift to 5pm or 7pm. Going instant → wall clock → +days → instant keeps
 * 6pm meaning 6pm, which is the only thing a store's schedule promises.
 */
export function plusDaysInZone(instant: Date, days: number, timeZone: string): Date {
  const wall = instantToLocal(instant, timeZone);
  const shifted = new Date(Date.parse(`${wall}:00.000Z`) + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  return (
    localToInstant(shifted, timeZone) ??
    new Date(instant.getTime() + days * 24 * 60 * 60 * 1000)
  );
}

/**
 * A short label for a zone, as somebody would recognise it.
 *
 * "CDT" beats "America/Chicago" on a dashboard: it is what a store owner would
 * say out loud, and it disambiguates the half of the year the offset changes.
 * Falls back to the zone name where a runtime has no abbreviation for it.
 */
export function zoneAbbreviation(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(instant);

  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}
