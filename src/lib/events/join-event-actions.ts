"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { text } from "@/lib/form-value";
import { getViewer } from "@/lib/auth/session";
import { linkSessionToPlayer, playerForUser } from "@/lib/players/accounts";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createPlayerSession,
  deletePlayerSession,
  renamePlayerSession,
} from "@/lib/players/repository";
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
import {
  findParticipation,
  joinEvent,
  leaveEvent,
  setOpenToTrades,
} from "./participants";
import { enterRoomByCode, resolveCode } from "./rooms";

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

  /*
   * The only place a walk-in room is ever opened.
   *
   * A store's permanent code resolves to whatever is running — a scheduled
   * event if there is one, so that tonight's tournament does not end up with
   * half its players in a separate room. If nothing is running and the store
   * allows walk-in trading, this tap is what starts it.
   */
  const event = await enterRoomByCode(code);
  if (!event) return invalid("That room could not be found.", submitted);

  // Checked at the moment of joining, not when the page rendered: a store can
  // close the room between a player loading it and tapping the button.
  if (event.status !== "open") {
    return invalid("This room is not open right now.", submitted);
  }

  let session = await getPlayerSession();
  let freshToken: string | null = null;

  if (session) {
    /*
     * A returning player can edit the name the form filled in for them.
     *
     * Renamed in place, never replaced: `player_cards`, `flares` and room
     * membership all hang off the session id, so creating a new session to
     * carry a new name would silently abandon the player's binder. Editing a
     * name must not cost anybody their cards.
     */
    const wants = submitted.trim();

    if (wants && wants !== session.display_name) {
      const parsed = joinAsPlayerSchema.safeParse({ displayName: wants });

      if (!parsed.success) {
        const issue = parsed.error.issues.find((i) => i.path[0] === "displayName");
        return invalid(issue?.message ?? "Please choose a display name.", submitted);
      }

      try {
        await renamePlayerSession(session.id, parsed.data.displayName);
        session = { ...session, display_name: parsed.data.displayName };
      } catch (error) {
        console.error("Could not rename the player session", error);
        return invalid(GENERIC_ERROR, submitted);
      }
    }
    /*
     * An empty field keeps the existing name rather than blocking the join.
     * The input is pre-filled, so blank means the field never arrived — and an
     * empty name was never going to be stored anyway.
     */
  } else {
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

  /*
   * If a signed-in account is present, the session becomes theirs — that is
   * the whole difference an account makes at the door. Guests join exactly
   * as before; nothing above this line knows accounts exist.
   */
  if (session.player_id === null) {
    const viewer = await getViewer();
    const playerId =
      viewer.kind === "player"
        ? viewer.playerId
        : viewer.kind === "anonymous"
          ? null
          : ((await playerForUser(viewer.user.id))?.id ?? null);

    if (playerId) await linkSessionToPlayer(session.id, playerId);
  }

  if (freshToken) await setPlayerCookie(freshToken);

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}

/**
 * Says whether the player will consider any trade.
 *
 * Re-establishes the whole chain rather than trusting the page that rendered
 * the form: a valid session, a room this code actually resolves to, and
 * membership of it. A Server Action is a public POST endpoint, and the player
 * always comes from the cookie — a session id in the form would let anyone
 * advertise somebody else.
 *
 * Resolved, never entered: announcing you are open to trades is not a way into
 * a room.
 */
export async function setOpenToTradesAction(formData: FormData): Promise<void> {
  const code = normalizeJoinCode(text(formData, "code"));
  if (!isValidJoinCode(code)) return;

  const open = text(formData, "open") === "on";

  const session = await getPlayerSession();
  if (!session) redirect(`/e/${code}`);

  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") redirect(`/e/${code}`);

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) redirect(`/e/${code}`);

  try {
    await setOpenToTrades(resolved.room.id, session.id, open);
  } catch (error) {
    // Nothing actionable to show: the page re-renders with the old state,
    // which is honest about what happened.
    console.error("Could not change the trade status", error);
  }

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}

/** Leaves the room without ending the player's session. */
export async function leaveEventAction(formData: FormData): Promise<void> {
  const code = normalizeJoinCode(text(formData, "code"));
  if (!isValidJoinCode(code)) return;

  const session = await getPlayerSession();
  if (!session) redirect(`/e/${code}`);

  // Resolved rather than entered: leaving a room must never open one.
  const resolved = await resolveCode(code);
  if (resolved.outcome === "room") await leaveEvent(resolved.room.id, session.id);

  revalidatePath(`/e/${code}`);
  redirect(`/e/${code}`);
}
