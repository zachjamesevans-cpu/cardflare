import { ArrowLeftRight, Users } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import { leaveEventAction } from "@/lib/events/join-event-actions";
import type { Participant } from "@/lib/events/participants";

/**
 * Who is in the room.
 *
 * Present players first, and "here now" is a presence window rather than a
 * live connection — someone who put their phone away to dig through a binder
 * is still in the room, and that is precisely when a trade is happening.
 */
export function EventLobby({
  code,
  participants,
  youId,
}: {
  code: string;
  participants: Participant[];
  /** The viewer's own session, so their row can be marked. */
  youId: string;
}) {
  const present = participants.filter((participant) => participant.present).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
          <Users className="size-4 text-text-muted" aria-hidden="true" />
          In this room
        </h2>
        <Badge tone={present > 0 ? "accent" : "neutral"}>
          {present} here now
          {participants.length !== present && ` · ${participants.length} total`}
        </Badge>
      </div>

      <ul className="flex flex-col gap-2">
        {participants.map((participant) => {
          const isYou = participant.playerSessionId === youId;

          return (
            <li
              key={participant.playerSessionId}
              className="flex items-center gap-3 rounded-[var(--radius-control)] px-1 py-1.5"
            >
              <PlayerAvatar
                displayName={participant.displayName}
                seed={participant.playerSessionId}
                size="sm"
                className={participant.present ? undefined : "opacity-50"}
              />

              <span className="min-w-0 flex-1 truncate text-text-secondary">
                <span className={participant.present ? "text-text-primary" : undefined}>
                  {participant.displayName}
                </span>
                {isYou && <span className="text-text-muted"> · you</span>}
              </span>

              {/*
               * Repeated from the board on purpose. This list answers "who is
               * here", and for somebody deciding who to approach, "will look
               * at anything" is the most useful thing to know about a name.
               */}
              {/*
               * Labelled at every width, not icon-only on small screens. Two
               * arrows on their own mean nothing to somebody seeing them for
               * the first time, and a phone is where this is read. The name
               * beside it truncates, which is the right thing to give up.
               */}
              {participant.openToTrades && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
                  <ArrowLeftRight className="size-3.5" aria-hidden="true" />
                  Open to trades
                </span>
              )}

              {!participant.present && (
                <span className="shrink-0 text-xs text-text-muted">away</span>
              )}
            </li>
          );
        })}
      </ul>

      <form action={leaveEventAction} className="border-t border-border pt-3">
        <input type="hidden" name="code" value={code} />
        <button
          type="submit"
          className="text-sm text-text-muted underline underline-offset-4 transition-colors hover:text-text-secondary"
        >
          Leave this room
        </button>
      </form>
    </Card>
  );
}
