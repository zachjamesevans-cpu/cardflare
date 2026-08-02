import { z } from "zod";

import { normalizeJoinCode, JOIN_CODE_PATTERN } from "./join-code";

export const EVENT_NAME_MAX = 80;

/** The longest an event may run. Guards a typo, not a policy. */
const MAX_DURATION_HOURS = 24;

const localDateTime = z
  .string()
  .trim()
  .min(1, "Please choose a date and time.")
  // `datetime-local` submits "2026-08-14T18:00", with no timezone. Parsed in
  // the server's zone, which on Vercel is UTC — see createEventSchema.
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Please choose a valid date and time.",
  });

export const createEventSchema = z
  .object({
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
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: "The end time must be after the start time.",
    path: ["endsAt"],
  })
  .refine(
    (value) =>
      Date.parse(value.endsAt) - Date.parse(value.startsAt) <=
      MAX_DURATION_HOURS * 60 * 60 * 1000,
    {
      message: `An event cannot run longer than ${MAX_DURATION_HOURS} hours.`,
      path: ["endsAt"],
    },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;

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
  storeName: string;
  storeCity: string | null;
  storeRegion: string | null;
}

/** The little a player sees about a store when no room of its is running. */
export interface PublicStore {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  walkInEnabled: boolean;
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
export type CodeResolution =
  | { outcome: "not-found" }
  | { outcome: "room"; room: PublicEvent }
  | { outcome: "lobby"; store: PublicStore }
  | { outcome: "quiet"; store: PublicStore };
