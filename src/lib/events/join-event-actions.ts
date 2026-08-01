"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPlayerSession, deletePlayerSession } from "@/lib/players/repository";
import { joinAsPlayerSchema, type JoinPlayerState } from "@/lib/players/schema";
import {
  createSessionToken,
  getPlayerSession,
  hashSessionToken,
  setPlayerCookie,
} from "@/lib/players/session";
import { clientKey } from "@/lib/request-context";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { isValidJoinCode, normalizeJoinCode } from "./join-code";
import { joinEvent, leaveEvent } from "./participants";
import { findEventByJoinCode } from "./repository";

const JOIN_MAX = 20;
const JOIN_WINDOW_MS = 10 * 60 * 1000;

const GENERIC_ERROR = "Something went wrong on our end. Please try again in a moment.";

function invalid(message: string, displayName: string): JoinPlayerState {
  return { status: "error", message, displayName };
}

/**
 * Joins an event room, creating the player's identity if they do not have one.
 *
 * This is the whole point of the QR code, so it is one submission: a player at
 * a counter types a name and is in the room. Splitting identity and joining
 * into two steps would put a second screen between scanning and trading, which
 * is exactly where the core loop cannot afford friction.
 *
 * The event is resolved from the code in the request, but the *player* always
 * comes from the cookie — a session id in the form would let anyone add
 * someone else to a room.
 */
export async function joinEventAction(
  _previous: JoinPlayerState,
  formData: FormData,
): Promise<JoinPlayerState> {
  const code = normalizeJoinCode(text(formData, "code"));
  const submitted = text(formData, "displayName");

  if (!isValidJoinCode(code)) {
    // The page they are on was reached by a valid code, so this means a
    // tampered form rather than a mistyped one.
    return invalid("That event code is not valid.", submitted);
  }

  const rate = checkRateLimit(
    `event-join:${await clientKey()}`,
    JOIN_MAX,
    JOIN_WINDOW_MS,
  );

  if (!rate.allowed) {
    return invalid(
      "Too many players joined from this network just now. Please wait a moment.",
      submitted,
    );
  }

  if (!isSupabaseConfigured()) {
    console.error("Event join rejected: Supabase is not configured.");
    return invalid(GENERIC_ERROR, submitted);
  }

  const event = await findEventByJoinCode(code);
  if (!event) return invalid("That event could not be found.", submitted);

  // Checked at the moment of joining, not when the page rendered: a store can
  // close the room between a player loading it and tapping the button.
  if (event.status !== "open") {
    return invalid("This room is not open right now.", submitted);
  }

  let session = await getPlayerSession();
  let freshToken: string | null = null;

  if (!session) {
    const parsed = joinAsPlayerSchema.safeParse({ displayName: submitted });

    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path[0] === "displayName");
      return invalid(issue?.message ?? "Please choose a display name.", submitted);
    }

    freshToken = createSessionToken();

    try {
      session = await createPlayerSession(
        parsed.data.displayName,
        hashSessionToken(freshToken),
      );
    } catch (error) {
      console.error("Could not create the player session", error);
      return invalid(GENERIC_ERROR, submitted);
    }
  }

  const joined = await joinEvent(event.id, session.id);

  if (!joined) {
    // The identity was created but the room write failed. Roll it back rather
    // than leaving an orphaned session and a cookie pointing at nothing.
    if (freshToken) await deletePlayerSession(session.id);
    return invalid(GENERIC_ERROR, submitted);
  }

  if (freshToken) await setPlayerCookie(freshToken);

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}

/** Leaves the room without ending the player's session. */
export async function leaveEventAction(formData: FormData): Promise<void> {
  const code = normalizeJoinCode(text(formData, "code"));
  if (!isValidJoinCode(code)) return;

  const session = await getPlayerSession();
  if (!session) redirect(`/e/${code}`);

  const event = await findEventByJoinCode(code);
  if (event) await leaveEvent(event.id, session.id);

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}
