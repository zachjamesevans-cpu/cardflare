import {
  BINDER_PAGES,
  MAX_SCAN_PAGES,
  POCKETS_PER_PAGE,
  pocketAt,
  pocketCrop,
} from "./scan-copy";
import { CARD_ASPECT, type Box } from "./scan-frame";

/**
 * Whole binder pages, as arithmetic: where the page guide sits, where
 * each pocket is in the photo, which page is read next, and what goes to
 * the binder at the end. Kept apart from the screen (src/page-scanner.tsx)
 * and from ./api, so tests/unit/page-scan-app.test.ts can run it in node.
 *
 * The founder (2026-10-09): "scan, let's say 5 pages of their binder into
 * a queue and it auto fills in an actual binder, with the exact same
 * location the cards were in in their binder."
 */

/**
 * The page guide: three card-shaped cells across and three down, so the
 * page is a card's shape too, as large as the preview allows.
 */
export function pageFrame(viewWidth: number, viewHeight: number): Box {
  const width = Math.min(viewWidth * 0.92, viewHeight * 0.92 * CARD_ASPECT);
  const height = width / CARD_ASPECT;
  return {
    x: (viewWidth - width) / 2,
    y: (viewHeight - height) / 2,
    width,
    height,
  };
}

/** The guide's nine cells, slot order (left to right, top to bottom), each 2.5 by 3.5. */
export function pageCells(frame: Box): Box[] {
  const width = frame.width / 3;
  const height = frame.height / 3;
  return Array.from({ length: POCKETS_PER_PAGE }, (_, slot) => ({
    x: frame.x + (slot % 3) * width,
    y: frame.y + Math.floor(slot / 3) * height,
    width,
    height,
  }));
}

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

/** Where a queued page is: waiting its turn, on its way, read, or not. */
export type PageStatus = "waiting" | "reading" | "read" | "failed";

/**
 * The page to read next, as its place in the queue, or -1: the first one
 * waiting, and only while none is being read. Pages go up one at a time,
 * in queue order, while the player keeps shooting.
 */
export function nextToRead(queue: readonly { status: PageStatus }[]): number {
  if (queue.some((page) => page.status === "reading")) return -1;
  return queue.findIndex((page) => page.status === "waiting");
}

/**
 * A read page's numbers for its row: cards are the pockets with
 * something in them, found the ones a card was matched for.
 */
export function pageCounts(pockets: readonly { state: string }[]): {
  found: number;
  cards: number;
} {
  return {
    found: pockets.filter((pocket) => pocket.state === "found").length,
    cards: pockets.filter((pocket) => pocket.state !== "empty").length,
  };
}

/** The last page a queue of this many may start at: its last page is still in the binder. */
export function lastStartPage(queued: number): number {
  return Math.max(1, BINDER_PAGES - Math.max(0, queued - 1));
}

/** Whether another page fits: the queue is not full and the binder has a page for it. */
export function canTakeAnother(start: number, queued: number): boolean {
  return queued < MAX_SCAN_PAGES && start + queued <= BINDER_PAGES;
}

/** A pocket's chosen card, or null for one left empty. */
export type PocketChoice = { cardId: string; printingId: string | null } | null;

/**
 * What goes to the binder: every chosen card at the pocket it sat in,
 * page by page from the starting page. A pocket left empty is not sent.
 */
export function pagePlacements(
  start: number,
  pages: readonly (readonly PocketChoice[])[],
): { pocket: number; cardId: string; printingId: string | null }[] {
  return pages.flatMap((choices, index) =>
    choices.flatMap((choice, slot) =>
      choice
        ? [
            {
              pocket: pocketAt(start + index, slot),
              cardId: choice.cardId,
              printingId: choice.printingId,
            },
          ]
        : [],
    ),
  );
}

/** The pages the button counts: those with at least one card chosen. */
export function pagesWithCards(pages: readonly (readonly PocketChoice[])[]): number {
  return pages.filter((choices) => choices.some((choice) => choice !== null)).length;
}
