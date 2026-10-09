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
  unavailable: "The scanner isn't working right now. Try again in a moment.",
} as const;

export type ScanRefusal = keyof typeof SCAN_REFUSALS;
