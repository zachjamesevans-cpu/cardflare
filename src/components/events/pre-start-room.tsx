import Link from "next/link";
import { Users } from "lucide-react";

import { RoomBoardCard } from "@/components/events/room-board-card";
import { CardRail, tileWidth } from "@/components/feed/feed-tile";
import { GoingButton } from "@/components/nights/going-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import { binderCover } from "@/lib/binder/covers";
import type { RosterPlayer } from "@/lib/events/going";
import {
  goingLine,
  PRE_START_PITCH,
  YOURE_ON_THE_BOARD,
} from "@/lib/events/going-copy";
import type { ListEntry } from "@/lib/lists/repository";
import { groupByPlayer } from "@/lib/lists/schema";

/**
 * A room before its night starts, for whoever opens it.
 *
 * The founder: "That room stays 'open' and anyone can go into there
 * and see who is looking for which cards before the tournament or
 * event starts." So this is three things under the door: the pitch
 * with the one tap on it, who is going and what they carry, and the
 * board as it stands, read-only. Posting to it is what Going does;
 * offering on it waits for a seat in the room, which Going also gives.
 *
 * Server-rendered, no database behind the props: the page reads the
 * roster and the Flares once and this draws them. The app's room.tsx
 * draws the same three blocks with the same words, and
 * tests/unit/nights-parity.test.ts holds the two together.
 */

/** "3 Flares", "1 Flare", "No Flares yet": a roster row's count. */
export function flaresLine(count: number): string {
  if (count === 0) return "No Flares yet";
  return `${count} ${count === 1 ? "Flare" : "Flares"}`;
}

/**
 * The pitch and the tap. One sentence before the viewer has said
 * yes, a different one after, and the button beside the count.
 */
export function PreStartCard({
  eventId,
  code,
  youGoing,
  goingCount,
  signedIn,
}: {
  eventId: string;
  code: string;
  youGoing: boolean;
  goingCount: number;
  signedIn: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 border-accent/30">
      <p className="text-sm text-text-secondary">
        {youGoing ? YOURE_ON_THE_BOARD : PRE_START_PITCH}
      </p>
      <GoingButton
        eventId={eventId}
        youGoing={youGoing}
        goingCount={goingCount}
        signedIn={signedIn}
        next={`/e/${code}`}
        size="md"
      />
    </Card>
  );
}

/**
 * Who is going: a face, a name that opens their profile, how many of
 * their Flares are on this board, and up to three binders they have
 * up for trade, each a chip in its cover's colour that opens the
 * binder. A guest on the roster has no profile and no binders, so
 * their row is the face and the name and nothing else.
 */
export function NightRosterCard({ roster }: { roster: RosterPlayer[] }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
          <Users className="size-4 text-text-muted" aria-hidden="true" />
          Who&rsquo;s going
        </h2>
        <Badge tone={roster.length > 0 ? "accent" : "neutral"}>
          {goingLine(roster.length)}
        </Badge>
      </div>

      {roster.length > 0 && (
        <ul className="flex flex-col gap-3">
          {roster.map((player) => (
            <li key={player.playerSessionId} className="flex items-start gap-3">
              <PlayerAvatar
                displayName={player.displayName}
                seed={player.playerId ?? player.playerSessionId}
                avatarUrl={player.avatarUrl}
                frame={player.frame}
                ring={player.ring}
                aura={player.aura}
                size="md"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {player.playerId ? (
                    <Link
                      href={`/p/${player.playerId}`}
                      className="truncate font-semibold text-text-primary underline-offset-4 hover:underline"
                    >
                      {player.displayName}
                    </Link>
                  ) : (
                    <span className="truncate font-semibold text-text-primary">
                      {player.displayName}
                    </span>
                  )}
                  <span className="text-xs text-text-muted tabular-nums">
                    {flaresLine(player.flares)}
                  </span>
                </p>
                {player.playerId && player.binders.length > 0 && (
                  <ul
                    className="flex flex-wrap gap-1.5"
                    aria-label="Binders up for trade"
                  >
                    {player.binders.slice(0, 3).map((binder) => (
                      <li key={binder.id}>
                        <Link
                          href={`/p/${player.playerId}/binders/${binder.id}`}
                          className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full border border-border-strong"
                            style={{ background: binderCover(binder.cover).edge }}
                          />
                          <span className="truncate">{binder.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The board, read-only, grouped by poster the way the live board is:
 * a face and a name over a rail of the cards they are hunting. No
 * offer controls, no "you have this": those belong to a seat in the
 * room, and this viewer has not taken one. The faces come off the
 * roster, which is the same people.
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

export function PreStartRoom({
  eventId,
  code,
  youGoing,
  goingCount,
  signedIn,
  roster,
  flares,
  imagesEnabled,
}: {
  eventId: string;
  code: string;
  youGoing: boolean;
  goingCount: number;
  signedIn: boolean;
  roster: RosterPlayer[];
  flares: ListEntry[];
  imagesEnabled: boolean;
}) {
  return (
    <>
      <PreStartCard
        eventId={eventId}
        code={code}
        youGoing={youGoing}
        goingCount={goingCount}
        signedIn={signedIn}
      />
      <NightRosterCard roster={roster} />
      <ReadOnlyBoard flares={flares} roster={roster} imagesEnabled={imagesEnabled} />
    </>
  );
}
