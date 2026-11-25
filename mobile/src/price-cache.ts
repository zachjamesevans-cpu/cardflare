import { getCardPrices, type CardPrices } from "./api";
import { cachedPlayerId, readCache, writeCache } from "./cache";

/**
 * A card's prices, asked for once and kept, so the card screen never
 * waits on them twice. The founder: "it takes a second to load price
 * information - any way to speed that up, or ... where it does not ...
 * pop in".
 *
 * - `loadCardPrices` starts the request the moment a card is opened, in
 *   step with the card itself rather than after it, and every caller in
 *   the next ten minutes shares the one answer.
 * - `peekCardPrices` answers synchronously when that answer is in, so a
 *   card opened again draws its prices in the first frame.
 * - `savedCardPrices` reads the copy kept on the phone (twelve hours,
 *   like the server), so even a fresh launch paints prices at once.
 */
const FRESH_MS = 10 * 60 * 1000;

const asked = new Map<string, { at: number; promise: Promise<CardPrices> }>();
const settled = new Map<string, CardPrices>();

export function peekCardPrices(cardId: string): CardPrices | null {
  return settled.get(cardId) ?? null;
}

export function loadCardPrices(cardId: string): Promise<CardPrices> {
  const hit = asked.get(cardId);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise;

  const promise = getCardPrices(cardId)
    .then((answer) => answer.prices)
    .catch((): CardPrices => ({ state: "unavailable" }));
  asked.set(cardId, { at: Date.now(), promise });

  void promise.then(async (prices) => {
    /* A failed ask is not kept: the next open tries again. */
    if (prices.state === "unavailable") {
      asked.delete(cardId);
      return;
    }
    settled.set(cardId, prices);
    void writeCache("prices", (await cachedPlayerId()) ?? "guest", prices, cardId);
  });
  return promise;
}

export async function savedCardPrices(cardId: string): Promise<CardPrices | null> {
  return readCache<CardPrices>("prices", (await cachedPlayerId()) ?? "guest", cardId);
}
