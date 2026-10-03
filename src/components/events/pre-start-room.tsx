import Link from "next/link";

import { RoomBoardCard } from "@/components/events/room-board-card";
import { CardRail, tileWidth } from "@/components/feed/feed-tile";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import type { RosterPlayer } from "@/lib/events/going";
import { flaresLine } from "@/lib/events/night-copy";
import type { ListEntry } from "@/lib/lists/repository";
import { groupByPlayer } from "@/lib/lists/schema";

/**
 * The board, read-only, for whoever opens a night without a seat in it.
 *
 * The founder: "That room stays 'open' and anyone can go into there
 * and see who is looking for which cards before the tournament or
 * event starts." Grouped by poster the way the live board is: a face
 * and a name over a rail of the cards they are hunting. No offer
 * controls, no "you have this": those belong to a seat in the room,
 * and this viewer has not taken one. The faces come off the roster,
 * which is the same people.
 *
 * Nights round 1 drew the pitch card and the roster card here too.
 * Round 2 took both away: the RSVP lives on the header line and the
 * roster is "Players going", lower down, with why each one matters.
 */

/** The pre-start board with nothing on it yet. */
export const EMPTY_PRE_START_BOARD =
  "Nothing posted yet. Say you're going and your Flares are the first on the board.";

export function ReadOnlyBoard({
  flares,
  roster,
  imagesEnabled,
}: {
  flares: ListEntry[];
  roster: RosterPlayer[];
  imagesEnabled: boolean;
}) {
  const faces = new Map(roster.map((player) => [player.playerSessionId, player]));
  const groups = groupByPlayer(flares);

  return (
    <RoomBoardCard empty={groups.length === 0} emptyLine={EMPTY_PRE_START_BOARD}>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => {
          const who = faces.get(group.playerSessionId);
          const name = who?.displayName ?? group.displayName ?? "A player";
          const cards = group.entries.map((entry) => ({
            cardId: entry.cardId,
            cardName: entry.cardName,
            cardNumber: entry.cardNumber,
            imageUrl: imagesEnabled ? entry.imageUrl : null,
            match: null,
            printingId: entry.printingId,
            printingLabel: entry.printingLabel,
            quantity: entry.quantity,
          }));

          return (
            <Card
              as="li"
              key={group.playerSessionId}
              className="flex flex-col gap-3 p-4"
            >
              <div className="flex items-center gap-3">
                <PlayerAvatar
                  displayName={name}
                  seed={who?.playerId ?? group.playerSessionId}
                  avatarUrl={who?.avatarUrl ?? null}
                  frame={who?.frame ?? null}
                  ring={who?.ring ?? null}
                  aura={who?.aura ?? null}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  {who?.playerId ? (
                    <Link
                      href={`/p/${who.playerId}`}
                      className="truncate text-sm font-semibold text-text-primary underline-offset-4 hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {name}
                    </p>
                  )}
                  <p className="text-xs text-text-muted tabular-nums">
                    {flaresLine(group.entries.length)}
                  </p>
                </div>
              </div>
              <CardRail cards={cards} size={tileWidth(cards.length)} />
            </Card>
          );
        })}
      </ul>
    </RoomBoardCard>
  );
}
