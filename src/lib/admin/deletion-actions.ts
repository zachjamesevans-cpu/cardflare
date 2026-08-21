"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import {
  deletePlayer,
  deleteStore,
  previewPlayerDeletion,
  previewStoreDeletion,
} from "@/lib/admin/deletion";
import {
  confirmsName,
  type DeletePreview,
  type DeleteState,
} from "@/lib/admin/deletion-schema";

/**
 * Deleting a store, behind a typed name.
 *
 * The confirmation is re-checked HERE and not only in the browser. A
 * Server Action is a public POST endpoint, so a client-side "are you
 * sure" is a convenience for the admin and no protection at all — the
 * only thing standing between a stray request and a shop's entire
 * history is this comparison.
 *
 * The name is re-read from the database rather than trusted from the
 * form, because a form that carries both the name and the confirmation
 * is a form that confirms itself.
 */
export async function deleteStoreAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  await requireAdmin();

  const storeId = String(formData.get("storeId") ?? "");
  const typed = String(formData.get("confirmName") ?? "");

  const preview = await previewStoreDeletion(storeId);
  if (!preview) return { status: "error", message: "That store no longer exists." };

  if (!confirmsName(typed, preview.name)) {
    return {
      status: "error",
      message: `Type the store's name exactly — ${preview.name} — to delete it.`,
    };
  }

  const result = await deleteStore(storeId);
  if (!result.ok) {
    return { status: "error", message: result.error ?? "Could not delete that." };
  }

  revalidatePath("/admin/stores");

  /* Back to the list, because the page this was pressed on no longer
     describes anything. */
  redirect("/admin/stores?deleted=store");
}

/**
 * Deleting a player.
 *
 * Refuses to delete the admin's own player account. Not paranoia — the
 * founder is an admin WITH a player account, both halves working at
 * once, and the same console lists both. Deleting yourself here would
 * sign you out mid-request and leave the console reachable only by
 * whoever else has a key.
 */
export async function deletePlayerAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const admin = await requireAdmin();

  const playerId = String(formData.get("playerId") ?? "");
  const typed = String(formData.get("confirmName") ?? "");

  const own = await playerForUser(admin.id);
  if (own?.id === playerId) {
    return {
      status: "error",
      message:
        "That is your own player account. Delete it from somewhere you are not signed in.",
    };
  }

  const preview = await previewPlayerDeletion(playerId);
  if (!preview) return { status: "error", message: "That player no longer exists." };

  if (!confirmsName(typed, preview.name)) {
    return {
      status: "error",
      message: `Type the player's name exactly — ${preview.name} — to delete them.`,
    };
  }

  const result = await deletePlayer(playerId);
  if (!result.ok) {
    return { status: "error", message: result.error ?? "Could not delete that." };
  }

  revalidatePath("/admin/players");

  return { status: "deleted", message: `${preview.name} is gone.` };
}

/**
 * What deleting this would destroy, fetched when the panel opens.
 *
 * Lazy on purpose. Counting the collateral is a dozen count queries
 * across a dozen tables, and doing that on every page load — for every
 * player in a list of a hundred — to fill in a panel almost nobody
 * opens is a page made slow by a button nobody pressed.
 *
 * Behind `requireAdmin` even though it only reads. The counts describe
 * a shop's whole history and a player's whole account, which is not a
 * shape anybody but an admin should be able to ask for.
 */
export async function previewDeletionAction(
  kind: "store" | "player",
  id: string,
): Promise<DeletePreview | null> {
  await requireAdmin();

  return kind === "store" ? previewStoreDeletion(id) : previewPlayerDeletion(id);
}
