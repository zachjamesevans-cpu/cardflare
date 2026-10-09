/**
 * Store days in the app: the words, and the few date helpers the
 * words need. The website's `src/lib/events/store-day-rules.ts`, word
 * for word, and tests/unit/store-days-app.test.ts holds the two
 * together.
 *
 * The founder (2026-10-09): "I miss the simplicity of just getting into
 * a room." The store is the room and a day is the time. No imports, so
 * the website's tests can read this file as it is.
 */

/** What a day room is called. The store's name is beside it everywhere. */
export const DAY_ROOM_NAME = "Open trading";

/** "2026-10-16" plus n days, in the calendar, with no clock involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
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
function weekdayOf(date: string): number {
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

/** The store console's one control for its pin. Web only; kept for the mirror. */
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

/** A refusal's words, from the code the server answered with. */
export function planRefusal(code: string): string {
  return code in PLAN_REFUSALS
    ? PLAN_REFUSALS[code as PlanRefusal]
    : PLAN_REFUSALS.unavailable;
}
