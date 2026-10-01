"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { mergeStores, previewMerge, type MergePreview } from "./merge-stores";

/** The website's doors to merging two stores. Admin only, both of them. */

export async function previewMergeAction(
  fromId: string,
  intoId: string,
): Promise<MergePreview | null> {
  await requireAdmin();
  return previewMerge(fromId, intoId);
}

export type MergeState = { status: "idle" } | { status: "error"; message: string };

export async function mergeStoresAction(
  _previous: MergeState,
  formData: FormData,
): Promise<MergeState> {
  await requireAdmin();

  const fromId = text(formData, "fromId");
  const intoId = text(formData, "intoId");
  /* The survivor's name, typed back, so a merge is never one slip. */
  const typed = text(formData, "confirmName").trim().toLowerCase();

  const preview = await previewMerge(fromId, intoId);
  if (!preview) return { status: "error", message: "Pick a store to merge into." };
  if (preview.blocked) return { status: "error", message: preview.blocked };
  if (typed !== preview.into.name.trim().toLowerCase()) {
    return {
      status: "error",
      message: `Type ${preview.into.name} exactly to confirm.`,
    };
  }

  const result = await mergeStores(fromId, intoId);
  if (!result.ok) return { status: "error", message: result.error };

  revalidatePath("/admin");
  revalidatePath("/admin/stores");
  revalidatePath(`/admin/stores/${intoId}`);
  redirect(`/admin/stores/${intoId}?merged=${encodeURIComponent(preview.from.name)}`);
}
