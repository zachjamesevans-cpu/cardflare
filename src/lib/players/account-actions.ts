"use server";

import { revalidatePath } from "next/cache";

import { generateSetupLink } from "@/lib/auth/invite-link";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/client";
import { playerInviteEmail } from "@/lib/email/store-invite";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { text } from "@/lib/form-value";
import { addFlare } from "@/lib/lists/repository";
import { getPlayerSession } from "@/lib/players/session";
import { siteUrl } from "@/lib/site";
import { invitePlayer, linkSessionToPlayer, playerForUser } from "./accounts";
import {
  invitePlayerSchema,
  type InvitePlayerState,
  type RepostState,
} from "./account-schema";
import { listWants, removeWant } from "./wants";

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

/** Removes one saved want. The player's own list only. */
export async function removeWantAction(formData: FormData): Promise<void> {
  const wantId = text(formData, "wantId");
  if (!wantId) return;

  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  await removeWant(wantId, playerId);
  revalidatePath("/account");
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
