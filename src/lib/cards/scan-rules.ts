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
  unavailable: "The scanner isn't working right now. Try again in a moment.",
} as const;

export type ScanRefusal = keyof typeof SCAN_REFUSALS;
