import "server-only";

import { showingAnnouncements } from "@/lib/announcements/repository";
import { findEventByJoinCode } from "@/lib/events/repository";
import { listRoomFlares, type ListEntry } from "@/lib/lists/repository";
import { listBinder } from "@/lib/lists/repository";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { listFollowing } from "@/lib/players/follows";
import { listLocals, listOpenStores, type LocalStore } from "@/lib/players/locals";
import { heldByCard, matchFor, type MatchKind } from "@/lib/matching/schema";
import { listCosmetics, ownedCosmetics, ownsCosmetic } from "@/lib/players/cosmetics";
import { listWants } from "@/lib/players/wants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * The Feed: the room's question asked from a sofa.
 *
 * A board tells you who has a card tonight, in this shop. This tells you the
 * same thing on a Tuesday — a board opening at your store on Friday with four
 * cards on it you are holding, and which of the people you follow are the ones
 * asking.
 *
 * Everything here is DERIVED. Nothing is authored, nobody posts to it, and
 * that is deliberate: a pilot with six players would otherwise open an empty
 * feed on its first day, which teaches "nothing happens here" more effectively
 * than having no feed at all. See PRODUCT.md.
 *
 * One flare read per board serves both item kinds below, because they are the
 * same fact at two sizes: what a whole board owes you, and which person it was.
 */

/** How many of a player's stores are worth pulling a board for. */
const LOCALS_SHOWN = 4;

/** Cards shown on a board item before it stops listing and starts counting. */
const BOARD_SAMPLE = 4;

/**
 * Cards shown on one friend's hunt. A deck is thirty; a Feed row is not.
 *
 * Four, the same as a board's sample, because that is what fits on ONE
 * line at phone width beside the "+N more" that follows it. Six wrapped,
 * leaving a lone tile on a second row with the count stranded next to
 * it — untidy in exactly the way the founder keeps catching.
 */
const HUNT_SAMPLE = 4;

/** How far back "just added" and "traded recently" reach. */
const RECENT_DAYS = 7;

/** Cards named on one "added to their binder" item before it counts instead. */
const ADDED_SAMPLE = 3;

/** Players suggested at once. A list of ten is a chore, not a suggestion. */
const SUGGESTIONS = 3;

/**
 * Rooms shown from stores the player has never been to.
 *
 * The day-one answer. Every other item on this screen is personalised —
 * a friend's hunt, a saved store's board, a trade where you play — so on
 * a new account they all return nothing and the Feed teaches "nothing
 * happens here" on the one render that decides whether anybody comes
 * back. A room open tonight is news whether or not we have been told
 * anything about the person reading it.
 *
 * Three, and below your own stores rather than above them: this is what
 * the Feed falls back on, not what it is for.
 */
const OPEN_ANYWHERE = 3;

/**
 * Recent Flares: how many rows to read, how many groups to show, and how
 * many cards to name inside one.
 *
 * Read wide and show narrow, because the read is grouped afterwards: one
 * pasted deck can be thirty rows and is one item, so a limit set at the
 * number of ITEMS wanted would return a single deck and call it a feed.
 */
const RECENT_READ = 120;

/**
 * "Wanted from you": how many of the reader's cards to ask about, how
 * many matching Flares to read, and how many to name in the item.
 *
 * A synced collection can be thousands of cards and Postgres has to be
 * handed that list, so the ask is capped - the newest Flares against the
 * first slice is a good answer, and a perfect one is not worth a query
 * that grows with somebody's binder.
 */
const WANTED_CARDS_ASKED = 400;
const WANTED_READ = 60;
const WANTED_SHOWN = 4;
const RECENT_SHOWN = 4;
const RECENT_SAMPLE = 4;

/** Cosmetics named in the shop item. Three is a look; twelve is a catalogue. */
const SHOP_SAMPLE = 3;

interface CardFacts {
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
}

/**
 * Names, numbers and art for a set of cards.
 *
 * The board items get theirs free, because a Flare already carries them.
 * Everything derived from `trades` and `player_cards` holds a card id and
 * nothing else, so this is the one place that turns ids into something a
 * person can read. One printing per card is enough: the feed shows the art,
 * not the edition.
 */
async function cardFacts(cardIds: string[]): Promise<Map<string, CardFacts>> {
  const facts = new Map<string, CardFacts>();
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return facts;

  const admin = getSupabaseAdmin();

  const [cards, printings] = await Promise.all([
    admin.from("cards").select("id, exact_name, canonical_card_number").in("id", ids),
    admin.from("card_printings").select("card_id, image_url").in("card_id", ids),
  ]);

  const art = new Map<string, string>();
  for (const row of printings.data ?? []) {
    if (row.image_url && !art.has(row.card_id)) art.set(row.card_id, row.image_url);
  }

  for (const row of cards.data ?? []) {
    facts.set(row.id, {
      cardName: row.exact_name,
      cardNumber: row.canonical_card_number,
      imageUrl: art.get(row.id) ?? null,
    });
  }

  return facts;
}

export interface FeedCard {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  /**
   * What the viewer's own binder says about it, or null for nothing.
   *
   * Nullable since a friend's hunt shows cards the viewer does NOT hold
   * — that is the point of seeing what a friend is chasing. A board's
   * sample only ever carries matches, and still does.
   */
  match: MatchKind | null;
}

export interface BoardItem {
  kind: "board";
  code: string;
  storeName: string;
  /**
   * Where the shop is, for a board at a store the player has never been
   * to. One of your own locals needs no address — you drive there — but
   * "a room is open right now" is only useful with a place attached.
   */
  city: string | null;
  /** True when this is one of the player's own stores. */
  yours: boolean;
  eventName: string;
  /** Open now, or a board taking Flares ahead of doors. */
  live: boolean;
  startsAt: string | null;
  /** The store's clock, so "Friday 7pm" means their Friday and not UTC. */
  timeZone: string;
  /** Flares on this board that the viewer's own binder answers. */
  youCanAnswer: number;
  sample: FeedCard[];
}

/**
 * What somebody you follow is hunting, in one item.
 *
 * ONE per person per posting action, not one per card. A player building
 * a deck posts thirty Flares in a sitting, and the first cut turned that
 * into thirty separate items from the same face — the founder's words:
 * "I don't want all of those notifications to show up as separate posts
 * or notifications in the feed."
 *
 * It also appears when the viewer holds NONE of it. The earlier version
 * only surfaced cards your own binder could answer, which quietly meant
 * you could not see what your friends were chasing unless you happened
 * to own it. "You can see which friends are looking for which cards" is
 * the founder's ask, and `youCanAnswer` carries the actionable part
 * without hiding the rest.
 */
export interface HuntItem {
  kind: "hunt";
  code: string;
  storeName: string;
  eventName: string;
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  /** The hunt's name, when they gave it one ("Red Luffy"). */
  deckLabel: string | null;
  /** Every card in this batch, the ones the viewer holds first. */
  cards: FeedCard[];
  /** How many they posted, which can exceed what is shown. */
  total: number;
  /** How many of them the viewer's own binder answers. */
  youCanAnswer: number;
}

/**
 * A trade that happened, at one of your stores.
 *
 * The only purely social item, and it costs nothing to produce: the trades
 * table already records every confirmed one. It is also the best advert a
 * store has, because it names a place and a night somebody actually got
 * something.
 */
export interface TradedItem {
  kind: "traded";
  storeName: string;
  eventName: string;
  requester: string;
  holder: string | null;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  confirmedAt: string;
}

/** Somebody you follow put cards in their binder. */
export interface AddedItem {
  kind: "added";
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  total: number;
  cards: (CardFacts & { cardId: string; onYourList: boolean })[];
  /** How many of them you are hunting. The reason to read the item. */
  onYourListCount: number;
}

/**
 * People worth following, because their binder answers your list.
 *
 * The thing a general social product cannot do. Follow suggestions elsewhere
 * are a guess; here they are a query, which is why the Feed does not have the
 * cold-start problem that kills small social products. See PRODUCT.md.
 */
export interface SuggestionItem {
  kind: "suggest";
  players: {
    playerId: string;
    displayName: string;
    avatarUrl: string | null;
    /** How many cards on your want list they are carrying. */
    answers: number;
  }[];
}

/**
 * A notice from CardFlare.
 *
 * The only authored item on the Feed, and the only one that is not a
 * player: it wears the mark rather than a face, and there is nothing to
 * follow or unfollow. The founder floated an official CardFlare account
 * instead — "everyone has one following when they first load the app" —
 * and this is deliberately not that. A CardFlare row in `players` would
 * be a fake person on a screen where every other face belongs to
 * somebody who stood in a shop.
 *
 * It carries its own expiry in the database, so it leaves without
 * anybody remembering to take it down.
 */
export interface AnnouncementItem {
  kind: "announcement";
  id: string;
  headline: string;
  body: string;
  linkLabel: string | null;
  /** A path on our own origin. The database refuses anything else. */
  linkHref: string | null;
}

/**
 * The two things the Feed cannot derive until the player tells it
 * something.
 *
 * Both appear only while the answer is missing and vanish the moment it
 * arrives, so this is not onboarding bolted to the top of a screen —
 * it is the screen saying which of its own questions it cannot answer
 * yet. A player with a local and a want list never sees either.
 */
export interface StartItem {
  kind: "start";
  /** `store` when they have no locals, `deck` when they have no wants. */
  topic: "store" | "deck";
}

/**
 * Open Flares, anywhere, that the reader's own collection answers.
 *
 * THE ITEM THE FEED WAS MISSING, and the reason it read as a log of
 * strangers' cards. Nine of the eleven kinds before this one were a
 * record of an event: true, inert, and identical whether you own the
 * card or have never heard of the person. This one is a fact about the
 * READER, it changes on its own, and its only resolution is a trade.
 *
 * It costs nobody anything to produce. The collection is already synced
 * and already private - "matched quietly in every room and never
 * listed" - so demand for somebody's cards is computable the moment they
 * have a binder, with no have-list to publish and no extra input at all.
 *
 * Deliberately NOT limited to recent, unlike `recent` items: a Flare
 * somebody posted a fortnight ago is still a card they want and you
 * still have it. What ages out is the room, not the wanting.
 */
export interface WantedItem {
  kind: "wanted";
  /** Everything your binder answers, which may exceed what is listed. */
  total: number;
  entries: {
    playerSessionId: string;
    displayName: string | null;
    avatarUrl: string | null;
    storeName: string;
    joinCode: string;
    when: string;
    card: FeedCard;
  }[];
}

/**
 * A store you have saved, with something to come.
 *
 * THE ITEM THAT ANSWERS A TUESDAY. Every other board item requires a room
 * to be open now or a board already taking Flares, which on a pilot-size
 * roster is true on perhaps two evenings a week. Measured on the founder's
 * own account - a saved store, a want list, nothing live - the whole Feed
 * came back empty, which is the one thing PRODUCT.md says it may not be.
 *
 * So a store is news before it is live. A night on the calendar is "bring
 * it Friday", which is the spec's own example of place and time; a counter
 * code with nothing scheduled is "walk in whenever you like", which is what
 * a Counter Code is for. Only ever for stores NOT already shown as a live
 * board above, so a shop never appears twice.
 */
export interface UpcomingItem {
  kind: "upcoming";
  storeId: string;
  storeName: string;
  city: string | null;
  /** The permanent counter code, for walking in without a QR. */
  joinCode: string;
  /** The next scheduled night, when the calendar has one. */
  nextEventAt: string | null;
  nextEventName: string | null;
  nextEventCode: string | null;
  /** The store's clock, so "Friday 7pm" is their Friday and not UTC's. */
  timeZone: string;
  /** True when the store takes walk-ins on its counter code. */
  walkIn: boolean;
  /** How many cards are on your want list — what there is to go and ask for. */
  wants: number;
}

/**
 * A Flare somebody posted lately, wherever they posted it.
 *
 * The founder, asking for this by name: "maybe most recent flares from
 * people". The board items only ever show a room that is OPEN, so a card
 * posted at a shop on Friday is invisible by Saturday morning even though
 * the person is still looking for it. This is the same fact without the
 * requirement that the room still be running.
 *
 * One row per person per store per day, so a player working through a
 * deck arrives as one answer to "who do I walk over to, and about what"
 * rather than as one row per card.
 */
export interface RecentItem {
  kind: "recent";
  /** Stable per group: the batch, or the first flare's id. */
  id: string;
  playerSessionId: string;
  displayName: string | null;
  avatarUrl: string | null;
  storeName: string;
  city: string | null;
  joinCode: string;
  /** When it was posted. */
  when: string;
  /** Which way the card points, the board's own word. */
  direction: "want" | "showcase";
  /** The named hunt this belonged to, when it had one. */
  deckLabel: string | null;
  cards: FeedCard[];
  /** Cards in the group beyond the ones named. */
  more: number;
}

/**
 * A pack in the shop, and the Embers to open it with.
 *
 * Evergreen: true with nobody else in the product, which is the whole
 * reason it is here. See PRODUCT.md's round-two note - it sits below
 * everything derived, it is capped at one, and it never displaces a room.
 */
export interface PackItem {
  kind: "pack";
  slug: string;
  name: string;
  description: string;
  priceEmbers: number;
  artUrl: string | null;
  /** What the reader has to spend, so the item knows if it is reachable. */
  balance: number;
}

/**
 * Cosmetics worth a look, with what they cost.
 *
 * PRODUCT.md names this as one of three reasons the Feed earns its place:
 * "a player buys a ring today and three people at a counter notice. Rings,
 * showcases and Embers only make sense where people look at each other,
 * and the Feed is that place." Until there are people to notice, the Feed
 * is at least where they are seen.
 */
export interface ShopItem {
  kind: "shop";
  cosmetics: {
    slug: string;
    name: string;
    description: string;
    /** ring, aura, border, and the rest - the section it lives under. */
    family: string;
    costEmbers: number;
  }[];
  balance: number;
}

export type FeedItem =
  | AnnouncementItem
  | WantedItem
  | BoardItem
  | HuntItem
  | UpcomingItem
  | RecentItem
  | TradedItem
  | AddedItem
  | PackItem
  | ShopItem
  | SuggestionItem
  | StartItem;

/**
 * What the reader has to spend.
 *
 * Only the two evergreen items use it, and only to say whether the thing
 * they are showing is reachable today: an item that offers a pack somebody
 * cannot afford is an advert, and one that knows the difference is a
 * suggestion.
 */
async function embersBalance(playerId: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("embers_balance")
    .eq("id", playerId)
    .maybeSingle();

  return data?.embers_balance ?? 0;
}

/**
 * Which part of the screen an item belongs to.
 *
 * The order was always an argument - things that go stale above things
 * that do not - and it was invisible, so the Feed read as one flat pile.
 * Naming the argument turns the same list into a screen somebody can
 * scan, and it means a quiet week reads as "nothing on tonight" rather
 * than as an empty app.
 */
export type FeedSection = "wanted" | "tonight" | "people" | "store";

/** The heading each section is drawn under, on both platforms. */
export const SECTION_TITLES: Record<FeedSection, string> = {
  wanted: "Wanted from you",
  tonight: "Tonight",
  people: "People you follow",
  store: "New in the store",
};

function sectionFor(item: FeedItem): FeedSection {
  switch (item.kind) {
    case "wanted":
      return "wanted";
    case "announcement":
    case "board":
    case "upcoming":
    case "start":
      return "tonight";
    case "hunt":
    case "recent":
    case "added":
    case "traded":
    case "suggest":
      return "people";
    default:
      return "store";
  }
}

/**
 * Why this item is on this person's screen.
 *
 * The founder: "seeing a bunch of random cards posted just doesn't feel
 * great." A feed that explains itself stops feeling arbitrary even when
 * it is thin, and every one of these reasons was already known at the
 * moment the item was built - it was simply never said out loud.
 *
 * Written as a fragment rather than a sentence, because it is drawn as a
 * quiet line under the row and not as prose.
 */
function reasonFor(item: FeedItem): string {
  switch (item.kind) {
    case "wanted":
      return "Because these are in your collection";
    case "announcement":
      return "From CardFlare";
    case "board":
      return item.yours ? "At a store you saved" : "A room open right now";
    case "upcoming":
      return "At a store you saved";
    case "hunt":
    case "added":
      return "Because you follow them";
    case "recent":
      return `Posted at ${item.storeName}`;
    case "traded":
      return "At a store you go to";
    case "suggest":
      return "Their binders answer your wants";
    case "pack":
    case "shop":
      return "Yours to spend Embers on";
    case "start":
      return "The Feed cannot answer this one for you";
  }
}

/** One item, with the two things the screen needs to place it. */
export type FeedEntry = FeedItem & { section: FeedSection; reason: string };

/** ISO for "this many days ago", the cut both recent items share. */
function since(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Trades confirmed lately at the stores this player goes to.
 *
 * Deliberately the whole store rather than only people they follow: the point
 * of the item is that Friday is worth turning up to, and a stranger's trade
 * says that as well as a friend's does.
 */
async function tradedItems(storeIds: string[]): Promise<TradedItem[]> {
  if (storeIds.length === 0) return [];
  const admin = getSupabaseAdmin();

  const { data: events } = await admin
    .from("events")
    .select("id, name, store_id")
    .in("store_id", storeIds);

  const byEvent = new Map((events ?? []).map((row) => [row.id, row]));
  if (byEvent.size === 0) return [];

  const { data: trades, error } = await admin
    .from("trades")
    .select("event_id, requester_session_id, holder_session_id, card_id, confirmed_at")
    .in("event_id", [...byEvent.keys()])
    .gt("confirmed_at", since(RECENT_DAYS))
    .order("confirmed_at", { ascending: false })
    .limit(5);

  if (error || !trades?.length) return [];

  const sessionIds = trades.flatMap((row) =>
    [row.requester_session_id, row.holder_session_id].filter(
      (id): id is string => !!id,
    ),
  );

  const [{ data: sessions }, { data: stores }, facts] = await Promise.all([
    admin.from("player_sessions").select("id, display_name").in("id", sessionIds),
    admin.from("stores").select("id, name").in("id", storeIds),
    cardFacts(trades.map((row) => row.card_id)),
  ]);

  const nameOf = new Map((sessions ?? []).map((row) => [row.id, row.display_name]));
  const storeName = new Map((stores ?? []).map((row) => [row.id, row.name]));

  return trades.flatMap((row) => {
    const event = byEvent.get(row.event_id);
    const card = facts.get(row.card_id);
    const requester = row.requester_session_id
      ? nameOf.get(row.requester_session_id)
      : null;
    if (!event || !card || !requester) return [];

    return [
      {
        kind: "traded" as const,
        storeName: storeName.get(event.store_id) ?? "a store",
        eventName: event.name,
        requester,
        /* Null is a real answer: a trade with somebody who never tapped
           "offer" is recorded partnerless, and saying so is honest. */
        holder: row.holder_session_id
          ? (nameOf.get(row.holder_session_id) ?? null)
          : null,
        ...card,
        confirmedAt: row.confirmed_at,
      },
    ];
  });
}

/**
 * Cards the people this player follows have just put in their binder.
 *
 * Grouped per person rather than per card: "Alexandrina added 3 cards" is one
 * thing that happened, and three separate items for it would be a wall.
 */
async function addedItems(
  followed: Map<
    string,
    {
      playerId: string;
      displayName: string;
      avatarUrl: string | null;
      frame: string | null;
      ring: string | null;
    }
  >,
  playerBySession: Map<string, string>,
  wanted: Set<string>,
): Promise<AddedItem[]> {
  const sessionIds = [...playerBySession.keys()];
  if (sessionIds.length === 0) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("player_cards")
    .select("player_session_id, card_id, created_at")
    .in("player_session_id", sessionIds)
    .gt("created_at", since(RECENT_DAYS))
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !data?.length) return [];

  const byPlayer = new Map<string, string[]>();
  for (const row of data) {
    const owner = playerBySession.get(row.player_session_id);
    if (!owner) continue;
    byPlayer.set(owner, [...(byPlayer.get(owner) ?? []), row.card_id]);
  }

  const facts = await cardFacts(data.map((row) => row.card_id));

  return [...byPlayer.entries()].flatMap(([owner, cardIds]) => {
    const person = followed.get(owner);
    if (!person) return [];

    const unique = [...new Set(cardIds)];

    return [
      {
        kind: "added" as const,
        playerId: person.playerId,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
        frame: person.frame,
        ring: person.ring,
        total: unique.length,
        onYourListCount: unique.filter((id) => wanted.has(id)).length,
        cards: unique.slice(0, ADDED_SAMPLE).flatMap((cardId) => {
          const card = facts.get(cardId);
          return card ? [{ cardId, ...card, onYourList: wanted.has(cardId) }] : [];
        }),
      },
    ];
  });
}

/**
 * Players carrying cards from this player's want list, who they do not
 * already follow.
 *
 * One query over `player_cards` rather than a scan of every account: the want
 * list is short, and the cards on it are the whole question.
 */
async function suggestionItem(
  playerId: string,
  wanted: Set<string>,
  alreadyFollowing: Set<string>,
): Promise<SuggestionItem[]> {
  if (wanted.size === 0) return [];
  const admin = getSupabaseAdmin();

  const { data: rows, error } = await admin
    .from("player_cards")
    .select("player_session_id, card_id")
    .in("card_id", [...wanted])
    .limit(400);

  if (error || !rows?.length) return [];

  const { data: sessions } = await admin
    .from("player_sessions")
    .select("id, player_id")
    .in("id", [...new Set(rows.map((row) => row.player_session_id))]);

  const ownerOf = new Map(
    (sessions ?? []).flatMap((row) =>
      row.player_id ? [[row.id, row.player_id] as const] : [],
    ),
  );

  /* Distinct cards per player: somebody holding four copies of one card is
     not four reasons to follow them. */
  const answers = new Map<string, Set<string>>();
  for (const row of rows) {
    const owner = ownerOf.get(row.player_session_id);
    if (!owner || owner === playerId || alreadyFollowing.has(owner)) continue;
    answers.set(owner, (answers.get(owner) ?? new Set()).add(row.card_id));
  }

  const ranked = [...answers.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, SUGGESTIONS);

  if (ranked.length === 0) return [];

  const { data: players } = await admin
    .from("players")
    .select("id, display_name, avatar_url")
    .in(
      "id",
      ranked.map(([id]) => id),
    );

  const byId = new Map((players ?? []).map((row) => [row.id, row]));

  return [
    {
      kind: "suggest",
      players: ranked.flatMap(([id, cards]) => {
        const person = byId.get(id);
        return person
          ? [
              {
                playerId: id,
                displayName: person.display_name,
                avatarUrl: person.avatar_url,
                answers: cards.size,
              },
            ]
          : [];
      }),
    },
  ];
}

/**
 * One store's board, and the people on it worth naming.
 *
 * Lifted out of `listFeed` so the stores a player saved and the stores
 * with something on tonight go through exactly the same reading — and
 * so the reads happen side by side rather than one store at a time.
 * Seven stores of sequential round trips is a screen that arrives late
 * on a shop's wifi, which is where this screen is actually opened.
 */
async function boardWithHunts(
  local: LocalStore,
  yours: boolean,
  held: ReturnType<typeof heldByCard>,
  followed: Map<
    string,
    {
      playerId: string;
      displayName: string;
      avatarUrl: string | null;
      frame: string | null;
      ring: string | null;
    }
  >,
  playerBySession: Map<string, string>,
): Promise<FeedItem[]> {
  const code = local.liveNow ? local.joinCode : local.nextEventCode;
  if (!code) return [];

  const event = await findEventByJoinCode(code);
  if (!event) return [];

  const flares = await listRoomFlares(event.id);

  /* Matched once, read twice: the board's count and the people below it. */
  const answerable = flares.flatMap((flare) => {
    const match = matchFor(flare, held);
    if (!match) return [];
    return [{ flare, match }];
  });

  const eventName = local.liveNow
    ? (event.name ?? "Trading now")
    : (local.nextEventName ?? event.name);

  const items: FeedItem[] = [
    {
      kind: "board",
      code,
      storeName: local.name,
      city: local.city,
      yours,
      eventName,
      live: local.liveNow,
      startsAt: local.liveNow ? null : local.nextEventAt,
      timeZone: event.storeTimeZone,
      youCanAnswer: answerable.length,
      sample: answerable.slice(0, BOARD_SAMPLE).map(({ flare, match }) => ({
        cardId: flare.cardId,
        cardName: flare.cardName,
        cardNumber: flare.cardNumber,
        imageUrl: flare.imageUrl,
        match,
      })),
    },
  ];

  /*
   * The same board again, read as people rather than cards: a
   * stranger's Flare is a board entry, a friend's is a plan.
   *
   * Grouped by poster AND posting action, so a deck put up in one
   * sitting is one item. A Flare with no batch — posted alone, or
   * before batches existed — falls back to its own id, which makes it
   * a group of one rather than lumping every loose card together.
   */
  const hunts = new Map<string, { flare: ListEntry; match: MatchKind | null }[]>();

  for (const flare of flares) {
    if (flare.intent !== "want") continue;

    const author = playerBySession.get(flare.playerSessionId);
    if (!author || !followed.has(author)) continue;

    const key = `${author}::${flare.postedBatch ?? flare.id}`;
    hunts.set(key, [
      ...(hunts.get(key) ?? []),
      { flare, match: matchFor(flare, held) },
    ]);
  }

  for (const [key, group] of hunts) {
    const person = followed.get(key.split("::")[0]);
    if (!person) continue;

    /* The ones they can act on first: a friend's list is worth
       reading, and the card in your binder is worth reading first. */
    const ordered = [...group].sort(
      (a, b) => Number(Boolean(b.match)) - Number(Boolean(a.match)),
    );

    items.push({
      kind: "hunt",
      code,
      storeName: local.name,
      eventName,
      playerId: person.playerId,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      frame: person.frame,
      ring: person.ring,
      deckLabel: ordered[0]?.flare.deckLabel ?? null,
      total: group.length,
      youCanAnswer: group.filter(({ match }) => match).length,
      cards: ordered.slice(0, HUNT_SAMPLE).map(({ flare, match }) => ({
        cardId: flare.cardId,
        cardName: flare.cardName,
        cardNumber: flare.cardNumber,
        imageUrl: flare.imageUrl,
        match,
      })),
    });
  }

  return items;
}

/**
 * Who wants what the reader is holding, everywhere, right now.
 *
 * One query in the OPPOSITE direction to every other item on this
 * screen. The rest ask "what is on this board"; this asks "where am I
 * wanted", which is the question somebody opens the app to have
 * answered even when they could not have said so.
 *
 * Showcases are excluded: a card somebody is letting go of is not a
 * card they want, and answering it with "you have one too" is noise.
 * The reader's own Flares are excluded for the obvious reason.
 */
async function wantedItems(
  ownSessionId: string | null,
  held: ReturnType<typeof heldByCard>,
): Promise<WantedItem[]> {
  const cardIds = [...held.keys()];
  if (cardIds.length === 0) return [];

  const admin = getSupabaseAdmin();

  const { data: flares, error } = await admin
    .from("flares")
    .select("id, created_at, event_id, player_session_id, card_id, printing_id")
    .eq("status", "open")
    .eq("intent", "want")
    .in("card_id", cardIds.slice(0, WANTED_CARDS_ASKED))
    .order("created_at", { ascending: false })
    .limit(WANTED_READ);

  if (error || !flares || flares.length === 0) {
    if (error) console.error("Could not read who wants your cards", error);
    return [];
  }

  const usable = flares.filter((flare) => flare.player_session_id !== ownSessionId);
  if (usable.length === 0) return [];

  /* Where each one is, so the item can end in a place like every other. */
  const { data: events } = await admin
    .from("events")
    .select("id, store_id")
    .in("id", [...new Set(usable.map((flare) => flare.event_id))]);
  const storeOf = new Map((events ?? []).map((event) => [event.id, event.store_id]));

  const { data: stores } = await admin
    .from("stores")
    .select("id, name, join_code")
    .in("id", [...new Set([...storeOf.values()])]);
  const storeById = new Map((stores ?? []).map((store) => [store.id, store]));

  const { data: sessions } = await admin
    .from("player_sessions")
    .select("id, display_name, player_id")
    .in("id", [...new Set(usable.map((flare) => flare.player_session_id))]);
  const people = new Map((sessions ?? []).map((row) => [row.id, row]));

  const [facts, avatars] = await Promise.all([
    cardFacts(usable.map((flare) => flare.card_id)),
    avatarsFor(
      (sessions ?? []).flatMap((row) => (row.player_id ? [row.player_id] : [])),
    ),
  ]);

  const entries: WantedItem["entries"] = [];

  for (const flare of usable) {
    const storeId = storeOf.get(flare.event_id);
    const store = storeId ? storeById.get(storeId) : undefined;
    const fact = facts.get(flare.card_id);
    if (!store || !fact) continue;

    const person = people.get(flare.player_session_id);
    entries.push({
      playerSessionId: flare.player_session_id,
      displayName: person?.display_name ?? null,
      avatarUrl: person?.player_id ? (avatars.get(person.player_id) ?? null) : null,
      storeName: store.name,
      joinCode: store.join_code,
      when: flare.created_at,
      card: {
        cardId: flare.card_id,
        ...fact,
        match: matchFor({ cardId: flare.card_id, printingId: flare.printing_id }, held),
      },
    });
  }

  if (entries.length === 0) return [];

  return [
    {
      kind: "wanted",
      total: entries.length,
      entries: entries.slice(0, WANTED_SHOWN),
    },
  ];
}

/**
 * Stores you have saved that are worth knowing about, though nothing is
 * open at them right now.
 *
 * The gate the first cut got wrong. `liveNow || earlyOpen` is a good rule
 * for "which board do I show cards from" and a bad one for "is this shop
 * worth a line", because a shop is worth a line on the four days a week it
 * has nothing on - and those are most of them. Measured on the founder's
 * own account, with a saved store and a want list, the entire Feed came
 * back empty.
 *
 * A store with neither a night on the calendar nor walk-ins is genuinely
 * not news and is dropped. "Nothing is happening at four shops" is worse
 * than a short feed, which was true of the first cut and still is.
 */
function upcomingItems(
  locals: LocalStore[],
  alreadyShown: Set<string>,
  wants: number,
): UpcomingItem[] {
  return locals
    .filter((local) => !alreadyShown.has(local.storeId))
    .filter((local) => local.nextEventAt !== null || local.walkIn)
    .slice(0, LOCALS_SHOWN)
    .map((local) => ({
      kind: "upcoming" as const,
      storeId: local.storeId,
      storeName: local.name,
      city: local.city,
      joinCode: local.joinCode,
      nextEventAt: local.nextEventAt,
      nextEventName: local.nextEventName,
      nextEventCode: local.nextEventCode,
      timeZone: local.timeZone,
      walkIn: local.walkIn,
      wants,
    }));
}

/** Profile pictures for a batch of accounts. */
async function avatarsFor(playerIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(playerIds)];
  if (ids.length === 0) return out;

  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("id, avatar_url")
    .in("id", ids);

  for (const row of data ?? []) out.set(row.id, row.avatar_url);
  return out;
}

/**
 * Flares posted lately, wherever they were posted.
 *
 * Asked for by name: "maybe most recent flares from people". Every other
 * card-bearing item on this screen reads through a board that is OPEN, so
 * a card somebody posted on Friday has left the Feed by Saturday even
 * though they are still looking for it. This reads the Flares themselves
 * and asks only that they still be open, and recent.
 *
 * GROUPED BY PERSON, PLACE AND DAY, not by batch.
 *
 * Batch alone was the first cut and it was visibly wrong the moment real
 * data arrived: one player's three separate Flares at one shop on one
 * afternoon came out as three near-identical rows, same face, same store,
 * same "4d ago", one small card each. The founder, looking at it: "it
 * would look a little silly to have separate flares in the feed for each
 * card someone needs, if theyre building a full deck."
 *
 * A batch only ever exists when somebody pasted a list, so grouping by it
 * groups the one case that was already tidy and leaves the messy one
 * alone. What a reader actually wants is the question the room's board
 * asks: who do I walk over to, and about what. So one row per person per
 * store per day - and per named hunt, because a player who named two
 * decks meant two answers to that question, not one.
 *
 * The reader's own Flares are left out: you know what you posted, and a
 * feed that opens with your own words is a mirror rather than a room.
 */
async function recentItems(
  ownSessionId: string | null,
  held: ReturnType<typeof heldByCard>,
  stores: Map<string, { name: string; city: string | null; joinCode: string }>,
): Promise<RecentItem[]> {
  const admin = getSupabaseAdmin();

  const { data: flares, error } = await admin
    .from("flares")
    .select("id, created_at, event_id, player_session_id, card_id, intent, deck_label")
    .eq("status", "open")
    .gte("created_at", since(RECENT_DAYS))
    .order("created_at", { ascending: false })
    .limit(RECENT_READ);

  if (error || !flares || flares.length === 0) {
    if (error) console.error("Could not read recent flares", error);
    return [];
  }

  const usable = flares.filter((flare) => flare.player_session_id !== ownSessionId);
  if (usable.length === 0) return [];

  const { data: events } = await admin
    .from("events")
    .select("id, store_id")
    .in("id", [...new Set(usable.map((flare) => flare.event_id))]);
  const storeOf = new Map((events ?? []).map((event) => [event.id, event.store_id]));

  const { data: sessions } = await admin
    .from("player_sessions")
    .select("id, display_name, player_id")
    .in("id", [...new Set(usable.map((flare) => flare.player_session_id))]);
  const people = new Map((sessions ?? []).map((row) => [row.id, row]));

  const [facts, avatars] = await Promise.all([
    cardFacts(usable.map((flare) => flare.card_id)),
    avatarsFor(
      (sessions ?? []).flatMap((row) => (row.player_id ? [row.player_id] : [])),
    ),
  ]);

  /* One group per posting act: the batch if it had one, else the flare. */
  const groups = new Map<string, RecentItem>();

  for (const flare of usable) {
    const storeId = storeOf.get(flare.event_id);
    const store = storeId ? stores.get(storeId) : undefined;
    const fact = facts.get(flare.card_id);
    if (!store || !fact) continue;

    /* The day in the store's own terms is overkill here: a Flare posted
       either side of midnight is the same trip, and a UTC date is stable
       and cheap. Deck label included, so two named hunts stay two rows. */
    const day = flare.created_at.slice(0, 10);
    const key = [
      flare.player_session_id,
      storeId,
      flare.intent,
      flare.deck_label ?? "",
      day,
    ].join(":");
    const card: FeedCard = {
      cardId: flare.card_id,
      ...fact,
      match: matchFor({ cardId: flare.card_id, printingId: null }, held),
    };

    const existing = groups.get(key);
    if (existing) {
      if (existing.cards.length < RECENT_SAMPLE) existing.cards.push(card);
      else existing.more += 1;
      continue;
    }

    if (groups.size >= RECENT_SHOWN) continue;

    const person = people.get(flare.player_session_id);
    groups.set(key, {
      kind: "recent",
      id: key,
      playerSessionId: flare.player_session_id,
      displayName: person?.display_name ?? null,
      avatarUrl: person?.player_id ? (avatars.get(person.player_id) ?? null) : null,
      storeName: store.name,
      city: store.city,
      joinCode: store.joinCode,
      when: flare.created_at,
      direction: flare.intent === "showcase" ? "showcase" : "want",
      deckLabel: flare.deck_label,
      cards: [card],
      more: 0,
    });
  }

  return [...groups.values()];
}

/**
 * A pack worth opening, and what the reader has to open it with.
 *
 * The first of the two evergreen items - see PRODUCT.md's round-two note.
 * True with nobody else in the product, which is exactly why it is here
 * and exactly why it sits at the bottom: a shop is what the Feed falls
 * back on, never what it is for.
 *
 * The NEWEST live pack rather than the cheapest, because "there is a new
 * one" is news and "there is a cheap one" is inventory.
 */
async function packItem(balance: number): Promise<PackItem[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("pack_series")
    .select("slug, name, description, price_embers, art_path")
    .eq("status", "live")
    .order("set_number", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    if (error) console.error("Could not read the pack shop for the feed", error);
    return [];
  }

  const pack = data[0];

  return [
    {
      kind: "pack",
      slug: pack.slug,
      name: pack.name,
      description: pack.description,
      priceEmbers: pack.price_embers,
      artUrl: pack.art_path,
      balance,
    },
  ];
}

/**
 * Cosmetics to look at, with what they cost.
 *
 * PRODUCT.md's third reason the Feed earns its place is that it "gives the
 * cosmetics somewhere to be seen". Until there are enough people around to
 * see them on each other, this is where they are seen.
 *
 * Only ones the reader does not already own: a list of things somebody has
 * already bought is a wardrobe, and they have one of those.
 */
async function shopItem(playerId: string, balance: number): Promise<ShopItem[]> {
  const [catalogue, owned] = await Promise.all([
    listCosmetics(),
    ownedCosmetics(playerId),
  ]);

  const fresh = catalogue
    .filter((row) => row.cost_embers > 0)
    .filter((row) => !ownsCosmetic(row, owned))
    .slice(0, SHOP_SAMPLE);

  if (fresh.length === 0) return [];

  return [
    {
      kind: "shop",
      cosmetics: fresh.map((row) => ({
        slug: row.slug,
        name: row.name,
        description: row.description,
        family: row.kind,
        costEmbers: row.cost_embers,
      })),
      balance,
    },
  ];
}

/**
 * Builds the feed for one player.
 *
 * `sessionId` is the room identity whose binder answers the boards — the
 * account has exactly one, so the two are the same person by construction.
 * Without it there is no binder to match against and the feed is still worth
 * showing: a board opening on Friday is news whether or not you can answer it.
 */
export async function listFeed(
  playerId: string,
  sessionId: string | null,
): Promise<FeedEntry[]> {
  const [locals, following, binder, wants, notices, balance] = await Promise.all([
    listLocals(playerId),
    listFollowing(playerId),
    sessionId ? listBinder(sessionId) : Promise.resolve([]),
    listWants(playerId),
    showingAnnouncements(),
    embersBalance(playerId),
  ]);

  /* The want list as a set of cards, which is the question two of the item
     kinds below are asking in different words. */
  const wanted = new Set(wants.map((want) => want.cardId));

  const held = heldByCard(binder);
  const followed = new Map(following.map((player) => [player.playerId, player]));

  /* A Flare names the session that posted it; the follow list names accounts.
     This is the bridge, and it is one query rather than one per person. */
  const playerBySession = await sessionsForPlayers([...followed.keys()]);

  /*
   * A store earns a place only when there is somewhere to go: a room open
   * now, or a board already taking Flares. A shop with nothing on is not
   * news, and a feed of "nothing is happening at four shops" is worse than a
   * short feed.
   */
  const live = locals
    .filter((local) => local.liveNow || local.earlyOpen)
    .slice(0, LOCALS_SHOWN);

  /*
   * And then everywhere else. Nothing about this depends on the player,
   * which is exactly the point: it is the item a brand-new account can
   * still be shown. Their own stores are excluded so a local never
   * appears twice under two headings.
   */
  const elsewhere = await listOpenStores(
    locals.map((local) => local.storeId),
    OPEN_ANYWHERE,
  );

  const boards = (
    await Promise.all([
      ...live.map((local) =>
        boardWithHunts(local, true, held, followed, playerBySession),
      ),
      ...elsewhere.map((local) =>
        boardWithHunts(local, false, held, followed, playerBySession),
      ),
    ])
  ).flat();

  /*
   * The two questions the Feed cannot answer on its own, asked only
   * while they are unanswered. A player with a local and a want list
   * sees neither, which is what keeps them out of the way of the
   * product rather than in front of it.
   */
  const starters: StartItem[] = [];
  if (locals.length === 0) starters.push({ kind: "start", topic: "store" });
  if (wanted.size === 0) starters.push({ kind: "start", topic: "deck" });

  /*
   * The three that do not depend on a board being open, fetched together
   * because none of them needs anything the others produce.
   */
  /*
   * Where every store on this screen is, so a recent Flare can say which
   * shop it was posted at. Locals and open-anywhere rooms both, because a
   * Flare from a room you have never saved is still a Flare.
   */
  const stores = new Map(
    [...locals, ...elsewhere].map((local) => [
      local.storeId,
      { name: local.name, city: local.city, joinCode: local.joinCode },
    ]),
  );

  /* Stores already carrying a board above, so a shop is never listed
     twice under two different headings. */
  const shown = new Set([...live, ...elsewhere].map((local) => local.storeId));

  const [traded, added, suggested, recent, pack, shop] = await Promise.all([
    tradedItems(locals.map((local) => local.storeId)),
    addedItems(followed, playerBySession, wanted),
    suggestionItem(playerId, wanted, new Set(followed.keys())),
    recentItems(sessionId, held, stores),
    packItem(balance),
    shopItem(playerId, balance),
  ]);

  /* The lead item, and the one that needs nothing from anybody else
     having posted this week. See wantedItems. */
  const wantedFromYou = await wantedItems(sessionId, held);

  const upcoming = upcomingItems(locals, shown, wanted.size);

  /*
   * The order is an argument about what is worth a tap, and it runs from
   * things that go stale to things that do not.
   *
   * A notice from us leads, because it is the only item somebody chose to
   * write and it carries an expiry that takes it away again. Then
   * somebody needing a card you are holding, which expires on Friday
   * night. Then a board at one of your own stores, which expires with the
   * event. Then the two questions we cannot answer yet, above the rooms
   * that answer the first of them. Cards somebody just added are news for
   * a few days. A trade already happened and is only ever social proof.
   * And a suggestion is true until you act on it, so it waits at the
   * bottom where it is found rather than pushed.
   */
  const items: FeedItem[] = [
    ...wantedFromYou,
    ...notices.map((notice): AnnouncementItem => ({
      kind: "announcement",
      id: notice.id,
      headline: notice.headline,
      body: notice.body,
      linkLabel: notice.linkLabel,
      linkHref: notice.linkHref,
    })),
    ...boards.filter((item) => item.kind === "hunt"),
    ...boards.filter((item) => item.kind === "board" && item.yours),
    ...upcoming,
    ...starters,
    ...boards.filter((item) => item.kind === "board" && !item.yours),
    ...recent,
    ...added,
    ...traded,
    ...suggested,
    ...pack,
    ...shop,
  ];

  /*
   * Every item leaves here knowing where it goes and why it is here.
   * One place, so a new kind cannot ship without an answer to both.
   */
  return items.map((item) => ({
    ...item,
    section: sectionFor(item),
    reason: reasonFor(item),
  }));
}
