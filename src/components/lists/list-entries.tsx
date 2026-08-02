import { Flame, Hand, PackageCheck } from "lucide-react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { removeListEntryAction } from "@/lib/lists/actions";
import type { ListEntry } from "@/lib/lists/repository";
import { groupByPlayer, type ListKind } from "@/lib/lists/schema";

/**
 * Flare boards and Have lists.
 *
 * Server components: nothing here is interactive except removing, which is a
 * plain form posting to a Server Action, so a list of forty cards ships no
 * JavaScript at all.
 *
 * An entry is a row rather than its own card. The board groups rows under the
 * player who posted them — a busy room is a handful of people, not thirty
 * unrelated requests, and "who do I go and talk to" is the actual question.
 */

function Entry({
  entry,
  code,
  kind,
  imagesEnabled,
  youHaveIt,
  removable,
}: {
  entry: ListEntry;
  code: string;
  kind: ListKind;
  imagesEnabled: boolean;
  /**
   * The viewer holds this card. Computed for this viewer only and never
   * broadcast — a Have list is a list of valuable things a named person is
   * carrying in a room full of strangers.
   */
  youHaveIt?: boolean;
  removable: boolean;
}) {
  return (
    <li className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
      <CardThumbnail
        imageUrl={entry.imageUrl}
        exactName={entry.cardName}
        cardNumber={entry.cardNumber}
        enabled={imagesEnabled}
        anyPrinting={!entry.printingId}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
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
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {youHaveIt && (
          <Badge>
            <PackageCheck className="size-3.5" aria-hidden="true" />
            You have this
          </Badge>
        )}

        {removable && (
          <form action={removeListEntryAction}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="entryId" value={entry.id} />
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        )}
      </div>
    </li>
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
 * Every open Flare in the room, gathered under whoever posted it.
 *
 * The board a player reads to find someone to trade with. Until matching
 * exists this is the whole mechanism, and it works: you scan it, you recognise
 * something in your binder, you go and find them — which is easier when one
 * person's four cards sit together instead of being scattered by post time.
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

  const groups = groupByPlayer(entries);

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => {
        const isYou = group.playerSessionId === youId;
        const answerable = group.entries.filter(
          (entry) => !isYou && heldCardIds.has(entry.cardId),
        ).length;
        const headingId = `flares-${group.playerSessionId}`;

        return (
          <Card as="li" key={group.playerSessionId} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerAvatar
                  displayName={group.displayName ?? "?"}
                  seed={group.playerSessionId}
                  size="sm"
                />
                <p id={headingId} className="truncate font-semibold text-text-primary">
                  {group.displayName ?? "A player"}
                  {isYou && <span className="font-normal text-text-muted"> · you</span>}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/*
                 * Said once for the group as well as per card. On a long board
                 * this is the line that decides whether someone walks over.
                 */}
                {answerable > 0 && (
                  <Badge>
                    You have {answerable} of {group.entries.length}
                  </Badge>
                )}
                <span className="text-sm text-text-muted tabular-nums">
                  {group.entries.length} {group.entries.length === 1 ? "card" : "cards"}
                </span>
              </div>
            </div>

            <ul aria-labelledby={headingId} className="flex flex-col">
              {group.entries.map((entry) => (
                <Entry
                  key={entry.id}
                  entry={entry}
                  code={code}
                  kind="flare"
                  imagesEnabled={imagesEnabled}
                  youHaveIt={!isYou && heldCardIds.has(entry.cardId)}
                  removable={isYou}
                />
              ))}
            </ul>
          </Card>
        );
      })}
    </ul>
  );
}

/** One player's own binder. Never shown to anybody else. */
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
        Add what you brought with you. Only you can see this list, it follows you to
        every event, and it flags Flares here that you can answer.
      </Empty>
    );
  }

  return (
    <Card className="p-4">
      <ul className="flex flex-col">
        {entries.map((entry) => (
          <Entry
            key={entry.id}
            entry={entry}
            code={code}
            kind="have"
            imagesEnabled={imagesEnabled}
            removable
          />
        ))}
      </ul>
    </Card>
  );
}
