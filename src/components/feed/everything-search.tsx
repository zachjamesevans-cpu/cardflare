"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Clock, Search } from "lucide-react";

import {
  readRecent,
  recentKey,
  withRecent,
  writeRecent,
} from "@/components/feed/recent-searches";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { TextInput } from "@/components/ui/controls";
import { searchCardsAction } from "@/lib/cards/actions";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { pickBasePrinting, type CardResult } from "@/lib/cards/schema";
import { cn } from "@/lib/cn";
import { gameShortName } from "@/lib/players/games-catalog";
import { formatHandle } from "@/lib/players/handle";
import {
  matchScore,
  rankBy,
  readQuery,
  SEARCH_TABS,
  TOP_LIMITS,
  topOrder,
  type SearchTab,
  type TopSection,
} from "@/lib/search/rank";
import { searchStoresAction } from "@/lib/stores/search-actions";
import type { FoundStore } from "@/lib/stores/search";

/**
 * One search for everything, from the Feed.
 *
 * One field, and four tabs under it: Top, Players, Cards, Stores
 * (SEARCH_TABS, shared with the app). The founder: "When I search for
 * someone named Luffy as a username, a bunch of Luffy cards pop up,
 * with the username being all the way at the bottom." So every list is
 * ranked by how well it matches (src/lib/search/rank.ts), and Top puts
 * a player or store whose name IS the search, or starts with it, above
 * the cards. Top shows a few of each (TOP_LIMITS) with "See all", which
 * is the tab. A search starting "@" asks for players and nothing else.
 *
 * Before anything is typed, the recent searches on this device, newest
 * first, with a Clear. A search is remembered when a result is opened
 * or the field is submitted, the way Instagram's is, so half-typed
 * words never fill the list.
 *
 * Searching as you type, after two characters and a short pause, with
 * the asks sent together and the answers landing together, so the tabs
 * never show a card for one word and a player for the last. An ask that
 * fails is an empty section, not a broken page. The profile keeps its
 * own player search (player-search.tsx); the app's Search screen is
 * this component, drawn the same.
 */

/** The player search's row, as the API serves it. */
interface FoundPlayer {
  playerId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

/**
 * A card result, with the game it belongs to once the catalogue says
 * so. The row leads with the game's short name; a result without one
 * leaves the line at the number.
 */
type SearchCard = CardResult & { game?: string | null };

interface Found {
  /** What was asked, without the "@". */
  text: string;
  cards: SearchCard[];
  players: FoundPlayer[];
  stores: FoundStore[];
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

async function findCards(query: string): Promise<SearchCard[]> {
  const response = await searchCardsAction(query);
  return response.status === "ok" ? response.results : [];
}

async function findPlayers(query: string): Promise<FoundPlayer[]> {
  const response = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { players: FoundPlayer[] };
  return body.players;
}

/** Each ask on its own: one failing must not empty the others. */
const quietly = <T,>(ask: Promise<T[]>): Promise<T[]> => ask.catch(() => []);
const none = <T,>(): Promise<T[]> => Promise.resolve([]);

/* How each kind is matched: players by name and handle, stores by
   name, cards by name and number. */
const playerScore = (text: string) => (person: FoundPlayer) =>
  matchScore(text, [person.displayName, person.handle]);
const storeScore = (text: string) => (store: FoundStore) =>
  matchScore(text, [store.name]);
const cardScore = (text: string) => (card: SearchCard) =>
  matchScore(text, [card.exactName, card.canonicalCardNumber]);

const best = <T,>(items: T[], score: (item: T) => number) =>
  items.reduce((top, item) => Math.max(top, score(item)), 0);

export function EverythingSearch({ account = null }: { account?: string | null }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [tab, setTab] = useState<SearchTab>("top");

  /* This component only mounts on a tap (FeedSearch opens it), so the
     device's list is read on the client, never during a server render. */
  const storageKey = recentKey(account);
  const [recent, setRecent] = useState<string[]>(() => readRecent(storageKey));

  /* The debounce, and the guard against answers landing out of order.
     Driven from the change handler, not an effect: typing is the event,
     so the event handler is where the work belongs. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const { playersOnly } = readQuery(query);
  /* "@" is a players search, whichever tab was open. */
  const shown: SearchTab = playersOnly ? "players" : tab;

  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);

    const { text, playersOnly: onlyPlayers } = readQuery(value);
    if (text.length < MIN_CHARS) {
      latest.current++;
      setFound(null);
      return;
    }

    const request = ++latest.current;
    timer.current = setTimeout(() => {
      void Promise.all([
        onlyPlayers ? none<SearchCard>() : quietly(findCards(text)),
        quietly(findPlayers(text)),
        onlyPlayers ? none<FoundStore>() : quietly(searchStoresAction(text)),
      ]).then(([cards, players, stores]) => {
        if (latest.current !== request) return;
        setFound({
          text,
          cards: rankBy(cards, cardScore(text)),
          players: rankBy(players, playerScore(text)),
          stores: rankBy(stores, storeScore(text)),
        });
      });
    }, DEBOUNCE_MS);
  };

  const remember = (value: string) => {
    const next = withRecent(recent, value);
    setRecent(next);
    writeRecent(storageKey, next);
  };

  const clearRecent = () => {
    setRecent([]);
    writeRecent(storageKey, []);
  };

  /* The sections a tab draws, in order, and how many rows of each. */
  const sections: { kind: TopSection; limit?: number }[] =
    shown === "top"
      ? found
        ? topOrder(
            best(found.players, playerScore(found.text)),
            best(found.stores, storeScore(found.text)),
          ).map((kind) => ({ kind, limit: TOP_LIMITS[kind] }))
        : []
      : [{ kind: shown }];

  const nothing =
    found !== null && sections.every(({ kind }) => found[kind].length === 0);

  const typing = query.trim() !== "";

  /** One section, or nothing when it has no rows. */
  const section = (kind: TopSection, limit?: number) => {
    if (!found) return null;
    const rows = found[kind];
    const more =
      limit !== undefined && rows.length > limit ? () => setTab(kind) : undefined;
    const opened = () => remember(query);
    const top = shown === "top";

    switch (kind) {
      case "cards": {
        const cards = found.cards.slice(0, limit);
        return (
          found.cards.length > 0 && (
            <Section key={kind} heading="Cards" visible={top} onSeeAll={more}>
              {cards.map((card) => {
                const art = pickBasePrinting(card.printings, card.exactName)?.imageUrl;
                return (
                  <li key={card.id} className="border-t border-border first:border-t-0">
                    <Link
                      href={`/cards/${card.id}`}
                      onClick={opened}
                      className="flex items-center gap-3 py-2.5 underline-offset-4 hover:underline"
                    >
                      {/* The art thumb: the row's shape held whether or not
                          a picture exists, so the list never reflows. */}
                      <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[4px] border border-border bg-elevated">
                        {isRenderableImageUrl(art) && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={art} alt="" className="size-full object-cover" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold text-text-primary">
                          {card.exactName}
                        </span>
                        <span className="truncate text-xs text-text-muted">
                          {card.canonicalCardNumber}
                          {card.game && (
                            <>
                              <span aria-hidden="true"> · </span>
                              {gameShortName(card.game)}
                            </>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </Section>
          )
        );
      }

      case "players": {
        const players = found.players.slice(0, limit);
        return (
          found.players.length > 0 && (
            <Section key={kind} heading="Players" visible={top} onSeeAll={more}>
              {players.map((person) => (
                <li
                  key={person.playerId}
                  className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
                >
                  <PlayerAvatar
                    displayName={person.displayName}
                    seed={person.playerId}
                    avatarUrl={person.avatarUrl}
                    frame={person.frame}
                    ring={person.ring}
                    aura={person.aura}
                    size="sm"
                  />
                  {/* Both, because a result list is exactly where two
                      people called Zach turn up together and the handle
                      is the only thing that tells them apart. */}
                  <Link
                    href={`/p/${person.playerId}`}
                    onClick={opened}
                    className="flex min-w-0 flex-1 flex-col underline-offset-4 hover:underline"
                  >
                    <span className="truncate font-semibold text-text-primary">
                      {person.displayName}
                    </span>
                    <span className="truncate text-xs text-text-muted">
                      {formatHandle(person.handle)}
                    </span>
                  </Link>
                </li>
              ))}
            </Section>
          )
        );
      }

      case "stores": {
        const stores = found.stores.slice(0, limit);
        return (
          found.stores.length > 0 && (
            <Section key={kind} heading="Stores" visible={top} onSeeAll={more}>
              {stores.map((store) => (
                <li
                  key={store.storeId}
                  className="border-t border-border first:border-t-0"
                >
                  <Link
                    href={`/s/${store.storeId}`}
                    onClick={opened}
                    className="flex min-w-0 flex-col py-2.5 underline-offset-4 hover:underline"
                  >
                    <span className="flex items-center gap-1.5 truncate font-semibold text-text-primary">
                      {store.name}
                      {store.verified && <VerifiedMark className="size-4" />}
                    </span>
                    {(store.city || store.region) && (
                      <span className="truncate text-xs text-text-muted">
                        {[store.city, store.region].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </Section>
          )
        );
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (readQuery(query).text.length >= MIN_CHARS) remember(query);
        }}
      >
        <label className="relative block">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <TextInput
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder="Search cards, players and stores"
            aria-label="Search cards, players and stores"
            autoFocus
            enterKeyHint="search"
            className="w-full pl-9"
          />
        </label>
      </form>

      {/* Before typing: what this device searched for last. */}
      {!typing && recent.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
              Recent
            </h2>
            <button
              type="button"
              onClick={clearRecent}
              className="text-sm font-semibold text-accent hover:text-accent-hover"
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-col">
            {recent.map((item) => (
              <li key={item} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  onClick={() => search(item)}
                  className="flex w-full items-center gap-3 py-2.5 text-left text-text-primary underline-offset-4 hover:underline"
                >
                  <Clock
                    className="size-4 shrink-0 text-text-muted"
                    aria-hidden="true"
                  />
                  <span className="truncate">{item}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top · Players · Cards · Stores, once there is something to sort. */}
      {typing && (
        <div
          role="tablist"
          aria-label="Search results"
          className="flex border-b border-border"
        >
          {SEARCH_TABS.map(({ id, label }) => {
            const on = shown === id;
            const off = playersOnly && id !== "players";
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                disabled={off}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px flex-1 border-b-2 py-2 text-sm font-semibold transition-colors disabled:opacity-40",
                  on
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-secondary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {nothing && <p className="text-sm text-text-muted">Nothing for that yet.</p>}

      {sections.map(({ kind, limit }) => section(kind, limit))}
    </div>
  );
}

/**
 * One section of results: the heading, its rows, and "See all" when
 * Top is holding some back. The heading is drawn on Top only; under a
 * tab it would repeat the tab's own name, so it is there for screen
 * readers alone.
 */
function Section({
  heading,
  visible,
  onSeeAll,
  children,
}: {
  heading: string;
  visible: boolean;
  onSeeAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <div
        className={cn("flex items-center justify-between gap-3", !visible && "sr-only")}
      >
        <h2 className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
          {heading}
        </h2>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-sm font-semibold text-accent hover:text-accent-hover"
          >
            See all
          </button>
        )}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}
