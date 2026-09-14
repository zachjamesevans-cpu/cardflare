"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPin, MessageCircle } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { buttonStyles } from "@/components/ui/button";
import { haveThisAction } from "@/lib/nearby/actions";
import type { NearbyMatch } from "@/lib/nearby/matching";
import { cn } from "@/lib/cn";

/**
 * One nearby match on the Feed: who, which card, how far, two buttons.
 *
 * "I have this" opens the conversation with the first message already
 * sent; "Message" opens it with the box empty. Both land on the
 * Messages page with that thread open. Once a thread exists the row
 * says so and offers only the way back to it.
 */
export function MatchRow({
  match,
  tile,
}: {
  match: NearbyMatch;
  /** The card's picture, drawn by the server with the feed's own tile. */
  tile: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (storeName: string | null, message: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await haveThisAction(
        match.ask,
        storeName,
        message ? "message" : "have",
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/local?thread=${encodeURIComponent(result.threadId)}`);
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        {tile}
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <PlayerAvatar
            displayName={match.wanter.displayName}
            seed={match.wanter.playerId}
            avatarUrl={match.wanter.avatarUrl}
            frame={match.wanter.frame}
            ring={match.wanter.ring}
            aura={match.wanter.aura}
            ringArt={match.wanter.ringArt}
            auraArt={match.wanter.auraArt}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug text-text-primary">
              <span className="font-semibold">{match.wanter.displayName}</span> is
              looking for your{" "}
              <span className="font-semibold">{match.card.cardName}</span>
            </p>
            <p className="flex items-center gap-1 text-xs text-text-muted">
              <MapPin className="size-3.5" aria-hidden="true" />
              {match.milesLabel}
              {match.card.match === "other-printing" && " · You have another printing"}
            </p>
          </div>
        </div>
      </div>

      {match.threadId ? (
        <button
          type="button"
          onClick={() =>
            router.push(`/local?thread=${encodeURIComponent(match.threadId ?? "")}`)
          }
          className={cn(buttonStyles("secondary", "sm"), "self-start")}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Open the conversation
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => open(null, false)}
            className={cn(buttonStyles("primary", "sm"), "flex-1")}
          >
            {pending ? "Opening…" : "I have this"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => open(null, true)}
            className={cn(buttonStyles("secondary", "sm"), "flex-1")}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Message {match.wanter.displayName.split(" ")[0]}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
