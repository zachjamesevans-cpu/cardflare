"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerPeek } from "@/components/players/player-peek";
import { OpenToTradesTag } from "@/components/players/open-to-trades-tag";
import { Sheet } from "@/components/ui/sheet";
import { leaveEventAction } from "@/lib/events/join-event-actions";
import type { Participant } from "@/lib/events/participants";

/** How many faces the meta line shows before it stops at the number. */
const FACES = 3;

/**
 * Who is here: the door card's meta line, and the dialog behind it.
 *
 * The line reads "2 here now · 10 tonight · 3 Flares" with up to three
 * faces in front of it, the present ones first, and the whole line is
 * one button named "Who's here". The names themselves are reference
 * material, not a decision anyone makes on arrival, so they live in a
 * sheet over the room rather than in a card of their own: the
 * founder's call, after a roster that pushed the board below the fold
 * and then a folded card that was still one more block.
 *
 * Present players first, and "here now" is a presence window rather
 * than a live connection: someone who put their phone away to dig
 * through a binder is still in the room, and that is precisely when a
 * trade is happening.
 */
export function EventLobby({
  code,
  participants,
  youId,
  imagesEnabled,
  flareCount,
}: {
  code: string;
  participants: Participant[];
  /** The viewer's own session, so their row can be marked. */
  youId: string;
  /** For the card images inside a profile popup's showcase. */
  imagesEnabled: boolean;
  /** Open Flares on the board, for the line's last number. */
  flareCount: number;
}) {
  const [open, setOpen] = useState(false);

  const ordered = [
    ...participants.filter((participant) => participant.present),
    ...participants.filter((participant) => !participant.present),
  ];
  const present = participants.filter((participant) => participant.present).length;
  const faces = ordered.slice(0, FACES);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Who's here"
        className="flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-control)] text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {faces.length > 0 && (
          <span className="flex items-center" aria-hidden="true">
            {faces.map((participant) => (
              <span
                key={participant.playerSessionId}
                className="-ml-1.5 size-[22px] shrink-0 rounded-full ring-2 ring-surface first:ml-0 [&>span]:size-full [&>span]:text-[9px]"
              >
                <PlayerAvatar
                  displayName={participant.displayName}
                  seed={participant.playerSessionId}
                  avatarUrl={participant.avatarUrl}
                  frame={participant.frame}
                  ring={participant.ring}
                  aura={participant.aura}
                  ringArt={participant.ringArt}
                  auraArt={participant.auraArt}
                  size="sm"
                />
              </span>
            ))}
          </span>
        )}
        <span className="font-semibold text-text-secondary tabular-nums">
          {present} here now
        </span>
        <span className="text-text-muted tabular-nums">
          · {participants.length} tonight · {flareCount}{" "}
          {flareCount === 1 ? "Flare" : "Flares"}
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Who's here"
        footer={
          <form action={leaveEventAction}>
            <input type="hidden" name="code" value={code} />
            <LeaveRoomButton />
          </form>
        }
      >
        <ul className="flex flex-col gap-2">
          {ordered.map((participant) => {
            const isYou = participant.playerSessionId === youId;

            return (
              <li
                key={participant.playerSessionId}
                className="flex items-center gap-3 rounded-[var(--radius-control)] px-1 py-1.5"
              >
                {/*
                 * An account opens the profile popup, right here in the
                 * room: the founder's ask, looking somebody up must not
                 * navigate away from the table. A guest is not a dead
                 * button, they are somebody who does not need an
                 * account to trade, so their row stays plain text.
                 */}
                {participant.playerId ? (
                  <PlayerPeek
                    playerId={participant.playerId}
                    displayName={participant.displayName}
                    seed={participant.playerSessionId}
                    avatarUrl={participant.avatarUrl}
                    frame={participant.frame}
                    ring={participant.ring}
                    aura={participant.aura}
                    ringArt={participant.ringArt}
                    auraArt={participant.auraArt}
                    isYou={isYou}
                    dimmed={!participant.present}
                    imagesEnabled={imagesEnabled}
                    className="flex-1"
                  />
                ) : (
                  <>
                    <PlayerAvatar
                      displayName={participant.displayName}
                      seed={participant.playerSessionId}
                      avatarUrl={participant.avatarUrl}
                      frame={participant.frame}
                      ring={participant.ring}
                      aura={participant.aura}
                      ringArt={participant.ringArt}
                      auraArt={participant.auraArt}
                      size="sm"
                      className={participant.present ? undefined : "opacity-50"}
                    />

                    <span className="min-w-0 flex-1 truncate text-text-secondary">
                      <span
                        className={
                          participant.present ? "text-text-primary" : undefined
                        }
                      >
                        {participant.displayName}
                      </span>
                    </span>
                  </>
                )}

                {/* No Ember badge here - the founder's call: in the
                    room itself, Embers only show inside a player's
                    popup or full profile, never on the roster. */}

                {/*
                 * Repeated from the board on purpose. This list answers
                 * "who is here", and for somebody deciding who to
                 * approach, "will look at anything" is the most useful
                 * thing to know about a name.
                 */}
                {participant.openToTrades && <OpenToTradesTag />}

                {!participant.present && (
                  <span className="shrink-0 text-xs text-text-muted">away</span>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

/**
 * Leaving says it is leaving.
 *
 * A quiet text link with a server round trip behind it is the exact
 * shape of control that gets clicked three times - it looks inert
 * because nothing about it moves.
 */
function LeaveRoomButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-text-muted underline underline-offset-4 transition-colors hover:text-text-secondary disabled:no-underline disabled:opacity-60"
    >
      {pending ? "Leaving…" : "Leave this room"}
    </button>
  );
}
