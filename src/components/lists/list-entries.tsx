import { Flame, Hand, PackageCheck } from "lucide-react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cancelListEntryAction } from "@/lib/lists/actions";
import type { ListEntry } from "@/lib/lists/repository";

/**
 * Flare boards and Have lists.
 *
 * Server components: nothing here is interactive except cancelling, which is a
 * plain form posting to a Server Action, so a list of forty cards ships no
 * JavaScript at all.
 */

function Entry({
  entry,
  code,
  imagesEnabled,
  showWho,
  youHaveIt,
  cancellable,
}: {
  entry: ListEntry;
  code: string;
  imagesEnabled: boolean;
  /** Flares are public and name their owner. Have lists are private. */
  showWho: boolean;
  /**
   * The viewer holds this card. Computed for this viewer only and never
   * broadcast — a Have list is a list of valuable things a named person is
   * carrying in a room full of strangers.
   */
  youHaveIt?: boolean;
  cancellable: boolean;
}) {
  return (
    <Card as="li" className="flex items-start gap-3 p-4">
      <CardThumbnail
        imageUrl={entry.imageUrl}
        exactName={entry.cardName}
        cardNumber={entry.cardNumber}
        enabled={imagesEnabled}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="font-semibold text-text-primary">{entry.cardName}</p>
          {entry.quantity > 1 && (
            <span className="text-sm text-text-muted tabular-nums">
              ×{entry.quantity}
            </span>
          )}
        </div>

        <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-text-muted">
          <span>{entry.cardNumber}</span>
          {/* Said explicitly, because "any printing" is a real answer to a
              question the other player is about to ask. */}
          <span className="font-sans">{entry.printingLabel ?? "Any printing"}</span>
        </p>

        {entry.note && (
          <p className="text-sm text-text-secondary italic">{entry.note}</p>
        )}

        {showWho && entry.displayName && (
          <div className="mt-0.5 flex items-center gap-2">
            <PlayerAvatar
              displayName={entry.displayName}
              seed={entry.playerSessionId}
              size="sm"
            />
            <span className="text-sm text-text-secondary">{entry.displayName}</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {youHaveIt && (
          <Badge>
            <PackageCheck className="size-3.5" aria-hidden="true" />
            You have this
          </Badge>
        )}

        {cancellable && (
          <form action={cancelListEntryAction}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="entryId" value={entry.id} />
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function Empty({ icon: Icon, children }: { icon: typeof Flame; children: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon className="size-6 text-text-muted" aria-hidden="true" />
      <p className="max-w-sm text-text-secondary">{children}</p>
    </Card>
  );
}

/**
 * Every open Flare in the room.
 *
 * The board a player reads to find someone to trade with. Until matching
 * exists this is the whole mechanism, and it works: you scan it, you recognise
 * something in your binder, you go and find them.
 */
export function FlareBoard({
  entries,
  code,
  imagesEnabled,
  youId,
  heldCardIds,
}: {
  entries: ListEntry[];
  code: string;
  imagesEnabled: boolean;
  youId: string;
  heldCardIds: Set<string>;
}) {
  if (entries.length === 0) {
    return (
      <Empty icon={Flame}>
        No Flares yet. Post the first one and everyone here will see it.
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <Entry
          key={entry.id}
          entry={entry}
          code={code}
          imagesEnabled={imagesEnabled}
          showWho
          youHaveIt={heldCardIds.has(entry.cardId) && entry.playerSessionId !== youId}
          cancellable={entry.playerSessionId === youId}
        />
      ))}
    </ul>
  );
}

/** One player's own Have list. Never shown to anybody else. */
export function HaveList({
  entries,
  code,
  imagesEnabled,
}: {
  entries: ListEntry[];
  code: string;
  imagesEnabled: boolean;
}) {
  if (entries.length === 0) {
    return (
      <Empty icon={Hand}>
        Add what you brought with you. Only you can see this list — it is used to flag
        when someone here is looking for a card you have.
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <Entry
          key={entry.id}
          entry={entry}
          code={code}
          imagesEnabled={imagesEnabled}
          showWho={false}
          cancellable
        />
      ))}
    </ul>
  );
}
