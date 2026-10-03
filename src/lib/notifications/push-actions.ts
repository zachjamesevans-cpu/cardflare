"use server";

import { getViewer } from "@/lib/auth/session";
import {
  isPushGroup,
  type PushGroup,
  type PushPrefs,
} from "@/lib/notifications/push-prefs";
import { setPushPref } from "@/lib/notifications/push-prefs-server";
import { playerForUser } from "@/lib/players/accounts";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * One switch, flipped. A Server Action is a public POST, so the
 * account comes from the cookie and the group is checked against the
 * four that exist.
 */
export async function setPushPrefAction(
  group: PushGroup,
  on: boolean,
): Promise<{ ok: true; prefs: PushPrefs } | { ok: false; message: string }> {
  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) return { ok: false, message: "Sign in first." };
  if (!isPushGroup(group) || typeof on !== "boolean") {
    return { ok: false, message: "That switch does not exist." };
  }
  if (!checkRateLimit(`push-pref:${playerId}`, 30, 60_000).allowed) {
    return { ok: false, message: "Give it a moment." };
  }
  return { ok: true, prefs: await setPushPref(playerId, group, on) };
}
