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
import { GroupView } from "@/components/lists/group-view";
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
  ownQuantity = 1,
  early = false,
  covered = false,
  remaining,
}: {
  entry: ListEntry;
  code: string;
  kind: ListKind;
  imagesEnabled: boolean;
  match?: MatchKind | null;
  removable: boolean;
  /** The hunt's coverage, one short line: "Needs 1 more" and kin. */
  pledgeLine?: string | null;
  /** Somebody else's Flare: the pledge control renders. */
  canOffer?: boolean;
  /** The viewer's pledge is already standing: filled button, editable. */
  offered?: boolean;
  /** How many the standing pledge promised. */
  ownQuantity?: number;
  early?: boolean;
  /** Every asked-for copy is pledged: dimmed and parked at the rail's end. */
  covered?: boolean;
  /** Copies still unpledged; equals the ask until someone raises a hand. */
  remaining?: number;
}) {
  /*
   * Quantity drawn instead of written — and it is the *live need*, the
   * founder's confirm: copies still unpledged render as faded layers of
   * the same card behind the art, fanned out to the RIGHT and pinned to
   * the card's bottom edge, so every card in a stack shares a baseline.
   * Sideways only, and bottom-anchored rather than merely the same
   * height: the first cut nudged the layers downward, every stacked
   * tile grew taller, and names and buttons fell out of line across the
   * rail. Three asked with one
   * pledged is a fan of two; fully pledged collapses to a single dimmed
   * card at the rail's end. Past four the layers stop being countable,
   * so ×N text returns; screen readers always get a number. The fan's
   * bleed is reserved as margin so neighbours never collide.
   */
  const visible = Math.max(remaining ?? entry.quantity, 1);
  const ghosts = Math.min(visible, 4) - 1;

  return (
    <li
      className={`relative flex w-14 shrink-0 flex-col gap-1 ${
        /* Fully covered: dimmed AND drained of colour — "taken care
           of" should read from across the room. */
        covered ? "opacity-60 grayscale" : ""
      }`}
      style={ghosts > 0 ? { marginRight: ghosts * 4 } : undefined}
    >
      <div className="relative">
        {Array.from({ length: ghosts }, (_, i) => ghosts - i).map((depth) => (
          <div
            key={depth}
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 aspect-[60/84] overflow-hidden rounded-[7px] border border-border bg-elevated opacity-40"
            style={{ transform: `translate(${depth * 4}px, 0)` }}
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
          stillNeeds={pledgeLine != null && remaining != null ? remaining : null}
          thumbClassName="w-full"
        />
        {/*
         * Every signal that used to be its own caption line lives on
         * the art as a badge now. The founder's screenshot counted the
         * handshake at three different heights in one rail — variable
         * caption stacks were the culprit, so the tile below the art is
         * a fixed grid: one name line, one caption slot, one action
         * row. Same anatomy on every tile, buttons on one line, always.
         */}
        {match && (
          <span
            aria-label={
              match === "exact" ? "You have this" : "You have another printing"
            }
            title={match === "exact" ? "You have this" : "You have another printing"}
            className="pointer-events-none absolute top-0.5 left-0.5 z-10 rounded-full bg-surface/90 p-0.5"
          >
            {match === "exact" ? (
              <PackageCheck className="size-3 text-accent" aria-hidden="true" />
            ) : (
              <Layers className="size-3 text-accent" aria-hidden="true" />
            )}
          </span>
        )}
        {entry.note && (
          <span
            aria-label="Has a note"
            className="pointer-events-none absolute top-0.5 right-0.5 z-10 rounded-full bg-surface/90 p-0.5"
          >
            <StickyNote className="size-3 text-accent" aria-hidden="true" />
          </span>
        )}
        {/* The number, right on the card — the fan draws it, this chip
            says it, and both count down together as pledges land. */}
        {visible > 1 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0.5 bottom-0.5 z-10 rounded-[4px] border border-border bg-canvas/85 px-1 text-[10px] font-bold text-text-primary tabular-nums"
          >
            ×{visible}
          </span>
        )}
      </div>

      <p className="min-h-[14px] truncate text-[11px] leading-[14px] font-semibold text-text-primary">
        {entry.cardName}
        {visible > 1 && <span className="sr-only"> ×{visible}</span>}
        {match && (
          <span className="sr-only">
            {match === "exact" ? " You have this." : " You have another printing."}
          </span>
        )}
      </p>

      {/*
       * The caption slot: exactly one line tall whether or not there is
       * a deck to name, so the action row below never drifts.
       */}
      <p className="flex min-h-[13px] items-center gap-1 text-[10px] leading-[13px] text-text-muted">
        {entry.deckLabel && (
          <>
            <Folder className="size-3 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 truncate">{entry.deckLabel}</span>
          </>
        )}
      </p>

      {/* The action row: reserved on every tile, one control per side
          of the trade. Pledging is open to anyone — no binder required,
          the founder's call — and the stepper opens over the art. */}
      <div className="h-7">
        {canOffer && (
          <QuickPledge
            code={code}
            flareId={entry.id}
            early={early}
            flareQuantity={entry.quantity}
            offered={offered}
            ownQuantity={ownQuantity}
          />
        )}
        {removable && (
          <form action={removeListEntryAction}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="entryId" value={entry.id} />
            <button
              type="submit"
              className="flex h-7 w-full items-center justify-center rounded-[6px] border border-border text-[10px] font-medium text-text-muted transition-colors hover:text-text-secondary"
            >
              Remove
            </button>
          </form>
        )}
      </div>
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

        /*
         * The carousel tile is a contact sheet with one quick action:
         * anyone can tap the handshake on somebody else's card. The
         * coverage is public — the founder's ask — so the next holder
         * knows whether a hunt still needs them.
         */
        const renderTile = (entry: ListEntry) => {
          const match = isYou ? null : (matches.get(entry.id) ?? null);
          const entryOffers = offers.get(entry.id) ?? [];
          const ownOffer = entryOffers.find(
            (offer) => offer.responderSessionId === youId,
          );
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
              canOffer={!isYou}
              offered={Boolean(ownOffer)}
              ownQuantity={ownOffer?.quantity ?? 1}
              early={early}
              covered={covered}
              remaining={remaining}
            />
          );
        };

        /*
         * The unfolded row. Your Flare: everyone who raised a hand,
         * each with a "we traded", plus the quiet tally for a trade
         * that happened without an offer. Someone else's: the pledge
         * controls, for everybody — a binder match is a hint now, not
         * a permission. Never both — you cannot offer on your own
         * request. The coverage line renders for all viewers.
         */
        const renderRow = (entry: ListEntry) => {
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

        /*
         * Fully pledged hunts park at the rail's far end, dimmed but
         * present — "taken care of" at a glance, while the bring-extras
         * crowd can still see what was asked.
         */
        const isCovered = (entry: ListEntry) => {
          const entryOffers = offers.get(entry.id) ?? [];
          return (
            entryOffers.length > 0 &&
            pledgeTally(entryOffers, entry.quantity).remaining === 0
          );
        };

        const railEntries = [...folders.flatMap((folder) => folder.entries), ...loose];

        return (
          <Card as="li" key={group.playerSessionId} className="flex flex-col gap-3 p-4">
            {/*
             * The founder's synthesis, replacing the page-wide toggle:
             * the rail is every player's default face, and the chevron
             * on their header unfolds THEM into the full stacked view.
             */}
            <GroupView
              identity={
                <span className="flex min-w-0 items-center gap-2.5">
                  <PlayerAvatar
                    displayName={group.displayName ?? "?"}
                    seed={group.playerSessionId}
                    size="sm"
                  />
                  <span
                    id={headingId}
                    className="truncate font-semibold text-text-primary"
                  >
                    {group.displayName ?? "A player"}
                    {isYou && (
                      <span className="font-normal text-text-muted"> · you</span>
                    )}
                  </span>
                </span>
              }
              meta={
                <>
                  {/*
                   * Said once for the group as well as per card. On a long
                   * board this is the line that decides who to walk over to.
                   */}
                  {answerable > 0 && (
                    <Badge>
                      You have {answerable} of {group.entries.length}
                    </Badge>
                  )}
                  <span className="text-sm text-text-muted tabular-nums">
                    {group.entries.length}{" "}
                    {group.entries.length === 1 ? "card" : "cards"}
                  </span>
                </>
              }
              rail={
                <Rail labelledBy={headingId}>
                  {[
                    ...railEntries.filter((entry) => !isCovered(entry)),
                    ...railEntries.filter(isCovered),
                  ].map(renderTile)}
                  {alsoOpen && <OpenToTradesEntry isYou={isYou} rail />}
                </Rail>
              }
              stacked={
                <div className="flex flex-col gap-3 pt-1">
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
                      <ul
                        aria-label={`Deck: ${folder.label}`}
                        className="flex flex-col"
                      >
                        {folder.entries.map(renderRow)}
                      </ul>
                    </div>
                  ))}

                  {(loose.length > 0 || alsoOpen) && (
                    <ul aria-labelledby={headingId} className="flex flex-col">
                      {loose.map(renderRow)}

                      {/*
                       * Last, under the specific asks. Somebody has named
                       * four cards and will also look at anything — the four
                       * cards are the more actionable half of that.
                       */}
                      {alsoOpen && <OpenToTradesEntry isYou={isYou} />}
                    </ul>
                  )}
                </div>
              }
            />
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
