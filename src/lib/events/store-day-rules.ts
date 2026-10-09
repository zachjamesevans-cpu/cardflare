/**
 * Store days: the rules and the words, with no server in them.
 *
 * The founder (2026-10-09): "I miss the simplicity of just getting into
 * a room." The store is the room and a day is the time. A player says
 * they are going to a store on a day; that opens the store's room for
 * the day, and everyone else going that day is in it with them, before
 * anyone leaves home. Scanning the counter, or opening the app at the
 * store, walks into the same room. A night the store posted is still
 * used for its day.
 *
 * Kept free of server imports so the dates, hours and words are
 * unit-testable, and mirrored word for word in the app by
 * `mobile/src/store-day-copy.ts`.
 */

/** Today and the six days after it: a week of days to pick from. */
export const PLAN_DAYS = 7;

/** A store that has not said its hours is open these, for a day room's bounds. */
export const DEFAULT_OPEN = "11:00";
export const DEFAULT_CLOSE = "22:00";

/** How close to a store's pin counts as being at the store, in metres. */
export const HERE_RADIUS_METERS = 150;

/** What a day room is called. The store's name is beside it everywhere. */
export const DAY_ROOM_NAME = "Open trading";

/** "2026-10-16" plus n days, in the calendar, with no clock involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** The days on offer, from the store's own today. */
export function planDates(today: string): string[] {
  return Array.from({ length: PLAN_DAYS }, (_, i) => addDays(today, i));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** 0 for Sunday, the index store hours use. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The chip: "Today", "Tomorrow", then "Fri 17". */
export function dayChipLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return `${WEEKDAYS[weekdayOf(date)]} ${Number(date.slice(8, 10))}`;
}

/** The same day in a sentence: "today", "tomorrow", "Friday". */
export function dayInWords(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return WEEKDAYS_LONG[weekdayOf(date)];
}

type DayHours = { open: string; close: string } | null;

/**
 * The store's hours on a date, or null when it is closed that day.
 * Seven entries, Sunday first, as the store's page saves them; no hours
 * at all means the defaults. A close at or before the open is past
 * midnight, the next calendar day.
 */
export function dayWindow(
  hours: readonly DayHours[] | null,
  date: string,
): { open: string; close: string; closesNextDay: boolean } | null {
  const day = hours && hours.length === 7 ? hours[weekdayOf(date)] : undefined;
  if (day === null) return null;
  const open = day?.open ?? DEFAULT_OPEN;
  const close = day?.close ?? DEFAULT_CLOSE;
  return { open, close, closesNextDay: close <= open };
}

/* ---- Words, the same on both platforms ------------------------------ */

export const PLAN_VISIT = "Plan a visit";
export const PLAN_VISIT_HINT =
  "Pick a store and a day. Everyone going that day sees who has what before you get there.";
export const WHICH_DAY = "Which day?";
export const CLOSED_THAT_DAY = "Closed";
export const PICK_A_STORE = "Pick a store";
export const SEARCH_STORES = "Search stores";
export const STORES_NEAR_YOU = "Near you";
export const STORES_YOU_FOLLOW = "Stores you follow";
export const NO_STORES_FOUND = "No stores found. Try the town or part of the name.";

/** The line under a day chip's room: "Friday Night Trades · 6 going". */
export function dayRoomLine(name: string, going: number): string {
  return going > 0 ? `${name} · ${going} going` : name;
}

/** After the tap: "You're going to Mox on Friday." */
export function goingToStoreLine(
  storeName: string,
  date: string,
  today: string,
): string {
  const when = dayInWords(date, today);
  return date === today || date === addDays(today, 1)
    ? `You're going to ${storeName} ${when}.`
    : `You're going to ${storeName} on ${when}.`;
}

/** You're here: the banner when the app opens at a store. */
export function youreAtLine(storeName: string): string {
  return `You're at ${storeName}`;
}
export const JOIN_THE_ROOM = "Join the room";
export const NOT_NOW = "Not now";
export const FIND_MY_STORE = "Find the store I'm in";
export const NO_STORE_HERE =
  "No store found right here. Scan the code on the counter instead.";
export const LOCATION_DENIED =
  "Location is off for cardflare. Scan the code on the counter instead.";

/** The store console's one control for its pin. */
export const SET_STORE_LOCATION = "Use my current location";
export const STORE_LOCATION_HINT =
  "Stand inside the store and tap this once. Players who open cardflare here are offered your room.";
export const STORE_LOCATION_SAVED = "Saved. Players here will see your room.";

/** What the server's refusals say. */
export const PLAN_REFUSALS = {
  "not-found": "That store could not be found.",
  "bad-day": "Pick a day this week.",
  closed: "The store is closed that day.",
  "day-over": "The store has closed for today.",
  "no-open-trading":
    "This store isn't taking open trading days. Check its page for nights.",
  "no-account": "Sign in to say you're going.",
  unavailable: "That didn't save. Try again in a moment.",
} as const;

export type PlanRefusal = keyof typeof PLAN_REFUSALS;
