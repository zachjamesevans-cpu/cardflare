import { Flame, Folder, Hand, Layers, PackageCheck, Store } from "lucide-react";

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
import { groupByPlayer, partitionByDeck, type ListKind } from "@/lib/lists/schema";
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
              {counterName} may have this single. Ask at the counter.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {removable && (
            <form action={removeListEntryAction}>
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="entryId" value={entry.id} />
              {/*
               * Negative margins swallow the ghost button's own padding so
               * its label sits flush with the card's right edge (level with
               * the "N cards" count above) and on the card name's first
               * line. The touch target keeps its full size — only the box's
               * position moves, not its dimensions.
               */}
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="-mt-1.5 -mr-3.5"
              >
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
            ? "Nothing specific, so people can bring a binder to you."
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
/**
 * One Flare as the carousel view shows it: art first, everything else
 * beneath, sized so a player's thirty cards read as one swipeable rail
 * instead of thirty rows. Every control the stacked row has is here,
 * in the same order; only the geometry changes, exactly like switching
 * icon views in a file browser.
 */
function CarouselEntry({
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
  match?: MatchKind | null;
  removable: boolean;
  counterName?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex w-28 shrink-0 flex-col gap-1.5">
      <CardImageZoom
        imageUrl={entry.imageUrl}
        exactName={entry.cardName}
        cardNumber={entry.cardNumber}
        enabled={imagesEnabled}
        anyPrinting={!entry.printingId}
        caption={entry.printingLabel ?? "Any printing"}
        thumbClassName="w-full"
      />

      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-text-primary">
          {entry.cardName}
        </p>
        {entry.quantity > 1 && (
          <span className="shrink-0 text-xs text-text-muted tabular-nums">
            ×{entry.quantity}
          </span>
        )}
      </div>

      <p className="truncate text-xs text-text-muted">
        {entry.printingLabel ?? "Any printing"}
      </p>

      {entry.note && (
        <p className="truncate text-xs text-text-secondary italic">{entry.note}</p>
      )}

      {match === "exact" && (
        <span>
          <Badge>
            <PackageCheck className="size-3.5" aria-hidden="true" />
            You have this
          </Badge>
        </span>
      )}
      {match === "other-printing" && (
        <span>
          <Badge>
            <Layers className="size-3.5" aria-hidden="true" />
            Another printing
          </Badge>
        </span>
      )}

      {counterName && (
        <p className="flex items-center gap-1 text-xs text-text-secondary">
          <Store className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
          At the counter, maybe
        </p>
      )}

      {removable && (
        <form action={removeListEntryAction}>
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="entryId" value={entry.id} />
          <button
            type="submit"
            className="text-xs text-text-muted underline underline-offset-4 hover:text-text-secondary"
          >
            Remove
          </button>
        </form>
      )}

      {children && <div className="flex flex-col text-sm">{children}</div>}
    </li>
  );
}

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
  early = false,
  view = "stacked",
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
  /** Early board: offers read as pledges to bring the card. */
  early?: boolean;
  /** Stacked is the reading view; carousel is the browsing view. */
  view?: "stacked" | "carousel";
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

        /*
         * A player's section splits into deck folders and loose cards.
         * The fourteen cards of an "RG Luffy" hunt read as one named
         * thing instead of burying the rest of the board; a card wanted
         * on its own stays a plain row below the folders.
         */
        const { folders, loose } = partitionByDeck(group.entries);

        const listClass =
          view === "carousel" ? "flex gap-3 overflow-x-auto pb-2" : "flex flex-col";

        const renderEntry = (entry: ListEntry) => {
          const match = isYou ? null : (matches.get(entry.id) ?? null);
          const entryOffers = offers.get(entry.id) ?? [];
          const ownOffer = entryOffers.find(
            (offer) => offer.responderSessionId === youId,
          );

          /*
           * Your Flare: everyone who raised a hand, each with a
           * "we traded", plus the quiet tally for a trade that
           * happened without an offer. Someone else's that you can
           * answer: the hand-raising controls. Never both — you
           * cannot offer on your own request. The same controls ride
           * both layouts; a view change must never change what a
           * player can do.
           */
          const controls = (
            <>
              {isYou && entryOffers.length > 0 && (
                <OfferList
                  offers={entryOffers}
                  code={code}
                  flareId={entry.id}
                  early={early}
                />
              )}
              {isYou && <MarkTraded code={code} flareId={entry.id} />}
              {match && (
                <OfferPanel
                  code={code}
                  flareId={entry.id}
                  ownOffer={ownOffer}
                  early={early}
                />
              )}
            </>
          );

          const Row = view === "carousel" ? CarouselEntry : Entry;

          return (
            <Row
              key={entry.id}
              entry={entry}
              code={code}
              kind="flare"
              imagesEnabled={imagesEnabled}
              match={match}
              removable={isYou}
              counterName={counterHas?.has(entry.cardId) ? (counterName ?? null) : null}
            >
              {controls}
            </Row>
          );
        };

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

            {folders.map((folder) => (
              <div key={folder.label.toLowerCase()} className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                  <Folder className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 truncate">{folder.label}</span>
                  <span className="shrink-0 font-normal text-text-muted tabular-nums">
                    · {folder.entries.length}{" "}
                    {folder.entries.length === 1 ? "card" : "cards"}
                  </span>
                </p>
                <ul aria-label={`Deck: ${folder.label}`} className={listClass}>
                  {folder.entries.map(renderEntry)}
                </ul>
              </div>
            ))}

            {(loose.length > 0 || alsoOpen) && (
              <ul aria-labelledby={headingId} className={listClass}>
                {loose.map(renderEntry)}

                {/*
                 * Last, under the specific asks. Somebody has named four cards
                 * and will also look at anything — the four cards are the more
                 * actionable half of that.
                 */}
                {alsoOpen && <OpenToTradesEntry isYou={isYou} />}
              </ul>
            )}
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
