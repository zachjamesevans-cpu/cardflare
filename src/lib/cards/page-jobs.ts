import "server-only";

import { createHash } from "node:crypto";

import { afterResponse } from "@/lib/after-response";
import {
  binderOwner,
  placeBinderPages,
  type BinderPlacement,
  type PlaceMode,
} from "@/lib/binder/binder";
import { cornersMakeAPage, slotName, type Quad } from "@/lib/cards/page-geometry";
import {
  emptyRun,
  readCrops,
  recordRun,
  type ReaderPhoto,
  type ReadOutcome,
} from "@/lib/cards/page-reader";
import { readPagePhoto, type DetectMethod } from "@/lib/cards/page-vision";
import {
  photoType,
  scannerAccess,
  withoutKeys,
  type PocketOutcome,
} from "@/lib/cards/scan";
import {
  MAX_SCAN_PAGES,
  PAGES_PER_DAY,
  pocketAt,
  POCKETS_PER_PAGE,
  SCAN_MAX_BYTES,
  type ScanRefusal,
} from "@/lib/cards/scan-rules";
import { scannerSettings } from "@/lib/cards/scan-settings";
import { notifyPagesReady } from "@/lib/notifications/notify";
import { listPlayerGames } from "@/lib/players/games";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PageScanRow } from "@/lib/supabase/types";

/**
 * Binder pages read in the background, and the notice when they are.
 *
 * The founder (2026-10-09): "maybe it scans it, and then they'll get a
 * notification once it's ready." A page is sent (one full-resolution photo
 * of it), stored privately, and read after the response has gone, so the
 * player can close the app: the page and its nine pockets are found in the
 * photo and straightened (page-vision.ts), each pocket's card is cut out
 * and kept, and the reader (page-reader.ts) names them. When every page of
 * the queue is done, one notice. The player checks the pages, places them,
 * and the photos go.
 *
 * A photo the detector is unsure of is not guessed at: the page comes
 * back as "needs-alignment", the player drags its four corners into place
 * (realignPage), and it is read again from those. One pocket can be read
 * again on its own, more carefully (rescanPocket).
 *
 * Each page is read in its own run after the request that sent it. A run
 * that dies part way (a deploy, a timeout) leaves its row "reading" with
 * a start time; looking at the queue, sending another page, or the daily
 * sweep starts it again, three times at most, and then it is marked as
 * failed so the player can retake it rather than wait for ever.
 */

const BUCKET = "scans";
/** A page photo may be larger than a pocket: it is the whole page, at full resolution. */
export const PAGE_MAX_BYTES = SCAN_MAX_BYTES * 2;
/** A run past this is presumed dead and may be started again. */
const STALE_MS = 6 * 60 * 1000;
/** A queued page not started within this has lost its run. */
const UNSTARTED_MS = 30 * 1000;
const MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows and photos older than this are swept. */
const KEEP_MS = 7 * DAY_MS;
/** Saved reads and placement receipts: long enough to matter, short enough to stay small. */
const KEEP_READS_MS = 30 * DAY_MS;

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
    /**
     * Pockets cut on the phone, from builds before the server found them
     * itself. Checked, and not kept: the server's own cuts are straighter.
     */
    pockets?: (Uint8Array | null)[];
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
    (input.pockets !== undefined && input.pockets.length !== POCKETS_PER_PAGE)
  ) {
    return { ok: false, reason: "no-card" };
  }
  if (input.page.length === 0 || input.page.length > PAGE_MAX_BYTES) {
    return { ok: false, reason: "too-big" };
  }
  if (input.pockets?.some((cell) => cell !== null && cell.length > SCAN_MAX_BYTES)) {
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

  /* The photo, privately. The pockets are cut from it when it is read. */
  const photos: { page: string; pockets: (string | null)[]; framed?: boolean } = {
    page: pathFor(who, input.batchId, input.pageNumber, "page.jpg"),
    pockets: Array.from({ length: POCKETS_PER_PAGE }, () => null),
    /* Builds that cut pockets on the phone cut the page at their guide too. */
    ...(input.pockets ? { framed: true } : {}),
  };
  const stored = await admin.storage
    .from(BUCKET)
    .upload(photos.page, input.page, { contentType: pageType, upsert: true });
  if (stored.error) {
    console.error("Could not store a scanned page", stored.error);
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
        vision: null,
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

async function photoAt(path: string | null): Promise<ReaderPhoto | null> {
  if (!path) return null;
  const { data } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const mediaType = photoType(bytes);
  return mediaType ? { bytes, mediaType } : null;
}

/** Where the page and its pockets were found, as kept on the row and sent to the check. */
export interface VisionView {
  method: DetectMethod;
  /** 0 to 1: how surely the grid was found. */
  confidence: number;
  needsAlignment: boolean;
  /** The page in the photo, as shares of its width and height. */
  page: Quad;
  /** The photo is soft overall: a steadier retake would read better. */
  blurry: boolean;
  width: number;
  height: number;
  pockets: {
    slot: number;
    /** A1 to C3. */
    position: string;
    quad: Quad;
    cardSeen: boolean;
    looksEmpty: boolean;
    glare: boolean;
  }[];
  /** The player's own corners, once they have lined the page up. */
  corners: Quad | null;
  /** The pockets came from the app's guide, not the cards: every one is checked. */
  guided?: boolean;
}

const isQuad = (value: unknown): value is Quad =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(
    (p) =>
      p &&
      typeof p === "object" &&
      Number.isFinite((p as { x: unknown }).x) &&
      Number.isFinite((p as { y: unknown }).y),
  );

/** The row's vision, if it has one in the shape we write. */
function visionOf(value: unknown): VisionView | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<VisionView>;
  if (!Array.isArray(v.pockets) || !isQuad(v.page)) return null;
  return { ...(v as VisionView), corners: isQuad(v.corners) ? v.corners : null };
}

/**
 * One look at a page photo: the pockets found and cut (from `corners` when
 * given), each cut kept for the check, where they were found kept on the
 * row, and, unless the page needs lining up, the cards read and the run
 * logged.
 */
async function lookAt(
  row: PageScanRow,
  bytes: Uint8Array,
  corners: Quad | null,
  games: readonly string[],
  settings: Awaited<ReturnType<typeof scannerSettings>>,
): Promise<{ vision: VisionView; outcome: ReadOutcome }> {
  const admin = getSupabaseAdmin();
  const vision = await readPagePhoto(bytes, corners ?? undefined, {
    framed: Boolean(row.photos.framed),
  });
  const view: VisionView = {
    method: vision.method,
    confidence: vision.confidence,
    needsAlignment: vision.needsAlignment,
    page: vision.page,
    blurry: vision.blurry,
    width: vision.width,
    height: vision.height,
    pockets: vision.pockets.map((pocket) => ({
      slot: pocket.slot,
      position: slotName(pocket.slot),
      quad: pocket.quad,
      cardSeen: pocket.cardSeen,
      looksEmpty: pocket.looksEmpty,
      glare: pocket.glare,
    })),
    corners,
    guided: vision.guided,
  };

  /* Each pocket's straightened card, kept for the check and for a
     pocket read again later. */
  const base = row.photos.page.replace(/page\.jpg$/, "");
  const pocketPaths = await Promise.all(
    vision.pockets.map(async (pocket) => {
      const path = `${base}pocket-${pocket.slot}.jpg`;
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, pocket.jpeg, { contentType: "image/jpeg", upsert: true });
      return error ? null : path;
    }),
  );
  await admin
    .from("page_scans")
    .update({ vision: view, photos: { ...row.photos, pockets: pocketPaths } })
    .eq("id", row.id);

  if (vision.needsAlignment) {
    return {
      vision: view,
      outcome: { ok: false, reason: "unavailable", run: emptyRun(settings.mode) },
    };
  }
  const read = await readCrops(
    vision.pockets.map((pocket) => ({
      slot: pocket.slot,
      bytes: pocket.jpeg,
      mediaType: "image/jpeg" as const,
      looksEmpty: pocket.looksEmpty,
      cardSeen: pocket.cardSeen,
      glare: pocket.glare,
    })),
    { games, settings },
  );
  /* Pockets placed by the guide: the card may be known, where it sat is
     the guide's guess, so none goes in unchecked. */
  const outcome: ReadOutcome =
    read.ok && vision.guided
      ? { ...read, pockets: read.pockets.map(checkedByHand) }
      : read;
  await recordRun(outcome.run, {
    playerId: row.player_id,
    pageScanId: row.id,
    kind: "page",
    detectMethod: vision.method,
  });
  return { vision: view, outcome };
}

/** A pocket that must be checked: a match held back as a question. */
function checkedByHand(pocket: PocketOutcome): PocketOutcome {
  if (pocket.state !== "found" || pocket.status !== "matched") return pocket;
  return {
    ...pocket,
    status: "ambiguous",
    sure: false,
    reasons: [...(pocket.reasons ?? []), "pocket found from the guide, not the cards"],
  };
}

/** Reads one page: finds the pockets, cuts and keeps them, names the cards. */
export async function readPage(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const row = await claim(id);
    if (!row) return;

    const [page, games, settings] = await Promise.all([
      photoAt(row.photos.page),
      listPlayerGames(row.player_id),
      scannerSettings(),
    ]);
    if (!page) {
      await finish(row, { status: "failed", error: "unavailable", result: null });
      return;
    }

    let corners = visionOf(row.vision)?.corners ?? null;
    let looked = await lookAt(row, page.bytes, corners, games, settings);
    if (looked.vision.needsAlignment) {
      await finish(row, { status: "failed", error: "needs-alignment", result: null });
      return;
    }
    /*
     * Most cards came back upside down: the page was photographed turned
     * round, which card outlines alone cannot tell, and read as it was it
     * would put A1's card in C3. The same page, from its far corner, is
     * cut and read again (a turned photo only; the player's own corners
     * already say which way up it is).
     */
    if (looked.outcome.run.upsideDown && !corners) {
      const p = looked.vision.page;
      corners = [p[2], p[3], p[0], p[1]];
      looked = await lookAt(row, page.bytes, corners, games, settings);
    }
    const { outcome } = looked;
    if (!outcome.ok) {
      await finish(row, {
        status: "failed",
        error: outcome.reason === "timeout" ? "timeout" : "unavailable",
        result: null,
      });
      return;
    }
    await finish(row, { status: "ready", error: null, result: outcome.pockets });
  } catch (error) {
    console.error(
      "Could not read a scanned page",
      error instanceof Error ? error.name : error,
      error instanceof Error ? withoutKeys(error.message).slice(0, 200) : "",
    );
  }
}

/**
 * The player's own four corners of a page the detector was unsure of,
 * and the page read again from them. Corners are shares of the photo's
 * width and height, A1's corner first, then clockwise.
 */
export async function realignPage(
  who: Who,
  scanId: string,
  corners: Quad,
): Promise<{ ok: true } | { ok: false; reason: "not-found" | "busy" | "bad-corners" }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "not-found" };
  if (!isQuad(corners) || !cornersMakeAPage(corners)) {
    return { ok: false, reason: "bad-corners" };
  }
  const ordered: Quad = [corners[0], corners[1], corners[2], corners[3]];

  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("page_scans")
    .select("*")
    .eq("id", scanId)
    .eq("player_id", who.playerId)
    .is("closed_at", null)
    .maybeSingle();
  if (!row) return { ok: false, reason: "not-found" };
  if (row.status === "queued" || row.status === "reading")
    return { ok: false, reason: "busy" };

  const before = visionOf(row.vision);
  const { error } = await admin
    .from("page_scans")
    .update({
      status: "queued",
      attempts: 0,
      result: null,
      error: null,
      vision: before ? { ...before, corners: ordered } : { corners: ordered },
    })
    .eq("id", row.id)
    .eq("status", row.status);
  if (error) return { ok: false, reason: "busy" };
  afterResponse(() => readPage(row.id));
  return { ok: true };
}

/* One pocket read again at a time per page, so two answers cannot overwrite each other. */
const rescanning = new Set<string>();

/**
 * One pocket read again on its own: the reader asked to take more care,
 * the cache not used. The page's other pockets are left as they were.
 */
export async function rescanPocket(
  who: Who,
  scanId: string,
  slot: number,
): Promise<
  | { ok: true; pocket: PocketOutcome }
  | { ok: false; reason: "not-found" | "busy" | "limit" | "unavailable" | "timeout" }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (!Number.isInteger(slot) || slot < 0 || slot >= POCKETS_PER_PAGE) {
    return { ok: false, reason: "not-found" };
  }
  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("page_scans")
    .select("*")
    .eq("id", scanId)
    .eq("player_id", who.playerId)
    .is("closed_at", null)
    .maybeSingle();
  if (!row || row.status !== "ready" || !Array.isArray(row.result)) {
    return { ok: false, reason: "not-found" };
  }
  const path = row.photos.pockets[slot];
  if (!path) return { ok: false, reason: "not-found" };
  if (rescanning.has(scanId)) return { ok: false, reason: "busy" };
  /* Thirty in ten minutes is a player going round a page twice; past it,
     something is tapping for them. */
  if (!checkRateLimit(`pocket-rescan:${who.playerId}`, 30, 10 * 60 * 1000).allowed) {
    return { ok: false, reason: "limit" };
  }

  rescanning.add(scanId);
  try {
    const [photo, games] = await Promise.all([
      photoAt(path),
      listPlayerGames(who.playerId),
    ]);
    if (!photo) return { ok: false, reason: "not-found" };
    const seen = visionOf(row.vision)?.pockets.find((p) => p.slot === slot);
    const outcome = await readCrops(
      [{ slot, ...photo, cardSeen: true, glare: seen?.glare ?? false }],
      { games, careful: true },
    );
    await recordRun(outcome.run, {
      playerId: who.playerId,
      pageScanId: row.id,
      kind: "pocket",
    });
    if (!outcome.ok) {
      return {
        ok: false,
        reason: outcome.reason === "timeout" ? "timeout" : "unavailable",
      };
    }
    const pocket = outcome.pockets[0];
    const result = (row.result as PocketOutcome[]).map((each) =>
      each.slot === slot ? pocket : each,
    );
    await admin.from("page_scans").update({ result }).eq("id", row.id);
    return { ok: true, pocket };
  } finally {
    rescanning.delete(scanId);
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
  /** "timeout", "unavailable" or "needs-alignment" on a failed page. */
  error: string | null;
  pockets: PocketOutcome[] | null;
  /** Where the page and its pockets were found, once it has been looked at. */
  vision: VisionView | null;
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
      vision: visionOf(row.vision),
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
  mode: PlaceMode = "skip",
): Promise<
  Awaited<ReturnType<typeof placeBinderPages>> | { ok: false; reason: "not-found" }
> {
  const view = await queueView(who, batchId);
  if (!view) return { ok: false, reason: "not-found" };
  /* The same cards placed twice (a retry after a lost answer) carry the
     same key, so the second does nothing; different cards, a new key. */
  const key = `${batchId}:${createHash("sha256")
    .update(
      JSON.stringify(
        [...placements]
          .sort((a, b) => a.pocket - b.pocket)
          .map((p) => [p.pocket, p.cardId, p.printingId]),
      ),
    )
    .digest("hex")
    .slice(0, 32)}:${mode}`;
  const result = await placeBinderPages(
    who.playerId,
    displayName,
    view.binderId,
    placements,
    { mode, key },
  );
  if (result.ok) await recordCorrections(view, placements);
  if (result.ok && last) await close(who, batchId);
  return result;
}

/**
 * How many pockets the player changed before placing, per page, for the
 * accuracy numbers: a card placed that is not the reader's first pick (or
 * its printing), a card placed where the reader saw none, and a card the
 * reader named that was left out. Only the pages this placement touches.
 */
async function recordCorrections(
  view: { pages: QueuedPage[] },
  placements: BinderPlacement[],
): Promise<void> {
  const byPocket = new Map(placements.map((p) => [p.pocket, p]));
  const admin = getSupabaseAdmin();
  for (const page of view.pages) {
    if (!page.pockets) continue;
    const pockets = Array.from({ length: POCKETS_PER_PAGE }, (_, slot) =>
      pocketAt(page.page, slot),
    );
    if (!pockets.some((pocket) => byPocket.has(pocket))) continue;
    let corrections = 0;
    for (const outcome of page.pockets) {
      const placed = byPocket.get(pocketAt(page.page, outcome.slot));
      const top = outcome.state === "found" ? outcome.matches[0] : null;
      if (!top) {
        if (placed) corrections += 1;
      } else if (!placed) {
        corrections += 1;
      } else if (
        placed.cardId !== top.card.id ||
        (top.printingId !== null && (placed.printingId ?? null) !== top.printingId)
      ) {
        corrections += 1;
      }
    }
    await admin
      .from("scan_runs")
      .update({ corrections })
      .eq("page_scan_id", page.scanId)
      .eq("kind", "page");
  }
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
  /* Saved reads and placement receipts: a month. */
  const readsCutoff = new Date(Date.now() - KEEP_READS_MS).toISOString();
  await admin.from("scan_recognitions").delete().lt("created_at", readsCutoff);
  await admin.from("binder_scan_placements").delete().lt("created_at", readsCutoff);
  /* Free single scans only count for a day; two is plenty of history. */
  await admin
    .from("card_scans")
    .delete()
    .lt("created_at", new Date(Date.now() - 2 * DAY_MS).toISOString());
  return { failed, removed: (old ?? []).length };
}
