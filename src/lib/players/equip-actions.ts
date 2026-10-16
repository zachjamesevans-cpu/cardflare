"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { isEquipKind, setEquip } from "@/lib/players/equips";

async function viewerPlayerId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === "player"
    ? viewer.playerId
    : viewer.kind === "anonymous"
      ? null
      : ((await playerForUser(viewer.user.id))?.id ?? null);
}

/** At most every slot there is, so a forged list cannot run long. */
const MAX_CHANGES = 20;

/**
 * Edit profile's Done: every pick from the Look and Showcase tabs, saved
 * in one go (components/players/look-draft). One slot at a time, and a
 * slot that fails does not stop the rest; the answer says whether all of
 * it took, so the page can put back what did not. A Server Action is a
 * public endpoint, so the list is checked here, not trusted.
 */
export async function saveLookAction(
  changes: { kind: string; slug: string | null }[],
): Promise<"saved" | "not-pro" | "failed"> {
  const playerId = await viewerPlayerId();
  if (!playerId) return "failed";
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES) return "failed";

  let outcome: "saved" | "not-pro" | "failed" = "saved";
  for (const change of changes) {
    const kind = typeof change?.kind === "string" ? change.kind : "";
    const slug =
      typeof change?.slug === "string" ? change.slug.trim().slice(0, 40) : "";
    if (!isEquipKind(kind)) {
      outcome = "failed";
      continue;
    }
    const result = await setEquip(playerId, kind, slug || null);
    if (result === "not-pro") outcome = "not-pro";
    else if ((result === "not-owned" || result === "failed") && outcome === "saved") {
      outcome = "failed";
    }
  }

  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  return outcome;
}
