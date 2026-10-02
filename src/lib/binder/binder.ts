import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { binderSessionFor, listHaves } from "@/lib/lists/haves";
import { addToBinder, listBinder, removeFromBinder } from "@/lib/lists/repository";
import type { AddEntryInput } from "@/lib/lists/schema";
import type { PlayerBinderRow } from "@/lib/supabase/types";
import {
  DEFAULT_BINDER_COVER,
  DEFAULT_BINDER_LAYOUT,
  isBinderCover,
  isBinderLayout,
  type BinderCoverId,
  type BinderLayout,
} from "./covers";

/**
 * The trade binder: the Have list, made public by choice, drawn like a
 * binder.
 *
 * The cards are `player_cards`, read through `listHaves` exactly as the
 * room and Nearby read them. What this module adds is one row of
 * settings per player (`player_binders`) and the two questions a
 * screen asks: "may I open this one" and "which of these cards do I
 * want". Private by default, because a Have list has always been
 * private (ARCHITECTURE.md: a named person's inventory across venues is
 * a theft map), and the switch is the owner's alone.
 */

export interface BinderCard {
  entryId: string;
  cardId: string;
  name: string;
  number: string;
  imageUrl: string | null;
  printingLabel: string | null;
  quantity: number;
  note: string | null;
  /** The viewer wants this card: an open want or hunt line. Always false for the owner. */
  onYourHunt: boolean;
}

export interface Binder {
  ownerId: string;
  ownerName: string;
  /** The viewer is the owner. */
  yours: boolean;
  isPublic: boolean;
  layout: BinderLayout;
  cover: BinderCoverId;
  frontEntryId: string | null;
  /** Newest first. */
  cards: BinderCard[];
  count: number;
  onYourHunts: number;
}

/** What a profile panel needs, without the cards. */
export interface BinderSummary {
  isPublic: boolean;
  count: number;
  layout: BinderLayout;
  cover: BinderCoverId;
  frontImageUrl: string | null;
  onYourHunts: number;
}

export type BinderSettingsPatch = {
  isPublic?: boolean;
  layout?: BinderLayout;
  cover?: BinderCoverId;
  frontEntryId?: string | null;
};

interface Settings {
  isPublic: boolean;
  layout: BinderLayout;
  cover: BinderCoverId;
  frontEntryId: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  isPublic: false,
  layout: DEFAULT_BINDER_LAYOUT,
  cover: DEFAULT_BINDER_COVER,
  frontEntryId: null,
};

function toSettings(row: PlayerBinderRow | null): Settings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    isPublic: row.is_public,
    layout: isBinderLayout(row.layout) ? row.layout : DEFAULT_BINDER_LAYOUT,
    cover: isBinderCover(row.cover) ? row.cover : DEFAULT_BINDER_COVER,
    frontEntryId: row.front_entry_id,
  };
}

async function readSettings(playerId: string): Promise<Settings> {
  if (!isSupabaseConfigured()) return DEFAULT_SETTINGS;
  const { data, error } = await getSupabaseAdmin()
    .from("player_binders")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) {
    console.error("Could not read the binder settings", error);
    return DEFAULT_SETTINGS;
  }
  return toSettings(data);
}

/**
 * The cards the viewer is after: every open want on their list and
 * every hunt line still short of its count. Card ids only; a binder
 * entry for any printing of a wanted card counts, the way the Feed's
 * "You have this" counts.
 */
async function wantedCardIds(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId || !isSupabaseConfigured()) return new Set();
  const admin = getSupabaseAdmin();
  const [wants, hunts] = await Promise.all([
    admin.from("player_wants").select("card_id").eq("player_id", viewerId),
    admin.from("hunts").select("id").eq("player_id", viewerId),
  ]);
  const ids = new Set<string>((wants.data ?? []).map((row) => row.card_id));
  const huntIds = (hunts.data ?? []).map((row) => row.id);
  if (huntIds.length > 0) {
    const { data: lines } = await admin
      .from("hunt_requests")
      .select("card_id, quantity_needed, quantity_found")
      .in("hunt_id", huntIds);
    for (const line of lines ?? []) {
      if ((line.quantity_found ?? 0) < line.quantity_needed) ids.add(line.card_id);
    }
  }
  return ids;
}

async function ownerName(playerId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("display_name")
    .eq("id", playerId)
    .maybeSingle();
  return data?.display_name ?? null;
}

/**
 * A binder, for whoever is looking.
 *
 * Null when the owner has no account, or when the binder is private
 * and the viewer is not the owner. The owner always gets their own,
 * cards or not, so the page they edit on exists before the first card.
 */
export async function readBinder(
  ownerId: string,
  viewerId: string | null,
): Promise<Binder | null> {
  const yours = viewerId === ownerId;
  const [name, settings] = await Promise.all([
    ownerName(ownerId),
    readSettings(ownerId),
  ]);
  if (!name) return null;
  if (!yours && !settings.isPublic) return null;

  const [entries, wanted] = await Promise.all([
    listHaves(ownerId),
    yours ? Promise.resolve(new Set<string>()) : wantedCardIds(viewerId),
  ]);

  /* The owner's order: placed cards by pocket, and anything not placed
     yet FIRST, newest first, so a card just added lands in pocket one. */
  const ordered = [...entries].sort((a, b) => {
    if (a.position === null && b.position === null) {
      return b.createdAt.localeCompare(a.createdAt);
    }
    if (a.position === null) return -1;
    if (b.position === null) return 1;
    return a.position - b.position;
  });

  const cards: BinderCard[] = ordered.map((entry) => ({
    entryId: entry.id,
    cardId: entry.cardId,
    name: entry.cardName,
    number: entry.cardNumber,
    imageUrl: entry.imageUrl,
    printingLabel: entry.printingLabel,
    quantity: entry.quantity,
    note: entry.note,
    onYourHunt: wanted.has(entry.cardId),
  }));

  /* A front card that was removed falls back to the newest one. */
  const frontEntryId = cards.some((card) => card.entryId === settings.frontEntryId)
    ? settings.frontEntryId
    : (cards[0]?.entryId ?? null);

  return {
    ownerId,
    ownerName: name,
    yours,
    isPublic: settings.isPublic,
    layout: settings.layout,
    cover: settings.cover,
    frontEntryId,
    cards,
    count: cards.length,
    onYourHunts: cards.filter((card) => card.onYourHunt).length,
  };
}

/** The panel's facts. Same null rule as `readBinder`. */
export async function binderSummary(
  ownerId: string,
  viewerId: string | null,
): Promise<BinderSummary | null> {
  const binder = await readBinder(ownerId, viewerId);
  if (!binder) return null;
  const front =
    binder.cards.find((card) => card.entryId === binder.frontEntryId) ??
    binder.cards[0];
  return {
    isPublic: binder.isPublic,
    count: binder.count,
    layout: binder.layout,
    cover: binder.cover,
    frontImageUrl: front?.imageUrl ?? null,
    onYourHunts: binder.onYourHunts,
  };
}

/** Writes the settings the owner changed, and nothing else. */
export async function saveBinderSettings(
  playerId: string,
  patch: BinderSettingsPatch,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = {
    player_id: playerId,
    updated_at: new Date().toISOString(),
  };
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (patch.layout !== undefined) row.layout = patch.layout;
  if (patch.cover !== undefined) row.cover = patch.cover;
  if (patch.frontEntryId !== undefined) row.front_entry_id = patch.frontEntryId;
  const { error } = await getSupabaseAdmin()
    .from("player_binders")
    .upsert(row as never, { onConflict: "player_id" });
  if (error) console.error("Could not save the binder settings", error);
}

export type BinderWriteResult =
  { ok: true } | { ok: false; reason: "at-cap" | "unavailable" | "not-yours" };

/** Adds a card to the owner's binder, making the session that holds it if needed. */
export async function addBinderCard(
  playerId: string,
  displayName: string,
  input: Pick<AddEntryInput, "cardId" | "printingId" | "quantity">,
): Promise<BinderWriteResult> {
  const session = await binderSessionFor(playerId, displayName, true);
  if (!session) return { ok: false, reason: "unavailable" };
  const result = await addToBinder(session.id, {
    cardId: input.cardId,
    printingId: input.printingId,
    quantity: input.quantity,
    note: null,
    deckLabel: null,
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/** Removes one of the owner's own cards. Somebody else's id is refused. */
export async function removeBinderCard(
  playerId: string,
  entryId: string,
): Promise<BinderWriteResult> {
  const session = await binderSessionFor(playerId, "", false);
  if (!session) return { ok: false, reason: "not-yours" };
  const removed = await removeFromBinder(entryId, session.id);
  return removed ? { ok: true } : { ok: false, reason: "not-yours" };
}

/**
 * The owner's new order, pocket by pocket: position 0 for the first id
 * and so on. Ids that are not the owner's are ignored, and a card the
 * list left out keeps a place after the listed ones, so a reorder sent
 * from a stale screen cannot lose a card.
 */
export async function saveBinderOrder(
  playerId: string,
  entryIds: string[],
): Promise<BinderWriteResult> {
  const session = await binderSessionFor(playerId, "", false);
  if (!session) return { ok: false, reason: "not-yours" };
  const entries = await listBinder(session.id);
  const own = new Set(entries.map((entry) => entry.id));
  const placed = entryIds.filter(
    (id, index) => own.has(id) && entryIds.indexOf(id) === index,
  );
  const rest = entries
    .filter((entry) => !placed.includes(entry.id))
    .sort((a, b) => (a.position ?? -1) - (b.position ?? -1))
    .map((entry) => entry.id);
  const order = [...placed, ...rest];
  const admin = getSupabaseAdmin();
  const results = await Promise.all(
    order.map((id, position) =>
      admin
        .from("player_cards")
        .update({ position })
        .eq("id", id)
        .eq("player_session_id", session.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("Could not save the binder order", failed.error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}
