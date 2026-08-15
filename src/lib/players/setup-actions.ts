"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { accountIdentity } from "./account-identity";
import { isDisplayNameFree, markOnboarded, setDisplayName } from "./profile";
import { displayNameSchema, type SetupState } from "./profile-schema";

/**
 * Choosing who you are, the first time.
 *
 * Split from `profile-actions.ts` because the two do different jobs on
 * the same column. Renaming is housekeeping for somebody who already
 * exists; this is the step that turns an authenticated email address
 * into a player, and it finishes by marking the account set up so
 * nobody is asked twice.
 *
 * Entry-agnostic on purpose. It keys on `onboarded_at` being null, not
 * on how the account was created — so the invited pilot player and
 * whoever signs themselves up when registration opens walk the same
 * path, and opening registration does not mean building this again.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

export async function chooseUsernameAction(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const submitted = text(formData, "displayName");

  const account = await accountIdentity(await getViewer());
  if (!account) {
    return { status: "error", message: GENERIC_ERROR, displayName: submitted };
  }

  const parsed = displayNameSchema.safeParse({ displayName: submitted });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      displayName: submitted,
    };
  }

  const outcome = await setDisplayName(account.playerId, parsed.data.displayName);

  if (outcome === "taken") {
    return {
      status: "error",
      message: "Somebody already goes by that. Try another one.",
      displayName: submitted,
    };
  }
  if (outcome === "failed") {
    return { status: "error", message: GENERIC_ERROR, displayName: submitted };
  }

  /*
   * Marked set up here, at the name, rather than after the picture.
   * A picture is optional — the generated initials are a real avatar,
   * not a placeholder — and gating "you are set up" on something
   * optional would leave anyone who skipped it permanently owing a step.
   */
  await markOnboarded(account.playerId);

  revalidatePath("/profile");
  redirect("/welcome/picture");
}

/**
 * "I will do the picture later."
 *
 * A real control rather than a link, so the flow has one obvious way
 * out. Nothing is written: the account was marked set up when the name
 * was chosen, and the initials are already a perfectly good avatar.
 */
export async function skipPictureAction(): Promise<void> {
  redirect("/welcome/games");
}

/**
 * Whether a name is free, for the field to say so while it is typed.
 *
 * A courtesy, never the gate — the unique index decides, and
 * `setDisplayName` reports what it decided. This exists because a
 * username picker that only tells you at submit time is the most
 * annoying form on the internet.
 */
export async function checkNameAction(name: string): Promise<"free" | "taken" | "bad"> {
  const account = await accountIdentity(await getViewer());
  if (!account) return "bad";

  const parsed = displayNameSchema.safeParse({ displayName: name });
  if (!parsed.success) return "bad";

  return (await isDisplayNameFree(parsed.data.displayName, account.playerId))
    ? "free"
    : "taken";
}
