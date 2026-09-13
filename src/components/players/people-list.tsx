import Link from "next/link";

import { PlayerAvatar } from "@/components/players/player-avatar";
import type { FollowedPlayer } from "@/lib/players/follows";

/** A list of players, each a link to their profile. */
export function PeopleList({
  people,
  empty,
}: {
  people: FollowedPlayer[];
  empty: string;
}) {
  if (people.length === 0) {
    return <p className="text-sm text-text-muted">{empty}</p>;
  }

  return (
    <ul className="flex flex-col">
      {people.map((person) => (
        <li
          key={person.playerId}
          className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0"
        >
          <PlayerAvatar
            displayName={person.displayName}
            seed={person.playerId}
            avatarUrl={person.avatarUrl}
            frame={person.frame}
            ring={person.ring}
            aura={person.aura}
            ringArt={person.ringArt}
            auraArt={person.auraArt}
            size="sm"
          />
          <Link
            href={`/p/${person.playerId}`}
            className="min-w-0 flex-1 truncate font-semibold text-text-primary underline-offset-4 hover:underline"
          >
            {person.displayName}
          </Link>
          {person.partners && (
            <span className="shrink-0 text-xs text-accent">Trade partners</span>
          )}
        </li>
      ))}
    </ul>
  );
}
