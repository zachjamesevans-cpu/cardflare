import { z } from "zod";

import { normalizeJoinCode, JOIN_CODE_PATTERN } from "./join-code";

export const EVENT_NAME_MAX = 80;

/**
 * `datetime-local` submits "2026-08-14T18:00" — a wall clock with no zone.
 *
 * Only the shape is checked here. Turning it into an instant needs the store's
 * timezone, which is not in the form and must not be: it comes from the store
 * row the server resolved. `eventWindowIn` in `format.ts` does that, and the
 * ordering and duration checks moved there with it, because comparing two
 * zoneless strings across a daylight-saving change compares the wrong thing.
 */
const localDateTime = z
  .string()
  .trim()
  .min(1, "Please choose a date and time.")
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Please choose a valid date and time.");

export const createEventSchema = z.object({
  /*
   * `guid`, not `uuid`. Zod's `uuid` enforces the RFC version and variant
   * nibbles; Postgres accepts any 32 hex digits. The only job here is to
   * keep malformed input from reaching the query, so matching the database's
   * leniency avoids rejecting an id the database would have accepted.
   * Authorisation is checked separately and does not rely on this shape.
   */
  storeId: z.guid("Please choose a store."),
  name: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "Please name the event.")
        .max(EVENT_NAME_MAX, `Please keep it under ${EVENT_NAME_MAX} characters.`),
    ),
  startsAt: localDateTime,
  endsAt: localDateTime,
  // A checkbox: "on" when ticked, absent otherwise.
  repeatWeekly: z.preprocess((value) => value === "on" || value === true, z.boolean()),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/** What the repository stores: real instants, already converted. */
export interface CreateEventRecord {
  storeId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  /** "Every Wednesday" entered once, not re-typed weekly by an employee. */
  repeatWeekly?: boolean;
}

/** What the sweep needs to know about an occurrence it just closed. */
export interface ClosedOccurrence {
  id: string;
  storeId: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  repeatWeekly: boolean;
}

export const joinCodeSchema = z
  .string()
  .transform(normalizeJoinCode)
  .pipe(z.string().regex(JOIN_CODE_PATTERN, "That code doesn't look right."));

export type EventStatus = "draft" | "open" | "closed";
export type EventKind = "scheduled" | "walk_in";

/** Statuses an event may be moved to, and what each one means. */
export const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

/**
 * What a walk-in room is called wherever a name is required.
 *
 * A store never types this — the application opens these rooms — but the
 * column is not-null and a player sees the value at the top of the room, so it
 * has to read like something a person would say.
 */
export const WALK_IN_ROOM_NAME = "Walk-in trading";

export type CreateEventFieldErrors = Partial<
  Record<"storeId" | "name" | "startsAt" | "endsAt", string>
>;

export type CreateEventValues = {
  name: string;
  startsAt: string;
  endsAt: string;
  repeatWeekly: boolean;
};

export type CreateEventState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors: CreateEventFieldErrors;
      values: CreateEventValues;
    };

export const CREATE_EVENT_IDLE: CreateEventState = { status: "idle" };

/** What a player is allowed to see about a room before joining it. */
export interface PublicEvent {
  id: string;
  name: string;
  kind: EventKind;
  status: EventStatus;
  startsAt: string;
  /** Null while a walk-in room is still running. */
  endsAt: string | null;
  storeId: string;
  storeName: string;
  storeCity: string | null;
  storeRegion: string | null;
  /** The store's zone. Event times mean nothing without it. */
  storeTimeZone: string;
  /** When true, closing this occurrence creates the next one, +7 days. */
  repeatWeekly: boolean;
  /** The store's early-board window in hours. 0 = boards open at doors. */
  earlyBoardHours: number;
}

/**
 * What a room is doing right now, for anyone deciding whether to let
 * somebody in or what to render.
 *
 * "early" is the new state this phase adds: a scheduled event, not yet
 * opened by the store, whose board already accepts Flares because the
 * start is inside the store's early window. The founder proved the value
 * by hand — a link shared hours early meant seventeen players knew what
 * to bring from home — and this makes that automatic. Everything posted
 * early is by definition from someone not in the building yet, which is
 * why pages render the phase loudly instead of pretending the room is
 * live.
 */
export type RoomPhase = "early" | "live" | "pending" | "finished";

export function roomPhase(
  event: Pick<
    PublicEvent,
    "kind" | "status" | "startsAt" | "endsAt" | "earlyBoardHours"
  >,
  // Defaulted so Server Components can call this without their own
  // Date.now(), which the compiler lint rightly refuses mid-render.
  now: number = Date.now(),
): RoomPhase {
  if (event.status === "open") return "live";
  if (event.status === "closed") return "finished";

  // Draft. Walk-in rooms are never drafts, so this is a scheduled event
  // that the store has not opened yet.
  if (
    event.kind === "scheduled" &&
    event.earlyBoardHours > 0 &&
    now >=
      new Date(event.startsAt).getTime() - event.earlyBoardHours * 60 * 60 * 1000 &&
    (!event.endsAt || now < new Date(event.endsAt).getTime())
  ) {
    return "early";
  }

  return "pending";
}

/** The little a player sees about a store when no room of its is running. */
export interface PublicStore {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  walkInEnabled: boolean;
  timeZone: string;
  /** Hours before start that a scheduled board accepts Flares. 0 = off. */
  earlyBoardHours: number;
}

/** An upcoming board already accepting Flares, as a lobby advertises it. */
export interface EarlyBoard {
  code: string;
  name: string;
  startsAt: string;
  /** How many players are already on it. Social proof, honestly counted. */
  playersIn: number;
}

/**
 * What a scanned code turned out to mean.
 *
 * A store's permanent code has three honest answers, and conflating any two of
 * them would put a wrong screen in front of somebody standing at a counter
 * holding a code that is perfectly correct:
 *
 *   `room`   something is running — an event, or the walk-in room
 *   `lobby`  nothing is running yet, but joining will start the walk-in room
 *   `quiet`  the store has walk-in trading switched off, so joining will not
 */
/** A card show, as the attendee page renders it. */
export interface PublicShow {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  timeZone: string;
  startsAt: string;
  endsAt: string;
  joinCode: string;
}

export type CodeResolution =
  | { outcome: "not-found" }
  | { outcome: "room"; room: PublicEvent }
  /*
   * Lobby and quiet screens carry the early board when one is open: the
   * counter code keeps meaning "trade here, now" (walk-in rooms win), but
   * the same scan tells a player at home that Wednesday's board is already
   * taking Flares — the pinned link never goes stale.
   */
  | { outcome: "lobby"; store: PublicStore; earlyBoard: EarlyBoard | null }
  | { outcome: "quiet"; store: PublicStore; earlyBoard: EarlyBoard | null }
  | { outcome: "show"; show: PublicShow };
