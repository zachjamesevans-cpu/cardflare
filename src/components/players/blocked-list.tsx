"use client";

import Link from "next/link";
import { useState } from "react";

import { UnblockButton } from "@/components/players/block-controls";
import { formatHandle } from "@/lib/players/handle";

export interface BlockedPerson {
  playerId: string;
  displayName: string;
  handle: string | null;
}

/**
 * The people this player has blocked, on Settings.
 *
 * A row is the name, the handle and a way back. A block is taken on a
 * profile; this is the one place to see them all and let one go. The
 * row leaves the list the moment the server agrees.
 */
export function BlockedList({ people }: { people: BlockedPerson[] }) {
  const [rows, setRows] = useState(people);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Nobody. Blocking somebody on their profile puts them here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {rows.map((person) => (
        <li
          key={person.playerId}
          className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
        >
          <Link
            href={`/p/${person.playerId}`}
            className="flex min-w-0 flex-col underline-offset-4 hover:underline"
          >
            <span className="truncate text-sm font-semibold text-text-primary">
              {person.displayName}
            </span>
            {person.handle && (
              <span className="truncate text-xs text-text-muted">
                {formatHandle(person.handle)}
              </span>
            )}
          </Link>
          <UnblockButton
            playerId={person.playerId}
            className="shrink-0"
            onDone={() =>
              setRows((current) =>
                current.filter((row) => row.playerId !== person.playerId),
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
