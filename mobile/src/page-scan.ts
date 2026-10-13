import {
  BINDER_PAGES,
  MAX_SCAN_PAGES,
  POCKETS_PER_PAGE,
  QUEUE_FULL,
  SCAN_REFUSALS,
  POCKET_NAMES,
  STATUS_EMPTY,
  STATUS_MATCHED,
  STATUS_REVIEW,
  STATUS_UNRECOGNIZED,
  pocketAt,
  type ScanRefusal,
} from "./scan-copy";

/**
 * Whole binder pages, as arithmetic: how big the page's photo goes up,
 * which page is sent next, what each pocket's status is, which pockets
 * the check walks through, and what goes to the binder at the end. Kept apart from the screens
 * (src/card-scanner.tsx, src/page-scanner.tsx) and from ./api, so
 * tests/unit/page-scan-app.test.ts can run it in node.
 *
 * The founder (2026-10-09): "scan, let's say 5 pages of their binder into
 * a queue and it auto fills in an actual binder, with the exact same
 * location the cards were in in their binder."
 */

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
 * A page goes up as ONE photo, the whole of it at full resolution: the
 * server finds the page and its nine pockets in it, straightens each card
 * and keeps those crops, so nothing is cut on the phone. The quick way
 * (one body) sends it at PAGE_LONG_EDGE; the pieces, where a body cannot
 * get through, send a smaller one, as a page at full size would be
 * hundreds of requests. Quality steps down only past the server's
 * ceiling, PAGE_MAX_BYTES.
 */
export const PAGE_LONG_EDGE = 2800;
export const PAGE_QUALITY = 0.85;
export const PAGE_PIECES_LONG_EDGE = 2000;
export const PAGE_PIECES_QUALITY = 0.8;
/** The server's page ceiling: twice a single card's. */
export const PAGE_MAX_BYTES = 3_000_000;

/** The page's resize: its long side at `longEdge`, never enlarged. */
export function pageResize(
  photo: { width: number; height: number },
  longEdge = PAGE_LONG_EDGE,
): { width: number } | { height: number } {
  return photo.height >= photo.width
    ? { height: Math.min(photo.height, longEdge) }
    : { width: Math.min(photo.width, longEdge) };
}

/** The qualities a page is tried at, from `start` down by 0.1, never under 0.45. */
export function pageQualities(start: number): number[] {
  const steps: number[] = [];
  for (let at = 0; start - at * 0.1 >= 0.45 - 1e-9; at += 1) {
    steps.push(Math.round((start - at * 0.1) * 100) / 100);
  }
  return steps;
}

/** Whether a base64 page is under the server's ceiling. */
export function pageFits(base64: string): boolean {
  return (base64.length * 3) / 4 <= PAGE_MAX_BYTES;
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

/** A pocket's status: matched (green), ambiguous (yellow), unrecognized (red), empty (grey). */
export type PocketStatus = "matched" | "ambiguous" | "unrecognized" | "empty";

/**
 * A pocket's status as the server gave it, or, for a page read before the
 * second scanner (no status), as its state says: empty is empty, a sure
 * guess matched, an unsure one ambiguous, an unread pocket unrecognized.
 */
export function pocketStatus(pocket: {
  state: string;
  sure?: boolean;
  status?: PocketStatus;
}): PocketStatus {
  if (pocket.status) return pocket.status;
  if (pocket.state === "empty") return "empty";
  if (pocket.state === "found") return pocket.sure === false ? "ambiguous" : "matched";
  return "unrecognized";
}

/** The word under a status's colour. */
export function statusWord(status: PocketStatus): string {
  if (status === "matched") return STATUS_MATCHED;
  if (status === "ambiguous") return STATUS_REVIEW;
  if (status === "unrecognized") return STATUS_UNRECOGNIZED;
  return STATUS_EMPTY;
}

/** The theme token a status is drawn in: the screens look it up in ./theme. */
export const STATUS_TOKEN = {
  matched: "success",
  ambiguous: "warning",
  unrecognized: "danger",
  empty: "textMuted",
} as const satisfies Record<PocketStatus, string>;

/** A pocket's name on its page, A1 to C3: the server's, else its slot's. */
export function pocketName(pocket: { slot: number; position?: string }): string {
  return pocket.position ?? POCKET_NAMES[pocket.slot] ?? "";
}

/**
 * A pocket "Check 2 unsure" walks through, as the website's `doubtful`:
 * one to check, one the reader could not identify, or a card whose
 * printing is the player's to choose, until the player has looked at it
 * in the viewer (confirmed it, chose another, or left it empty).
 */
export function needsLook(
  pocket: {
    state: string;
    sure?: boolean;
    status?: PocketStatus;
    printingUncertain?: boolean;
  },
  looked: boolean,
): boolean {
  if (looked) return false;
  const status = pocketStatus(pocket);
  return (
    status === "ambiguous" ||
    status === "unrecognized" ||
    (pocket.state === "found" && pocket.printingUncertain === true)
  );
}
