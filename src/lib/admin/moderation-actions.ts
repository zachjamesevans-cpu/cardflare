"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { forgetFeed } from "@/lib/feed/memo";
import { removeCommentAsAdmin, removePostAsAdmin } from "./moderation";

/**
 * The report queue's Remove buttons. A Server Action is a public POST
 * endpoint, so each one checks for an admin before anything else
 * (requireAdmin redirects anyone who is not).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function repaint(): void {
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  revalidatePath("/feed");
  revalidatePath("/profile");
}

export async function removeReportedPostAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const postId = String(formData.get("targetId") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  if (!UUID.test(postId)) return;
  const outcome = await removePostAsAdmin(postId, user.id);
  /* The owner's own Feed may hold the post in memory: drop it. */
  if (outcome.ok && UUID.test(ownerId)) forgetFeed(ownerId);
  repaint();
}

export async function removeReportedCommentAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const commentId = String(formData.get("targetId") ?? "");
  if (!UUID.test(commentId)) return;
  await removeCommentAsAdmin(commentId, user.id);
  repaint();
}
