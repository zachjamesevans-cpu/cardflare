import {
  BINDER_PAGES,
  MAX_SCAN_PAGES,
  POCKETS_PER_PAGE,
  QUEUE_FULL,
  SCAN_REFUSALS,
  pocketAt,
  pocketCrop,
  type ScanRefusal,
} from "./scan-copy";

/**
 * Whole binder pages, as arithmetic: where each pocket is in the photo,
 * which page is sent next, which pockets the check walks through, and
 * what goes to the binder at the end. Kept apart from the screens
 * (src/card-scanner.tsx, src/page-scanner.tsx) and from ./api, so
 * tests/unit/page-scan-app.test.ts can run it in node.
 *
 * The founder (2026-10-09): "scan, let's say 5 pages of their binder into
 * a queue and it auto fills in an actual binder, with the exact same
 * location the cards were in in their binder."
 */

/**
 * One pocket of the page's photo (already cut to the guide), for the
 * image manipulator: the website's pocketCrop on the photo's own pixels.
 */
export function pocketBox(
  slot: number,
  page: { width: number; height: number },
): { originX: number; originY: number; width: number; height: number } {
  const cut = pocketCrop(slot, page.width, page.height);
  return {
    originX: cut.x,
    originY: cut.y,
    width: Math.max(1, cut.width),
    height: Math.max(1, cut.height),
  };
}

/**
 * The same pocket in the whole photo's pixels: the page's region (the
 * guide, cut through the preview's fit) first, then the pocket inside
 * it, so each pocket is one crop of the original photo and the page is
 * never encoded twice.
 */
export function pocketInPhoto(
  slot: number,
  region: { originX: number; originY: number; width: number; height: number },
): { originX: number; originY: number; width: number; height: number } {
  const box = pocketBox(slot, region);
  return {
    ...box,
    originX: region.originX + box.originX,
    originY: region.originY + box.originY,
  };
}

/** Where a page just shot is: waiting its turn, on its way, sent, or refused. */
export type PageStatus = "waiting" | "sending" | "sent" | "refused";

/**
 * The page to send next, as its place in the queue, or -1: the first one
 * waiting, and only while none is on its way. Pages go up one at a time,
 * in queue order, while the player keeps shooting; the server reads them
 * after, so nothing here waits for a read.
 */
export function nextToSend(queue: readonly { status: PageStatus }[]): number {
  if (queue.some((page) => page.status === "sending")) return -1;
  return queue.findIndex((page) => page.status === "waiting");
}

/** Whether a page is still to leave the phone: Done waits for these, and only these. */
export function stillSending(queue: readonly { status: PageStatus }[]): boolean {
  return queue.some((page) => page.status === "waiting" || page.status === "sending");
}

/** A send the server turned down, in words: the scanner's own, else the queue's. */
export type PageSendRefusal = ScanRefusal | "not-yours" | "queue-full";

export function sendRefusalLine(reason: PageSendRefusal): string {
  if (reason === "queue-full") return QUEUE_FULL;
  if (reason === "not-yours") return SCAN_REFUSALS.unavailable;
  return SCAN_REFUSALS[reason];
}

/** Whether a refusal the server sent is one of ours, so a stray code falls back to "unavailable". */
export function isSendRefusal(code: string): code is PageSendRefusal {
  return (
    code === "not-yours" ||
    code === "queue-full" ||
    Object.keys(SCAN_REFUSALS).includes(code)
  );
}

/*
 * The whole page goes up beside its pockets, for the careful reader to
 * see the page as the player shot it: larger than a pocket, so a
 * further-away photo still has its text, and under SCAN_MAX_BYTES.
 */
export const PAGE_LONG_EDGE = 1568;

/** The whole page's resize: its long side at PAGE_LONG_EDGE, never enlarged. */
export function pageResize(crop: {
  width: number;
  height: number;
}): { width: number } | { height: number } {
  return crop.height >= crop.width
    ? { height: Math.min(crop.height, PAGE_LONG_EDGE) }
    : { width: Math.min(crop.width, PAGE_LONG_EDGE) };
}

/**
 * A queue's id, made once when its first page is shot: every page of
 * the queue is sent under it, and a retake under it replaces its page.
 * The platform's own uuid where there is one, else a version 4 by hand.
 */
export function newBatchId(): string {
  const made = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof made?.randomUUID === "function") return made.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16));
  hex[12] = 4;
  hex[16] = (hex[16] & 0x3) | 0x8;
  const text = hex.map((digit) => digit.toString(16)).join("");
  return [
    text.slice(0, 8),
    text.slice(8, 12),
    text.slice(12, 16),
    text.slice(16, 20),
    text.slice(20),
  ].join("-");
}

/** A page of a queue on the server: settled once it is read or has failed. */
export function queueSettled(pages: readonly { status: string }[]): boolean {
  return pages.every((page) => page.status === "ready" || page.status === "failed");
}

/**
 * Whether another page fits: the queue is not full and the binder has
 * the page it would fill, `next` being that page's number.
 */
export function canTakeAnother(next: number, queued: number): boolean {
  return queued < MAX_SCAN_PAGES && next <= BINDER_PAGES;
}

/** A pocket's chosen card, or null for one left empty. */
export type PocketChoice = { cardId: string; printingId: string | null } | null;

/**
 * What goes to the binder: every chosen card at the pocket it sat in,
 * on the page's own number (a queue on the server may skip a page the
 * player removed, so it is never counted from the first). A pocket left
 * empty is not sent.
 */
export function pagePlacements(
  pages: readonly { page: number; choices: readonly PocketChoice[] }[],
): { pocket: number; cardId: string; printingId: string | null }[] {
  return pages.flatMap(({ page, choices }) =>
    choices.flatMap((choice, slot) =>
      choice
        ? [
            {
              pocket: pocketAt(page, slot),
              cardId: choice.cardId,
              printingId: choice.printingId,
            },
          ]
        : [],
    ),
  );
}

/** Placements per request: three pages, so a long queue's payload header stays small. */
export const PLACE_PER_PART = 3 * POCKETS_PER_PAGE;

/**
 * A queue's placements in parts of at most PLACE_PER_PART, in order,
 * `last` on the final part only: the server closes the queue on that
 * one. Nothing to place is no parts: the button that places is not
 * pressable with no card chosen.
 */
export function placementParts<T>(
  placements: readonly T[],
  per = PLACE_PER_PART,
): { placements: T[]; last: boolean }[] {
  const parts: { placements: T[]; last: boolean }[] = [];
  for (let start = 0; start < placements.length; start += per) {
    parts.push({
      placements: placements.slice(start, start + per),
      last: start + per >= placements.length,
    });
  }
  return parts;
}

/** The pages the button counts: those with at least one card chosen. */
export function pagesWithCards(pages: readonly (readonly PocketChoice[])[]): number {
  return pages.filter((choices) => choices.some((choice) => choice !== null)).length;
}

/**
 * A pocket "Check 2 unsure" walks through: a guess the reader was not
 * sure of, or one it could not read, until the player has looked at it
 * in the viewer (confirmed it, chose another, or left it empty).
 */
export function needsLook(
  pocket: { state: string; sure?: boolean },
  looked: boolean,
): boolean {
  if (looked) return false;
  return (
    pocket.state === "unread" || (pocket.state === "found" && pocket.sure === false)
  );
}
