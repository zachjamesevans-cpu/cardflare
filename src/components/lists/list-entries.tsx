import Image from "next/image";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Flame,
  Folder,
  Hand,
  Layers,
  PackageCheck,
  Search,
  StickyNote,
  Store,
} from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { isRenderableImageUrl } from "@/lib/cards/images";
import {
  MarkTraded,
  OfferList,
  OfferPanel,
  PledgeSummary,
} from "@/components/matching/offer-controls";
import { GroupView } from "@/components/lists/group-view";
import { QuickPledge } from "@/components/matching/quick-pledge";
import { pledgeTally } from "@/lib/matching/schema";
import { OpenToTradesTag } from "@/components/players/open-to-trades-tag";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerPeek } from "@/components/players/player-peek";
import type { CosmeticArtFileRef } from "@/components/players/cosmetic-art";
import { Badge, Card } from "@/components/ui/card";
import { Rail } from "@/components/lists/rail";
import { RemoveEntry } from "@/components/lists/remove-entry";
import type { ListEntry } from "@/lib/lists/repository";
import {
  acceptsLabel,
  groupByPlayer,
  partitionByDeck,
  partitionByIntent,
  type ListKind,
} from "@/lib/lists/schema";
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
  pledges = [],
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
  /** Who has raised a hand, shown by name in the large view. */
  pledges?: { name: string; quantity: number }[];
  /** Offer controls or the offers themselves, rendered under the card. */
  children?: React.ReactNode;
}) {
  return (
    /* `relative` so Remove's pending veil covers the whole row. */
    <li className="relative flex flex-col border-t border-border py-3 first:border-t-0 first:pt-0">
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
          direction={entry.intent}
          terms={acceptsLabel(entry)}
          pledges={pledges}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/*
           * Remove sits *in* the name's line, not in a column beside it.
           * As its own column the two boxes were aligned by their tops,
           * which is not where either one's text is: the founder's
           * screenshot caught "Yamato" and "Remove" a few pixels apart,
           * and a list of them read as crooked. One flex row on a shared
           * baseline cannot drift, whatever either font does.
           */}
          <div className="flex items-baseline gap-x-2">
            <p className="min-w-0 font-semibold text-text-primary">{entry.cardName}</p>
            {entry.quantity > 1 && (
              <span className="shrink-0 text-sm text-text-muted tabular-nums">
                ×{entry.quantity}
              </span>
            )}
            {removable && (
              <RemoveEntry
                code={code}
                kind={kind}
                entryId={entry.id}
                variant="row"
                className="ml-auto shrink-0"
              />
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
          {/*
           * Direction is said once, by the section this row sits in,
           * rather than on every row inside it. What is left worth
           * saying per card is the terms — and only when they are not
           * the plain trade the board has always assumed.
           */}
          {acceptsLabel(entry) && (
            <span className="mt-1">
              <Badge tone="accent">
                <Banknote className="size-3.5" aria-hidden="true" />
                {acceptsLabel(entry)}
              </Badge>
            </span>
          )}

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

/**
 * The seam in a player's rail where the direction turns around.
 *
 * The founder's revision of the two-rail layout: almost everything on a
 * board is a want, so a whole labelled shelf for one or two showcases
 * cluttered every section that had any. The cards on offer now sit at
 * the far end of the same rail instead, past this divider — a rule and
 * the words, turned on their side so they cost twenty pixels instead
 * of a row.
 */
function RailDivider() {
  return (
    <li className="flex shrink-0 items-stretch gap-1.5 self-stretch py-0.5 pr-0.5">
      <span aria-hidden="true" className="w-px bg-border" />
      <span className="flex items-center text-[10px] font-medium tracking-wide whitespace-nowrap text-accent [writing-mode:vertical-rl]">
        Letting go
      </span>
    </li>
  );
}

/**
 * A labelled run of cards pointing the same way.
 *
 * The founder's correction to the first cut, and the right one: foil
 * says "rare", not "available", so a texture can never carry the
 * direction of a trade. Words can. Every card on the board now sits
 * under a heading that states which way it points, which also means a
 * tile needs no decoration of its own to be unambiguous.
 *
 * Rendered only when a player has both directions in play. Somebody
 * hunting four cards and offering none — nearly everyone — sees no
 * headings at all, because there is nothing to disambiguate.
 */
function DirectionHeading({
  direction,
  count,
}: {
  direction: "want" | "showcase";
  count: number;
}) {
  const Icon = direction === "showcase" ? ArrowUpRight : Search;

  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
      <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
      <span>{direction === "showcase" ? "Letting go" : "Looking for"}</span>
      <span className="font-normal text-text-muted tabular-nums">
        · {count} {count === 1 ? "card" : "cards"}
      </span>
    </p>
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
 *
 * Players who are open to trades appear here too, including those who have
 * posted nothing at all. They used to be invisible on the one surface everyone
 * reads, which is a poor outcome for the person most in need of being found —
 * somebody new enough that they cannot yet name what they want.
 */
/**
 * The carousel tile's art box, in pixels: `w-14` at the card's 60:84
 * ratio. Tailwind resolves the same two numbers from the classes; they
 * are written out here because the pending veil has to land on the card
 * exactly, and "roughly the card" is what the founder sent back.
 */
const TILE_ART_WIDTH = 56;
const TILE_ART_HEIGHT = (TILE_ART_WIDTH * 84) / 60;

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
  pledges = [],
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
  /** Who has raised a hand, shown by name in the large view. */
  pledges?: { name: string; quantity: number }[];
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
   * the same card behind the art, fanned out to the RIGHT so every card
   * in the stack shares one bottom edge.
   *
   * The wrapper below is `flex` for exactly that reason, and it is not
   * cosmetic. A `<button>` is inline-block, so a plain block wrapper
   * reserves descender space under it — measured at six pixels — and
   * anything positioned against the wrapper (these layers, the count
   * chip, the note badge) sat six pixels below the card it belonged to.
   * A flex container has no line box, so the wrapper is exactly the
   * card and everything anchored to it lands on the card's own edges. Three asked with one
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
      {/*
       * A green ring on a card you are holding.
       *
       * The founder replaced the "You have 2 of 6" badge with this:
       * "the cards you have will be highlighted with a green ring
       * around them." A count told you there was something to find; a
       * ring on the card IS the finding, and it survives being glanced
       * at across a table in a way a sentence does not.
       */}
      <div
        className={`relative flex rounded-[9px] ${
          match ? "shadow-[0_0_10px_rgba(198,238,79,0.35)] ring-2 ring-accent" : ""
        }`}
      >
        {Array.from({ length: ghosts }, (_, i) => ghosts - i).map((depth) => (
          <div
            key={depth}
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-[7px] border border-border bg-elevated opacity-40"
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
          direction={entry.intent}
          stillNeeds={pledgeLine != null && remaining != null ? remaining : null}
          terms={acceptsLabel(entry)}
          pledges={pledges}
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
          <RemoveEntry
            code={code}
            kind={kind}
            entryId={entry.id}
            variant="tile"
            cover={{
              width: TILE_ART_WIDTH + ghosts * 4,
              height: TILE_ART_HEIGHT,
              cardWidth: TILE_ART_WIDTH,
            }}
          />
        )}
      </div>
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
  identities,
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
  /**
   * Who each session is, beside their name: their picture and their
   * lifetime Ember badge.
   *
   * A map keyed by session rather than fields on the entry, because
   * these are facts about the person and not about the card — putting
   * them on every Flare would repeat one number a dozen times down a
   * section and invite the copies to drift apart. Sessions with no
   * account are simply absent, which leaves a guest with initials and
   * no badge.
   */
  identities?: Map<
    string,
    {
      embersEarned: number;
      avatarUrl: string | null;
      frame: string | null;
      /** The catalogue ring, worn over the frame when both are set. */
      ring: string | null;
      /** The avatar effect floating around the picture. */
      aura: string | null;
      /** The dropped-in files behind those two, when they are Rive ones. */
      ringArt: CosmeticArtFileRef | null;
      auraArt: CosmeticArtFileRef | null;
      /** The account behind the session, for the profile popup. */
      playerId: string | null;
    }
  >;
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
        const headingId = `flares-${group.playerSessionId}`;
        const alsoOpen = openIds.has(group.playerSessionId);

        /*
         * A player's section splits into deck folders and loose cards.
         * The fourteen cards of an "RG Luffy" hunt read as one named
         * thing instead of burying the rest of the board; a card wanted
         * on its own stays a plain row below the folders.
         */
        /*
         * Showcases come out first and stay out. They are the opposite
         * statement to a Flare — "I have this" against "I need this" —
         * and reading the two as one list is how somebody walks over
         * about a card the owner was trying to get rid of.
         */
        const { showcases, wants } = partitionByIntent(group.entries);
        const { folders, loose } = partitionByDeck(wants);

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

          /* Names travel with the card: the tile draws coverage as a
             stack, and the zoom is where "by whom?" gets answered. */
          const pledges = entryOffers.map((offer) => ({
            name: offer.displayName ?? "A player",
            quantity: offer.quantity,
          }));

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
              pledges={pledges}
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
              pledges={entryOffers.map((offer) => ({
                name: offer.displayName ?? "A player",
                quantity: offer.quantity,
              }))}
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

        /*
         * Fully pledged hunts park at the far end of whichever rail
         * they belong to, dimmed but present.
         */
        /*
         * Cards you can answer come first.
         *
         * The founder's revision, replacing the "You have 2 of 6"
         * badge: "all cards you have will automatically sort to the
         * leftmost portion of the carousel." A rail you can only read
         * the front of should open on the part that concerns you, and
         * the green ring then says which without a sentence.
         *
         * Covered hunts still park at the far end whatever else is
         * true: those are settled, and settled outranks interesting.
         */
        const held = (entry: ListEntry) => !isYou && matches.has(entry.id);

        const inTileOrder = (list: ListEntry[]) => [
          ...list.filter((entry) => !isCovered(entry) && held(entry)),
          ...list.filter((entry) => !isCovered(entry) && !held(entry)),
          ...list.filter(isCovered),
        ];

        const wantEntries = [...folders.flatMap((folder) => folder.entries), ...loose];

        /*
         * Headings appear only when a player has cards pointing both
         * ways. The overwhelming majority are hunting and offering
         * nothing, and labelling a single list "Looking for" is
         * furniture — but a lone showcase with no heading would read
         * as a want, which is the one mistake this must never make.
         */
        const labelled = showcases.length > 0;

        return (
          <Card as="li" key={group.playerSessionId} className="flex flex-col gap-3 p-4">
            {/*
             * The founder's synthesis, replacing the page-wide toggle:
             * the rail is every player's default face, and the chevron
             * on their header unfolds THEM into the full stacked view.
             */}
            <GroupView
              identity={
                /*
                 * Picture on the left, name and status stacked beside
                 * it. Inline they competed for one line and a real
                 * username lost - the founder: "can't even see a full
                 * username anymore". Stacked, the name gets the width.
                 */
                <span id={headingId} className="flex min-w-0 flex-1 items-center gap-3">
                  {/*
                   * An account opens the profile popup right here on the
                   * board — the founder's ask: finding somebody's name
                   * under "who's here" was the only way in, and the
                   * board is where their name actually comes up. Guests
                   * stay plain: no profile, no dead button.
                   */}
                  {identities?.get(group.playerSessionId)?.playerId ? (
                    <PlayerPeek
                      playerId={identities.get(group.playerSessionId)!.playerId!}
                      displayName={group.displayName ?? "A player"}
                      seed={group.playerSessionId}
                      avatarUrl={
                        identities.get(group.playerSessionId)?.avatarUrl ?? null
                      }
                      frame={identities.get(group.playerSessionId)?.frame ?? null}
                      ring={identities.get(group.playerSessionId)?.ring ?? null}
                      aura={identities.get(group.playerSessionId)?.aura ?? null}
                      ringArt={identities.get(group.playerSessionId)?.ringArt ?? null}
                      auraArt={identities.get(group.playerSessionId)?.auraArt ?? null}
                      isYou={isYou}
                      imagesEnabled={imagesEnabled}
                      nameClassName="text-lg font-semibold"
                      size="lg"
                      className="min-w-0 flex-1"
                      /* Under the NAME, in the column beside the picture. */
                      below={alsoOpen ? <OpenToTradesTag /> : null}
                    />
                  ) : (
                    <>
                      <PlayerAvatar
                        displayName={group.displayName ?? "?"}
                        seed={group.playerSessionId}
                        avatarUrl={
                          identities?.get(group.playerSessionId)?.avatarUrl ?? null
                        }
                        frame={identities?.get(group.playerSessionId)?.frame ?? null}
                        ring={identities?.get(group.playerSessionId)?.ring ?? null}
                        aura={identities?.get(group.playerSessionId)?.aura ?? null}
                        ringArt={
                          identities?.get(group.playerSessionId)?.ringArt ?? null
                        }
                        auraArt={
                          identities?.get(group.playerSessionId)?.auraArt ?? null
                        }
                        /*
                         * lg, and the third size this component has had
                         * on this one row. The founder's mockup settles
                         * it: the picture anchors the header, and a
                         * worn ring is most of why anybody bought one.
                         */
                        size="lg"
                      />
                      {/* The same column a peekable player gets, by hand,
                          because a guest has no profile to open. */}
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                        <span className="max-w-full truncate text-lg font-semibold text-text-primary">
                          {group.displayName ?? "A player"}
                          {isYou && (
                            <span className="text-base font-normal text-text-muted">
                              {" "}
                              · you
                            </span>
                          )}
                        </span>
                        {alsoOpen && <OpenToTradesTag />}
                      </span>
                    </>
                  )}
                  {/*
                   * "Open to trades" is on the name, not in the list. It
                   * is a fact about the person, and as a row it cost this
                   * player's whole section to say one short sentence.
                   *
                   * It sits UNDER the name and left-aligned with it,
                   * which took three reports to get right: it is passed
                   * into the identity block rather than placed after it,
                   * because anything placed after the block wraps beneath
                   * the PICTURE and reads as a caption on the avatar.
                   */}
                  {/* No Ember badge on board headers - in the room,
                      Embers live inside the popup and profile only. */}
                </span>
              }
              meta={
                <>
                  <span className="text-sm whitespace-nowrap text-text-muted tabular-nums">
                    {group.entries.length}{" "}
                    {group.entries.length === 1 ? "card" : "cards"}
                  </span>
                </>
              }
              rail={
                /*
                 * One rail per player, whatever they are doing. Wants
                 * lead, and anything on offer sits past the divider at
                 * the far end — the founder's revision: nearly all of a
                 * board is wants, and a labelled shelf for one showcase
                 * cluttered every section that had one.
                 */
                <Rail labelledBy={headingId}>
                  {inTileOrder(wantEntries).map(renderTile)}
                  {showcases.length > 0 && (
                    <>
                      <RailDivider />
                      {inTileOrder(showcases).map(renderTile)}
                    </>
                  )}
                </Rail>
              }
              stacked={
                <div className="flex flex-col gap-3 pt-1">
                  {/*
                   * Cards on offer, which the first cut left out of this
                   * view entirely — unfolding a player hid the very
                   * cards they were trying to move.
                   */}
                  {showcases.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <DirectionHeading direction="showcase" count={showcases.length} />
                      <ul
                        aria-label="Cards this player is letting go"
                        className="flex flex-col"
                      >
                        {showcases.map(renderRow)}
                      </ul>
                    </div>
                  )}

                  {labelled && wantEntries.length > 0 && (
                    <DirectionHeading direction="want" count={wantEntries.length} />
                  )}

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

                  {loose.length > 0 && (
                    <ul aria-labelledby={headingId} className="flex flex-col">
                      {loose.map(renderRow)}
                    </ul>
                  )}
                </div>
              }
            />
          </Card>
        );
      })}

      {/*
       * Everyone who is here for a trade but has named nothing, in one
       * block rather than a section each.
       *
       * They used to get a full card apiece, which meant a room of five
       * browsers pushed every actual Flare off the screen. They still
       * have to be findable — somebody new enough that they cannot name
       * a card is exactly who most needs to be found — but "who is up
       * for anything" is one answer to one question, so it reads as one
       * line of names.
       *
       * Last, after the specific asks: a named card is easier to act on
       * than "surprise me", so it should be what a reader hits first.
       */}
      {browsing.length > 0 && (
        <Card as="li" className="flex flex-col gap-2.5 p-4">
          <p
            id="open-to-trades-heading"
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary"
          >
            <ArrowLeftRight
              className="size-4 shrink-0 text-accent"
              aria-hidden="true"
            />
            Open to any trade
            <span className="font-normal text-text-muted tabular-nums">
              · {browsing.length}
            </span>
          </p>

          <ul
            aria-labelledby="open-to-trades-heading"
            className="flex flex-wrap gap-x-4 gap-y-2"
          >
            {browsing.map((player) => (
              <li
                key={player.playerSessionId}
                className="flex min-w-0 items-center gap-1.5"
              >
                <PlayerAvatar
                  displayName={player.displayName}
                  seed={player.playerSessionId}
                  size="sm"
                />
                <span className="min-w-0 truncate text-sm text-text-primary">
                  {player.displayName}
                  {player.playerSessionId === youId && (
                    <span className="font-normal text-text-muted"> · you</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
