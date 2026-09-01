"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateSetupLink } from "@/lib/auth/invite-link";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/client";
import { playerInviteEmail } from "@/lib/email/store-invite";
import { findParticipation, joinEvent } from "@/lib/events/participants";
import { postAreaFlare } from "@/lib/local/area";
import { enterRoomByCode, resolveCode } from "@/lib/events/rooms";
import { roomPhase } from "@/lib/events/schema";
import { text } from "@/lib/form-value";
import { addFlareBatch } from "@/lib/lists/repository";
import { deckLabelSchema } from "@/lib/lists/schema";
import { findCardsByNumbers } from "@/lib/cards/search";
import { compactCardNumber, parseDeckList, type DeckImportState } from "./deck-list";
import { previewDeckList, type DeckPreviewEntry } from "./deck-list-preview";
import { addEntrySchema, type ListState } from "@/lib/lists/schema";
import { notifyEarlyBoardFlares, notifyRoomFlare } from "@/lib/notifications/notify";
import { accountRoomIdentity } from "@/lib/players/room-identity";
import { getPlayerSession, setPlayerCookie } from "@/lib/players/session";
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
   * The player's room identity: the same resolver the join form uses, so an
   * RSVP from a laptop and a join from the app land on one seat rather than
   * two. Created on the spot when nothing exists yet, seeded with the
   * account's own display name so nothing has to be typed.
   */
  const displayName =
    viewer.kind === "player"
      ? viewer.playerName
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.display_name ?? null);
  if (!displayName) return;

  let identity;
  try {
    identity = await accountRoomIdentity(
      playerId,
      displayName,
      await getPlayerSession(),
    );
  } catch (error) {
    console.error("Could not resolve the account's room identity", error);
    return;
  }

  const session = identity.session;
  if (identity.freshToken) await setPlayerCookie(identity.freshToken);

  const joined = await joinEvent(event.id, session.id);
  if (!joined) return;

  await saveLocal(playerId, event.storeId);

  /* Post the whole want list as ONE batch — an RSVP is one act, and a
     twenty-card list arriving as twenty separate posts is what this
     round exists to stop. Duplicates are skipped and the cap stops it
     the same way the repost panel's does. */
  const wants = await listWants(playerId);
  await addFlareBatch(
    event.id,
    session.id,
    wants.map((want) => ({
      cardId: want.cardId,
      printingId: want.printingId,
      quantity: want.quantity,
      note: want.note,
      deckLabel: want.deckLabel,
    })),
  );

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
  revalidatePath("/profile/settings");
}

/**
 * Repaints wherever the want list is on screen.
 *
 * The profile's settings page and the Flare tab always — the Flare tab
 * is the list's home now — and the room too when the form came from the
 * re-post panel, which edits the list in place.
 */
function revalidateWants(code: string): void {
  revalidatePath("/profile/settings");
  revalidatePath("/flare");
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

  /*
   * One batch, so the room hears about a want list once. This used to
   * loop `addFlare` and tell nobody at all — quiet, but the wrong kind:
   * a player posting twenty cards ahead of a release is exactly the
   * event everybody else in the room wants to know about.
   */
  const { posted } = await addFlareBatch(
    resolved.room.id,
    session.id,
    wants.map((want) => ({
      cardId: want.cardId,
      printingId: want.printingId,
      quantity: want.quantity,
      note: want.note,
      deckLabel: want.deckLabel,
    })),
  );

  if (posted.length > 0) {
    void notifyRoomFlare(
      resolved.room.id,
      session.id,
      session.display_name ?? "A player",
      posted,
      "want",
    );
  }

  revalidatePath(`/e/${code}`);
  return { status: "posted", count: posted.length };
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

  /*
   * No room: it goes up for the people near you.
   *
   * This used to save a private want, which is the reason the product
   * had two nouns and three composers. The founder's model, and the
   * simpler one: "you post a flare. whether its someone local, at a
   * store, card show, etc. - they can see it."
   *
   * WHERE IT LANDS IS DERIVED, NEVER ASKED. Being in a room is a fact
   * the app already knows, so a Flare posted there goes on that board —
   * and Local already shows the boards of stores near you, so the area
   * sees it too, with no second row and no visibility question to answer
   * on every post.
   */
  const outcome = await postAreaFlare(playerId, {
    cardId: parsed.data.cardId,
    printingId: parsed.data.printingId ?? null,
    quantity: parsed.data.quantity,
    note: parsed.data.note ?? null,
  });

  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "no-postal-code"
          ? "Tell us roughly where you are and the card goes up."
          : outcome.reason === "already-posted"
            ? "That card is already up."
            : outcome.reason === "not-migrated"
              ? "Posting isn't switched on yet."
              : "Something went wrong. Please try again in a moment.",
    };
  }

  revalidatePath("/profile/settings");
  revalidatePath("/flare");
  revalidatePath("/local");

  return {
    status: "added",
    kind: "flare",
    cardName: text(formData, "cardName").slice(0, 200),
  };
}

/** What the paste-a-deck confirmation screen renders. */
export interface DeckPreviewResult {
  entries: DeckPreviewEntry[];
  unreadable: string[];
}

/**
 * The pasted list, looked up with names and art BEFORE anything saves.
 *
 * The founder's ask after a bad paste went through silently: "have a
 * loading screen that loads all cards, with images, for confirmation
 * that they are the cards someone wants." This is that screen's data.
 * Read-only — the save is still `importDeckListAction`, which re-parses
 * the text itself rather than trusting anything echoed back.
 */
export async function previewDeckListAction(list: string): Promise<DeckPreviewResult> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId || typeof list !== "string") return { entries: [], unreadable: [] };

  const { lines, unreadable } = parseDeckList(list.slice(0, 20_000));
  return { entries: await previewDeckList(lines), unreadable };
}

/**
 * Saves a pasted deck list to the want list, under one name.
 *
 * The bulk half of "post multiple flares at once". This puts the cards
 * on the account; the room's existing "still hunting these?" panel posts
 * them as ONE batch, which is what makes a thirty-card deck a single
 * notification and a single Feed item.
 *
 * Deliberately not a posting action itself. A deck is written at home
 * and posted at a counter, often days apart, and a want list is the
 * thing that already survives that gap — see `saveWantAction`.
 */
export async function importDeckListAction(
  _previous: DeckImportState,
  formData: FormData,
): Promise<DeckImportState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) {
    return { status: "error", message: "Sign in to keep a list between events." };
  }

  const { lines, unreadable } = parseDeckList(text(formData, "list"));

  if (lines.length === 0) {
    return {
      status: "error",
      message: "No card numbers in that. Lines look like “OP17-001” or “4x OP17-001”.",
    };
  }

  const label = deckLabelSchema.safeParse(text(formData, "deckLabel") || null);
  const deckLabel = label.success ? (label.data ?? null) : null;

  /*
   * Resolved by NUMBER, in one query. Names are ignored on purpose: they
   * differ by printing, language and punctuation, and a list that
   * half-matches on names is worse than one that says plainly what it
   * could not find.
   */
  const found = await findCardsByNumbers(lines.map((line) => line.cardNumber));

  let saved = 0;
  let atCap = false;
  const unknown: string[] = [];

  for (const line of lines) {
    const cardId = found.get(compactCardNumber(line.cardNumber));

    if (!cardId) {
      unknown.push(line.cardNumber);
      continue;
    }

    const outcome = await saveWant(playerId, {
      cardId,
      /* Any printing. A deck list says which card, never which art. */
      printingId: null,
      quantity: line.quantity,
      note: null,
      deckLabel,
    });

    if (outcome === "saved") saved += 1;
    else if (outcome === "at-cap") {
      atCap = true;
      break;
    }
  }

  revalidatePath("/profile");

  return { status: "saved", saved, unknown, unreadable, atCap };
}
