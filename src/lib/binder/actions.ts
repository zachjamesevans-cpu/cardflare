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
  TRADE_BINDER_ID,
} from "./binder";
import { isBinderCover, isBinderLayout, type BinderCoverId } from "./covers";

/**
 * The binders' Server Actions, for the website. The app goes through
 * /api/v1/binders to the same lib. Every action takes the binder's id
 * last; left out, it means the Trade binder.
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
  revalidatePath("/profile/binders");
  revalidatePath(`/profile/binders/${binderId}`);
  revalidatePath(`/p/${playerId}`);
  revalidatePath(`/p/${playerId}/binders`);
  revalidatePath(`/p/${playerId}/binders/${binderId}`);
}

const binderIdSchema = z.union([z.literal(TRADE_BINDER_ID), z.guid()]);

function whichBinder(binderId: unknown): string | null {
  if (binderId === undefined) return TRADE_BINDER_ID;
  const parsed = binderIdSchema.safeParse(binderId);
  return parsed.success ? parsed.data : null;
}

const settingsSchema = z.object({
  isPublic: z.boolean().optional(),
  layout: z.custom<2 | 3>(isBinderLayout).optional(),
  cover: z.custom<string>(isBinderCover).optional(),
  frontEntryId: z.guid().nullable().optional(),
  name: z.string().trim().min(1).max(BINDER_NAME_MAX).optional(),
});

export async function saveBinderSettingsAction(
  input: unknown,
  binderId?: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = whichBinder(binderId);
  if (!which) return { ok: false, message: "No such binder." };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "That setting is not one the binder has." };
  const patch = parsed.data;
  await saveBinderSettings(
    player.id,
    {
      ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
      ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
      ...(patch.cover !== undefined && isBinderCover(patch.cover)
        ? { cover: patch.cover }
        : {}),
      ...(patch.frontEntryId !== undefined ? { frontEntryId: patch.frontEntryId } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
    },
    which,
  );
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
  binderId?: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = whichBinder(binderId);
  if (!which) return { ok: false, message: "No such binder." };
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
            ? "No such binder."
            : "Could not add that card. Try again in a moment.",
    };
  }
  repaint(player.id, which);
  return { ok: true };
}

export async function removeBinderCardAction(
  entryId: string,
  binderId?: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = whichBinder(binderId);
  if (!which) return { ok: false, message: "No such binder." };
  if (!z.guid().safeParse(entryId).success) {
    return { ok: false, message: "That card is not in this binder." };
  }
  const result = await removeBinderCard(player.id, entryId, which);
  if (!result.ok) return { ok: false, message: "That card is not in this binder." };
  repaint(player.id, which);
  return { ok: true };
}

const orderSchema = z.array(z.guid()).max(400);

/** The whole binder's entry ids in the order the owner dragged them into. */
export async function reorderBinderAction(
  entryIds: unknown,
  binderId?: string,
): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const which = whichBinder(binderId);
  if (!which) return { ok: false, message: "No such binder." };
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
});

/** A new custom binder. */
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

/** A custom binder and its cards, gone. */
export async function deleteBinderAction(binderId: string): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  if (!z.guid().safeParse(binderId).success) {
    return { ok: false, message: "The Trade binder stays." };
  }
  const result = await deleteBinder(player.id, binderId);
  if (!result.ok) return { ok: false, message: "No such binder." };
  repaint(player.id, binderId);
  return { ok: true };
}
