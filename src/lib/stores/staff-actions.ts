"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import type { FormNotice } from "@/lib/forms/notice";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { addOrganizer, removeOrganizer } from "./staff";

/**
 * Naming and un-naming organizers.
 *
 * Both are public POST endpoints, so who may do this is re-established
 * from the caller's own session every time: an admin, or the OWNER of
 * that store. An organizer cannot name another organizer; membership
 * is the owner's, always. The store id in the form is something the
 * caller chose, which is why it is checked against the viewer's roles
 * rather than trusted.
 */

const ORGANIZERS = "/store/organizers";
/* The wizard's team step lists the same people. */
const SETUP = "/store/setup";

/** Thirty membership changes in ten minutes is a busy night's worth. */
const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

/** True when the viewer owns the store outright, or is an admin. */
async function authorizeOwner(storeId: string): Promise<{ userId: string } | null> {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect(`/login?next=${ORGANIZERS}`);
  if (viewer.kind === "admin") return { userId: viewer.user.id };
  if (viewer.kind === "store" && viewer.storeRoles[storeId] === "owner") {
    return { userId: viewer.user.id };
  }

  return null;
}

export async function addOrganizerAction(
  _previous: FormNotice,
  formData: FormData,
): Promise<FormNotice> {
  const storeId = text(formData, "storeId");
  const playerId = text(formData, "playerId");
  if (!storeId || !playerId) {
    return { status: "error", message: "Pick a player to add." };
  }

  const actor = await authorizeOwner(storeId);
  if (!actor) {
    return { status: "error", message: "Only the store's owner can add organizers." };
  }

  const rate = checkRateLimit(`organizers:${actor.userId}`, LIMIT, WINDOW_MS);
  if (!rate.allowed) {
    return {
      status: "error",
      message: "That is a lot of changes at once. Try again in a few minutes.",
    };
  }

  /* "Already an organizer here", "No such player", a failed write: each
     used to vanish, and the Add button simply did nothing. */
  const added = await addOrganizer(storeId, playerId);
  if (!added.ok) return { status: "error", message: added.message };

  revalidatePath(ORGANIZERS);
  revalidatePath(SETUP);
  return { status: "done" };
}

export async function removeOrganizerAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const userId = text(formData, "userId");
  if (!storeId || !userId) return;

  const actor = await authorizeOwner(storeId);
  if (!actor) return;

  const rate = checkRateLimit(`organizers:${actor.userId}`, LIMIT, WINDOW_MS);
  if (!rate.allowed) return;

  await removeOrganizer(storeId, userId);

  revalidatePath(ORGANIZERS);
  revalidatePath(SETUP);
}
