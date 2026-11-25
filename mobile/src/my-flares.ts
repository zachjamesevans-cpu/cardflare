import { useEffect, useState } from "react";

import { getMe, type Me } from "./api";

/**
 * The cards on your open Flares, held once for the whole app, so a
 * marker can say "already flared" wherever you meet the card: a small
 * flame on a search result, "On your Flares" on its sheet, a flame on a
 * tile in the composer. The founder (2026-11-25): "when you ... already
 * have a flare out for perona, and you happen to click on that card,
 * it'll have a logo or something ... that you already have it on your
 * list."
 *
 * Read from /me once per session (signed out, it stays empty), and fed
 * whenever the composer's own list is read or a Flare goes up.
 */

type Want = Pick<Me["wants"][number], "cardId" | "printingId"> & {
  found?: boolean;
  direction?: "want" | "offering";
};

let wants: Want[] | null = null;
let asked: Promise<void> | null = null;
const listeners = new Set<() => void>();

const tell = () => listeners.forEach((listener) => listener());

/** The list as it now is: still looking for, and only wants. */
export function setMyFlares(next: Want[] | null | undefined): void {
  wants = (next ?? []).filter((want) => !want.found && want.direction !== "offering");
  tell();
}

/** Ask the server once; a failure (signed out, offline) is no Flares. */
export function loadMyFlares(force = false): Promise<void> {
  if (asked && !force) return asked;
  asked = getMe()
    .then((me) => setMyFlares(me.wants))
    .catch(() => {
      if (wants === null) setMyFlares([]);
    });
  return asked;
}

/** Any art of this card is on your Flares. */
export function cardFlared(cardId: string): boolean {
  return (wants ?? []).some((want) => want.cardId === cardId);
}

/**
 * This art of the card is: a Flare for exactly one of its printings, or
 * one for "any art" of the card.
 */
export function artFlared(cardId: string, printingIds: readonly (string | null)[]): boolean {
  return (wants ?? []).some(
    (want) =>
      want.cardId === cardId &&
      (want.printingId === null || printingIds.includes(want.printingId)),
  );
}

/** Re-render when the list changes; loads it the first time. */
export function useMyFlares(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    void loadMyFlares();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return version;
}
