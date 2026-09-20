import { z } from "zod";

/**
 * A store post: what a store says to its followers.
 *
 * The founder: "a store announcing 'OP-12 prerelease Saturday, 20
 * seats' as a Flare-shaped post to its followers. This is the thing
 * that makes following worth it." A title, a line or two, a picture if
 * they have one, and optionally the event night it is about, so "I'll
 * be there" is one tap from the Feed.
 *
 * Plain module: the composer's caps, the Server Action's rule and the
 * unit tests all read these, so it carries no server imports.
 */

export const STORE_POST_TITLE_MAX = 80;
export const STORE_POST_BODY_MAX = 600;

/** The words a store gives; the picture and the store come separately. */
export const storePostSchema = z.object({
  title: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "Give the post a title.")
        .max(
          STORE_POST_TITLE_MAX,
          `Keep the title under ${STORE_POST_TITLE_MAX} characters.`,
        ),
    ),
  body: z
    .string()
    .transform((value) => value.replace(/\r\n/g, "\n").trim())
    .pipe(
      z
        .string()
        .max(STORE_POST_BODY_MAX, `Keep it under ${STORE_POST_BODY_MAX} characters.`),
    ),
  /** The event night the post is about, or nothing. An empty select is nothing. */
  eventId: z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.guid("Pick an event from the list.").optional()),
});

export type StorePostFields = z.infer<typeof storePostSchema>;

export interface StorePostState {
  status: "idle" | "done" | "error";
  message: string | null;
}

export const STORE_POST_IDLE: StorePostState = { status: "idle", message: null };

/** Posts a store may publish in an hour. Five is a busy week's worth. */
export const STORE_POST_RATE = { limit: 5, windowMs: 60 * 60 * 1000 };

/** Posts a day a store's followers are pushed about; the rest post quietly. */
export const STORE_POST_NOTICES_PER_DAY = 2;

/**
 * The events a post can be about: the store's nights that have not
 * ended, soonest first.
 *
 * A closed event is over, and a scheduled one whose window has passed
 * but which nobody closed is over too. A walk-in room has no date to
 * announce, so a post about one would say nothing a follower could put
 * in a calendar.
 */
export function upcomingEventChoices<
  T extends {
    id: string;
    name: string;
    kind: string;
    status: string;
    starts_at: string;
    ends_at: string | null;
  },
>(events: T[], now: number = Date.now()): T[] {
  return events
    .filter((event) => event.kind === "scheduled" && event.status !== "closed")
    .filter((event) =>
      event.ends_at
        ? new Date(event.ends_at).getTime() > now
        : new Date(event.starts_at).getTime() > now - 6 * 60 * 60 * 1000,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
