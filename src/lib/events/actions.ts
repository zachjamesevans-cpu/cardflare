"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { createEvent, findEventById, setEventStatus } from "./repository";
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

  let event;
  try {
    event = await createEvent(parsed.data, actor.userId);
  } catch (error) {
    console.error("Could not create the event", error);
    return failure(GENERIC_ERROR, {}, values);
  }

  revalidatePath("/store");
  revalidatePath("/admin");
  redirect(`/store/events/${event.id}`);
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

  revalidatePath(`/store/events/${event.id}`);
  revalidatePath("/store");
  revalidatePath("/admin");
}
