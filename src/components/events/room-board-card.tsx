import type { ReactNode } from "react";

/** The one line an empty board says, same words as the app. */
export const EMPTY_BOARD =
  "Nothing posted yet. Yours would be the first one on the board tonight.";

/**
 * The board, flattened to rows.
 *
 * The founder, on the Room tab: "There's just so many blocks." The
 * board used to be a stack of cards, one per player, under a heading
 * with a sort control beside it; then one card with one heading. Now
 * (Nights round 2, "USE LESS CONTAINERIZATION") it is not a card at
 * all: the section label and the filter above it belong to
 * FlaresAtNight, and this is the rows, the players separated by a
 * hairline. FlareBoard keeps its internals; this flattens its
 * per-player cards into rows.
 *
 * Empty, it says so in one line rather than handing the page a second
 * block to say "nothing". Nothing of the viewer's waits at the foot:
 * joining a room posts their Flares to it (src/lib/events/auto-post.ts).
 * A guest's open-to-trades row lives at the foot, because a guest has
 * no composer to carry it.
 */
export function RoomBoardCard({
  empty,
  emptyLine = EMPTY_BOARD,
  children,
  guestTrades = null,
}: {
  /** No Flares and nobody open to trades: say so instead of drawing the board. */
  empty: boolean;
  /** What the empty board says; a night days away does not say "tonight". */
  emptyLine?: string;
  /** The FlareBoard, when there is one to draw. */
  children?: ReactNode;
  /** A guest's open-to-trades toggle; a player's rides in the composer. */
  guestTrades?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {empty ? (
        <p className="text-sm leading-5 text-text-secondary">{emptyLine}</p>
      ) : (
        /*
         * FlareBoard draws a <ul> of per-player <Card as="li">s. Each
         * becomes a plain row: the card's own border, radius, fill,
         * shadow and side padding come off, and a hairline above every
         * row but the first separates the players.
         */
        <div className="[&>ul]:gap-2 [&>ul>li]:rounded-none [&>ul>li]:border-x-0 [&>ul>li]:border-t [&>ul>li]:border-b-0 [&>ul>li]:border-border [&>ul>li]:bg-transparent [&>ul>li]:px-0 [&>ul>li]:pt-3 [&>ul>li]:shadow-none [&>ul>li:first-child]:border-t-0 [&>ul>li:first-child]:pt-0">
          {children}
        </div>
      )}

      {guestTrades}
    </div>
  );
}
