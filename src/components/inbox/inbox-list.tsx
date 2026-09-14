import Link from "next/link";
import { Bell, Store } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { cn } from "@/lib/cn";
import type { InboxItem } from "@/lib/notifications/inbox";
import { ago, kindIcon, splitTitle } from "@/lib/notifications/inbox-row";

/**
 * The inbox's rows, the way Instagram lays its notifications out.
 *
 * The founder, with the two side by side: "make it closer to Instagram
 * where the profile avatar is shown." So each row leads with the
 * person who did it — their picture, worn ring and all, opening their
 * profile — then the sentence with their name in bold and the time
 * inline after it, then the detail line. A row with nobody behind it
 * (a board opening) leads with the kind's icon in the same slot, so
 * the column of faces stays a column.
 *
 * Two links side by side rather than one nested in another: the face
 * opens the person, the words open where it happened. The app draws
 * the same row in `mobile/src/screens/inbox.tsx`.
 */
export function InboxList({ items }: { items: InboxItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const unread = !item.readAt;
        const { lead, rest } = splitTitle(item.title, item.actor?.displayName);

        const words = (
          <>
            <p className="text-sm leading-snug">
              {lead && <span className="font-semibold text-text-primary">{lead}</span>}
              <span
                className={cn(
                  lead ? "font-normal" : "font-semibold",
                  unread ? "text-text-primary" : "text-text-secondary",
                )}
              >
                {rest}
              </span>
              <span className="text-text-muted"> {ago(item.createdAt)}</span>
            </p>
            {item.body && (
              <p className="line-clamp-2 text-sm text-text-secondary">{item.body}</p>
            )}
          </>
        );

        return (
          <li
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5",
              unread && "bg-accent/6",
            )}
          >
            {item.actor ? (
              <Link
                href={`/p/${item.actor.playerId}`}
                aria-label={`Open ${item.actor.displayName}'s profile`}
                className="shrink-0"
              >
                <PlayerAvatar
                  displayName={item.actor.displayName}
                  seed={item.actor.playerId}
                  avatarUrl={item.actor.avatarUrl}
                  frame={item.actor.frame}
                  ring={item.actor.ring}
                  aura={item.actor.aura}
                  ringArt={item.actor.ringArt}
                  auraArt={item.actor.auraArt}
                  size="md"
                />
              </Link>
            ) : (
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-text-muted"
              >
                {kindIcon(item.kind) === "store" ? (
                  <Store className="size-4" />
                ) : (
                  <Bell className="size-4" />
                )}
              </span>
            )}

            {/* Most of these happened somewhere; the words are the way
                back to it. */}
            {item.url ? (
              <Link
                href={item.url}
                className="flex min-w-0 flex-1 flex-col gap-0.5 transition-colors hover:text-text-primary"
              >
                {words}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">{words}</div>
            )}

            {unread && (
              <span
                aria-label="Unread"
                className="size-2 shrink-0 rounded-full bg-accent"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
