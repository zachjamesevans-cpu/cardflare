import type { ScanRefusal } from "./scan-copy";

/**
 * The one scanner's rules, with no screen in them: what a player may
 * scan, and where a photo goes once the quick reader has answered. Kept
 * apart from ./api so tests/unit/scan-ux-app.test.ts can run it in node.
 *
 * The founder (2026-10-09): "a unified scan - it can detect if it's
 * scanning a full page and says you need pro for that", and "Free
 * singles up to 10 a day." Every photo is read as one card first; the
 * reader says when it is a whole page instead.
 */

/**
 * What the server lets this player scan (GET /api/v1/cards/scan,
 * the website's ScanRights): single cards "on", "used-up" for the day,
 * or null; the free ones left today, null with no limit; whole pages
 * "on", the door to Pro, or null.
 */
export interface ScanRights {
  singles: "on" | "used-up" | null;
  singlesLeft: number | null;
  pages: "on" | "pro-door" | null;
}

/** Nothing at all: before the server has said, and when it says no. */
export const NO_SCAN_RIGHTS: ScanRights = {
  singles: null,
  singlesLeft: null,
  pages: null,
};

/** A single scan's answer, as far as the flow cares. */
export type SingleAnswer = { ok: true } | { ok: false; reason: ScanRefusal };

/** Where a photo goes next. */
export type ScanNext =
  | { kind: "viewer" }
  | { kind: "send-page" }
  | { kind: "pro"; why: "pages" | "daily-singles" }
  | { kind: "refused"; reason: ScanRefusal };

/**
 * The single scan has answered: a card opens the viewer; a whole page is
 * sent as a page for a player who may scan pages, and is the door to Pro
 * for anyone else; the day's free scans gone is the same door; anything
 * else is its own sentence.
 */
export function afterSingleScan(answer: SingleAnswer, rights: ScanRights): ScanNext {
  if (answer.ok) return { kind: "viewer" };
  if (answer.reason === "is-page") {
    return rights.pages === "on"
      ? { kind: "send-page" }
      : { kind: "pro", why: "pages" };
  }
  if (answer.reason === "daily-singles") return { kind: "pro", why: "daily-singles" };
  return { kind: "refused", reason: answer.reason };
}

/**
 * Whether the server counted that photo as one of the day's free scans:
 * it does once the reader has looked for a card, found or not. A whole
 * page, a refusal before the read, and a read that broke are free.
 */
export function countsAsFreeScan(answer: SingleAnswer): boolean {
  return (
    answer.ok ||
    answer.reason === "no-card" ||
    answer.reason === "not-found" ||
    answer.reason === "not-carried"
  );
}

/** The rights after one more answer, so the free scans line counts down without asking. */
export function rightsAfter(rights: ScanRights, answer: SingleAnswer): ScanRights {
  if (!answer.ok && answer.reason === "daily-singles") {
    return { ...rights, singles: "used-up", singlesLeft: 0 };
  }
  if (rights.singlesLeft === null || !countsAsFreeScan(answer)) return rights;
  const left = Math.max(0, rights.singlesLeft - 1);
  return { ...rights, singlesLeft: left, singles: left > 0 ? "on" : "used-up" };
}

/**
 * The day's free scans are gone: the shutter goes straight to the door
 * to Pro, and nothing is sent. Pro has no limit, so never for Pro.
 */
export function freeScansGone(rights: ScanRights): boolean {
  return rights.singles === "used-up" || rights.singlesLeft === 0;
}
