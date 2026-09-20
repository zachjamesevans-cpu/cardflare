"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { updateStorePage } from "@/lib/stores/page";
import { storePageSchema, type StorePageState } from "@/lib/stores/page-schema";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * Saving the store's own page from the console.
 *
 * OWNERS ONLY, and admins. An organizer is a regular who was handed the
 * timers; the name on the door and the phone number players will ring
 * are not theirs to change. The role is read from the viewer's
 * memberships, which `getViewer` loads with the service role, so a
 * store id posted by anyone else lands here and goes nowhere.
 *
 * A Server Action is a public POST endpoint, so every field is
 * re-validated by the same schema the form's caps come from.
 */
export async function updateStorePageAction(
  _previous: StorePageState,
  formData: FormData,
): Promise<StorePageState> {
  const storeId = text(formData, "storeId");
  if (!storeId) return { status: "error", message: GENERIC_ERROR };

  const viewer = await getViewer();
  const allowed =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeRoles[storeId] === "owner");

  if (!allowed) {
    console.error("Rejected a store page change from an unauthorised viewer.");
    return { status: "error", message: GENERIC_ERROR };
  }

  const parsed = storePageSchema.safeParse({
    name: text(formData, "name"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    addressLine: text(formData, "addressLine"),
    postalCode: text(formData, "postalCode"),
    phone: text(formData, "phone"),
    website: text(formData, "website"),
    description: text(formData, "description"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const ok = await updateStorePage(storeId, parsed.data);
  if (!ok) return { status: "error", message: GENERIC_ERROR };

  revalidatePath("/store");
  revalidatePath("/store/settings");
  revalidatePath(`/s/${storeId}`);

  return { status: "done", message: "Saved. This is what players see now." };
}
