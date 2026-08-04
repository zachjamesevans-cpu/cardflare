import { ArrowLeftRight, Users } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import type { Participant } from "@/lib/events/participants";

/**
 * Who is in the room, read-only.
 *
 * The operator's and the console's view of a lobby. Not the room's own
 * lobby component: that one carries a working "leave this room" form, which
 * would be a dead control for a viewer who never joined.
 */
export function RoomRoster({ participants }: { participants: Participant[] }) {
  const present = participants.filter((participant) => participant.present).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-text-primary">
          <Users className="size-4 text-text-muted" aria-hidden="true" />
          In this room
        </h3>
        <Badge tone={present > 0 ? "accent" : "neutral"}>
          {present} here now
          {participants.length !== present && ` · ${participants.length} total`}
        </Badge>
      </div>

      {participants.length === 0 ? (
        <p className="text-sm text-text-secondary">Nobody has joined yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {participants.map((participant) => (
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
              </span>
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
          ))}
        </ul>
      )}
    </Card>
  );
}
