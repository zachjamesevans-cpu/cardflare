"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { accountIdentity } from "./account-identity";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  createPlayerSession,
  deletePlayerSession,
  renamePlayerSession,
} from "./repository";
import { joinAsPlayerSchema, type JoinPlayerState } from "./schema";
import {
  clearPlayerCookie,
  createSessionToken,
  getPlayerSession,
  hashSessionToken,
  setPlayerCookie,
} from "./session";

/**
 * Joining is unauthenticated and writes a row, so it is throttled.
 *
 * Generous compared to the waitlist: a whole store shares one network, and a
 * queue of players scanning the same code at the same counter must not lock
 * each other out. This stops a script, not a busy Friday night.
 */
const JOIN_MAX = 20;
const JOIN_WINDOW_MS = 10 * 60 * 1000;

const GENERIC_ERROR = "Something went wrong on our end. Please try again in a moment.";

function invalid(message: string, displayName: string): JoinPlayerState {
  return { status: "error", message, displayName };
}

/**
 * Creates a guest identity and signs the browser into it.
 *
 * No email, no password, no account — a display name and a cookie. The token
 * is generated here and the database only ever sees its hash, so this function
 * holds the only copy at the only moment it exists in full.
 */
export async function joinAsPlayer(
  _previous: JoinPlayerState,
  formData: FormData,
): Promise<JoinPlayerState> {
  const submitted = text(formData, "displayName");

  /*
   * A signed-in player is not a guest, even here. This is the guest
   * front door and stays one, but somebody who has an account and lands
   * on it should get their own name rather than a second identity under
   * whatever they type — the account's name is unique and theirs.
   */
  const account = await accountIdentity(await getViewer());
  const parsed = joinAsPlayerSchema.safeParse({
    displayName: account?.displayName ?? submitted,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "displayName");
    return invalid(issue?.message ?? "Please choose a display name.", submitted);
  }

  const rate = checkRateLimit(
    `player-join:${await clientKey()}`,
    JOIN_MAX,
    JOIN_WINDOW_MS,
  );

  if (!rate.allowed) {
    return invalid(
      "Too many players joined from this network just now. Please wait a moment.",
      parsed.data.displayName,
    );
  }

  if (!isSupabaseConfigured()) {
    console.error("Player join rejected: Supabase is not configured.");
    return invalid(GENERIC_ERROR, parsed.data.displayName);
  }

  const token = createSessionToken();

  try {
    await createPlayerSession(parsed.data.displayName, hashSessionToken(token));
  } catch (error) {
    // Logged, never returned: the message can carry database internals.
    console.error("Could not create the player session", error);
    return invalid(GENERIC_ERROR, parsed.data.displayName);
  }

  await setPlayerCookie(token);
  redirect("/play");
}

/**
 * Changes the display name on the current session.
 *
 * Authorisation is the cookie: the session is resolved from it rather than
 * from any id the form submitted, so this cannot be pointed at someone else's
 * row by editing the request.
 */
export async function renamePlayer(
  _previous: JoinPlayerState,
  formData: FormData,
): Promise<JoinPlayerState> {
  const submitted = text(formData, "displayName");
  const parsed = joinAsPlayerSchema.safeParse({ displayName: submitted });

  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "displayName");
    return invalid(issue?.message ?? "Please choose a display name.", submitted);
  }

  const session = await getPlayerSession();
  if (!session) redirect("/play");

  try {
    await renamePlayerSession(session.id, parsed.data.displayName);
  } catch (error) {
    console.error("Could not rename the player session", error);
    return invalid(GENERIC_ERROR, parsed.data.displayName);
  }

  revalidatePath("/play");
  return { status: "idle" };
}

/** Ends the guest session and forgets it on both sides. */
export async function leaveAsPlayer(): Promise<void> {
  const session = await getPlayerSession();
  if (session) await deletePlayerSession(session.id);

  await clearPlayerCookie();
  redirect("/play");
}
