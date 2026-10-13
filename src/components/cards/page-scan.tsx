"use client";

import { QUALITIES } from "@/components/cards/scan-card";
import { sendPageAction } from "@/lib/cards/page-job-actions";
import type { PageSendRefusal } from "@/lib/cards/page-jobs";
import { QUEUE_FULL, SCAN_MAX_BYTES, SCAN_REFUSALS } from "@/lib/cards/scan-rules";

/**
 * A whole binder page, sent: the scanner's half for pages.
 *
 * The founder (2026-10-09): "the full binder page scans should be fully
 * agentic. It is a further away picture, often with glare inside a
 * binder, so it's best to have it do a full pass. Maybe it scans it, and
 * then they'll get a notification once it's ready." So a page is only
 * sent here; the careful reader works on the server, and the check
 * opens later, from the binder's banner or the notice (`QueueCheck`).
 *
 * The scanner (`Scanner`) decides a photo is a page when the single
 * scan answers "is-page", then sends the photo it kept as one picture,
 * upright, at PAGE_LONG_EDGE. Nothing is cut here: the server finds the
 * page and its nine pockets itself (page-vision.ts) and cuts each card
 * out straight, which a fixed 3x3 cut of a tilted photo never could.
 * Every page of one scanner session carries the same `batchId`, so the
 * server reads them as one queue and sends one notice; a retake from the
 * check comes back with that queue's batchId and the page's own number,
 * and replaces it.
 */

/** The page's photo: this long on its long side, never enlarged. */
export const PAGE_LONG_EDGE = 2800;
/**
 * The most one page photo may weigh: the server's PAGE_MAX_BYTES
 * (page-jobs.ts, which is server-only, so the number is restated here
 * from the same SCAN_MAX_BYTES), under the Server Action's four
 * megabytes with room for the form around it.
 */
export const PAGE_MAX_BYTES = SCAN_MAX_BYTES * 2;

/** What a page that was not sent says. */
export function sendRefusalLine(reason: PageSendRefusal): string {
  if (reason === "queue-full") return QUEUE_FULL;
  if (reason === "not-yours") return SCAN_REFUSALS.unavailable;
  return SCAN_REFUSALS[reason];
}

/** The size a photo is drawn at: `edge` on the long side, never larger. */
export function sizeAt(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * A photo of a page, ready to send: upright, PAGE_LONG_EDGE on its long
 * side (never enlarged), a JPEG under PAGE_MAX_BYTES, stepping the
 * quality down from 0.85 until it fits. An <img> rather than
 * createImageBitmap because every browser now turns an <img> the way
 * the camera was held, and draws it to a canvas that way too. Null when
 * it never fits; throws when the browser cannot open the file.
 */
export async function preparePage(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = sizeAt(image.naturalWidth, image.naturalHeight, PAGE_LONG_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, size.width, size.height);
    for (const quality of QUALITIES) {
      const page = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done, "image/jpeg", quality),
      );
      if (page && page.size <= PAGE_MAX_BYTES) return page;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * One page to the server: the whole photo as "page", and nothing else.
 * The answer is only whether the server has it, and the pages left
 * today; the page is read later.
 */
export async function sendPage(
  binderId: string,
  batchId: string,
  pageNumber: number,
  page: Blob,
): Promise<{ ok: true; left: number | null } | { ok: false; reason: PageSendRefusal }> {
  const form = new FormData();
  form.append("binderId", binderId);
  form.append("batchId", batchId);
  form.append("pageNumber", String(pageNumber));
  form.append("page", page, "page.jpg");
  try {
    const outcome = await sendPageAction(form);
    return outcome.ok
      ? { ok: true, left: outcome.left }
      : { ok: false, reason: outcome.reason };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
