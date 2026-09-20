import type { StoreHoursJson } from "@/lib/supabase/types";

/**
 * A store's hours: seven days, Sunday first, each open-to-close or
 * closed. Kept as the one shape the form, the page and the app read,
 * so "when the regulars turn up" is answered the same way everywhere.
 * Plain module.
 */

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type DayHours = { open: string; close: string } | null;
export type StoreHours = DayHours[];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Seven entries of "HH:MM" pairs or null, or null for anything else. */
export function parseHours(value: unknown): StoreHours | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  const days: StoreHours = [];
  for (const day of value) {
    if (day === null) {
      days.push(null);
      continue;
    }
    if (
      !day ||
      typeof day !== "object" ||
      typeof (day as { open?: unknown }).open !== "string" ||
      typeof (day as { close?: unknown }).close !== "string"
    ) {
      return null;
    }
    const { open, close } = day as { open: string; close: string };
    if (!TIME.test(open) || !TIME.test(close)) return null;
    days.push({ open, close });
  }
  return days;
}

export const hoursToJson = (hours: StoreHours): StoreHoursJson => hours;

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

/** Whether the store is open at this moment in its own time zone. */
export function openNow(hours: StoreHours, now: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const day = DAY_NAMES.indexOf(weekday as (typeof DAY_NAMES)[number]);
  const entry = day >= 0 ? hours[day] : null;
  if (!entry) return false;
  const clock = `${hour === "24" ? "00" : hour}:${minute}`;
  return clock >= entry.open && clock < entry.close;
}
