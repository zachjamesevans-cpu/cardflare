"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer, type Viewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import {
  addBinderCard,
  BINDER_NAME_MAX,
  createBinder,
  deleteBinder,
  removeBinderCard,
  saveBinderOrder,
  saveBinderSettings,
} from "./binder";
import { isBinderCover, type BinderCoverId } from "./covers";

/**
 * The binders' Server Actions, for the website. The app goes through
 * /api/v1/binders to the same lib. Every action names its binder by id.
 */

type Outcome = { ok: true } | { ok: false; message: string };

async function currentPlayer(
  viewer: Viewer,
): Promise<{ id: string; name: string } | null> {
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return { id: viewer.playerId, name: viewer.playerName };
  const player = await playerForUser(viewer.user.id);
  return player ? { id: player.id, name: player.display_name } : null;
}

function repaint(playerId: string, binderId: string): void {
  revalidatePath("/profile");
  revalidatePath(`/profile/binders/${binderId}`);
  revalidatePath(`/p/${playerId}`);
  revalidatePath(`/p/${playerId}/binders/${binderId}`);
}

const NO_SUCH = "No such binder.";

function binderIdOf(value: unknown): string | null {
  const parsed = z.guid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(BINDER_NAME_MAX).optional(),
  cover: z.custom<BinderCoverId>(isBinderCover).optional(),
  forTrade: z.boolean().optional(),
});

export async function saveBinderSettingsAction(
  input: unknown,
  binderId: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = binderIdOf(binderId);
  if (!which) return { ok: false, message: NO_SUCH };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "That setting is not one the binder has." };
  const result = await saveBinderSettings(player.id, player.name, parsed.data, which);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "invalid"
          ? `A name, up to ${BINDER_NAME_MAX} characters.`
          : result.reason === "not-yours"
            ? NO_SUCH
            : "Could not save that. Try again in a moment.",
    };
  }
  repaint(player.id, which);
  return { ok: true };
}

const addSchema = z.object({
  cardId: z.guid(),
  printingId: z.guid().nullable(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export async function addBinderCardAction(
  input: unknown,
  binderId: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = binderIdOf(binderId);
  if (!which) return { ok: false, message: NO_SUCH };
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pick a card from the list." };
  const result = await addBinderCard(player.id, player.name, parsed.data, which);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "at-cap"
          ? "That binder is full. Remove a card to add another."
          : result.reason === "not-yours"
            ? NO_SUCH
            : "Could not add that card. Try again in a moment.",
    };
  }
  repaint(player.id, which);
  return { ok: true };
}

export async function removeBinderCardAction(
  entryId: string,
  binderId: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = binderIdOf(binderId);
  if (!which) return { ok: false, message: NO_SUCH };
  if (!z.guid().safeParse(entryId).success) {
    return { ok: false, message: "That card is not in this binder." };
  }
  const result = await removeBinderCard(player.id, player.name, entryId, which);
  if (!result.ok) return { ok: false, message: "That card is not in this binder." };
  repaint(player.id, which);
  return { ok: true };
}

const orderSchema = z.array(z.guid()).max(400);

/** The whole binder's entry ids in the order the owner dragged them into. */
export async function reorderBinderAction(
  entryIds: unknown,
  binderId: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = binderIdOf(binderId);
  if (!which) return { ok: false, message: NO_SUCH };
  const parsed = orderSchema.safeParse(entryIds);
  if (!parsed.success)
    return { ok: false, message: "That order is not one the binder can keep." };
  const result = await saveBinderOrder(player.id, parsed.data, which);
  if (!result.ok)
    return { ok: false, message: "Could not save the order. Try again in a moment." };
  repaint(player.id, which);
  return { ok: true };
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(BINDER_NAME_MAX),
  cover: z.custom<BinderCoverId>(isBinderCover).optional(),
  forTrade: z.boolean().optional(),
});

/** A new binder, private unless the switch was on. */
export async function createBinderAction(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: `A name, up to ${BINDER_NAME_MAX} characters.` };
  }
  const result = await createBinder(player.id, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "at-cap"
          ? "Twenty binders is as many as a profile holds."
          : result.reason === "invalid"
            ? `A name, up to ${BINDER_NAME_MAX} characters.`
            : "Could not make the binder. Try again in a moment.",
    };
  }
  repaint(player.id, result.id);
  return { ok: true, id: result.id };
}

/** A binder and its cards, gone. */
export async function deleteBinderAction(binderId: string): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = binderIdOf(binderId);
  if (!which) return { ok: false, message: NO_SUCH };
  const result = await deleteBinder(player.id, player.name, which);
  if (!result.ok) return { ok: false, message: NO_SUCH };
  repaint(player.id, which);
  return { ok: true };
}
