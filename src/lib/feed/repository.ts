import "server-only";

import { findEventByJoinCode } from "@/lib/events/repository";
import { listRoomFlares, type ListEntry } from "@/lib/lists/repository";
import { listBinder } from "@/lib/lists/repository";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { listFollowing } from "@/lib/players/follows";
import { listLocals } from "@/lib/players/locals";
import { heldByCard, matchFor, type MatchKind } from "@/lib/matching/schema";
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

export type FeedItem = BoardItem | HuntItem | TradedItem | AddedItem | SuggestionItem;

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
): Promise<FeedItem[]> {
  const [locals, following, binder, wants] = await Promise.all([
    listLocals(playerId),
    listFollowing(playerId),
    sessionId ? listBinder(sessionId) : Promise.resolve([]),
    listWants(playerId),
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

  const items: FeedItem[] = [];

  for (const local of live) {
    const code = local.liveNow ? local.joinCode : local.nextEventCode;
    if (!code) continue;

    const event = await findEventByJoinCode(code);
    if (!event) continue;

    const flares = await listRoomFlares(event.id);

    /* Matched once, read twice: the board's count and the people below it. */
    const answerable = flares.flatMap((flare) => {
      const match = matchFor(flare, held);
      if (!match) return [];
      return [{ flare, match }];
    });

    items.push({
      kind: "board",
      code,
      storeName: local.name,
      eventName: local.liveNow
        ? (event.name ?? "Trading now")
        : (local.nextEventName ?? event.name),
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
    });

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
        eventName: local.liveNow
          ? (event.name ?? "Trading now")
          : (local.nextEventName ?? event.name),
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
  }

  /*
   * The three that do not depend on a board being open, fetched together
   * because none of them needs anything the others produce.
   */
  const [traded, added, suggested] = await Promise.all([
    tradedItems(locals.map((local) => local.storeId)),
    addedItems(followed, playerBySession, wanted),
    suggestionItem(playerId, wanted, new Set(followed.keys())),
  ]);

  /*
   * The order is an argument about what is worth a tap, and it runs from
   * things that go stale to things that do not.
   *
   * Somebody needing a card you are holding expires on Friday night. A board
   * expires with the event. Cards somebody just added are news for a few
   * days. A trade already happened and is only ever social proof. And a
   * suggestion is true until you act on it, so it waits at the bottom where
   * it is found rather than pushed.
   */
  return [
    ...items.filter((item) => item.kind === "hunt"),
    ...items.filter((item) => item.kind === "board"),
    ...added,
    ...traded,
    ...suggested,
  ];
}
