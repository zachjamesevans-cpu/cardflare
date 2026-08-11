"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateSetupLink } from "@/lib/auth/invite-link";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/client";
import { playerInviteEmail } from "@/lib/email/store-invite";
import { findParticipation, joinEvent } from "@/lib/events/participants";
import { enterRoomByCode, resolveCode } from "@/lib/events/rooms";
import { roomPhase } from "@/lib/events/schema";
import { text } from "@/lib/form-value";
import { addFlare } from "@/lib/lists/repository";
import { addEntrySchema, type ListState } from "@/lib/lists/schema";
import { notifyEarlyBoardFlares } from "@/lib/notifications/notify";
import { createPlayerSession } from "@/lib/players/repository";
import {
  createSessionToken,
  getPlayerSession,
  hashSessionToken,
  setPlayerCookie,
} from "@/lib/players/session";
import { siteUrl } from "@/lib/site";
import { invitePlayer, linkSessionToPlayer, playerForUser } from "./accounts";
import {
  invitePlayerSchema,
  type InvitePlayerState,
  type RepostState,
} from "./account-schema";
import { removeLocal, saveLocal } from "./locals";
import { listWants, removeWant, saveWant, setWantQuantity } from "./wants";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * The player behind whoever is signed in, whatever else they are.
 *
 * The founder is an admin who also holds a player account; a store owner
 * might too. Player features key on the players row, not on the viewer
 * kind, so one account can be all of these at once.
 */
async function playerIdFor(viewer: Viewer): Promise<string | null> {
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return viewer.playerId;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

/** Adds a player to the beta and emails them, admin only. */
export async function invitePlayerAction(
  _previous: InvitePlayerState,
  formData: FormData,
): Promise<InvitePlayerState> {
  const viewer = await getViewer();
  if (viewer.kind !== "admin") {
    return { status: "error", message: GENERIC_ERROR };
  }

  const parsed = invitePlayerSchema.safeParse({
    displayName: text(formData, "displayName"),
    email: text(formData, "email"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const result = await invitePlayer(parsed.data, viewer.user.id);

  if (result.outcome === "already-invited") {
    return {
      status: "error",
      message: "That email address already has a pending invitation.",
    };
  }
  if (result.outcome === "failed") {
    return { status: "error", message: GENERIC_ERROR };
  }

  const setupLink = await generateSetupLink(parsed.data.email);

  const email = await sendEmail(
    playerInviteEmail(parsed.data.displayName, parsed.data.email, siteUrl(), setupLink),
  );

  if (email.status === "failed") {
    console.error(`Player invitation email failed: ${email.reason}`);
  }

  revalidatePath("/admin/players");

  const outcome = email.status === "skipped" ? "not-configured" : email.status;

  return {
    status: "success",
    displayName: parsed.data.displayName,
    email: outcome,
    setupLink: outcome === "sent" ? null : setupLink,
  };
}

/**
 * "I'll be there": one tap that walks a signed-in player onto an
 * upcoming board and posts everything they are still hunting.
 *
 * No RSVP table behind it, on purpose. Being in the room before doors
 * IS the RSVP: participation counts you among who is coming, the board
 * carries your Flares days early, leaving the room takes it back, and
 * the no-show expiry already cleans up after anyone whose plans fell
 * through. A second record of the same fact would drift from the first.
 *
 * Everything is re-derived here because a Server Action is a public
 * POST endpoint: the signed-in player from the cookie, the room from
 * the code, and the phase from the clock. Guests never reach this
 * (their path is the join form, exactly as before); duplicate wants
 * already on the board are skipped by the repository.
 */
export async function rsvpAction(formData: FormData): Promise<void> {
  const code = text(formData, "code");
  if (!code) return;

  const viewer = await getViewer();
  const playerId = await playerIdFor(viewer);
  if (!playerId) return;

  const event = await enterRoomByCode(code);
  if (!event) return;

  const phase = roomPhase(event, Date.now());
  if (phase !== "early" && phase !== "live") return;

  /*
   * The player's session, created on the spot when this browser has
   * none: the same identity machinery the join form uses, seeded with
   * the account's own display name so nothing has to be typed.
   */
  let session = await getPlayerSession();
  if (!session) {
    const displayName =
      viewer.kind === "player"
        ? viewer.playerName
        : viewer.kind === "anonymous"
          ? null
          : ((await playerForUser(viewer.user.id))?.display_name ?? null);
    if (!displayName) return;

    const freshToken = createSessionToken();
    try {
      session = await createPlayerSession(displayName, hashSessionToken(freshToken));
    } catch (error) {
      console.error("Could not create a session for the RSVP", error);
      return;
    }
    await setPlayerCookie(freshToken);
  }

  const joined = await joinEvent(event.id, session.id);
  if (!joined) return;

  if (session.player_id === null) await linkSessionToPlayer(session.id, playerId);
  await saveLocal(playerId, event.storeId);

  // Post the whole want list; the board's duplicates are skipped and the
  // cap stops the loop the same way the repost panel's does.
  const wants = await listWants(playerId);
  for (const want of wants) {
    const result = await addFlare(event.id, session.id, {
      cardId: want.cardId,
      printingId: want.printingId,
      quantity: want.quantity,
      note: want.note,
      deckLabel: want.deckLabel,
    });
    if (!result.ok && result.reason === "at-cap") break;
  }

  // An RSVP's Flares wake the store's regulars the same way any early
  // post does; the dedupe makes this free when the digest already went.
  if (phase === "early" && wants.length > 0) {
    void notifyEarlyBoardFlares(event.id);
  }

  redirect(`/e/${code}`);
}

/** Forgets one saved store. The player's own locals only. */
export async function removeLocalAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  if (!storeId) return;

  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  await removeLocal(playerId, storeId);
  revalidatePath("/account");
}

/**
 * Repaints wherever the want list is on screen.
 *
 * The account page always; the room too when the form came from the
 * re-post panel, which now edits the list in place rather than only
 * offering to post it.
 */
function revalidateWants(code: string): void {
  revalidatePath("/account");
  if (code) {
    revalidatePath(`/e/${code}`);
    revalidatePath("/room");
  }
}

/** Removes one saved want. The player's own list only. */
export async function removeWantAction(formData: FormData): Promise<void> {
  const wantId = text(formData, "wantId");
  if (!wantId) return;

  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  await removeWant(wantId, playerId);
  revalidateWants(text(formData, "code"));
}

/**
 * Nudges one saved want's quantity up or down.
 *
 * A delta rather than an absolute, because the control is a pair of
 * buttons and two thumbs racing each other should land on "two more",
 * not on whichever number was on screen when the first tap started. The
 * repository clamps; one at minus stays one, and removal has its own
 * button.
 */
export async function nudgeWantQuantityAction(formData: FormData): Promise<void> {
  const wantId = text(formData, "wantId");
  const delta = Number(text(formData, "delta"));
  if (!wantId || !Number.isFinite(delta) || delta === 0) return;

  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  const wants = await listWants(playerId);
  const want = wants.find((entry) => entry.id === wantId);
  if (!want) return;

  await setWantQuantity(wantId, playerId, want.quantity + Math.trunc(delta));
  revalidateWants(text(formData, "code"));
}

/**
 * Posts the player's outstanding saved wants as Flares in this room.
 *
 * One tap covers "post these again?": every want that is not already an
 * open Flare of theirs on this board goes up. Ownership is re-derived from
 * scratch — the signed-in account, the session cookie, and membership in
 * the room the code resolves to — because a Server Action trusts nothing.
 */
export async function repostWantsAction(
  _previous: RepostState,
  formData: FormData,
): Promise<RepostState> {
  const code = text(formData, "code");
  if (!code) return { status: "error", message: GENERIC_ERROR };

  const playerId = await playerIdFor(await getViewer());
  const session = await getPlayerSession();
  if (!playerId || !session) {
    return { status: "error", message: "Sign in and join the room first." };
  }

  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") {
    return { status: "error", message: "This room is not open any more." };
  }

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) {
    return { status: "error", message: "Join the room first." };
  }

  // A session that posts account wants belongs to that account from here on.
  await linkSessionToPlayer(session.id, playerId);

  const wants = await listWants(playerId);
  if (wants.length === 0) return { status: "posted", count: 0 };

  let posted = 0;

  for (const want of wants) {
    const result = await addFlare(resolved.room.id, session.id, {
      cardId: want.cardId,
      printingId: want.printingId,
      quantity: want.quantity,
      note: want.note,
      deckLabel: want.deckLabel,
    });

    if (result.ok) {
      posted += 1;
    } else if (result.reason === "at-cap") {
      break;
    }
    // A duplicate (already on the board) is skipped by the repository; any
    // other failure skips one want rather than abandoning the rest.
  }

  revalidatePath(`/e/${code}`);
  return { status: "posted", count: posted };
}

/**
 * Saves a hunt straight to the account list, no room involved.
 *
 * The website's twin of `POST /api/v1/wants`, and the same founder bug
 * behind both: a Flare posted from the couch used to need a room, and
 * the only room going was one that had no business being open at
 * midnight. A want saved here touches no event; the next room the
 * player walks into offers to post it.
 */
export async function saveWantAction(
  _previous: ListState,
  formData: FormData,
): Promise<ListState> {
  const playerId = await playerIdFor(await getViewer());

  if (!playerId) {
    return { status: "error", message: "Sign in to keep a list between events." };
  }

  const parsed = addEntrySchema.safeParse({
    cardId: text(formData, "cardId"),
    printingId: text(formData, "printingId"),
    quantity: text(formData, "quantity") || 1,
    note: text(formData, "note"),
    deckLabel: text(formData, "deckLabel"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the details.",
    };
  }

  const outcome = await saveWant(playerId, parsed.data);

  if (outcome !== "saved") {
    return {
      status: "error",
      message:
        outcome === "at-cap"
          ? "Your list is full. Remove something on your account page first."
          : "Something went wrong. Please try again in a moment.",
    };
  }

  revalidatePath("/account");
  revalidatePath("/flare");

  return {
    status: "added",
    kind: "flare",
    cardName: text(formData, "cardName").slice(0, 200),
  };
}
