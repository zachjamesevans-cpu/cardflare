import "server-only";

import { afterResponse } from "@/lib/after-response";
import {
  binderOwner,
  placeBinderPages,
  type BinderPlacement,
} from "@/lib/binder/binder";
import { readWithAgent, type AgentPhoto } from "@/lib/cards/page-agent";
import {
  photoType,
  scannerAccess,
  type PocketOutcome,
  type ScanMatch,
} from "@/lib/cards/scan";
import {
  MAX_SCAN_PAGES,
  PAGES_PER_DAY,
  POCKETS_PER_PAGE,
  SCAN_GAMES,
  SCAN_MAX_BYTES,
  type ScanGame,
  type ScanRefusal,
} from "@/lib/cards/scan-rules";
import { notifyPagesReady } from "@/lib/notifications/notify";
import { listPlayerGames } from "@/lib/players/games";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PageScanRow } from "@/lib/supabase/types";

/**
 * Binder pages read in the background, and the notice when they are.
 *
 * The founder (2026-10-09): "maybe it scans it, and then they'll get a
 * notification once it's ready." A page is sent (the whole photo and its
 * nine pockets), stored privately, and read by the careful reader after
 * the response has gone, so the player can close the app. When every page
 * of the queue is done, one notice. The player checks the pages, places
 * them, and the photos go.
 *
 * Each page is read in its own run after the request that sent it. A run
 * that dies part way (a deploy, a timeout) leaves its row "reading" with
 * a start time; looking at the queue, sending another page, or the daily
 * sweep starts it again, three times at most, and then it is marked as
 * failed so the player can retake it rather than wait for ever.
 */

const BUCKET = "scans";
/** A page photo may be larger than a pocket: it is the whole page. */
const PAGE_MAX_BYTES = SCAN_MAX_BYTES * 2;
/** A run past this is presumed dead and may be started again. */
const STALE_MS = 6 * 60 * 1000;
/** A queued page not started within this has lost its run. */
const UNSTARTED_MS = 30 * 1000;
const MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows and photos older than this are swept. */
const KEEP_MS = 7 * DAY_MS;

type Who = { playerId: string; userId: string };

export type PageSendRefusal = ScanRefusal | "not-yours" | "queue-full";

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Pages this account may still send today; null for an admin, who has no limit. */
export async function pagesLeftToday(who: Who): Promise<number | null> {
  if (await isAdmin(who.userId)) return null;
  const { count } = await getSupabaseAdmin()
    .from("page_scans")
    .select("id", { count: "exact", head: true })
    .eq("player_id", who.playerId)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  return Math.max(0, PAGES_PER_DAY - (count ?? 0));
}

const pathFor = (who: Who, batchId: string, page: number, name: string) =>
  `${who.playerId}/${batchId}/${page}/${name}`;

/**
 * One page into the queue: checked, stored, and read after the response.
 * Sending a page number already in the queue replaces it (a retake).
 */
export async function sendPage(
  who: Who,
  input: {
    binderId: string;
    batchId: string;
    pageNumber: number;
    page: Uint8Array;
    pockets: (Uint8Array | null)[];
  },
): Promise<
  | { ok: true; scanId: string; left: number | null }
  | { ok: false; reason: PageSendRefusal }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if ((await scannerAccess(who)) !== "on") return { ok: false, reason: "not-allowed" };
  if ((await binderOwner(input.binderId)) !== who.playerId) {
    return { ok: false, reason: "not-yours" };
  }
  if (
    !Number.isInteger(input.pageNumber) ||
    input.pageNumber < 1 ||
    input.pageNumber > 100 ||
    input.pockets.length !== POCKETS_PER_PAGE
  ) {
    return { ok: false, reason: "no-card" };
  }
  if (input.page.length === 0 || input.page.length > PAGE_MAX_BYTES) {
    return { ok: false, reason: "too-big" };
  }
  if (input.pockets.some((cell) => cell !== null && cell.length > SCAN_MAX_BYTES)) {
    return { ok: false, reason: "too-big" };
  }
  const pageType = photoType(input.page);
  if (!pageType) return { ok: false, reason: "no-card" };

  const admin = getSupabaseAdmin();

  /* The queue is one player's and one binder's, ten pages at most. */
  const { data: queue } = await admin
    .from("page_scans")
    .select("id, player_id, binder_id, page_number, closed_at")
    .eq("batch_id", input.batchId);
  const rows = queue ?? [];
  if (
    rows.some(
      (row) => row.player_id !== who.playerId || row.binder_id !== input.binderId,
    )
  ) {
    return { ok: false, reason: "not-yours" };
  }
  const retake = rows.find((row) => row.page_number === input.pageNumber);
  if (retake?.closed_at) return { ok: false, reason: "not-yours" };
  if (!retake && rows.length >= MAX_SCAN_PAGES)
    return { ok: false, reason: "queue-full" };

  const left = await pagesLeftToday(who);
  if (left !== null && left <= 0 && !retake)
    return { ok: false, reason: "daily-pages" };

  /* The photos, privately. A pocket the client sent nothing for is empty. */
  const photos: { page: string; pockets: (string | null)[] } = {
    page: pathFor(who, input.batchId, input.pageNumber, "page.jpg"),
    pockets: [],
  };
  const uploads: Promise<{ error: unknown }>[] = [
    admin.storage
      .from(BUCKET)
      .upload(photos.page, input.page, { contentType: pageType, upsert: true }),
  ];
  input.pockets.forEach((cell, slot) => {
    const type = cell ? photoType(cell) : null;
    if (!cell || !type) {
      photos.pockets.push(null);
      return;
    }
    const path = pathFor(who, input.batchId, input.pageNumber, `pocket-${slot}.jpg`);
    photos.pockets.push(path);
    uploads.push(
      admin.storage
        .from(BUCKET)
        .upload(path, cell, { contentType: type, upsert: true }),
    );
  });
  const stored = await Promise.all(uploads);
  if (stored.some((result) => result.error)) {
    console.error("Could not store a scanned page", stored.find((r) => r.error)?.error);
    return { ok: false, reason: "unavailable" };
  }

  const { data: row, error } = await admin
    .from("page_scans")
    .upsert(
      {
        player_id: who.playerId,
        binder_id: input.binderId,
        batch_id: input.batchId,
        page_number: input.pageNumber,
        photos,
        status: "queued",
        attempts: 0,
        result: null,
        error: null,
      },
      { onConflict: "batch_id,page_number" },
    )
    .select("id")
    .single();
  if (error || !row) {
    console.error("Could not queue a scanned page", error);
    return { ok: false, reason: "unavailable" };
  }
  /* A retake of a page in a queue that was already announced: the
     queue is not done any more, so it is announced again when it is. */
  if (retake) {
    await admin
      .from("page_scans")
      .update({ notified_at: null })
      .eq("batch_id", input.batchId);
  }

  afterResponse(() => readPage(row.id));
  return {
    ok: true,
    scanId: row.id,
    left: left === null ? null : Math.max(0, left - (retake ? 0 : 1)),
  };
}

/** Takes a page for reading, once: null when another run has it or it is done. */
async function claim(id: string): Promise<PageScanRow | null> {
  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("page_scans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.closed_at) return null;
  const stale =
    row.status === "reading" &&
    row.started_at !== null &&
    Date.now() - Date.parse(row.started_at) > STALE_MS;
  if (row.status !== "queued" && !stale) return null;
  if (row.attempts >= MAX_ATTEMPTS) {
    await finish(row, { status: "failed", error: "timeout", result: null });
    return null;
  }
  /* The attempts the row had is the lock: a second run reading the same
     number loses the update and walks away. */
  const { data: claimed } = await admin
    .from("page_scans")
    .update({
      status: "reading",
      attempts: row.attempts + 1,
      started_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("attempts", row.attempts)
    .select("*")
    .maybeSingle();
  return claimed ?? null;
}

async function photoAt(path: string | null): Promise<AgentPhoto | null> {
  if (!path) return null;
  const { data } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const mediaType = photoType(bytes);
  return mediaType ? { bytes, mediaType } : null;
}

/** Reads one page with the careful reader and keeps what it found. */
export async function readPage(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = await claim(id);
    if (!row) return;

    const [page, pockets, games] = await Promise.all([
      photoAt(row.photos.page),
      Promise.all(row.photos.pockets.map((path) => photoAt(path))),
      listPlayerGames(row.player_id),
    ]);
    if (!page) {
      await finish(row, { status: "failed", error: "unavailable", result: null });
      return;
    }

    const outcome = await readWithAgent({ mode: "page", page, pockets, games });
    if (!outcome.ok) {
      await finish(row, { status: "failed", error: outcome.reason, result: null });
      return;
    }

    const result: PocketOutcome[] = outcome.pockets.map((pocket) => {
      if (pocket.state === "empty") return { slot: pocket.slot, state: "empty" };
      const card = pocket.cardId ? outcome.cards.get(pocket.cardId) : undefined;
      const game: ScanGame | "other" = SCAN_GAMES.includes(card?.game as ScanGame)
        ? (card?.game as ScanGame)
        : "other";
      const read = {
        found: true,
        game,
        name: pocket.readName || card?.exactName || "",
        englishName: pocket.readName || card?.exactName || "",
        number: pocket.readNumber,
        setCode: "",
      };
      if (!card) {
        return {
          slot: pocket.slot,
          state: "unread",
          read: pocket.readName ? read : null,
          note: pocket.note,
        };
      }
      const matches: ScanMatch[] = [{ card, printingId: pocket.printingId }];
      for (const alt of pocket.alternatives) {
        const other = outcome.cards.get(alt);
        if (other) matches.push({ card: other, printingId: null });
      }
      return {
        slot: pocket.slot,
        state: "found",
        read,
        matches,
        sure: pocket.sure,
        note: pocket.note,
      };
    });
    await finish(row, { status: "ready", error: null, result });
  } catch (error) {
    console.error(
      "Could not read a scanned page",
      error instanceof Error ? error.name : error,
    );
  }
}

/** A page done, one way or the other, and the queue's notice if it was the last. */
async function finish(
  row: PageScanRow,
  end: {
    status: "ready" | "failed";
    error: string | null;
    result: PocketOutcome[] | null;
  },
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("page_scans")
    .update({ ...end, finished_at: new Date().toISOString() })
    .eq("id", row.id);
  await announceIfDone(row.batch_id);
}

/** One notice per queue, once every page in it is read or has failed. */
async function announceIfDone(batchId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: rows } = await admin
    .from("page_scans")
    .select("status, player_id, binder_id, closed_at")
    .eq("batch_id", batchId);
  const open = (rows ?? []).filter((row) => !row.closed_at);
  if (open.length === 0) return;
  if (open.some((row) => row.status === "queued" || row.status === "reading")) return;

  /* Whoever stamps the queue first sends the notice; anyone after finds
     it stamped. */
  const { data: stamped } = await admin
    .from("page_scans")
    .update({ notified_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .is("notified_at", null)
    .select("id");
  if (!stamped || stamped.length === 0) return;

  const { player_id: playerId, binder_id: binderId } = open[0];
  const { data: binder } = await admin
    .from("binders")
    .select("name")
    .eq("id", binderId)
    .maybeSingle();
  await notifyPagesReady({
    playerId,
    binderId,
    batchId,
    binderName: binder?.name ?? "your binder",
    pages: open.filter((row) => row.status === "ready").length,
    failed: open.filter((row) => row.status === "failed").length,
  });
}

/** One page of a queue as the check draws it. */
export interface QueuedPage {
  scanId: string;
  page: number;
  status: PageScanRow["status"];
  /** "timeout" or "unavailable" on a failed page. */
  error: string | null;
  pockets: PocketOutcome[] | null;
  /** Short-lived links to the player's own photos. */
  photos: { page: string | null; pockets: (string | null)[] };
}

/** Starts again any page whose run has gone quiet. */
function nudge(rows: PageScanRow[]): void {
  const now = Date.now();
  for (const row of rows) {
    if (row.closed_at) continue;
    const lost =
      (row.status === "queued" && now - Date.parse(row.created_at) > UNSTARTED_MS) ||
      (row.status === "reading" &&
        row.started_at !== null &&
        now - Date.parse(row.started_at) > STALE_MS);
    if (lost) afterResponse(() => readPage(row.id));
  }
}

/** A queue, for its check: every page with its photos and what was found. */
export async function queueView(
  who: Who,
  batchId: string,
): Promise<{ binderId: string; pages: QueuedPage[] } | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("page_scans")
    .select("*")
    .eq("batch_id", batchId)
    .eq("player_id", who.playerId)
    .is("closed_at", null)
    .order("page_number");
  const rows = data ?? [];
  if (rows.length === 0) return null;
  nudge(rows);

  const paths = rows
    .flatMap((row) => [row.photos.page, ...row.photos.pockets])
    .filter((path): path is string => Boolean(path));
  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(paths, 60 * 60);
  const urlOf = new Map(
    (signed ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );

  return {
    binderId: rows[0].binder_id,
    pages: rows.map((row) => ({
      scanId: row.id,
      page: row.page_number,
      status: row.status,
      error: row.error,
      pockets: row.status === "ready" ? (row.result as PocketOutcome[]) : null,
      photos: {
        page: urlOf.get(row.photos.page) ?? null,
        pockets: row.photos.pockets.map((path) =>
          path ? (urlOf.get(path) ?? null) : null,
        ),
      },
    })),
  };
}

/** The queues waiting on a binder, for its banner: "5 pages ready to check". */
export async function queuesFor(
  who: Who,
  binderId: string,
): Promise<{ batchId: string; pages: number; ready: boolean }[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await getSupabaseAdmin()
    .from("page_scans")
    .select("*")
    .eq("binder_id", binderId)
    .eq("player_id", who.playerId)
    .is("closed_at", null)
    .order("created_at");
  const rows = data ?? [];
  nudge(rows);
  const byBatch = new Map<string, PageScanRow[]>();
  for (const row of rows)
    byBatch.set(row.batch_id, [...(byBatch.get(row.batch_id) ?? []), row]);
  return [...byBatch].map(([batchId, pages]) => ({
    batchId,
    pages: pages.length,
    ready: pages.every((page) => page.status === "ready" || page.status === "failed"),
  }));
}

/** A queue placed or thrown away: closed, and its photos removed. */
async function close(who: Who, batchId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: rows } = await admin
    .from("page_scans")
    .update({ closed_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("player_id", who.playerId)
    .is("closed_at", null)
    .select("photos");
  const paths = (rows ?? [])
    .flatMap((row) => [row.photos.page, ...row.photos.pockets])
    .filter((path): path is string => Boolean(path));
  if (paths.length > 0)
    await admin.storage
      .from(BUCKET)
      .remove(paths)
      .catch(() => {});
  return (rows ?? []).length > 0;
}

/**
 * The checked pages into their binder, then the queue closed. The app
 * sends a long queue a few pages at a time (its payload rides in a
 * header), so only the last part, `last`, closes the queue.
 */
export async function placeQueue(
  who: Who,
  displayName: string,
  batchId: string,
  placements: BinderPlacement[],
  last = true,
): Promise<
  Awaited<ReturnType<typeof placeBinderPages>> | { ok: false; reason: "not-found" }
> {
  const view = await queueView(who, batchId);
  if (!view) return { ok: false, reason: "not-found" };
  const result = await placeBinderPages(
    who.playerId,
    displayName,
    view.binderId,
    placements,
  );
  if (result.ok && last) await close(who, batchId);
  return result;
}

/** Throws a queue away: nothing placed, the photos removed. */
export async function discardQueue(who: Who, batchId: string): Promise<boolean> {
  return close(who, batchId);
}

/**
 * The daily sweep. A cron run is too short to read a page, so it does not
 * try: a page lost for over an hour (its run died, nobody looked at the
 * queue since) is marked failed, which announces its queue so the player
 * can retake it. Anything a week old, rows and photos, is removed.
 */
export async function sweepPageScans(): Promise<{ failed: number; removed: number }> {
  if (!isSupabaseConfigured()) return { failed: 0, removed: 0 };
  const admin = getSupabaseAdmin();

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const { data: unfinished } = await admin
    .from("page_scans")
    .select("*")
    .in("status", ["queued", "reading"])
    .is("closed_at", null);
  let failed = 0;
  for (const row of unfinished ?? []) {
    const since = Date.parse(row.started_at ?? row.created_at);
    if (since > hourAgo) continue;
    failed += 1;
    await finish(row, { status: "failed", error: "timeout", result: null });
  }

  const cutoff = new Date(Date.now() - KEEP_MS).toISOString();
  const { data: old } = await admin
    .from("page_scans")
    .delete()
    .lt("created_at", cutoff)
    .select("photos");
  const paths = (old ?? [])
    .flatMap((row) => [row.photos.page, ...row.photos.pockets])
    .filter((path): path is string => Boolean(path));
  for (let at = 0; at < paths.length; at += 100) {
    await admin.storage
      .from(BUCKET)
      .remove(paths.slice(at, at + 100))
      .catch(() => {});
  }
  /* Free single scans only count for a day; two is plenty of history. */
  await admin
    .from("card_scans")
    .delete()
    .lt("created_at", new Date(Date.now() - 2 * DAY_MS).toISOString());
  return { failed, removed: (old ?? []).length };
}
