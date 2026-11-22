import type { RoomFlare, RoomState } from "../api";
import type { RoomTimerWire } from "../room-timer-wire";
import { DEMO_CARDS, type DemoCard } from "./demo-cards";
import { PEOPLE, type DemoPerson } from "./demo-people";

/**
 * DEMO MODE's tournament room: what a player sees walking into a store
 * championship with cardflare open. The founder (2026-11-22): "there's
 * just no images on flarecast and how it helps going to a tournament
 * and BOOM you can see all cards people want in the room."
 *
 * A live room at Card Cavern, Round 3 on the clock, two dozen players
 * here, and the board: every card the room is hunting, the ones you
 * hold ringed in green. Answered on the phone by demo-server.ts for
 * DEMO_ROOM_CODE only; nothing here reaches the server, and like the
 * rest of demo mode it exists only in development builds.
 */

export const DEMO_ROOM_CODE = "DEMO42";

/* Fixed once per launch, so the clock runs down smoothly instead of
   jumping back every time the room polls. */
const OPENED_AT = Date.now();
const ROUND_ENDS_AT = OPENED_AT + 34 * 60_000 + 17_000;

const sessionOf = (person: DemoPerson) => `demo-session-${person.handle}`;

/* Who is in the room, and the cards each one is hunting. */
const HUNTERS: { person: DemoPerson; cards: DemoCard[]; note?: string }[] = [
  {
    person: PEOPLE.maya,
    cards: [DEMO_CARDS.luffySr, DEMO_CARDS.zoroSec, DEMO_CARDS.sanjiSec],
    note: "Finishing the crew binder",
  },
  { person: PEOPLE.jordan, cards: [DEMO_CARDS.shanksSec, DEMO_CARDS.yamatoSec] },
  { person: PEOPLE.theo, cards: [DEMO_CARDS.lawEb3, DEMO_CARDS.aceEb] },
  { person: PEOPLE.ava, cards: [DEMO_CARDS.nami14, DEMO_CARDS.robinEb] },
  { person: PEOPLE.priya, cards: [DEMO_CARDS.hancockEb, DEMO_CARDS.yamatoEb] },
  { person: PEOPLE.marcus, cards: [DEMO_CARDS.luffy12, DEMO_CARDS.zoroEb] },
  { person: PEOPLE.leo, cards: [DEMO_CARDS.shanks14] },
  { person: PEOPLE.sam, cards: [DEMO_CARDS.ace08, DEMO_CARDS.law01] },
];

/* The cards on the board you hold: ringed in green, as in a real room. */
const YOU_HOLD = new Set([
  DEMO_CARDS.luffySr.cardId,
  DEMO_CARDS.lawEb3.cardId,
  DEMO_CARDS.shanksSec.cardId,
]);

function flaresOf(): RoomFlare[] {
  const flares: RoomFlare[] = [];
  HUNTERS.forEach(({ person, cards, note }, who) => {
    cards.forEach((card, index) => {
      const held = YOU_HOLD.has(card.cardId);
      flares.push({
        id: `demo-room-flare-${person.handle}-${index}`,
        playerSessionId: sessionOf(person),
        displayName: person.displayName,
        cardId: card.cardId,
        cardName: card.cardName,
        cardNumber: card.cardNumber,
        printingId: card.printingId,
        printingLabel: card.printingLabel,
        imageUrl: card.imageUrl,
        quantity: 1,
        note: index === 0 ? (note ?? null) : null,
        deckLabel: null,
        postedBatch: `demo-room-batch-${person.handle}`,
        intent: "want",
        acceptsTrade: true,
        acceptsCash: false,
        createdAt: new Date(OPENED_AT - (who * 7 + index) * 60_000).toISOString(),
        foundQuantity: 0,
        match: held ? "exact" : null,
        heldCount: held ? 1 : 0,
        counterMayHave: false,
        offers: [],
      });
    });
  });
  return flares;
}

const TIMER: RoomTimerWire = {
  id: "demo-room-timer",
  game: "one-piece",
  gameName: "One Piece",
  eventName: "Store Championship",
  round: 3,
  phase: "running",
  headline: "+3 TURNS",
  endsAt: new Date(ROUND_ENDS_AT).toISOString(),
  overtimeSinceAt: null,
  overtimeCapMs: null,
  untimedSinceAt: null,
  staticMs: null,
  nextRoundAt: null,
  nextRound: null,
};

/** The room, as GET /api/v1/rooms/DEMO42 would answer a joined player. */
export function demoRoom(me: { displayName: string }): RoomState {
  const crowd = [PEOPLE.kaito, PEOPLE.hana, PEOPLE.zoe, PEOPLE.eli];
  const everyone = [...HUNTERS.map((hunter) => hunter.person), ...crowd];
  return {
    state: "room",
    joined: true,
    room: {
      name: "OP-14 Store Championship",
      status: "live",
      storeName: "Card Cavern",
      verified: true,
      kind: "tournament",
      startsAt: new Date(OPENED_AT - 95 * 60_000).toISOString(),
      endsAt: null,
      early: false,
      phase: "live",
      goingCount: 28,
      youGoing: true,
      hereNow: 24,
    },
    you: { sessionId: "demo-session-you", displayName: me.displayName },
    account: { displayName: me.displayName },
    following: true,
    timers: [TIMER],
    participants: everyone.map((person) => ({
      playerSessionId: sessionOf(person),
      displayName: person.displayName,
      present: true,
      openToTrades: true,
      avatarUrl: person.avatarUrl,
      frame: person.frame,
      ring: person.ring,
      aura: person.aura,
      embersEarned: 120,
      playerId: person.playerId,
    })),
    flares: flaresOf(),
  };
}
