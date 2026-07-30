import { MapPin, Search, Sparkles, Users } from "lucide-react";

import { PREVIEW_EVENT, PREVIEW_FLARES, PREVIEW_MATCH } from "./fixtures";
import { CardGlyph, CardIdentity, PreviewFrame, PreviewLabel } from "./primitives";
import type { PreviewEvent, PreviewFlare, PreviewMatch } from "./types";

function EventHeader({ event }: { event: PreviewEvent }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-accent uppercase">
            <span className="size-1.5 rounded-full bg-accent" />
            Live
          </span>
          <p className="truncate text-sm font-semibold text-text-primary">
            {event.storeName}
          </p>
        </div>
        <p className="mt-1 truncate text-xs text-text-muted">{event.eventName}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
        <Users className="size-3.5" />
        {event.playerCount}
      </div>
    </div>
  );
}

function FlareRow({ flare }: { flare: PreviewFlare }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-canvas p-3">
      <CardGlyph />
      <div className="min-w-0 flex-1">
        <CardIdentity card={flare.card} />
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
          <Search className="size-3" />
          Searching the room
        </p>
      </div>
      <span className="shrink-0 rounded-md bg-elevated px-2 py-1 text-xs font-semibold text-text-secondary">
        &times;{flare.wanted}
      </span>
    </div>
  );
}

function MatchRow({ match }: { match: PreviewMatch }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-accent/40 bg-accent/[0.07] p-3 shadow-[0_0_30px_-14px_var(--color-accent)]">
      <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-accent uppercase">
        <Sparkles className="size-3" />
        Flare Match
      </p>

      <div className="mt-2.5 flex items-center gap-3">
        <CardGlyph />
        <div className="min-w-0 flex-1">
          <CardIdentity card={match.card} />
          <p className="mt-1.5 truncate text-[11px] text-text-secondary">
            {match.playerName} has {match.available} available
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-accent/20 pt-2.5">
        <span className="flex items-center gap-1 text-[11px] text-text-muted">
          <MapPin className="size-3" />
          {match.location}
        </span>
      </div>
    </div>
  );
}

/** Event room screen: what a player sees during an event. */
export function EventRoomPreview({ className }: { className?: string }) {
  return (
    <PreviewFrame
      className={className}
      label="Preview of the CardFlare app: a live event room at Grand Line Games with two active Flares and one Flare Match found for Sanji, available from another player at table 12."
    >
      <EventHeader event={PREVIEW_EVENT} />

      <div className="flex flex-col gap-2.5 p-4">
        <PreviewLabel>Your Flares</PreviewLabel>

        <MatchRow match={PREVIEW_MATCH} />

        {PREVIEW_FLARES.map((flare) => (
          <FlareRow key={flare.id} flare={flare} />
        ))}
      </div>
    </PreviewFrame>
  );
}
