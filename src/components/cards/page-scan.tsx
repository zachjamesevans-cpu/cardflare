"use client";

import { QUALITIES, scanSize } from "@/components/cards/scan-card";
import { sendPageAction } from "@/lib/cards/page-job-actions";
import type { PageSendRefusal } from "@/lib/cards/page-jobs";
import {
  POCKETS_PER_PAGE,
  QUEUE_FULL,
  SCAN_MAX_BYTES,
  SCAN_REFUSALS,
  pocketCrop,
} from "@/lib/cards/scan-rules";

/**
 * A whole binder page, cut and sent: the scanner's half for pages.
 *
 * The founder (2026-10-09): "the full binder page scans should be fully
 * agentic. It is a further away picture, often with glare inside a
 * binder, so it's best to have it do a full pass. Maybe it scans it, and
 * then they'll get a notification once it's ready." So a page is only
 * cut and sent here; the careful reader works on the server, and the
 * check opens later, from the binder's banner or the notice
 * (`QueueCheck`).
 *
 * The scanner (`Scanner`) decides a photo is a page when the single
 * scan answers "is-page", then cuts the photo it kept at full size: the
 * whole page at PAGE_LONG_EDGE for the reader to see the page as a
 * page, and its nine pockets with `pocketCrop`. Every page of one
 * scanner session carries the same `batchId`, so the server reads them
 * as one queue and sends one notice; a retake from the check comes back
 * with that queue's batchId and the page's own number, and replaces it.
 */

/** The whole page's photo: this long on its long side, for the careful reader. */
export const PAGE_LONG_EDGE = 1568;
/**
 * All one page sends, the photo and its nine pockets, kept under the
 * Server Action's four megabytes with room for the form around it.
 */
const PAGE_FORM_BYTES = 3_500_000;

/** What a page that was not sent says. */
export function sendRefusalLine(reason: PageSendRefusal): string {
  if (reason === "queue-full") return QUEUE_FULL;
  if (reason === "not-yours") return SCAN_REFUSALS.unavailable;
  return SCAN_REFUSALS[reason];
}

/** The size a photo is drawn at: `edge` on the long side, never larger. */
function sizeAt(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((done) => canvas.toBlob(done, "image/jpeg", quality));
}

/**
 * A photo of a page, ready to send: its nine pockets, each upright and
 * shrunk to SCAN_LONG_EDGE on its long side (never enlarged), the whole
 * page at PAGE_LONG_EDGE, every one a JPEG under SCAN_MAX_BYTES and all
 * of them together under PAGE_FORM_BYTES, stepping the quality down
 * until they fit. Null when they never fit; throws when the browser
 * cannot open the file.
 */
export async function cutPage(
  file: Blob,
): Promise<{ page: Blob; cells: Blob[] } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    const draw = (
      crop: { x: number; y: number; width: number; height: number },
      size: { width: number; height: number },
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        size.width,
        size.height,
      );
      return canvas;
    };

    const pockets: HTMLCanvasElement[] = [];
    for (let slot = 0; slot < POCKETS_PER_PAGE; slot += 1) {
      const crop = pocketCrop(slot, width, height);
      const size = scanSize(crop.width, crop.height);
      const canvas = draw(crop, size);
      if (!canvas) return null;
      pockets.push(canvas);
    }
    const whole = draw(
      { x: 0, y: 0, width, height },
      sizeAt(width, height, PAGE_LONG_EDGE),
    );
    if (!whole) return null;

    let sent: { page: Blob; cells: Blob[] } | null = null;
    for (const quality of QUALITIES) {
      const cells = await Promise.all(pockets.map((canvas) => jpeg(canvas, quality)));
      const page = await jpeg(whole, quality);
      if (!page || cells.some((cell) => !cell)) continue;
      const fitted = cells as Blob[];
      const total = fitted.reduce((sum, cell) => sum + cell.size, page.size);
      if (
        page.size <= SCAN_MAX_BYTES &&
        fitted.every((cell) => cell.size <= SCAN_MAX_BYTES) &&
        total <= PAGE_FORM_BYTES
      ) {
        sent = { page, cells: fitted };
        break;
      }
    }
    return sent;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * One page to the server: the whole photo as "page", the nine pockets
 * "pocket0" to "pocket8". The answer is only whether the server has it,
 * and the pages left today; the page is read later.
 */
export async function sendPage(
  binderId: string,
  batchId: string,
  pageNumber: number,
  photos: { page: Blob; cells: Blob[] },
): Promise<{ ok: true; left: number | null } | { ok: false; reason: PageSendRefusal }> {
  const form = new FormData();
  form.append("binderId", binderId);
  form.append("batchId", batchId);
  form.append("pageNumber", String(pageNumber));
  form.append("page", photos.page, "page.jpg");
  photos.cells.forEach((cell, slot) =>
    form.append(`pocket${slot}`, cell, `pocket${slot}.jpg`),
  );
  try {
    const outcome = await sendPageAction(form);
    return outcome.ok
      ? { ok: true, left: outcome.left }
      : { ok: false, reason: outcome.reason };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
