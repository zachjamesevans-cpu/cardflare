"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { binderPagesSchema } from "@/lib/binder/pages-schema";
import {
  discardQueue,
  pagesLeftToday,
  placeQueue,
  queuesFor,
  queueView,
  sendPage,
  type PageSendRefusal,
  type QueuedPage,
} from "@/lib/cards/page-jobs";
import { POCKETS_PER_PAGE, pagesPlacedLine } from "@/lib/cards/scan-rules";
import { playerForUser } from "@/lib/players/accounts";
import { z } from "zod";

/**
 * The website's doors to pages read in the background. The browser
 * sends a page (the whole photo, "page", and its pockets, "pocket0" to
 * "pocket8") and can be left; the check opens the queue later, from
 * the binder or from the notice.
 */

async function who(): Promise<{
  playerId: string;
  userId: string;
  name: string;
} | null> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") {
    return {
      playerId: viewer.playerId,
      userId: viewer.user.id,
      name: viewer.playerName,
    };
  }
  const player = await playerForUser(viewer.user.id);
  return player
    ? { playerId: player.id, userId: viewer.user.id, name: player.display_name }
    : null;
}

const ids = z.object({
  binderId: z.guid(),
  batchId: z.guid(),
  pageNumber: z.coerce.number().int().min(1).max(100),
});

export async function sendPageAction(
  form: FormData,
): Promise<
  | { ok: true; scanId: string; left: number | null }
  | { ok: false; reason: PageSendRefusal }
> {
  const me = await who();
  if (!me) return { ok: false, reason: "not-allowed" };
  const parsed = ids.safeParse({
    binderId: form.get("binderId"),
    batchId: form.get("batchId"),
    pageNumber: form.get("pageNumber"),
  });
  const page = form.get("page");
  if (!parsed.success || !(page instanceof Blob))
    return { ok: false, reason: "no-card" };
  const pockets = await Promise.all(
    Array.from({ length: POCKETS_PER_PAGE }, async (_, slot) => {
      const cell = form.get(`pocket${slot}`);
      return cell instanceof Blob ? new Uint8Array(await cell.arrayBuffer()) : null;
    }),
  );
  return sendPage(me, {
    ...parsed.data,
    page: new Uint8Array(await page.arrayBuffer()),
    pockets,
  });
}

export async function queueViewAction(
  batchId: string,
): Promise<{ binderId: string; pages: QueuedPage[] } | null> {
  const me = await who();
  if (!me || !z.guid().safeParse(batchId).success) return null;
  return queueView(me, batchId);
}

export async function queuesForAction(binderId: string): Promise<{
  queues: { batchId: string; pages: number; ready: boolean }[];
  left: number | null;
}> {
  const me = await who();
  if (!me || !z.guid().safeParse(binderId).success) return { queues: [], left: 0 };
  const [queues, left] = await Promise.all([
    queuesFor(me, binderId),
    pagesLeftToday(me),
  ]);
  return { queues, left };
}

export async function placeQueueAction(
  batchId: string,
  input: unknown,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const me = await who();
  if (!me) return { ok: false, message: "Sign in to keep a binder." };
  const parsed = binderPagesSchema.safeParse(input);
  if (!z.guid().safeParse(batchId).success || !parsed.success) {
    return { ok: false, message: "Those pages could not be read." };
  }
  const result = await placeQueue(me, me.name, batchId, parsed.data.placements);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "unavailable"
          ? "Could not place those pages. Try again in a moment."
          : "Those pages are gone. Scan them again.",
    };
  }
  revalidatePath("/profile");
  revalidatePath("/profile/binders/[binderId]", "page");
  return { ok: true, message: pagesPlacedLine(result) };
}

export async function discardQueueAction(batchId: string): Promise<{ ok: boolean }> {
  const me = await who();
  if (!me || !z.guid().safeParse(batchId).success) return { ok: false };
  return { ok: await discardQueue(me, batchId) };
}
