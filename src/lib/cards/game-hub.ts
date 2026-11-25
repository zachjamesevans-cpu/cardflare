import "server-only";

import { cardPrices } from "@/lib/cards/prices";
import { pickBasePrinting } from "@/lib/cards/schema";
import { cardResultsByIds } from "@/lib/cards/search";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * A game's hub: its most hunted cards, its price moves this week, and its
 * most searched (opened) cards. The founder (2026-11-25): "like a 'top 10
 * most searched cards' for each TCG", then "build it all out".
 *
 * MOST HUNTED is what is on players' lists (their saved wants), counted by
 * player. MOST SEARCHED is cards opened over the last thirty days
 * (card_opens_daily), a count and nothing else. PRICE MOVES are the
 * biggest seven-day moves among the cards people here care about (the two
 * lists above), so the price reads stay a few dozen a day, each held for
 * twelve hours (prices.ts). A list with nothing in it is left out, rather
 * than drawn empty: a new game's hub starts with what it has.
 */

export interface HubCard {
  cardId: string;
  name: string;
  number: string;
  imageUrl: string | null;
  /** "4 hunting", "+12.3%": what put it on the list. */
  stat: string;
  /** For a price move: up or down, so it can be coloured. */
  up?: boolean;
}

export interface GameHub {
  game: string;
  hunted: HubCard[];
  movers: HubCard[];
  searched: HubCard[];
}

const LIST = 10;
/** How many cards the price moves are found among. */
const MOVER_POOL = 16;
const SEARCHED_DAYS = 30;

export async function gameHub(game: string): Promise<GameHub> {
  const empty: GameHub = { game, hunted: [], movers: [], searched: [] };
  if (!isSupabaseConfigured()) return empty;
  const admin = getSupabaseAdmin();

  const [hunted, opened] = await Promise.all([
    admin.rpc("game_hub_hunted", { p_game: game, p_limit: MOVER_POOL }),
    admin.rpc("game_hub_opened", {
      p_game: game,
      p_days: SEARCHED_DAYS,
      p_limit: MOVER_POOL,
    }),
  ]);
  const huntedRows = (hunted.data ?? []) as { card_id: string; total: number }[];
  const openedRows = (opened.data ?? []) as { card_id: string; total: number }[];

  /* The pool the price moves come from: hunted first, then opened. */
  const pool = [
    ...new Set([...huntedRows, ...openedRows].map((row) => row.card_id)),
  ].slice(0, MOVER_POOL);
  /* Every card any list draws, in one read. */
  const needed = [
    ...new Set([
      ...huntedRows.slice(0, LIST).map((row) => row.card_id),
      ...openedRows.slice(0, LIST).map((row) => row.card_id),
      ...pool,
    ]),
  ];
  const cards = await cardResultsByIds(needed);
  const byId = new Map(cards.map((card) => [card.id, card]));

  const face = (cardId: string, stat: string, up?: boolean): HubCard | null => {
    const card = byId.get(cardId);
    if (!card) return null;
    return {
      cardId,
      name: card.exactName,
      number: card.canonicalCardNumber,
      imageUrl: pickBasePrinting([...card.printings], card.exactName)?.imageUrl ?? null,
      stat,
      up,
    };
  };

  const moves = await Promise.all(
    pool.map(async (cardId) => {
      const prices = await cardPrices(cardId);
      if (prices.state !== "ok") return null;
      /* The card's lead price: the first printing that has one. */
      const lead = prices.printings.find(
        (printing) => printing.market !== null && printing.change7 !== null,
      );
      if (!lead || lead.change7 === null || Math.abs(lead.change7) < 0.5) return null;
      return { cardId, change: lead.change7 };
    }),
  );

  return {
    game,
    hunted: huntedRows
      .slice(0, LIST)
      .map((row) => face(row.card_id, `${row.total} hunting`))
      .filter((card): card is HubCard => card !== null),
    movers: moves
      .filter((move): move is { cardId: string; change: number } => move !== null)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, LIST)
      .map((move) =>
        face(
          move.cardId,
          `${move.change > 0 ? "+" : "−"}${Math.abs(move.change).toFixed(1)}%`,
          move.change > 0,
        ),
      )
      .filter((card): card is HubCard => card !== null),
    searched: openedRows
      .slice(0, LIST)
      .map((row) =>
        face(row.card_id, `${row.total} ${row.total === 1 ? "look" : "looks"}`),
      )
      .filter((card): card is HubCard => card !== null),
  };
}

/** One more open of a card. Never fails the page it is counted from. */
export async function countCardOpen(cardId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabaseAdmin().rpc("bump_card_open", { p_card: cardId });
  } catch {
    /* Before the migration is run, or a blip: the count just misses one. */
  }
}
