"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { createDisplayAction } from "@/lib/event-hub/actions";
import { eventWindowIn } from "@/lib/events/format";
import { createEvent, findStoreById } from "@/lib/events/repository";
import { createEventSchema, type CreateEventValues } from "@/lib/events/schema";
import { text } from "@/lib/form-value";
import { markStoreOnboarded } from "@/lib/stores/page";
import type { SetupEventState } from "@/lib/stores/setup-schema";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

const GENERIC_ERROR = "Something went wrong on our end. Please try again in a moment.";

/**
 * The setup wizard's own doors.
 *
 * The wizard is the OWNER's: it names the shop, hands out organizers
 * and stamps the store as set up, none of which an organizer may do.
 * So every action here asks for the owner (or an admin), from the
 * memberships `getViewer` loaded with the service role, never from
 * the hidden field that named the store.
 */
async function authorizedOwner(storeId: string): Promise<{ userId: string } | null> {
  if (!storeId) return null;
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/store/setup");
  if (viewer.kind === "admin") return { userId: viewer.user.id };
  if (viewer.kind === "store" && viewer.storeRoles[storeId] === "owner") {
    return { userId: viewer.user.id };
  }
  return null;
}

/**
 * The first event night, created without leaving the wizard.
 *
 * `createEventAction` redirects to the event's page, which is right
 * on the Events tab and wrong in the middle of a five-minute setup;
 * so this runs the same schema, the same zone rule and the same
 * repository call, and reports the room back instead of going there.
 */
export async function createSetupEventAction(
  _previous: SetupEventState,
  formData: FormData,
): Promise<SetupEventState> {
  const values: CreateEventValues = {
    name: text(formData, "name"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    repeatWeekly: text(formData, "repeatWeekly") === "on",
  };
  const fail = (message: string): SetupEventState => ({
    status: "error",
    message,
    values,
  });

  const parsed = createEventSchema.safeParse({
    storeId: text(formData, "storeId"),
    ...values,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the fields.");
  }

  const actor = await authorizedOwner(parsed.data.storeId);
  if (!actor) return fail("You cannot create an event for that store.");

  if (!isSupabaseConfigured()) return fail(GENERIC_ERROR);

  /* The zone comes from the store row, never from the form. */
  const store = await findStoreById(parsed.data.storeId);
  if (!store) return fail(GENERIC_ERROR);

  const window = eventWindowIn(
    parsed.data.startsAt,
    parsed.data.endsAt,
    store.timezone,
  );
  if (!window.ok) return fail(window.problem.message);

  try {
    const event = await createEvent(
      {
        storeId: parsed.data.storeId,
        name: parsed.data.name,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        repeatWeekly: parsed.data.repeatWeekly,
      },
      actor.userId,
    );

    revalidatePath("/store");
    revalidatePath("/store/events");
    revalidatePath("/store/setup");

    return {
      status: "done",
      eventId: event.id,
      name: event.name,
      joinCode: event.join_code,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
    };
  } catch (error) {
    console.error("Could not create the first event", error);
    return fail(GENERIC_ERROR);
  }
}

/**
 * A screen from the wizard: the Event Hub's own action, then a
 * repaint of the wizard, which that action does not know about.
 */
export async function addSetupScreenAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  if (!(await authorizedOwner(storeId))) return;

  await createDisplayAction(formData);
  revalidatePath("/store/setup");
}

/**
 * "Later" on the welcome, and the console button at the end: the
 * store is stamped as set up and the owner lands on the console. The
 * wizard stays reachable from Settings; the card on the console home
 * stops asking.
 */
export async function finishStoreSetupAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  if (!(await authorizedOwner(storeId))) redirect("/store");

  await markStoreOnboarded(storeId);
  revalidatePath("/store");
  revalidatePath("/store/setup");
  redirect(`/store?as=${storeId}`);
}
