"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronDown, Users } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import { leaveEventAction } from "@/lib/events/join-event-actions";
import type { Participant } from "@/lib/events/participants";

/**
 * Who is in the room — folded shut by default, the founder's call.
 *
 * Ten names above the board pushed the actual product below the fold;
 * the counts are what a scanning eye needs ("2 here now · 10 total"),
 * and the names are one tap away behind the chevron. The expansion
 * animates via the grid-rows trick — `0fr` to `1fr` with a transition —
 * which slides smoothly at any list length without measuring anything.
 *
 * Present players first, and "here now" is a presence window rather
 * than a live connection — someone who put their phone away to dig
 * through a binder is still in the room, and that is precisely when a
 * trade is happening.
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
  const [open, setOpen] = useState(false);
  const present = participants.filter((participant) => participant.present).length;

  return (
    <Card className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
      >
        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
          <Users className="size-4 text-text-muted" aria-hidden="true" />
          In this room
        </h2>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={present > 0 ? "accent" : "neutral"}>
            {present} here now
            {participants.length !== present && ` · ${participants.length} total`}
          </Badge>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 text-text-muted transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="flex flex-col gap-2 pt-4">
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
                    <span
                      className={participant.present ? "text-text-primary" : undefined}
                    >
                      {participant.displayName}
                    </span>
                    {isYou && <span className="text-text-muted"> · you</span>}
                  </span>

                  {/*
                   * Repeated from the board on purpose. This list answers
                   * "who is here", and for somebody deciding who to
                   * approach, "will look at anything" is the most useful
                   * thing to know about a name.
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

          <form action={leaveEventAction} className="mt-3 border-t border-border pt-3">
            <input type="hidden" name="code" value={code} />
            <button
              type="submit"
              className="text-sm text-text-muted underline underline-offset-4 transition-colors hover:text-text-secondary"
            >
              Leave this room
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}
