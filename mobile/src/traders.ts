import { useCallback, useEffect, useRef, useState } from "react";

import { getTradersNearYou, type NearbyTrader, type TradersAnswer } from "./api";
import { requestCoords, silentCoords } from "./location";

/**
 * Traders near you (the UI experiment): one loader for the Nearby strip
 * and the full list, so both say the same thing.
 *
 * The phone's position goes with the request only when permission was
 * already given (silentCoords never shows a dialog); without it the
 * server measures from the player's ZIP. `askLocation` is for a tap on
 * "Use my location", the only place the dialog may appear.
 */
export type TradersView =
  | { state: "loading" }
  | { state: "error" }
  | { state: "denied" }
  | Exclude<TradersAnswer, { state: "ok" }>
  | { state: "ok"; radius: number; hunting: number; traders: NearbyTrader[] };

export interface TradersFilters {
  radius: number | null;
  game: string | null;
  matchingOnly: boolean;
}

export function useTraders(filters: TradersFilters) {
  const [view, setView] = useState<TradersView>({ state: "loading" });
  const asked = useRef(0);

  const load = useCallback(
    async (coords?: { latitude: number; longitude: number } | null) => {
      const ticket = ++asked.current;
      try {
        const position = coords === undefined ? await silentCoords() : coords;
        const answer = await getTradersNearYou({ ...filters, coords: position });
        if (ticket === asked.current) setView(answer);
      } catch {
        if (ticket === asked.current) setView({ state: "error" });
      }
    },
    [filters.radius, filters.game, filters.matchingOnly],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** From a tap: may show the system dialog. */
  const askLocation = useCallback(async () => {
    const outcome = await requestCoords();
    if (outcome.status === "granted") await load(outcome.coords);
    else if (outcome.status === "denied" || outcome.status === "unavailable")
      setView({ state: "denied" });
    else setView({ state: "error" });
  }, [load]);

  return { view, reload: () => load(), askLocation };
}

/** "148 cards for trade" - the website's traders-rank.ts, word for word. */
export function tradeCountLine(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "card" : "cards"} for trade`;
}

/** "3 cards match your Hunts", or null for none. */
export function matchLine(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? "card matches" : "cards match"} your Hunts`;
}
