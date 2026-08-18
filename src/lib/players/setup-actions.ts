"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { newPasswordSchema } from "@/lib/auth/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { text } from "@/lib/form-value";
import { accountIdentity } from "./account-identity";
import { handleSchema } from "./handle";
import { isHandleFree, markOnboarded, setIdentity } from "./profile";
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
  const submittedHandle = text(formData, "handle");

  const fail = (message: string): SetupState => ({
    status: "error",
    message,
    displayName: submitted,
    handle: submittedHandle,
  });

  const account = await accountIdentity(await getViewer());
  if (!account) return fail(GENERIC_ERROR);

  const parsed = displayNameSchema.safeParse({ displayName: submitted });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? GENERIC_ERROR);
  }

  const parsedHandle = handleSchema.safeParse({ handle: submittedHandle });
  if (!parsedHandle.success) {
    return fail(parsedHandle.error.issues[0]?.message ?? GENERIC_ERROR);
  }

  const outcome = await setIdentity(
    account.playerId,
    parsed.data.displayName,
    parsedHandle.data.handle,
  );

  /* Only the handle can be taken now. A name is free to repeat. */
  if (outcome === "taken") {
    return fail("That handle is taken. Try another one.");
  }
  if (outcome === "failed") return fail(GENERIC_ERROR);

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
 * Whether a HANDLE is free, for the field to say so while it is typed.
 *
 * A courtesy, never the gate — the unique index decides, and
 * `setIdentity` reports what it decided. This exists because a picker
 * that only tells you at submit time is the most annoying form on the
 * internet.
 *
 * It checks the handle rather than the name because the name stopped
 * needing to be unique the day handles arrived: "taken" is no longer a
 * thing that can happen to somebody called Zach.
 */
export async function checkHandleAction(
  handle: string,
): Promise<"free" | "taken" | "bad"> {
  const account = await accountIdentity(await getViewer());
  if (!account) return "bad";

  const parsed = handleSchema.safeParse({ handle });
  if (!parsed.success) return "bad";

  return (await isHandleFree(parsed.data.handle, account.playerId)) ? "free" : "taken";
}

/**
 * Everything a new account needs, in one submit.
 *
 * The flow this replaces asked for a password on one screen and then a
 * name on the next, and the founder's report was the whole argument
 * against it: "when you create the account it says 'new password' when
 * really it should say 'password' then 'confirm password'. Also the
 * username should be something you can type in on the same screen. It
 * should not go to 'choose your username' after."
 *
 * Both halves of signing up are one act, so they are one form. Password
 * first, because a failure there is recoverable by trying again, while a
 * taken handle is a decision — and getting the recoverable failure out
 * of the way means the expensive one is never wasted.
 */
export async function finishSetupAction(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const submitted = text(formData, "displayName");
  const submittedHandle = text(formData, "handle");

  const fail = (message: string): SetupState => ({
    status: "error",
    message,
    displayName: submitted,
    handle: submittedHandle,
  });

  const account = await accountIdentity(await getViewer());
  if (!account) return fail(GENERIC_ERROR);

  const parsed = displayNameSchema.safeParse({ displayName: submitted });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? GENERIC_ERROR);
  }

  const parsedHandle = handleSchema.safeParse({ handle: submittedHandle });
  if (!parsedHandle.success) {
    return fail(parsedHandle.error.issues[0]?.message ?? GENERIC_ERROR);
  }

  const parsedPassword = newPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
  });
  if (!parsedPassword.success) {
    return fail(parsedPassword.error.issues[0]?.message ?? GENERIC_ERROR);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("Your sign-in has expired. Ask for a fresh link and try again.");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsedPassword.data.password,
  });

  if (error) {
    console.error("Could not set the password during setup", error.message);
    return fail(GENERIC_ERROR);
  }

  /* Identity after the password, so a taken handle leaves an account
     that can at least be signed into while they pick another. */
  const outcome = await setIdentity(
    account.playerId,
    parsed.data.displayName,
    parsedHandle.data.handle,
  );

  if (outcome === "taken") {
    return fail("That handle is taken. Try another one — your password is saved.");
  }
  if (outcome === "failed") return fail(GENERIC_ERROR);

  await markOnboarded(account.playerId);

  revalidatePath("/profile");
  redirect("/welcome/picture");
}
