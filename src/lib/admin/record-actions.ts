"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { isTier } from "@/lib/tiers";
import {
  isStoreMember,
  updatePlayerName,
  updatePlayerTier,
  updateSignInEmail,
  updateStoreRecord,
  userIdForPlayer,
} from "./records";
import {
  editPlayerSchema,
  editStoreSchema,
  signInEmailSchema,
  type RecordEditState,
} from "./record-schema";

/**
 * The site admin's record editor.
 *
 * Every one of these re-establishes admin from scratch. A Server Action
 * is a public POST endpoint, so hiding the form on a guarded page hides
 * nothing — and these rewrite other people's names and credentials,
 * which is the last surface that should trust its caller.
 *
 * A refused call says nothing specific. An unauthorised caller learns
 * neither that the action exists nor what it wanted.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const REFUSED: RecordEditState = { status: "error", message: GENERIC_ERROR };

async function isAdmin(): Promise<boolean> {
  return (await getViewer()).kind === "admin";
}

export async function updateStoreAction(
  _previous: RecordEditState,
  formData: FormData,
): Promise<RecordEditState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = editStoreSchema.safeParse({
    storeId: text(formData, "storeId"),
    name: text(formData, "name"),
    contactEmail: text(formData, "contactEmail"),
    city: text(formData, "city"),
    region: text(formData, "region"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the details.",
    };
  }

  const result = await updateStoreRecord(parsed.data.storeId, parsed.data);

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "not-found" ? "That store no longer exists." : GENERIC_ERROR,
    };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/stores/${parsed.data.storeId}`);
  revalidatePath("/store");

  return { status: "saved", message: `Saved. This store is now ${parsed.data.name}.` };
}

export async function updatePlayerAction(
  _previous: RecordEditState,
  formData: FormData,
): Promise<RecordEditState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = editPlayerSchema.safeParse({
    playerId: text(formData, "playerId"),
    displayName: text(formData, "displayName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the name.",
    };
  }

  const result = await updatePlayerName(parsed.data.playerId, parsed.data.displayName);

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "not-found" ? "That player no longer exists." : GENERIC_ERROR,
    };
  }

  revalidatePath("/admin/players");

  return {
    status: "saved",
    message: `Saved. They are now ${parsed.data.displayName}.`,
  };
}

/**
 * Changes what somebody signs in with.
 *
 * The user id arrives from the form, so it is never trusted on its own:
 * it must belong to the store being edited, or be the auth user behind
 * the player being edited. Without that check an admin form would be a
 * way to point any account's credential at any address.
 */
export async function updateSignInEmailAction(
  _previous: RecordEditState,
  formData: FormData,
): Promise<RecordEditState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = signInEmailSchema.safeParse({
    userId: text(formData, "userId"),
    email: text(formData, "email"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the address.",
    };
  }

  const storeId = text(formData, "storeId");
  const playerId = text(formData, "playerId");

  const belongs = storeId
    ? await isStoreMember(storeId, parsed.data.userId)
    : playerId
      ? (await userIdForPlayer(playerId)) === parsed.data.userId
      : false;

  if (!belongs) return REFUSED;

  const result = await updateSignInEmail(parsed.data.userId, parsed.data.email);

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "email-taken"
          ? "Another account already uses that address."
          : GENERIC_ERROR,
    };
  }

  revalidatePath("/admin");
  if (storeId) revalidatePath(`/admin/stores/${storeId}`);
  revalidatePath("/admin/players");

  return {
    status: "saved",
    message: `They sign in with ${parsed.data.email} from now on.`,
  };
}

/** Moves a player between tiers, from the console's player row. */
export async function setPlayerTierAction(
  _previous: RecordEditState,
  formData: FormData,
): Promise<RecordEditState> {
  if (!(await isAdmin())) return REFUSED;

  const playerId = text(formData, "playerId");
  const tier = text(formData, "tier");

  if (!playerId || !isTier(tier)) {
    return { status: "error", message: "Pick a real tier." };
  }

  const result = await updatePlayerTier(playerId, tier);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "not-found" ? "That player no longer exists." : GENERIC_ERROR,
    };
  }

  revalidatePath("/admin/players");
  return { status: "saved", message: `Tier set to ${tier}.` };
}
