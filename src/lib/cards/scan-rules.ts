/**
 * The card scanner: the rules and the words, with no server in them.
 *
 * The founder (2026-10-09), on faster binders: card scanning as a Pro
 * feature, "to cover the cost", tried by admins first. A photo of one
 * card goes to a vision model that reads what is printed on it (the
 * name, the collector number, the set code), and our own catalogue
 * decides which card that is. The model never picks a card id; it only
 * reads, and the player confirms before anything is added.
 *
 * Kept free of server imports so the ranking is unit-testable, and
 * mirrored word for word in the app by `mobile/src/scan-copy.ts`.
 */

/** The games a scan can come back as. "other" is a card we do not carry. */
export const SCAN_GAMES = [
  "one-piece",
  "riftbound",
  "lorcana",
  "mtg",
  "pokemon",
  "flesh-and-blood",
] as const;
export type ScanGame = (typeof SCAN_GAMES)[number];

/** What the model read off the card. Empty strings for what it could not. */
export interface ScanRead {
  found: boolean;
  game: ScanGame | "other";
  /** As printed, in the card's own language. */
  name: string;
  /** The English name, when the card is printed in another language. */
  englishName: string;
  /** The collector number as printed: "199/165", "OP01-001", "WTR001". */
  number: string;
  /** The set code as printed, when there is one: "SVI", "MKM", "OP01". */
  setCode: string;
}

/** The longest side a photo is sent at. Text on a card stays legible. */
export const SCAN_LONG_EDGE = 1024;
/** The ceiling on an uploaded photo, after the client has shrunk it. */
export const SCAN_MAX_BYTES = 1_500_000;
/** How many guesses come back for "Is this it?". */
export const SCAN_MATCHES = 6;

/** Whether a photo's first bytes say JPEG, PNG or WebP. A named type is a hint. */
export function photoType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Letters and digits only, upper case: how numbers and set codes compare. */
export function compactCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * The card's own number within its set, as a number: "199/165" is 199,
 * "OP01-001" is 1, "WTR001" is 1, "OGN-001/298" is 1, "0123" is 123.
 * Null when there is no number to read.
 */
export function collectorValue(printed: string): number | null {
  let part = printed.trim();
  if (part.includes("-")) part = part.slice(part.lastIndexOf("-") + 1);
  if (part.includes("/")) part = part.slice(0, part.indexOf("/"));
  const runs = part.match(/\d+/g);
  if (!runs) return null;
  const value = Number(runs[runs.length - 1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * How well a catalogue card answers what was read off the photo. The
 * name already matched to be a candidate; the number is what tells one
 * Pikachu from the next, and the set code breaks a tie when the number
 * is shared across sets.
 */
export function scanScore(
  read: Pick<ScanRead, "number" | "setCode">,
  canonicalCardNumber: string,
): number {
  let score = 0;
  const wanted = collectorValue(read.number);
  if (wanted !== null && collectorValue(canonicalCardNumber) === wanted) score += 2;
  const set = compactCode(read.setCode);
  if (set && compactCode(canonicalCardNumber).startsWith(set)) score += 1;
  /* A number read whole, "OP01-001" against "OP01-001", is the surest
     sign of all: in the games that print the set into the number, it
     names exactly one card. */
  if (read.number && compactCode(read.number) === compactCode(canonicalCardNumber)) {
    score += 3;
  }
  return score;
}

/** Best first, then the catalogue's own order, at most `limit`. */
export function rankScan<T extends { canonicalCardNumber: string }>(
  read: Pick<ScanRead, "number" | "setCode">,
  candidates: T[],
  limit = SCAN_MATCHES,
): T[] {
  return candidates
    .map((card, index) => ({
      card,
      index,
      score: scanScore(read, card.canonicalCardNumber),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ card }) => card);
}

/**
 * The printing to suggest: the one whose set code is the code printed
 * on the card, else none, and the player picks. A guess at a printing
 * that turns out wrong is worse than asking.
 */
export function suggestedPrinting(
  setCode: string,
  printings: { id: string; setCode: string | null }[],
): string | null {
  const set = compactCode(setCode);
  if (!set) return null;
  return printings.find((p) => compactCode(p.setCode ?? "") === set)?.id ?? null;
}

/* ---- Words, the same on both platforms ------------------------------ */

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
export function scanReadLine(read: Pick<ScanRead, "name" | "number">): string {
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
  "daily-singles":
    "That's your 10 free scans for today. Pro scans without a limit, whole binder pages too.",
  "is-page": "That's a whole binder page. Scanning pages is Pro.",
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

/* ---- One scanner ------------------------------------------------------ */

/*
 * The founder (2026-10-09): "a unified scan - it can detect if it's
 * scanning a full page and says you need pro for that", "Free singles up
 * to 10 a day", and the check as "a popup full card viewer and a
 * contextual menu there". One camera for one card or a whole page; the
 * quick reader says which it is.
 */

/** Single-card scans a free account gets a day. Pro and admins have no limit. */
export const FREE_SCANS_PER_DAY = 10;

export const SCAN_TITLE = "Scan";
export const SCAN_INTRO_SINGLE = "Scan a card.";
/** Followed by the PRO mark: "Scan a whole binder page with PRO". */
export const SCAN_INTRO_PAGES = "Scan a whole binder page with";
export const FILL_THE_FRAME =
  "One card or one binder page, filling the frame, in good light.";
export const PAGES_ARE_PRO = "Scanning whole binder pages is Pro.";
export const GET_PRO = "Get Pro";
export const THATS_IT = "That's it";
export const NOT_THIS_CARD = "Not this card";
export const OTHER_PRINTING = "Other printing";
export const YOUR_PHOTO = "Your photo";
export const OUR_MATCH = "Our match";

/** "7 of 10 free scans left today". */
export function freeScansLeftLine(left: number): string {
  return `${left} of ${FREE_SCANS_PER_DAY} free scans left today`;
}

/** After a page is shot: "Page 4 added. Reading it in the background." */
export function pageAddedLine(page: number): string {
  return `Page ${page} added. Reading it in the background.`;
}

/** The check's shortcut through the doubtful pockets: "Check 2 unsure". */
export function checkUnsureLabel(count: number): string {
  return `Check ${count} unsure`;
}
