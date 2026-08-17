import "server-only";

import { findEventByJoinCode } from "@/lib/events/repository";
import { listRoomFlares } from "@/lib/lists/repository";
import { listBinder } from "@/lib/lists/repository";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { listFollowing } from "@/lib/players/follows";
import { listLocals } from "@/lib/players/locals";
import { heldByCard, matchFor, type MatchKind } from "@/lib/matching/schema";

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

export interface FeedCard {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  match: MatchKind;
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
  card: FeedCard;
}

export type FeedItem = BoardItem | HuntItem;

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
  const [locals, following, binder] = await Promise.all([
    listLocals(playerId),
    listFollowing(playerId),
    sessionId ? listBinder(sessionId) : Promise.resolve([]),
  ]);

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
     * The same cards again, but only where the person asking is someone this
     * player follows. That is the item worth acting on: a stranger's Flare is
     * a board entry, and a friend's is a plan.
     */
    for (const { flare, match } of answerable) {
      const author = playerBySession.get(flare.playerSessionId);
      const person = author ? followed.get(author) : undefined;
      if (!person) continue;

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
        card: {
          cardId: flare.cardId,
          cardName: flare.cardName,
          cardNumber: flare.cardNumber,
          imageUrl: flare.imageUrl,
          match,
        },
      });
    }
  }

  /*
   * People before places. A board is a standing fact that will still be true
   * tomorrow; somebody you follow needing a card you are holding is the thing
   * that goes stale, so it goes first.
   */
  return [
    ...items.filter((item) => item.kind === "hunt"),
    ...items.filter((item) => item.kind === "board"),
  ];
}
