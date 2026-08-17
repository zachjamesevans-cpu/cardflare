"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { createAnnouncement, endAnnouncement } from "./repository";
import { checkAnnouncement, type AnnouncementFormState } from "./schema";

/**
 * Writing and pulling a notice.
 *
 * Admin only, checked here rather than trusted from the page: a Server
 * Action is a public POST endpoint, and this one puts text in front of
 * every player at once.
 */

export async function postAnnouncementAction(
  _previous: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const admin = await requireAdmin();

  const checked = checkAnnouncement({
    headline: text(formData, "headline"),
    body: text(formData, "body"),
    linkLabel: text(formData, "linkLabel"),
    linkHref: text(formData, "linkHref"),
    days: text(formData, "days"),
  });

  if (!checked.ok) return { status: "error", message: checked.message };

  const written = await createAnnouncement({ ...checked.draft, createdBy: admin.id });
  if (!written.ok) return { status: "error", message: written.message };

  revalidatePath("/admin/announcements");
  revalidatePath("/feed");

  return { status: "posted", headline: checked.draft.headline };
}

/** Ends a notice now. The row stays; only its window closes. */
export async function endAnnouncementAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = text(formData, "id");
  if (!id) return;

  await endAnnouncement(id);

  revalidatePath("/admin/announcements");
  revalidatePath("/feed");
}
