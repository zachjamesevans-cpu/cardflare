import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

/** The one line an empty board says, same words as the app. */
export const EMPTY_BOARD =
  "Nothing posted yet. Yours would be the first one on the board tonight.";

/**
 * "Flares in the room": the board, as one card.
 *
 * The founder, on the Room tab: "There's just so many blocks." The
 * board used to be a stack of cards, one per player, under a heading
 * with a sort control beside it. Now it is one card with one heading,
 * the players inside it separated by a hairline, and nothing else in
 * the heading row. FlareBoard keeps its internals; this wraps it and
 * flattens its per-player cards into rows of the one card.
 *
 * Empty, the card says so in one line of its own rather than handing
 * the page a second card to say "nothing". The foot is where the
 * viewer's own unposted wants sit (RepostWants), and a guest's
 * open-to-trades row lives under that, because a guest has no composer
 * to carry it.
 */
export function RoomBoardCard({
  empty,
  children,
  foot = null,
  guestTrades = null,
}: {
  /** No Flares and nobody open to trades: say so instead of drawing the board. */
  empty: boolean;
  /** The FlareBoard, when there is one to draw. */
  children?: ReactNode;
  /** The repost foot row, when the viewer has wants not posted here. */
  foot?: ReactNode;
  /** A guest's open-to-trades toggle; a player's rides in the composer. */
  guestTrades?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-bold text-text-primary">Flares in the room</h2>

      {empty ? (
        <p className="text-sm leading-5 text-text-secondary">{EMPTY_BOARD}</p>
      ) : (
        /*
         * FlareBoard draws a <ul> of per-player <Card as="li">s. Inside
         * this card each becomes a plain row: the card's own border,
         * radius, fill, shadow and side padding come off, and a
         * hairline above every row but the first separates the players.
         */
        <div className="[&>ul]:gap-2 [&>ul>li]:rounded-none [&>ul>li]:border-x-0 [&>ul>li]:border-t [&>ul>li]:border-b-0 [&>ul>li]:border-border [&>ul>li]:bg-transparent [&>ul>li]:px-0 [&>ul>li]:pt-3 [&>ul>li]:shadow-none [&>ul>li:first-child]:border-t-0 [&>ul>li:first-child]:pt-0">
          {children}
        </div>
      )}

      {foot}
      {guestTrades}
    </Card>
  );
}
