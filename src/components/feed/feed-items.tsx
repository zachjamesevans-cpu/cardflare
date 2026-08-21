import Link from "next/link";
import {
  CalendarClock,
  ClipboardList,
  MapPin,
  PackageCheck,
  Layers,
  Sparkles,
  BadgeCheck,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { PostalAsk } from "@/components/feed/postal-ask";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import type { FeedItem } from "@/lib/feed/repository";

/**
 * What one item of the Feed looks like.
 *
 * Split out of the page so the presentation can be rendered from fixtures
 * without a database behind it — this is a screen judged by eye, and a
 * screen judged by eye has to be lookable-at before it ships.
 */

/**
 * When the doors open, in the store's own clock.
 *
 * A board days out needs a day and an hour and nothing else. The room's
 * formatter says "open since", which is true of an event underway and wrong
 * about every board this line is drawn for.
 */
function doorsAt(startsAt: string | null, timeZone: string): string {
  if (!startsAt) return "Taking Flares early";

  return `Doors ${new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startsAt))}`;
}

/**
 * How long ago, in the shortest true form.
 *
 * A Flare from this afternoon and one from Tuesday are different news, and
 * a full date on every row is noise. Days are the coarsest unit that
 * matters here because the item stops being shown after a week.
 */
function agoFrom(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

/**
 * How wide a card is drawn, given how many are in the row.
 *
 * The founder, looking at a lone Flare in the deployed feed: "it looks a
 * little silly to have one single card on a thing." He was right - a
 * thumbnail the size of a thumbnail, marooned in a full-width card, reads
 * as a mistake rather than as one card.
 *
 * So the art carries the weight of what is actually in the row. One card
 * gets a picture worth looking at, two or three get something in between,
 * and a deck goes back to a strip of thumbnails because at that point the
 * row is about the SIZE of the hunt rather than about any one card in it.
 *
 * Thresholds are duplicated in the app deliberately and pinned together by
 * tests/unit/app-feed-parity.test.ts: one product, one set of sizes.
 */
export function tileWidth(count: number): "lg" | "md" | "sm" {
  if (count <= 1) return "lg";
  if (count <= 3) return "md";
  return "sm";
}

const TILE_CLASS = { lg: "w-40", md: "w-24", sm: "w-14" } as const;

/** One card, at the size the feed shows cards. */
function FeedTile({
  imageUrl,
  name,
  match,
  size = "sm",
}: {
  imageUrl: string | null;
  name: string;
  size?: "lg" | "md" | "sm";
  /**
   * What the viewer's binder says, or null for nothing.
   *
   * Nullable since a friend's hunt shows cards the viewer does NOT hold
   * — seeing what a friend is chasing is the point. An unheld card is
   * drawn plain: the green ring means "you have this" everywhere in the
   * product, and a ring on a card you do not own would be a lie in the
   * one place it is loudest.
   */
  match: "exact" | "other-printing" | null;
}) {
  return (
    <span
      title={
        match === "exact"
          ? `You have ${name}`
          : match
            ? "You have another printing"
            : name
      }
      /* The board's own mark for a card you are holding, so the feed and
         the room are not two dialects of the same fact. */
      className={`relative block ${TILE_CLASS[size]} shrink-0 overflow-hidden rounded-[6px] border bg-elevated ${
        match
          ? "border-border shadow-[0_0_10px_rgba(198,238,79,0.35)] ring-2 ring-accent"
          : "border-border"
      }`}
    >
      <span className="block aspect-[60/84] w-full">
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      {match && (
        <span className="pointer-events-none absolute top-0.5 left-0.5 rounded-full bg-surface/90 p-0.5">
          {match === "exact" ? (
            <PackageCheck className="size-3 text-accent" aria-hidden="true" />
          ) : (
            <Layers className="size-3 text-accent" aria-hidden="true" />
          )}
        </span>
      )}
    </span>
  );
}

/**
 * What the two starter items say.
 *
 * Kept as data rather than two more branches below, because the pair
 * are the same card with different words in it and the shape is the
 * argument: a question, why it is worth answering, and one button.
 */
const STARTERS = {
  store: {
    icon: MapPin,
    variant: "primary",
    headline: "Where do you play?",
    body: "Join your store's room once and it saves itself here, with its next board and who is hunting what. The code is on the counter.",
    label: "Enter a store code",
    href: "/room",
  },
  deck: {
    icon: ClipboardList,
    /* Secondary, deliberately. Two accent buttons stacked is two leads
       and therefore none, and a store is the answer that makes every
       other item on this screen possible. */
    variant: "secondary",
    headline: "What are you hunting?",
    body: "Paste a deck list and every card in it becomes a want. Walk into any room and it offers to post the lot in one go.",
    label: "Paste a deck list",
    href: "/profile/settings",
  },
} as const;

export function Item({ item }: { item: FeedItem }) {
  if (item.kind === "announcement") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          {/* The mark, not a face. There is no CardFlare player and this
              is the item that has to look like it knows that. */}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border-strong bg-elevated">
            <Logo size={20} markOnly />
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-semibold text-text-primary">{item.headline}</p>
            <p className="text-xs text-text-muted">CardFlare</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary">{item.body}</p>

        {item.linkLabel && item.linkHref && (
          <Link href={item.linkHref} className={buttonStyles("secondary", "sm")}>
            {item.linkLabel}
          </Link>
        )}
      </Card>
    );
  }

  if (item.kind === "start") {
    const starter = STARTERS[item.topic];
    const Icon = starter.icon;

    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-elevated">
            <Icon className="size-5 text-accent" aria-hidden="true" />
          </span>
          <p className="min-w-0 font-semibold text-text-primary">{starter.headline}</p>
        </div>

        <p className="text-sm text-text-secondary">{starter.body}</p>

        <Link href={starter.href} className={buttonStyles(starter.variant, "sm")}>
          {starter.label}
        </Link>
      </Card>
    );
  }

  if (item.kind === "hunt") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            displayName={item.displayName}
            seed={item.playerId}
            avatarUrl={item.avatarUrl}
            frame={item.frame}
            ring={item.ring}
            size="md"
          />
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-semibold text-text-primary">
              {item.displayName}
            </p>
            <p className="truncate text-xs text-text-muted">
              {item.total === 1 ? "is hunting" : `is hunting ${item.total} cards`}
              {item.deckLabel ? ` · ${item.deckLabel}` : ""} · {item.eventName}
            </p>
          </div>
        </div>

        {/* One card reads as a card; a deck reads as a row of them. The
            founder's rule for the whole Feed: a person posting thirty
            cards is one thing that happened, not thirty. */}
        {item.total === 1 && item.cards[0] ? (
          <div className="flex items-center gap-3">
            <FeedTile
              imageUrl={item.cards[0].imageUrl}
              name={item.cards[0].cardName}
              match={item.cards[0].match}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate font-semibold text-text-primary">
                {item.cards[0].cardName}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {item.cards[0].cardNumber}
              </p>
              {item.cards[0].match && (
                <p className="text-sm font-medium text-accent">
                  {item.cards[0].match === "exact"
                    ? "You have this"
                    : "You have another printing"}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {item.cards.map((card) => (
                <FeedTile
                  key={card.cardId}
                  imageUrl={card.imageUrl}
                  name={card.cardName}
                  match={card.match}
                  size={tileWidth(item.total)}
                />
              ))}
              {item.total > item.cards.length && (
                <span className="self-center text-xs text-text-muted tabular-nums">
                  +{item.total - item.cards.length} more
                </span>
              )}
            </div>
            {item.youCanAnswer > 0 && (
              /* The line that earns the tap. Absent when it would read
                 "you can answer 0", which is not news. */
              <p className="text-sm font-medium text-accent">
                You can answer {item.youCanAnswer} of {item.total}
              </p>
            )}
          </div>
        )}

        {/* Every item ends in a place and a time. */}
        <Link href={`/e/${item.code}`} className={buttonStyles("primary", "sm")}>
          Go to {item.storeName}
        </Link>
      </Card>
    );
  }

  if (item.kind === "traded") {
    return (
      <Card className="flex items-center gap-3 p-4">
        {item.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt=""
            className="w-9 shrink-0 rounded-[4px] border border-border"
          />
        )}
        <p className="min-w-0 flex-1 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{item.requester}</span>
          {" traded for "}
          <span className="font-semibold text-text-primary">{item.cardName}</span>
          {item.holder ? (
            <>
              {" with "}
              <span className="font-semibold text-text-primary">{item.holder}</span>
            </>
          ) : null}
          {` at ${item.storeName}.`}
        </p>
      </Card>
    );
  }

  if (item.kind === "added") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            displayName={item.displayName}
            seed={item.playerId}
            avatarUrl={item.avatarUrl}
            frame={item.frame}
            ring={item.ring}
            size="md"
          />
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-semibold text-text-primary">
              {item.displayName}
            </p>
            <p className="text-xs text-text-muted">
              added {item.total} {item.total === 1 ? "card" : "cards"} to their binder
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {item.cards.map((card) => (
            <span
              key={card.cardId}
              title={card.cardName}
              /* Ringed only when it is on YOUR list — the same green the
                 board uses, for the same "this one concerns you". */
              className={`block w-14 shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated ${
                card.onYourList
                  ? "shadow-[0_0_10px_rgba(198,238,79,0.35)] ring-2 ring-accent"
                  : ""
              }`}
            >
              <span className="block aspect-[60/84] w-full">
                {card.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={card.imageUrl} alt="" className="size-full object-cover" />
                )}
              </span>
            </span>
          ))}
        </div>

        {item.onYourListCount > 0 && (
          <p className="text-sm font-medium text-accent">
            {item.onYourListCount === 1
              ? "One of these is on your want list"
              : `${item.onYourListCount} of these are on your want list`}
          </p>
        )}
      </Card>
    );
  }

  if (item.kind === "suggest") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-text-primary">Worth following</p>
          <p className="text-xs text-text-muted">
            Their binders answer what you&rsquo;re hunting.
          </p>
        </div>

        {item.players.map((person) => (
          <div key={person.playerId} className="flex items-center gap-3">
            <PlayerAvatar
              displayName={person.displayName}
              seed={person.playerId}
              avatarUrl={person.avatarUrl}
              frame={person.frame}
              ring={person.ring}
              aura={person.aura}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {person.displayName}
              </p>
              <p className="text-xs text-text-muted">
                {/* Always "wants": the list is plural even when the
                    overlap with it is one card. */}
                has {person.answers} of your wants
              </p>
            </div>
            <Link
              href={`/p/${person.playerId}`}
              className={buttonStyles("secondary", "sm")}
            >
              View
            </Link>
          </div>
        ))}
      </Card>
    );
  }

  if (item.kind === "wanted") {
    return (
      <Card className="flex flex-col gap-3 border-accent-muted/60 bg-gradient-to-b from-accent/5 to-transparent p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-lg font-semibold text-text-primary">
            {/* The number is the item. It moves on its own, which is the
                whole reason to open the app again. */}
            {item.total} {item.total === 1 ? "player wants" : "players want"} a card
            you&rsquo;re holding
          </p>
          <p className="text-xs text-text-muted">
            Bring it and it&rsquo;s a trade. They already asked.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {item.entries.map((entry) => (
            <div
              key={`${entry.playerSessionId}-${entry.card.cardId}`}
              className="flex items-center gap-3"
            >
              <FeedTile
                imageUrl={entry.card.imageUrl}
                name={entry.card.cardName}
                match={entry.card.match}
              />
              {/* Whose it is. "Who do I walk over to" is half the
                  question, and a name without a face is the half of it
                  that nobody recognises across a shop. */}
              <PlayerAvatar
                displayName={entry.displayName ?? "A player"}
                seed={entry.playerSessionId}
                avatarUrl={entry.avatarUrl}
                frame={entry.frame}
                ring={entry.ring}
                aura={entry.aura}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {entry.card.cardName}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {entry.displayName ?? "A player"} · {entry.storeName} ·{" "}
                  {agoFrom(entry.when)}
                </p>
              </div>
              <Link
                href={`/e/${entry.joinCode}`}
                className={buttonStyles("secondary", "sm")}
              >
                Go
              </Link>
            </div>
          ))}
        </div>

        {item.total > item.entries.length && (
          <p className="text-xs text-text-muted">
            +{item.total - item.entries.length} more across your stores
          </p>
        )}
      </Card>
    );
  }

  if (item.kind === "upcoming") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-accent">
            {item.storeName}
            {item.city ? ` · ${item.city}` : ""}
          </p>
          <p className="text-lg font-semibold text-text-primary">
            {/* A night on the calendar is the headline. Without one, the
                counter code is: a walk-in room has no name and needs
                none, because the answer is "whenever you like". */}
            {item.nextEventName ?? "Walk in any time"}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-text-secondary">
            <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden />
            {item.nextEventAt
              ? doorsAt(item.nextEventAt, item.timeZone)
              : "The counter code is always open"}
          </p>
        </div>

        {item.wants > 0 && (
          <p className="text-sm text-text-secondary">
            {/* What there is to do when you get there. A want list is the
                reason to walk in, and the number is the size of it. */}
            {item.wants} {item.wants === 1 ? "card" : "cards"} on your want list to ask
            about
          </p>
        )}

        <Link
          href={`/e/${item.nextEventCode ?? item.joinCode}`}
          className={buttonStyles("secondary", "sm")}
        >
          {item.nextEventCode ? "See the board" : "Open the room"}
        </Link>
      </Card>
    );
  }

  if (item.kind === "recent") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            displayName={item.displayName ?? "A player"}
            seed={item.playerSessionId}
            avatarUrl={item.avatarUrl}
            frame={item.frame}
            ring={item.ring}
            aura={item.aura}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary">
              {item.displayName ?? "A player"}
            </p>
            <p className="truncate text-xs text-text-muted">
              {/* The direction in words, never a texture: PRODUCT.md is
                  explicit that foil means rare, not available. */}
              {item.direction === "showcase" ? "Letting go of" : "Hunting"}
              {item.deckLabel ? ` · ${item.deckLabel}` : ""} · {item.storeName}
            </p>
          </div>
          <p className="shrink-0 text-xs text-text-muted">{agoFrom(item.when)}</p>
        </div>

        <div className="flex items-center gap-2">
          {item.cards.map((card) => (
            <FeedTile
              key={card.cardId}
              imageUrl={card.imageUrl}
              name={card.cardName}
              match={card.match}
              size={tileWidth(item.cards.length + item.more)}
            />
          ))}
          {item.more > 0 && (
            <p className="text-xs text-text-muted">+{item.more} more</p>
          )}
        </div>

        <Link href={`/e/${item.joinCode}`} className={buttonStyles("secondary", "sm")}>
          See the board
        </Link>
      </Card>
    );
  }

  if (item.kind === "nearbyStores") {
    /*
     * Three states, and the two empty ones are the point. A section that
     * simply vanishes when we do not know where somebody is teaches them
     * nothing; a section that asks is how anybody discovers the feature
     * exists. See nearbyStoreItems.
     */
    if (item.needsLocation) {
      return (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold text-text-primary">Find stores near you</p>
            <p className="text-xs text-text-muted">
              CardFlare knows about shops whether or not they use it yet. Tell us
              roughly where you are and we&rsquo;ll list the close ones.
            </p>
          </div>

          <PostalAsk />
        </Card>
      );
    }

    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-text-primary">Stores near you</p>
          <p className="text-xs text-text-muted">
            Shops CardFlare knows about, whether or not they use it yet.
          </p>
        </div>

        {/* Known position, nothing in range. Said out loud, because an
            empty list is indistinguishable from a broken one - and the
            way out is to change the ZIP, which needs to be right here. */}
        {item.stores.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-secondary">
              No stores near you yet. We&rsquo;re adding shops city by city.
            </p>
            {item.source === "postal" && <PostalAsk />}
          </div>
        )}

        {item.stores.map((store) => (
          <div key={store.storeId} className="flex items-center gap-3">
            <MapPin className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-text-primary">
                {store.name}
                {/* Verified is trust and Ultra is a product tier: two
                    marks, never one inferred from the other. */}
                {store.verified && (
                  <BadgeCheck
                    className="size-4 shrink-0 text-accent"
                    aria-label="CardFlare Verified"
                  />
                )}
                {store.ultra && (
                  <span className="shrink-0 rounded-full border border-border-strong px-1.5 text-[10px] font-medium tracking-wide text-text-secondary uppercase">
                    Ultra
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-text-muted">
                {store.miles} mi
                {store.city ? ` · ${store.city}` : ""}
                {store.unclaimed ? " · Unclaimed listing" : ""}
              </p>
            </div>
            <Link
              href={`/s/${store.storeId}`}
              className={buttonStyles("secondary", "sm")}
            >
              View
            </Link>
          </div>
        ))}
      </Card>
    );
  }

  if (item.kind === "pack") {
    const affordable = item.balance >= item.priceEmbers;

    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-accent">In the Embers store</p>
          <p className="text-lg font-semibold text-text-primary">{item.name}</p>
          <p className="text-sm text-text-secondary">{item.description}</p>
        </div>

        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <PackageCheck className="size-4 shrink-0 text-text-muted" aria-hidden />
          {item.priceEmbers} Embers
          {/* Only said when it changes what you can do about it. */}
          {affordable ? "" : ` · you have ${item.balance}`}
        </p>

        <Link href="/profile/store" className={buttonStyles("secondary", "sm")}>
          {affordable ? "Open a pack" : "See the store"}
        </Link>
      </Card>
    );
  }

  if (item.kind === "shop") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-text-primary">Worth spending Embers on</p>
          <p className="text-xs text-text-muted">You have {item.balance} to spend.</p>
        </div>

        {item.cosmetics.map((cosmetic) => (
          <div key={cosmetic.slug} className="flex items-center gap-3">
            <Sparkles className="size-4 shrink-0 text-text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {cosmetic.name}
              </p>
              <p className="truncate text-xs text-text-muted">{cosmetic.description}</p>
            </div>
            <p className="shrink-0 text-xs text-text-secondary">
              {cosmetic.costEmbers}
            </p>
          </div>
        ))}

        <Link href="/profile/customize" className={buttonStyles("secondary", "sm")}>
          See what you can wear
        </Link>
      </Card>
    );
  }

  /*
   * A kind this build has never heard of draws NOTHING.
   *
   * The server ships on Vercel's clock and the app on TestFlight's, so a
   * phone meets item kinds newer than itself as a matter of routine - and
   * this chain used to end in the board branch, which meant an unknown
   * kind was rendered AS a board: a card with an undefined title and a
   * button to an undefined room. That is how the website and the app came
   * to show different feeds the week the new kinds landed.
   *
   * Skipping is the only honest answer, and it is what lets the server add
   * a kind without waiting for every phone to catch up.
   */
  if (item.kind !== "board") return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        {/* A local needs no address — you drive there. A room somewhere
            you have never been is only useful with a place attached. */}
        <p className="text-sm font-medium text-accent">
          {item.storeName}
          {!item.yours && item.city ? ` · ${item.city}` : ""}
        </p>
        <p className="text-lg font-semibold text-text-primary">{item.eventName}</p>
        {/*
         * "Open now", not "Trading now": a walk-in room is itself called
         * Trading now, and the heading directly above would have said it
         * twice. And a board that has not opened yet is never "open
         * since" — the room's own formatter assumes an event underway,
         * which is exactly what an early board is not.
         */}
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden />
          {item.live ? "Open now" : doorsAt(item.startsAt, item.timeZone)}
        </p>
      </div>

      {item.youCanAnswer > 0 && (
        <>
          <p className="text-sm font-medium text-accent">
            You can answer {item.youCanAnswer}{" "}
            {item.youCanAnswer === 1 ? "card" : "cards"} on this board
          </p>
          <div className="flex gap-2">
            {item.sample.map((card) => (
              <FeedTile
                key={card.cardId}
                imageUrl={card.imageUrl}
                name={card.cardName}
                match={card.match}
              />
            ))}
          </div>
        </>
      )}

      <Link href={`/e/${item.code}`} className={buttonStyles("secondary", "sm")}>
        {item.live ? "Go to the room" : "See the board"}
      </Link>
    </Card>
  );
}
