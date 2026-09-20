"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { createDisplayAction } from "@/lib/event-hub/actions";
import { text } from "@/lib/form-value";
import { markStoreOnboarded } from "@/lib/stores/page";

/**
 * The setup wizard's own doors.
 *
 * The wizard is the OWNER's: it names the shop, hands out organizers
 * and stamps the store as set up, none of which an organizer may do.
 * So every action here asks for the owner (or an admin), from the
 * memberships `getViewer` loaded with the service role, never from
 * the hidden field that named the store. The first event night is
 * not here: the wizard posts the Events tab's own action in its
 * in-place mode (`createEventInPlaceAction`), so there is one way to
 * make a night.
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
 * A screen from the wizard: FlareCast's own action, then a repaint
 * of the wizard, which that action does not know about.
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
