"use server";

import { revalidatePath } from "next/cache";

import { getViewer, requireAdmin } from "@/lib/auth/session";
import { forgetFeed } from "@/lib/feed/memo";
import { playerForUser } from "@/lib/players/accounts";
import { REPORT_KINDS } from "./safety-reasons";
import {
  blockPlayer,
  reportTarget,
  resolveReport,
  unblockPlayer,
  type ReportKind,
  type ReportReason,
} from "./safety";

/**
 * The website's doors to report and block. The player is re-derived
 * from the session; nothing in the form says who is acting.
 */

export type SafetyResult = { ok: true } | { ok: false; message: string };

async function viewerPlayerId(): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return viewer.playerId;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

function repaint(playerId: string, otherId: string): void {
  forgetFeed(playerId);
  revalidatePath("/feed");
  revalidatePath("/local");
  revalidatePath(`/p/${otherId}`);
  revalidatePath("/profile/settings");
}

export async function blockPlayerAction(otherId: string): Promise<SafetyResult> {
  const me = await viewerPlayerId();
  if (!me) return { ok: false, message: "Sign in first." };
  if (me === otherId) return { ok: false, message: "That is you." };

  const done = await blockPlayer(me, otherId);
  if (!done) return { ok: false, message: "Could not block them. Try again." };
  repaint(me, otherId);
  return { ok: true };
}

export async function unblockPlayerAction(otherId: string): Promise<SafetyResult> {
  const me = await viewerPlayerId();
  if (!me) return { ok: false, message: "Sign in first." };

  const done = await unblockPlayer(me, otherId);
  if (!done) return { ok: false, message: "Could not unblock them. Try again." };
  repaint(me, otherId);
  return { ok: true };
}

const KINDS: ReportKind[] = REPORT_KINDS;
const REASONS: ReportReason[] = ["spam", "scam", "harassment", "other"];

export async function reportAction(input: {
  kind: string;
  targetId: string;
  reason: string;
  note?: string;
}): Promise<SafetyResult> {
  const me = await viewerPlayerId();
  if (!me) return { ok: false, message: "Sign in first." };

  if (!KINDS.includes(input.kind as ReportKind) || !input.targetId) {
    return { ok: false, message: "Could not tell what to report." };
  }
  if (!REASONS.includes(input.reason as ReportReason)) {
    return { ok: false, message: "Pick a reason." };
  }
  const note = (input.note ?? "").trim().slice(0, 500) || null;

  const result = await reportTarget(
    me,
    input.kind as ReportKind,
    input.targetId,
    input.reason as ReportReason,
    note,
  );
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "yourself"
          ? "That one is yours."
          : result.reason === "not-found"
            ? "That is gone already."
            : "Could not send the report. Try again.",
    };
  }
  revalidatePath("/admin/reports");
  return { ok: true };
}

/** Admin: a report is dealt with. */
export async function resolveReportAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("reportId") ?? "");
  if (!id) return;
  await resolveReport(id, user.id);
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}
