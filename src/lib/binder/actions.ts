"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer, type Viewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { addBinderCard, removeBinderCard, saveBinderSettings } from "./binder";
import { isBinderCover, isBinderLayout } from "./covers";

/**
 * The binder's Server Actions, for the website. The app goes through
 * /api/v1/binder to the same lib.
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

function repaint(playerId: string): void {
  revalidatePath("/profile");
  revalidatePath("/profile/binder");
  revalidatePath(`/p/${playerId}`);
  revalidatePath(`/p/${playerId}/binder`);
}

const settingsSchema = z.object({
  isPublic: z.boolean().optional(),
  layout: z.custom<2 | 3>(isBinderLayout).optional(),
  cover: z.custom<string>(isBinderCover).optional(),
  frontEntryId: z.guid().nullable().optional(),
});

export async function saveBinderSettingsAction(input: unknown): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "That setting is not one the binder has." };
  const patch = parsed.data;
  await saveBinderSettings(player.id, {
    ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
    ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
    ...(patch.cover !== undefined && isBinderCover(patch.cover)
      ? { cover: patch.cover }
      : {}),
    ...(patch.frontEntryId !== undefined ? { frontEntryId: patch.frontEntryId } : {}),
  });
  repaint(player.id);
  return { ok: true };
}

const addSchema = z.object({
  cardId: z.guid(),
  printingId: z.guid().nullable(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export async function addBinderCardAction(input: unknown): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pick a card from the list." };
  const result = await addBinderCard(player.id, player.name, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "at-cap"
          ? "Your binder is full. Remove a card to add another."
          : "Could not add that card. Try again in a moment.",
    };
  }
  repaint(player.id);
  return { ok: true };
}

export async function removeBinderCardAction(entryId: string): Promise<Outcome> {
  const player = await currentPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in to keep a binder." };
  if (!z.guid().safeParse(entryId).success) {
    return { ok: false, message: "That card is not in your binder." };
  }
  const result = await removeBinderCard(player.id, entryId);
  if (!result.ok) return { ok: false, message: "That card is not in your binder." };
  repaint(player.id);
  return { ok: true };
}
