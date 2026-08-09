import Image from "next/image";
import {
  Flame,
  Folder,
  Hand,
  Layers,
  PackageCheck,
  StickyNote,
  Store,
} from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { OpenToTradesThumbnail } from "@/components/cards/open-to-trades-card";
import {
  MarkTraded,
  OfferList,
  OfferPanel,
  PledgeSummary,
} from "@/components/matching/offer-controls";
import { QuickPledge } from "@/components/matching/quick-pledge";
import { pledgeTally } from "@/lib/matching/schema";
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
          note={entry.note}
          lookingFor={kind === "flare" ? entry.quantity : null}
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
function OpenToTradesEntry({
  isYou,
  rail = false,
}: {
  isYou: boolean;
  /** Inside a carousel rail: fixed width, no row border. */
  rail?: boolean;
}) {
  return (
    <li
      className={
        rail
          ? "flex w-52 shrink-0 items-start gap-3 py-1"
          : "flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
      }
    >
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
 * One Flare as the carousel view shows it: a contact sheet, not a row.
 *
 * Sized so five cards share a phone's width — the founder's number, after
 * two rounds of "still too big". At this size the item is for browsing:
 * art (tap to zoom for everything else), name, count, and one-line
 * signals. Acting — offering, reading offers, confirming a trade — lives
 * in the stacked view, one tap away, same as the app.
 */
function CarouselEntry({
  entry,
  code,
  kind,
  imagesEnabled,
  match,
  removable,
  pledgeLine = null,
  canOffer = false,
  offered = false,
  early = false,
  covered = false,
}: {
  entry: ListEntry;
  code: string;
  kind: ListKind;
  imagesEnabled: boolean;
  match?: MatchKind | null;
  removable: boolean;
  /** The hunt's coverage, one short line: "Needs 1 more" and kin. */
  pledgeLine?: string | null;
  /** Somebody else's Flare and the viewer has not pledged yet. */
  canOffer?: boolean;
  /** The viewer's pledge is already standing. */
  offered?: boolean;
  early?: boolean;
  /** Every asked-for copy is pledged: dimmed and parked at the rail's end. */
  covered?: boolean;
}) {
  /*
   * "2x wanted" said without text: copies 2 through 4 render as faded
   * layers of the same card behind the art, each nudged down-right, so
   * the tile reads as a literal stack of what was asked — the founder's
   * shape. Past four the layers stop being countable, so ×N text
   * returns; screen readers always get the number either way.
   */
  const ghosts = Math.min(entry.quantity, 4) - 1;

  return (
    <li
      className={`relative flex w-14 shrink-0 flex-col gap-1 ${covered ? "opacity-60" : ""}`}
    >
      <div className={`relative ${ghosts > 0 ? "mb-1" : ""}`}>
        {Array.from({ length: ghosts }, (_, i) => ghosts - i).map((depth) => (
          <div
            key={depth}
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-[7px] border border-border bg-elevated opacity-40"
            style={{ transform: `translate(${depth * 2}px, ${depth * 2}px)` }}
          >
            {isRenderableImageUrl(entry.imageUrl) && (
              <Image
                src={entry.imageUrl}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
              />
            )}
          </div>
        ))}
        <CardImageZoom
          imageUrl={entry.imageUrl}
          exactName={entry.cardName}
          cardNumber={entry.cardNumber}
          enabled={imagesEnabled}
          anyPrinting={!entry.printingId}
          caption={entry.printingLabel ?? "Any printing"}
          note={entry.note}
          lookingFor={kind === "flare" ? entry.quantity : null}
          thumbClassName="w-full"
        />
        {/* The founder's ask: a note announces itself on the tile, and
            the zoom is where it gets read. */}
        {entry.note && (
          <span
            aria-label="Has a note"
            className="pointer-events-none absolute top-0.5 right-0.5 z-10 rounded-full bg-surface/90 p-0.5"
          >
            <StickyNote className="size-3 text-accent" aria-hidden="true" />
          </span>
        )}
      </div>

      <p className="truncate text-[11px] leading-tight font-semibold text-text-primary">
        {entry.cardName}
        {entry.quantity > 4 && (
          <span className="font-normal text-text-muted tabular-nums">
            {" "}
            ×{entry.quantity}
          </span>
        )}
        {entry.quantity > 1 && entry.quantity <= 4 && (
          <span className="sr-only"> ×{entry.quantity}</span>
        )}
      </p>

      {/*
       * The deck, said on the tile itself. A bordered chip around the
       * folder's cards read as clutter next to the plain rail — the
       * founder asked for uniform tiles, so the folder is a caption,
       * not a container. Partitioning keeps deck-mates side by side.
       */}
      {entry.deckLabel && (
        <p className="flex items-center gap-1 text-[10px] leading-tight text-text-muted">
          <Folder className="size-3 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 truncate">{entry.deckLabel}</span>
        </p>
      )}

      {match === "exact" && (
        <p className="text-[10px] leading-tight font-semibold text-accent">
          You have this
        </p>
      )}
      {match === "other-printing" && (
        <p className="text-[10px] leading-tight text-accent">Another printing</p>
      )}

      {pledgeLine && (
        <p className="text-[10px] leading-tight font-semibold text-accent">
          {pledgeLine}
        </p>
      )}

      {/*
       * The one-tap pledge, open to anyone — no binder required, the
       * founder's call. One copy, no note; the stacked view has the
       * full form for counts and where-to-find-me. While it lands, the
       * tile greys out under a spinner (the overlay anchors to this
       * li's `relative`), because a silent button reads as broken.
       */}
      {canOffer && (
        <QuickPledge
          code={code}
          flareId={entry.id}
          early={early}
          flareQuantity={entry.quantity}
        />
      )}
      {offered && (
        <p className="text-[10px] leading-tight text-text-muted">You&rsquo;re on it</p>
      )}

      {removable && (
        <form action={removeListEntryAction}>
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="entryId" value={entry.id} />
          <button
            type="submit"
            className="text-[10px] text-text-muted underline underline-offset-2 hover:text-text-secondary"
          >
            Remove
          </button>
        </form>
      )}
    </li>
  );
}

/**
 * A horizontal shelf of carousel entries with a fade on its trailing
 * edge — the founder's ask: the sixth card looked cut off rather than
 * scrollable, so the edge now visibly "continues". Half the item's
 * height, so the fade reads as a hint, not a wall.
 */
function Rail({
  children,
  ariaLabel,
  labelledBy,
}: {
  children: React.ReactNode;
  ariaLabel?: string;
  labelledBy?: string;
}) {
  return (
    <div className="relative">
      <ul
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        className="flex items-start gap-2 overflow-x-auto pb-2"
      >
        {children}
      </ul>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 h-1/2 w-8 bg-gradient-to-l from-surface to-transparent"
      />
    </div>
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
  view = "carousel",
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
  /**
   * Carousel is the browsing view and the default — every surface that
   * renders the board without asking gets the concise shape; the store
   * dashboard used to fall back to stacked with no way out.
   */
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

        const renderEntry = (entry: ListEntry) => {
          const match = isYou ? null : (matches.get(entry.id) ?? null);
          const entryOffers = offers.get(entry.id) ?? [];
          const ownOffer = entryOffers.find(
            (offer) => offer.responderSessionId === youId,
          );

          /*
           * The carousel item is a contact sheet with one quick action:
           * anyone can tap "I got it" on somebody else's card. Counts,
           * notes and confirms live in the stacked view. The coverage
           * line is public — the founder's ask — so the next holder
           * knows whether a hunt still needs them.
           */
          if (view === "carousel") {
            const { remaining } = pledgeTally(entryOffers, entry.quantity);
            const covered = entryOffers.length > 0 && remaining === 0;
            const pledgeLine =
              entryOffers.length === 0
                ? null
                : covered
                  ? entry.quantity > 1
                    ? `All ${entry.quantity} spoken for`
                    : "Spoken for"
                  : `Needs ${remaining} more`;

            return (
              <CarouselEntry
                key={entry.id}
                entry={entry}
                code={code}
                kind="flare"
                imagesEnabled={imagesEnabled}
                match={match}
                removable={isYou}
                pledgeLine={pledgeLine}
                canOffer={!isYou && !ownOffer}
                offered={Boolean(ownOffer)}
                early={early}
                covered={covered}
              />
            );
          }

          /*
           * Your Flare: everyone who raised a hand, each with a
           * "we traded", plus the quiet tally for a trade that
           * happened without an offer. Someone else's: the pledge
           * controls, for everybody — a binder match is a hint now,
           * not a permission. Never both — you cannot offer on your
           * own request. The coverage line renders for all viewers.
           */
          return (
            <Entry
              key={entry.id}
              entry={entry}
              code={code}
              kind="flare"
              imagesEnabled={imagesEnabled}
              match={match}
              removable={isYou}
              counterName={counterHas?.has(entry.cardId) ? (counterName ?? null) : null}
            >
              <PledgeSummary offers={entryOffers} asked={entry.quantity} />
              {isYou && entryOffers.length > 0 && (
                <OfferList
                  offers={entryOffers}
                  code={code}
                  flareId={entry.id}
                  early={early}
                />
              )}
              {isYou && <MarkTraded code={code} flareId={entry.id} />}
              {!isYou && (
                <OfferPanel
                  code={code}
                  flareId={entry.id}
                  ownOffer={ownOffer}
                  early={early}
                  flareQuantity={entry.quantity}
                />
              )}
            </Entry>
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

            {/*
             * Carousel: ONE rail per player, every tile the same shape —
             * the founder asked for the folder's cards to look exactly
             * like the loose ones. The partition keeps a deck's cards
             * side by side, and each of them names its deck in its own
             * caption. Stacked keeps the header-then-rows shape.
             */}
            {view === "carousel" ? (
              <Rail labelledBy={headingId}>
                {(() => {
                  /*
                   * Fully pledged hunts park at the rail's far end, dimmed
                   * but present — "taken care of" at a glance, while the
                   * bring-extras crowd can still see what was asked.
                   */
                  const isCovered = (entry: ListEntry) => {
                    const entryOffers = offers.get(entry.id) ?? [];
                    return (
                      entryOffers.length > 0 &&
                      pledgeTally(entryOffers, entry.quantity).remaining === 0
                    );
                  };

                  const rail = [
                    ...folders.flatMap((folder) => folder.entries),
                    ...loose,
                  ];

                  return [
                    ...rail.filter((entry) => !isCovered(entry)),
                    ...rail.filter(isCovered),
                  ].map(renderEntry);
                })()}
                {alsoOpen && <OpenToTradesEntry isYou={isYou} rail />}
              </Rail>
            ) : (
              <>
                {folders.map((folder) => (
                  <div
                    key={folder.label.toLowerCase()}
                    className="flex flex-col gap-1.5"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                      <Folder
                        className="size-4 shrink-0 text-accent"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">{folder.label}</span>
                      <span className="shrink-0 font-normal text-text-muted tabular-nums">
                        · {folder.entries.length}{" "}
                        {folder.entries.length === 1 ? "card" : "cards"}
                      </span>
                    </p>
                    <ul aria-label={`Deck: ${folder.label}`} className="flex flex-col">
                      {folder.entries.map(renderEntry)}
                    </ul>
                  </div>
                ))}

                {(loose.length > 0 || alsoOpen) && (
                  <ul aria-labelledby={headingId} className="flex flex-col">
                    {loose.map(renderEntry)}

                    {/*
                     * Last, under the specific asks. Somebody has named four
                     * cards and will also look at anything — the four cards
                     * are the more actionable half of that.
                     */}
                    {alsoOpen && <OpenToTradesEntry isYou={isYou} />}
                  </ul>
                )}
              </>
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
