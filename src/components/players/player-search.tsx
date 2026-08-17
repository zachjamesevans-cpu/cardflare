"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { TextInput } from "@/components/ui/controls";
import { formatHandle } from "@/lib/players/handle";

/**
 * Finding somebody by name - the founder's ask: "I can search up
 * someone by username and see their profile and follow them."
 *
 * Results appear as you type (debounced, so shop wifi is not hammered
 * per keystroke) and each row is a door to their profile page, where
 * the follow button already lives.
 */

interface FoundPlayer {
  playerId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

export function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPlayer[] | null>(null);
  const [failed, setFailed] = useState(false);

  /* The debounce, and the guard against answers landing out of order.
     Driven from the change handler, not an effect: typing is the event,
     so the event handler is where the work belongs. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setFound(null);
      setFailed(false);
      return;
    }

    const request = ++latest.current;
    timer.current = setTimeout(() => {
      void fetch(`/api/players/search?q=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`${response.status}`);
          const body = (await response.json()) as { players: FoundPlayer[] };
          if (latest.current === request) {
            setFound(body.players);
            setFailed(false);
          }
        })
        .catch(() => {
          if (latest.current === request) setFailed(true);
        });
    }, 300);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <TextInput
          value={query}
          onChange={(event) => search(event.target.value)}
          placeholder="Find a player by name or @handle"
          aria-label="Find a player by name or handle"
          className="w-full pl-9"
        />
      </label>

      {failed && (
        <p className="text-sm text-text-muted">
          The search did not go through. Try again in a moment.
        </p>
      )}

      {found && found.length === 0 && !failed && (
        <p className="text-sm text-text-muted">
          Nobody yet. Try their handle instead, or part of either.
        </p>
      )}

      {found && found.length > 0 && (
        <ul className="flex flex-col">
          {found.map((person) => (
            <li
              key={person.playerId}
              className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
            >
              <PlayerAvatar
                displayName={person.displayName}
                seed={person.playerId}
                avatarUrl={person.avatarUrl}
                frame={person.frame}
                ring={person.ring}
                aura={person.aura}
                size="sm"
              />
              {/* Both, because a result list is exactly where two
                  people called Zach turn up together and the handle is
                  the only thing that tells them apart. */}
              <Link
                href={`/p/${person.playerId}`}
                className="flex min-w-0 flex-1 flex-col underline-offset-4 hover:underline"
              >
                <span className="truncate font-semibold text-text-primary">
                  {person.displayName}
                </span>
                <span className="truncate text-xs text-text-muted">
                  {formatHandle(person.handle)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
