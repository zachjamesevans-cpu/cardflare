/**
 * A store's hours, the app's copy of the website's
 * `src/lib/stores/hours.ts`: the same seven-day shape and the same
 * lines a sign on the door reads. The bodies of `hoursLines` and
 * `formatClock` are kept identical to the web's on purpose;
 * `tests/unit/store-setup.test.ts` fails when they drift. Whether the
 * shop is open right now is decided by the server in the store's own
 * zone and arrives as `openNow`, so nothing here needs a time zone.
 */

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type DayHours = { open: string; close: string } | null;
export type StoreHours = DayHours[];

/** "11 am", "9:30 pm": the way a sign on the door says it. */
export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${hour} ${suffix}`
    : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * The hours folded into as few lines as they honestly can be:
 * "Mon to Thu 11 am to 9 pm", "Fri 11 am to 11 pm", "Sun closed".
 * Consecutive days with the same hours share a line.
 */
export function hoursLines(hours: StoreHours): { days: string; hours: string }[] {
  const lines: { from: number; to: number; text: string }[] = [];
  /* Monday first on a sign, the way people read a week. */
  const order = [1, 2, 3, 4, 5, 6, 0];
  for (const day of order) {
    const entry = hours[day];
    const text = entry
      ? `${formatClock(entry.open)} to ${formatClock(entry.close)}`
      : "closed";
    const last = lines[lines.length - 1];
    if (
      last &&
      last.text === text &&
      order.indexOf(last.to) === order.indexOf(day) - 1
    ) {
      last.to = day;
    } else {
      lines.push({ from: day, to: day, text });
    }
  }
  return lines.map((line) => ({
    days:
      line.from === line.to
        ? DAY_NAMES[line.from]
        : `${DAY_NAMES[line.from]} to ${DAY_NAMES[line.to]}`,
    hours: line.text,
  }));
}
