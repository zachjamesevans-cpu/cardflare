"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { isValidTimeZone } from "@/lib/time/zone";
import { eventWindowIn } from "./format";
import {
  createEvent,
  findEventById,
  findStoreById,
  findOpenWalkInRoom,
  setEarlyBoardHours,
  setEventStatus,
  setStoreTimeZone,
  setWalkInEnabled,
} from "./repository";
import { endWalkInRoomWhenLastUsed, settleClosedOccurrences } from "./rooms";
import {
  createEventSchema,
  type CreateEventFieldErrors,
  type CreateEventState,
  type CreateEventValues,
  type EventStatus,
} from "./schema";

const GENERIC_ERROR = "Something went wrong on our end. Please try again in a moment.";

const VALID_STATUSES: readonly EventStatus[] = ["draft", "open", "closed"];

function valuesFrom(formData: FormData): CreateEventValues {
  return {
    name: text(formData, "name"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    repeatWeekly: text(formData, "repeatWeekly") === "on",
  };
}

function failure(
  message: string,
  fieldErrors: CreateEventFieldErrors,
  values: CreateEventValues,
): CreateEventState {
  return { status: "error", message, fieldErrors, values };
}

/**
 * Whether the current viewer may act on `storeId`.
 *
 * Admins may act on any store. A store member may act only on a store they
 * belong to — checked against the membership the server resolved, never
 * against an id the form supplied, so submitting someone else's store id
 * fails here rather than creating an event in their room.
 */
async function authorizeStore(storeId: string) {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/store");
  if (viewer.kind === "admin") return { userId: viewer.user.id };
  if (viewer.kind === "store" && viewer.storeIds.includes(storeId)) {
    return { userId: viewer.user.id };
  }

  return null;
}

export async function createEventAction(
  _previous: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const values = valuesFrom(formData);
  const parsed = createEventSchema.safeParse({
    storeId: text(formData, "storeId"),
    ...values,
  });

  if (!parsed.success) {
    const fieldErrors: CreateEventFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CreateEventFieldErrors;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }

    return failure("Please fix the highlighted fields.", fieldErrors, values);
  }

  const actor = await authorizeStore(parsed.data.storeId);
  if (!actor) {
    // Same message whether the store does not exist or is someone else's, so
    // this cannot be used to discover which store ids are real.
    return failure("You cannot create an event for that store.", {}, values);
  }

  if (!isSupabaseConfigured()) {
    console.error("Event creation rejected: Supabase is not configured.");
    return failure(GENERIC_ERROR, {}, values);
  }

  /*
   * The zone comes from the store row, never from the form.
   *
   * The typed times are a wall clock with no zone attached, and this is what
   * attaches one. Taking it from a hidden field would let a submission decide
   * what "6pm" meant — and, more prosaically, would break the moment a form
   * was cached with a stale value.
   */
  const store = await findStoreById(parsed.data.storeId);
  if (!store) {
    console.error("Event creation rejected: the store could not be loaded.");
    return failure(GENERIC_ERROR, {}, values);
  }

  const window = eventWindowIn(
    parsed.data.startsAt,
    parsed.data.endsAt,
    store.timezone,
  );

  if (!window.ok) {
    return failure(
      "Please fix the highlighted fields.",
      { [window.problem.field]: window.problem.message },
      values,
    );
  }

  let event;
  try {
    event = await createEvent(
      {
        storeId: parsed.data.storeId,
        name: parsed.data.name,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        repeatWeekly: parsed.data.repeatWeekly,
      },
      actor.userId,
    );
  } catch (error) {
    console.error("Could not create the event", error);
    return failure(GENERIC_ERROR, {}, values);
  }

  revalidatePath("/store");
  revalidatePath("/admin");
  redirect(`/store/events/${event.id}`);
}

/**
 * Turns walk-in trading on or off for a store.
 *
 * Switching it off ends the walk-in room immediately rather than letting the
 * current one run out its idle window. A store that flips this switch has
 * decided it is done for now, and leaving a room open behind a switch that
 * says "off" is the kind of disagreement between a control and reality that
 * makes people stop trusting the control.
 *
 * Scheduled events are untouched either way: this governs only what the
 * counter code does when nothing is scheduled.
 */
/**
 * Sets how long before doors a store's boards take Flares.
 *
 * The value arrives from a `<select>`, which is to say from a form, which
 * is to say it is not to be trusted: clamped to the same 0–168 range the
 * database constraint enforces, and whole hours only.
 */
export async function setEarlyBoardAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const parsed = Number.parseInt(text(formData, "earlyBoardHours"), 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 168) {
    console.error(`Rejected an early-board window: ${parsed}`);
    return;
  }

  const actor = await authorizeStore(storeId);
  if (!actor) {
    console.error("Rejected an early-board change from an unauthorised viewer.");
    return;
  }

  try {
    await setEarlyBoardHours(storeId, parsed);
  } catch (error) {
    console.error("Could not change the early-board window", error);
    return;
  }

  revalidatePath("/store");
  revalidatePath("/admin");
}

export async function setWalkInAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const enabled = text(formData, "enabled") === "on";

  const actor = await authorizeStore(storeId);
  if (!actor) {
    console.error("Rejected a walk-in change from an unauthorised viewer.");
    return;
  }

  try {
    await setWalkInEnabled(storeId, enabled);

    if (!enabled) {
      const room = await findOpenWalkInRoom(storeId);
      if (room) await endWalkInRoomWhenLastUsed(room);
    }
  } catch (error) {
    console.error("Could not change walk-in trading", error);
    return;
  }

  revalidatePath("/store");
  revalidatePath("/admin");
}

/**
 * Sets where the store is.
 *
 * Validated against `Intl` rather than a list kept here: the IANA database
 * changes, and the set that matters is the one the runtime will actually
 * format with. The value arrives from a `<select>`, which is to say from a
 * form, which is to say it is not to be trusted.
 *
 * Nothing already stored moves. Events hold instants, and an instant does not
 * depend on the zone it was typed in — only what is typed from now on, and how
 * all of it is displayed, changes.
 */
export async function setStoreTimeZoneAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const timeZone = text(formData, "timezone");

  const actor = await authorizeStore(storeId);
  if (!actor) {
    console.error("Rejected a timezone change from an unauthorised viewer.");
    return;
  }

  if (!isValidTimeZone(timeZone)) {
    console.error(`Rejected an unknown timezone: ${timeZone}`);
    return;
  }

  try {
    await setStoreTimeZone(storeId, timeZone);
  } catch (error) {
    console.error("Could not change the store timezone", error);
    return;
  }

  revalidatePath("/store");
  revalidatePath("/admin");
}

/**
 * Ends the current walk-in session by hand.
 *
 * Not the same as switching walk-in trading off: this clears the board and
 * lets the next person who scans start a fresh room, which is what a store
 * wants when one crowd leaves and another arrives. The switch is what stops
 * rooms opening at all.
 */
export async function endWalkInSessionAction(formData: FormData): Promise<void> {
  const event = await findEventById(text(formData, "eventId"));
  if (!event) return;

  if (event.kind !== "walk_in") {
    console.error("Rejected an attempt to end a scheduled event as a walk-in room.");
    return;
  }

  const actor = await authorizeStore(event.store_id);
  if (!actor) {
    console.error("Rejected a walk-in session end from an unauthorised viewer.");
    return;
  }

  try {
    await endWalkInRoomWhenLastUsed({ id: event.id, startsAt: event.starts_at });
  } catch (error) {
    console.error("Could not end the walk-in session", error);
    return;
  }

  revalidatePath(`/store/events/${event.id}`);
  revalidatePath("/store");
  revalidatePath("/admin");
}

/**
 * Moves an event between draft, open and closed.
 *
 * The event is loaded first so the store it belongs to comes from the
 * database, not the request — otherwise a member of any store could close
 * another store's event by posting its id.
 */
export async function setEventStatusAction(formData: FormData): Promise<void> {
  const id = text(formData, "eventId");
  const status = text(formData, "status") as EventStatus;

  if (!VALID_STATUSES.includes(status)) {
    console.error(`Rejected an unknown event status: ${status}`);
    return;
  }

  const event = await findEventById(id);
  if (!event) return;

  /*
   * The draft/open/closed controls belong to scheduled events only. A walk-in
   * room reopened through this path would have a stale `ends_at` behind it and
   * could collide with the room the resolver has since opened, so a crafted
   * post is refused here rather than relying on the UI not to offer it.
   */
  if (event.kind !== "scheduled") {
    console.error("Rejected a status change on a walk-in room.");
    return;
  }

  const actor = await authorizeStore(event.store_id);
  if (!actor) {
    console.error("Rejected an event status change from an unauthorised viewer.");
    return;
  }

  try {
    await setEventStatus(event.id, status);
  } catch (error) {
    console.error("Could not change the event status", error);
    return;
  }

  // Closing by hand owes the same debts closing by clock pays: no-show
  // Flares expire, and a recurring event creates next week's occurrence.
  if (status === "closed") {
    await settleClosedOccurrences([
      {
        id: event.id,
        storeId: event.store_id,
        name: event.name,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        repeatWeekly: event.repeat_weekly,
      },
    ]);
  }

  revalidatePath(`/store/events/${event.id}`);
  revalidatePath("/store");
  revalidatePath("/admin");
}
