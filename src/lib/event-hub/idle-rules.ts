/**
 * FlareCast's idle mode: the rules and the words, with no server in them.
 *
 * The founder (2026-10-11): "if they're not showing a tournament timer
 * or anything - maybe it'll show some valuable cardflare info, what time
 * it is, when next event is, prior cards people were looking for there."
 * And on cost: "would it be expensive to always have this up?" It was
 * already the expensive part: the screen asked the server every three
 * seconds all day, timer or not. So the idle screen asks far less, and
 * after the store's hours it barely asks at all.
 *
 * Never on it: prices, standings, or anybody's name. What people are
 * letting go is left off too, as it is for the whole wall: projected, it
 * reads as the store's inventory (display-payload.ts says why).
 */

import type { StoreHours } from "@/lib/stores/hours";

/** The panels a store can show, in the order they rotate. */
export const IDLE_PANELS = ["nights", "wanted", "trades", "posts"] as const;
export type IdlePanel = (typeof IDLE_PANELS)[number];

/** What the store console calls each one. */
export const IDLE_PANEL_LABELS: Record<IdlePanel, string> = {
  nights: "Next nights",
  wanted: "Cards wanted here",
  trades: "Trades made here",
  posts: "Your latest post",
};

/** Only panels we know, each once, in our order. */
export function checkIdlePanels(values: readonly string[]): IdlePanel[] {
  return IDLE_PANELS.filter((panel) => values.includes(panel));
}

/* ---- What the panels carry ------------------------------------------- */

export interface IdleNight {
  name: string;
  startsAt: string;
  /** Running right now. */
  live: boolean;
  /** Its board is taking Flares already (live, or open early). */
  flaresOpen: boolean;
  going: number;
}

export interface IdleCard {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  /** How many different people asked for it. */
  people: number;
}

export interface IdlePost {
  title: string;
  body: string | null;
  imageUrl: string | null;
  publishedAt: string;
}

export interface IdleInfo {
  nights: IdleNight[];
  wanted: IdleCard[];
  /** Trades confirmed in this store's rooms in the last thirty days. */
  trades: number;
  post: IdlePost | null;
}

/** A panel and what it shows, once the empty ones are dropped. */
export type IdleSlide =
  | { panel: "nights"; nights: IdleNight[] }
  | { panel: "wanted"; cards: IdleCard[]; live: boolean }
  | { panel: "trades"; count: number }
  | { panel: "posts"; post: IdlePost };

/** The most cards the wanted panel shows at once. */
export const WANTED_ON_SCREEN = 6;

/**
 * The panels with something to show, in the store's chosen order. A
 * panel with nothing to say is skipped, never shown empty. A room open
 * right now beats last week for "wanted": its wants are already on the
 * payload, without names on them.
 */
export function idleSlides(
  panels: readonly IdlePanel[],
  info: IdleInfo,
  liveFlares: readonly {
    cardId: string;
    cardName: string;
    cardNumber: string;
    imageUrl: string | null;
    people: number;
  }[],
): IdleSlide[] {
  return panels.flatMap((panel): IdleSlide[] => {
    if (panel === "nights") {
      return info.nights.length > 0 ? [{ panel, nights: info.nights }] : [];
    }
    if (panel === "wanted") {
      if (liveFlares.length > 0) {
        return [
          {
            panel,
            live: true,
            cards: liveFlares.slice(0, WANTED_ON_SCREEN).map((flare) => ({
              cardId: flare.cardId,
              cardName: flare.cardName,
              cardNumber: flare.cardNumber,
              imageUrl: flare.imageUrl,
              people: flare.people,
            })),
          },
        ];
      }
      return info.wanted.length > 0
        ? [{ panel, live: false, cards: info.wanted.slice(0, WANTED_ON_SCREEN) }]
        : [];
    }
    if (panel === "trades")
      return info.trades > 0 ? [{ panel, count: info.trades }] : [];
    return info.post ? [{ panel, post: info.post }] : [];
  });
}

/* ---- How often the screen asks ---------------------------------------- */

/** A timer on the screen: a pause has to reach the wall in seconds. */
export const ACTIVE_POLL_MS = 3_000;
/**
 * No timer: often enough that a timer staff add appears within half a
 * minute, and once it is there the screen is back to every 3 seconds,
 * so starting it is instant.
 */
export const IDLE_POLL_MS = 30_000;
/** After the store's hours: a quiet clock, checked now and then. */
export const CLOSED_POLL_MS = 300_000;
/** The idle panels' contents change slowly; they are fetched this often. */
export const IDLE_INFO_MS = 300_000;
/** How long each idle panel holds before the next. */
export const IDLE_ROTATE_MS = 12_000;

/** How long the screen waits before asking again. */
export function pollDelayMs(state: {
  timers: number;
  idleMode: boolean;
  open: boolean;
}): number {
  if (state.timers > 0) return ACTIVE_POLL_MS;
  /* Idle mode off is the screen as it always was. */
  if (!state.idleMode) return ACTIVE_POLL_MS;
  return state.open ? IDLE_POLL_MS : CLOSED_POLL_MS;
}

/* ---- Open or closed, on the store's clock ----------------------------- */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The weekday (0 Sunday) and minutes past midnight, in a time zone. */
export function localTime(
  now: number,
  timeZone: string,
): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: Math.max(0, WEEKDAYS.indexOf(get("weekday"))),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Whether the store is open now by its posted hours. Unknown hours count
 * as open: a screen must never go dark because a store skipped a form.
 * A day that closes after midnight ("17:00" to "01:00") runs into the
 * next morning.
 */
export function isOpenNow(
  hours: StoreHours | null,
  timeZone: string,
  now: number,
): boolean {
  if (!hours || hours.length !== 7 || hours.every((day) => day === null)) return true;
  const { day, minutes } = localTime(now, timeZone);

  const today = hours[day];
  if (today) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (close > open ? minutes >= open && minutes < close : minutes >= open)
      return true;
  }
  /* Still inside last night's hours, past midnight. */
  const yesterday = hours[(day + 6) % 7];
  if (yesterday) {
    const open = toMinutes(yesterday.open);
    const close = toMinutes(yesterday.close);
    if (close <= open && minutes < close) return true;
  }
  return false;
}

/* ---- Words, for the wall and the console ----------------------------- */

export const IDLE_JOIN_LINE = "Scan to see who's trading here";
export const IDLE_NEXT_UP = "Next up";
export const IDLE_WANTED_WEEK = "Wanted here this week";
export const IDLE_WANTED_NOW = "Wanted right now";
export const IDLE_FROM_STORE = "From the store";
export const IDLE_FLARES_OPEN = "Flares open";
export const IDLE_LIVE_NOW = "Live now";
export const IDLE_CLOSED = "See you next time";
export const IDLE_MODE_LABEL = "Idle screen";
export const IDLE_MODE_HINT =
  "When no timer is on this screen, show the time, the way to join, and the panels below. After your hours it dims to a quiet clock.";

/** "7 going". */
export function goingLine(count: number): string {
  return `${count} going`;
}

/** "3 people" / "1 person". */
export function peopleLine(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** Under the big number: "trades made here in the last 30 days". */
export function tradesCaption(count: number): string {
  return `${count === 1 ? "trade" : "trades"} made here in the last 30 days`;
}
