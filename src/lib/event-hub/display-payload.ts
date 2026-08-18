import "server-only";

import { findStoreById } from "@/lib/events/repository";
import { resolveCode } from "@/lib/events/rooms";
import { joinUrl } from "@/lib/events/qr";
import { listRoomFlares } from "@/lib/lists/repository";
import { counterAvailability } from "@/lib/singles/repository";
import type { LayoutChoice } from "./layout";
import { listTimers, type HubDisplay } from "./repository";
import type { HubTimer } from "./timer";

/**
 * Everything the television is allowed to know, and nothing else.
 *
 * This module is the privacy boundary, deliberately in one file so the
 * question "can a display token see X?" has exactly one place to be
 * answered. A display token is handed to a browser on a shelf in a shop.
 * It is not a session, it belongs to nobody, and anyone who reads the
 * URL off the screen has it — so the payload is ASSEMBLED here rather
 * than being a row handed out, and the fields below are the complete
 * list of what leaves the building.
 *
 * Never in here, and each for its own reason:
 *
 *   * A Have List. A player's binder is private; a card in it reaching a
 *     wall would be publishing an inventory somebody typed for their own
 *     use. The Flares below are the opposite thing — a public request
 *     that its owner posted to a public board on purpose.
 *   * Showcase Flares. Those ARE public, but they are "I have this and
 *     would let it go", which reads as an inventory the moment it is
 *     projected. Only `want` reaches the wall.
 *   * The store's singles list. `storeMayHave` is one boolean per card
 *     somebody already asked for. There is no path from here to the
 *     store's uploaded inventory, and no price anywhere.
 *   * Player ids, session ids, handles, avatars, emails. A display name
 *     is what the board already shows a room; nothing else is needed to
 *     say who is looking for a card.
 *   * The display's own token. It comes in, it never goes out.
 */

/** One card on the rotating board. */
export interface DisplayFlare {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  /** Copies wanted, summed across everybody asking. */
  quantity: number;
  /** How many different people are asking. */
  people: number;
  /**
   * Who is asking, when exactly one person is.
   *
   * Null once it is more than one, because "3 people are looking for
   * this" is both better copy and less about any individual.
   */
  askedBy: string | null;
  /** The counter stocks it. A boolean, never a count and never a price. */
  storeMayHave: boolean;
}

export interface DisplayPayload {
  displayId: string;
  storeName: string;
  nightTitle: string | null;
  layout: LayoutChoice;
  announcement: string | null;
  showFlares: boolean;
  showQr: boolean;
  soundEnabled: boolean;
  /** The store's permanent counter code, already printed and public. */
  joinCode: string | null;
  joinUrl: string | null;
  timers: HubTimer[];
  flares: DisplayFlare[];
  /**
   * The server's clock when this was built.
   *
   * A television on a shelf in a shop is exactly the sort of device
   * whose clock is four minutes out, and every timer here is arithmetic
   * against a clock. The display measures the difference once per poll
   * and applies it, so a wrong clock on the TV costs nothing.
   */
  serverNow: number;
}

/** The most cards the board will carry. Beyond this nothing new is seen. */
const FLARE_LIMIT = 24;

/**
 * Builds the payload for one display.
 *
 * Reads the store's counter code through `resolveCode`, which is the
 * read-only resolver: it finds a live room but never OPENS one. That
 * distinction matters here more than anywhere — a television left on
 * overnight must not be able to start a trading room by looking at it.
 */
export async function displayPayload(display: HubDisplay): Promise<DisplayPayload> {
  const [store, timers] = await Promise.all([
    findStoreById(display.storeId),
    listTimers(display.id),
  ]);

  const base: DisplayPayload = {
    displayId: display.id,
    storeName: store?.name ?? "",
    nightTitle: display.nightTitle,
    layout: display.layout,
    announcement: display.announcement,
    showFlares: display.showFlares,
    showQr: display.showQr,
    soundEnabled: display.soundEnabled,
    joinCode: store?.join_code ?? null,
    joinUrl: store?.join_code ? joinUrl(store.join_code) : null,
    timers,
    flares: [],
    serverNow: Date.now(),
  };

  if (!store || !display.showFlares) return base;

  const resolved = await resolveCode(store.join_code);
  if (resolved.outcome !== "room" || resolved.room.status !== "open") return base;

  const entries = await listRoomFlares(resolved.room.id);

  /*
   * Wants only. A showcase Flare is public and would be safe to show,
   * but "I have this" projected on a wall reads as an inventory, and the
   * feature the shop asked for is "what are people looking for".
   */
  const wants = entries.filter((entry) => entry.intent === "want");

  /* Grouped by card, which is what makes "3 people are looking for this"
     possible. Counted by session, so one person posting four copies is
     still one person. */
  const byCard = new Map<
    string,
    {
      cardId: string;
      cardName: string;
      cardNumber: string;
      imageUrl: string | null;
      quantity: number;
      askers: Set<string>;
      firstName: string | null;
    }
  >();

  for (const entry of wants) {
    const existing = byCard.get(entry.cardId);

    if (existing) {
      existing.quantity += entry.quantity;
      existing.askers.add(entry.playerSessionId);
      /* Kept only while there is one asker; the name is dropped below
         the moment a second person appears. */
      continue;
    }

    byCard.set(entry.cardId, {
      cardId: entry.cardId,
      cardName: entry.cardName,
      cardNumber: entry.cardNumber,
      imageUrl: entry.imageUrl,
      quantity: entry.quantity,
      askers: new Set([entry.playerSessionId]),
      firstName: entry.displayName,
    });
  }

  const grouped = [...byCard.values()].slice(0, FLARE_LIMIT);

  const stocked = await counterAvailability(
    store.id,
    grouped.map((card) => card.cardId),
  );

  return {
    ...base,
    flares: grouped.map((card) => ({
      cardId: card.cardId,
      cardName: card.cardName,
      cardNumber: card.cardNumber,
      imageUrl: card.imageUrl,
      quantity: card.quantity,
      people: card.askers.size,
      askedBy: card.askers.size === 1 ? card.firstName : null,
      storeMayHave: stocked.has(card.cardId),
    })),
    /* Stamped last, after the reads, so the number is as close to "when
       the television receives this" as it can honestly be. */
    serverNow: Date.now(),
  };
}
