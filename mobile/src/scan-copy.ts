/**
 * The card scanner, in words: the app's half of
 * src/lib/cards/scan-rules.ts, word for word. No imports, so a unit
 * test can read it beside the website's and fail the day they drift
 * (tests/unit/card-scan-app.test.ts).
 *
 * The founder (2026-10-09): card scanning as a Pro feature, "to cover
 * the cost", tried by admins first. A photo of one card is read on the
 * server, our catalogue finds it, and the player confirms.
 */

/** The longest side a photo is sent at. Text on a card stays legible. */
export const SCAN_LONG_EDGE = 1024;
/** The ceiling on an uploaded photo, after the client has shrunk it. */
export const SCAN_MAX_BYTES = 1_500_000;

export const SCAN_CARD = "Scan a card";
export const SCAN_HINT = "One card, face up, filling the frame, in good light.";
export const TAKE_PHOTO = "Take photo";
export const READING_CARD = "Reading the card...";
export const IS_THIS_IT = "Is this it?";
export const OTHER_MATCHES = "Or one of these";
export const ADD_TO_BINDER = "Add to binder";
export const SCAN_NEXT = "Scan the next card";
export const SCAN_AGAIN = "Try again";
export const SCAN_WITH_PRO = "Scan cards with Pro";

/** "Read: Charizard ex · 199/165", so a wrong read is plain to see. */
export function scanReadLine(read: { name: string; number: string }): string {
  const parts = [read.name.trim(), read.number.trim()].filter(Boolean);
  return parts.length > 0 ? `Read: ${parts.join(" · ")}` : "";
}

/** What a refused scan says. */
export const SCAN_REFUSALS = {
  "no-card": "No card in that photo. Get closer, in better light, and try again.",
  "not-found":
    "We read the card but could not find it in our list. Search for it instead.",
  "not-carried": "That game isn't on cardflare yet.",
  "too-big": "That photo is too big. Try again.",
  "not-allowed": "Scanning is a Pro feature.",
  limit: "That is a lot of scans at once. Try again in a few minutes.",
  "daily-pages": "That's 20 pages for today. You can scan more tomorrow.",
  unavailable: "The scanner isn't working right now. Try again in a moment.",
} as const;

export type ScanRefusal = keyof typeof SCAN_REFUSALS;

/* ---- Whole pages ----------------------------------------------------- */

/*
 * The founder (2026-10-09): "scan, let's say 5 pages of their binder into
 * a queue and it auto fills in an actual binder, with the exact same
 * location the cards were in in their binder." A cardflare binder page is
 * 3x3, like a real nine-pocket page, so a photo of page 4 fills page 4,
 * pocket for pocket. Each pocket is cut out of the photo and read the way
 * one card is; the player checks the grid before anything is placed.
 */

/** Pockets on a page, as the binder counts them. */
export const POCKETS_PER_PAGE = 9;
/** The pages a binder has: 100 pages of nine. */
export const BINDER_PAGES = 100;
/** Pages one queue may hold. */
export const MAX_SCAN_PAGES = 10;
/** How far past its own square a pocket's cut reaches, so a card a little off the grid stays whole. */
export const POCKET_MARGIN = 0.06;

/** Page (1-based, as people count) and slot (0 to 8) to the binder's pocket. */
export function pocketAt(page: number, slot: number): number {
  return (page - 1) * POCKETS_PER_PAGE + slot;
}

/**
 * The first page with nothing in it at all, 1-based: where a scan of a
 * binder starts unless the player says otherwise. Past the last card, so
 * a page with a gap in it is never mistaken for an empty one.
 */
export function firstEmptyPage(pockets: readonly number[]): number {
  if (pockets.length === 0) return 1;
  const last = Math.max(...pockets);
  return Math.min(BINDER_PAGES, Math.floor(last / POCKETS_PER_PAGE) + 2);
}

/**
 * Where one pocket sits in a photo of a whole page, in the photo's own
 * pixels: the page cut into a 3x3 grid, each square grown by
 * POCKET_MARGIN on every side and kept inside the photo.
 */
export function pocketCrop(
  slot: number,
  width: number,
  height: number,
  margin = POCKET_MARGIN,
): { x: number; y: number; width: number; height: number } {
  const cellW = width / 3;
  const cellH = height / 3;
  const col = slot % 3;
  const row = Math.floor(slot / 3);
  const x0 = Math.max(0, (col - margin) * cellW);
  const y0 = Math.max(0, (row - margin) * cellH);
  const x1 = Math.min(width, (col + 1 + margin) * cellW);
  const y1 = Math.min(height, (row + 1 + margin) * cellH);
  return {
    x: Math.round(x0),
    y: Math.round(y0),
    width: Math.round(x1 - x0),
    height: Math.round(y1 - y0),
  };
}

export const SCAN_ONE = "One card";
export const SCAN_PAGES = "Whole pages";
export const PAGES_HINT =
  "One binder page per photo, straight on, filling the frame, in good light.";
export const READING_PAGE = "Reading...";
export const CHECK_PAGES = "Check the pages";
export const POCKET_EMPTY = "Empty";
export const POCKET_UNREAD = "Couldn't read this one. Tap to find it.";
export const FIND_THE_CARD = "Find the card";
export const LEAVE_EMPTY = "Leave empty";
export const RETAKE = "Retake";
export const REMOVE_PAGE = "Remove";
export const PAGE_FAILED = "That page didn't read. Retake it.";
/* Neutral on what happens: a card already in the binder counts up
   there instead, and the placed line says which. */
export const POCKET_TAKEN = "That pocket already has a card in this binder.";
export const BACK_TO_PAGES = "Back to pages";
export const START_EARLIER = "Start a page earlier";
export const START_LATER = "Start a page later";

/** "Starting at page 4". */
export function startingAtLine(page: number): string {
  return `Starting at page ${page}`;
}

/** The shutter while shooting: "Take page 4". */
export function takePageLabel(page: number): string {
  return `Take page ${page}`;
}

/** A queued page: "Page 4 · 8 of 9 read". Empty pockets are not counted. */
export function pageStatusLine(page: number, read: number, cards: number): string {
  return cards === 0
    ? `Page ${page} · no cards`
    : `Page ${page} · ${read} of ${cards} read`;
}

/** "Add 5 pages to binder". */
export function addPagesLabel(pages: number): string {
  return pages === 1 ? "Add 1 page to binder" : `Add ${pages} pages to binder`;
}

/**
 * What placing pages did, in one sentence: "Placed 41 cards. 2 were already
 * in this binder, so their counts went up. 1 pocket was already full, so
 * that card was left out."
 */
export function pagesPlacedLine(result: {
  added: number;
  merged: number;
  occupied: number;
  skipped: number;
}): string {
  const parts: string[] = [];
  if (result.added > 0) {
    parts.push(`Placed ${result.added} ${result.added === 1 ? "card" : "cards"}.`);
  }
  if (result.merged > 0) {
    parts.push(
      result.merged === 1
        ? "1 was already in this binder, so its count went up."
        : `${result.merged} were already in this binder, so their counts went up.`,
    );
  }
  if (result.occupied > 0) {
    parts.push(
      result.occupied === 1
        ? "1 pocket was already full, so that card was left out."
        : `${result.occupied} pockets were already full, so those cards were left out.`,
    );
  }
  if (result.skipped > 0) {
    parts.push(
      `The binder is full, so ${result.skipped} ${result.skipped === 1 ? "card was" : "cards were"} left out.`,
    );
  }
  return parts.join(" ") || "Nothing to place.";
}

/* ---- Pages read in the background ------------------------------------ */

/*
 * The founder: "maybe it scans it, and then they'll get a notification
 * once it's ready." A page is sent and read on the server by the careful
 * reader while the player does something else; one notice says when the
 * queue is ready to check. Pro only, twenty pages a day.
 */

/** Pages one account may send to be read in a day. Admins have no limit. */
export const PAGES_PER_DAY = 20;

export const SENDING_PAGE = "Sending...";
export const PAGE_SENT = "Sent";
export const READING_IN_BACKGROUND =
  "Reading your pages. We'll let you know when they're ready. You can close this.";
export const CHECK_NOW = "Check now";
export const THROW_PAGES_AWAY = "Throw these pages away";
export const NOT_SURE = "Not sure. Check this one.";
export const PAGE_TOOK_TOO_LONG = "That page took too long to read. Retake it.";
export const QUEUE_FULL =
  "That's 10 pages in one go. Check these first, then scan more.";
export const DONE_SCANNING = "Done";

/** The binder's line while a queue is out: "Reading 5 pages..." / "5 pages ready to check". */
export function pagesWaitingLine(pages: number, ready: boolean): string {
  const noun = pages === 1 ? "page" : "pages";
  return ready ? `${pages} ${noun} ready to check` : `Reading ${pages} ${noun}...`;
}

/** "18 of 20 pages left today", under the shutter. */
export function pagesLeftLine(left: number): string {
  return `${left} of ${PAGES_PER_DAY} pages left today`;
}
