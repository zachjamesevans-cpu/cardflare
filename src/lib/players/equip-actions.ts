"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { isEquipKind, setEquip } from "@/lib/players/equips";
import { text } from "@/lib/form-value";

/**
 * Wearing something from the customize page. Fire-and-forget from the
 * client's point of view - the tile already shows the choice - but the
 * profile pages revalidate so the real surfaces update on next look.
 */
export async function equipCosmeticAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) return;

  const kind = text(formData, "kind");
  if (!isEquipKind(kind)) return;

  const slug = text(formData, "slug");
  await setEquip(playerId, kind, slug || null);

  revalidatePath("/profile");
  revalidatePath("/profile/customize");
}
