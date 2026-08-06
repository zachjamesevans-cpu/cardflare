import { Flame, Hand, Layers, PackageCheck, Store } from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { OpenToTradesThumbnail } from "@/components/cards/open-to-trades-card";
import {
  MarkTraded,
  OfferList,
  OfferPanel,
} from "@/components/matching/offer-controls";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { removeListEntryAction } from "@/lib/lists/actions";
import type { ListEntry } from "@/lib/lists/repository";
import { groupByPlayer, type ListKind } from "@/lib/lists/schema";
import type { MatchKind, Offer } from "@/lib/matching/schema";

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
  match,
  removable,
  counterName,
  children,
}: {
  entry: ListEntry;
  code: string;
  kind: ListKind;
  imagesEnabled: boolean;
  /**
   * How well the viewer's binder answers this Flare. Computed for this viewer
   * only and never broadcast — a Have list is a list of valuable things a
   * named person is carrying in a room full of strangers. `other-printing`
   * is said out loud rather than rounded up to "you have this": the
   * requester named a printing, and claiming the match would be guessing.
   */
  match?: MatchKind | null;
  removable: boolean;
  /**
   * The store whose synced counter stock includes this card, if any.
   * "May", never "has": the sync can be a day old, and the promise the
   * line makes is only "worth asking at the register".
   */
  counterName?: string | null;
  /** Offer controls or the offers themselves, rendered under the card. */
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <CardImageZoom
          imageUrl={entry.imageUrl}
          exactName={entry.cardName}
          cardNumber={entry.cardNumber}
          enabled={imagesEnabled}
          anyPrinting={!entry.printingId}
          caption={entry.printingLabel ?? "Any printing"}
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

          {/*
           * In the text column rather than the badge column on the right: the
           * label is long, and a shrink-proof column wide enough for "You have
           * another printing" crushes the card name into a sliver on a phone.
           */}
          {match === "exact" && (
            <span className="mt-1">
              <Badge>
                <PackageCheck className="size-3.5" aria-hidden="true" />
                You have this
              </Badge>
            </span>
          )}
          {match === "other-printing" && (
            <span className="mt-1">
              <Badge>
                <Layers className="size-3.5" aria-hidden="true" />
                You have another printing
              </Badge>
            </span>
          )}

          {counterName && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
              <Store className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              {counterName} may have this single — ask at the counter.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
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
      </div>

      {/*
       * Offers and their controls take the row's full width rather than the
       * text column's: squeezed between the card image and the Remove
       * button they went tall and skinny on a phone, which is exactly where
       * "go find them" gets read.
       */}
      {children && <div className="flex flex-col">{children}</div>}
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
 * The row a player gets when they are not after anything specific.
 *
 * Deliberately shaped exactly like a card row — same thumbnail box, same
 * columns — because it belongs in the same scan. Somebody reading the board is
 * asking "who do I go and talk to", and "this person will look at anything" is
 * a perfectly good answer to that.
 */
function OpenToTradesEntry({ isYou }: { isYou: boolean }) {
  return (
    <li className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
      <OpenToTradesThumbnail />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold text-text-primary">Open to trades</p>
        <p className="text-sm text-text-secondary">
          {isYou
            ? "Nothing specific — people can bring a binder to you."
            : "Nothing specific. Show them something good."}
        </p>
      </div>
    </li>
  );
}

/**
 * Every open Flare in the room, gathered under whoever posted it.
 *
 * The board a player reads to find someone to trade with. Until matching
 * exists this is the whole mechanism, and it works: you scan it, you recognise
 * something in your binder, you go and find them — which is easier when one
 * person's four cards sit together instead of being scattered by post time.
 *
 * Players who are open to trades appear here too, including those who have
 * posted nothing at all. They used to be invisible on the one surface everyone
 * reads, which is a poor outcome for the person most in need of being found —
 * somebody new enough that they cannot yet name what they want.
 */
export function FlareBoard({
  entries,
  code,
  imagesEnabled,
  youId,
  matches,
  offers,
  openToTrades = [],
  counterHas,
  counterName,
}: {
  entries: ListEntry[];
  code: string;
  imagesEnabled: boolean;
  youId: string;
  /** How well the viewer's binder answers each Flare, keyed by entry id. */
  matches: Map<string, MatchKind>;
  /** Standing offers on each Flare, keyed by entry id. */
  offers: Map<string, Offer[]>;
  /** Players in this room who will consider any trade. */
  openToTrades?: { playerSessionId: string; displayName: string }[];
  /** Cards the room's store has in its synced counter stock. */
  counterHas?: Set<string>;
  /** The store's name, for the "may have it" line. */
  counterName?: string;
}) {
  const openIds = new Set(openToTrades.map((player) => player.playerSessionId));
  const groups = groupByPlayer(entries);
  const posted = new Set(groups.map((group) => group.playerSessionId));

  /*
   * Somebody open to trades who has also posted Flares already has a group;
   * this adds only the ones who would otherwise not be on the board.
   */
  const browsing = openToTrades.filter((player) => !posted.has(player.playerSessionId));

  if (groups.length === 0 && browsing.length === 0) {
    return (
      <Empty icon={Flame}>
        No Flares yet. Post the first one, or say you are open to trades and let people
        bring cards to you.
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => {
        const isYou = group.playerSessionId === youId;
        const answerable = group.entries.filter(
          (entry) => !isYou && matches.has(entry.id),
        ).length;
        const headingId = `flares-${group.playerSessionId}`;
        const alsoOpen = openIds.has(group.playerSessionId);

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
              {group.entries.map((entry) => {
                const match = isYou ? null : (matches.get(entry.id) ?? null);
                const entryOffers = offers.get(entry.id) ?? [];
                const ownOffer = entryOffers.find(
                  (offer) => offer.responderSessionId === youId,
                );

                return (
                  <Entry
                    key={entry.id}
                    entry={entry}
                    code={code}
                    kind="flare"
                    imagesEnabled={imagesEnabled}
                    match={match}
                    removable={isYou}
                    counterName={
                      counterHas?.has(entry.cardId) ? (counterName ?? null) : null
                    }
                  >
                    {/*
                     * Your Flare: everyone who raised a hand, each with a
                     * "we traded", plus the quiet tally for a trade that
                     * happened without an offer. Someone else's that you can
                     * answer: the hand-raising controls. Never both — you
                     * cannot offer on your own request.
                     */}
                    {isYou && entryOffers.length > 0 && (
                      <OfferList offers={entryOffers} code={code} flareId={entry.id} />
                    )}
                    {isYou && <MarkTraded code={code} flareId={entry.id} />}
                    {match && (
                      <OfferPanel code={code} flareId={entry.id} ownOffer={ownOffer} />
                    )}
                  </Entry>
                );
              })}

              {/*
               * Last, under the specific asks. Somebody has named four cards
               * and will also look at anything — the four cards are the more
               * actionable half of that.
               */}
              {alsoOpen && <OpenToTradesEntry isYou={isYou} />}
            </ul>
          </Card>
        );
      })}

      {/*
       * After everyone with a specific request. A named card is easier to act
       * on than "surprise me", so it should be what a reader hits first.
       */}
      {browsing.map((player) => {
        const isYou = player.playerSessionId === youId;
        const headingId = `open-${player.playerSessionId}`;

        return (
          <Card
            as="li"
            key={player.playerSessionId}
            className="flex flex-col gap-3 p-4"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <PlayerAvatar
                displayName={player.displayName}
                seed={player.playerSessionId}
                size="sm"
              />
              <p id={headingId} className="truncate font-semibold text-text-primary">
                {player.displayName}
                {isYou && <span className="font-normal text-text-muted"> · you</span>}
              </p>
            </div>

            <ul aria-labelledby={headingId} className="flex flex-col">
              <OpenToTradesEntry isYou={isYou} />
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
