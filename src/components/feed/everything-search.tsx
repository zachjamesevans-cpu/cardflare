"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { TextInput } from "@/components/ui/controls";
import { searchCardsAction } from "@/lib/cards/actions";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { pickBasePrinting, type CardResult } from "@/lib/cards/schema";
import { gameShortName } from "@/lib/players/games-catalog";
import { formatHandle } from "@/lib/players/handle";
import { searchStoresAction } from "@/lib/stores/search-actions";
import type { FoundStore } from "@/lib/stores/search";

/**
 * One search for everything, from the Feed.
 *
 * One field, and three sections under it: the cards that match, the
 * players, the stores, each drawn only when it has rows and always in
 * that order. The Feed's search used to find players and nothing else,
 * so a card's name typed there found nobody; now the same field opens
 * the card's page, a profile or a shop, whichever the word was. The
 * profile keeps its own player search (player-search.tsx), because
 * somebody managing who they follow is already standing there. The
 * app's Search screen is this component, drawn the same.
 *
 * Searching as you type, after two characters and a short pause, with
 * the three asks sent together and the answers landing together, so
 * the sections never show a card for one word and a player for the
 * last. An ask that fails is an empty section, not a broken page.
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

/** Each ask on its own: one failing must not empty the other two. */
const quietly = <T,>(ask: Promise<T[]>): Promise<T[]> => ask.catch(() => []);

export function EverythingSearch() {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);

  /* The debounce, and the guard against answers landing out of order.
     Driven from the change handler, not an effect: typing is the event,
     so the event handler is where the work belongs. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);

    const trimmed = value.trim();
    if (trimmed.length < MIN_CHARS) {
      setFound(null);
      return;
    }

    const request = ++latest.current;
    timer.current = setTimeout(() => {
      void Promise.all([
        quietly(findCards(trimmed)),
        quietly(findPlayers(trimmed)),
        quietly(searchStoresAction(trimmed)),
      ]).then(([cards, players, stores]) => {
        if (latest.current === request) setFound({ cards, players, stores });
      });
    }, DEBOUNCE_MS);
  };

  const nothing =
    found !== null &&
    found.cards.length === 0 &&
    found.players.length === 0 &&
    found.stores.length === 0;

  return (
    <div className="flex flex-col gap-3">
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
          className="w-full pl-9"
        />
      </label>

      {nothing && <p className="text-sm text-text-muted">Nothing for that yet.</p>}

      {found && found.cards.length > 0 && (
        <Section heading="Cards">
          {found.cards.map((card) => {
            const art = pickBasePrinting(card.printings, card.exactName)?.imageUrl;
            return (
              <li key={card.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/cards/${card.id}`}
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
      )}

      {found && found.players.length > 0 && (
        <Section heading="Players">
          {found.players.map((person) => (
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
                  people called Zach turn up together and the handle is
                  the only thing that tells them apart. */}
              <Link
                href={`/p/${person.playerId}`}
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
      )}

      {found && found.stores.length > 0 && (
        <Section heading="Stores">
          {found.stores.map((store) => (
            <li key={store.storeId} className="border-t border-border first:border-t-0">
              <Link
                href={`/s/${store.storeId}`}
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
      )}
    </div>
  );
}

/** One section of results: the heading, and its rows. */
function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
        {heading}
      </h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}
