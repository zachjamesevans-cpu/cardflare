import type { PocketOutcome } from "@/lib/cards/scan";
import {
  STATUS_EMPTY,
  STATUS_MATCHED,
  STATUS_REVIEW,
  STATUS_UNRECOGNIZED,
} from "@/lib/cards/scan-rules";

/**
 * A scanned pocket's status, the way the founder asked for it
 * (2026-10-13): matched (green), needs review (yellow), empty (grey) or
 * unable to identify (red). The page check's tiles and the card viewer
 * both say it with these, so a colour means the same thing on both, and
 * the app draws the same four from the same tokens.
 *
 * Kept free of React so the rules are unit-tested directly.
 */

export type PocketStatus = NonNullable<PocketOutcome["status"]>;

/**
 * The server's status, or, for a page read before the server said one,
 * the same answer from what it found: a sure (or quick) guess is
 * matched, an unsure one is for review, a pocket it could not place is
 * unrecognized.
 */
export function pocketStatus(pocket: PocketOutcome): PocketStatus {
  if (pocket.status) return pocket.status;
  if (pocket.state === "empty") return "empty";
  if (pocket.state === "unread") return "unrecognized";
  return pocket.sure === false ? "ambiguous" : "matched";
}

/** Each status's word, and its colour as the theme's tokens: text, band and dot. */
export const STATUS_LOOK: Record<
  PocketStatus,
  { word: string; text: string; band: string; dot: string }
> = {
  matched: {
    word: STATUS_MATCHED,
    text: "text-success",
    band: "bg-success/15",
    dot: "bg-success",
  },
  ambiguous: {
    word: STATUS_REVIEW,
    text: "text-warning",
    band: "bg-warning/15",
    dot: "bg-warning",
  },
  empty: {
    word: STATUS_EMPTY,
    text: "text-text-muted",
    band: "bg-text-muted/15",
    dot: "bg-text-muted",
  },
  unrecognized: {
    word: STATUS_UNRECOGNIZED,
    text: "text-danger",
    band: "bg-danger/15",
    dot: "bg-danger",
  },
};
