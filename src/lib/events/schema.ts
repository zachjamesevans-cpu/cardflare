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

/** Statuses an event may be moved to, and what each one means. */
export const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

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

/** What a player is allowed to see about an event before joining it. */
export interface PublicEvent {
  id: string;
  name: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  storeName: string;
  storeCity: string | null;
  storeRegion: string | null;
}
