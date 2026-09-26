import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreSinglesSyncRow } from "@/lib/supabase/types";
import { compactNumber, type SinglesGame, type SinglesLine } from "./csv";

/** Keeps `.in()` lists inside PostgREST's URL limits. */
const CHUNK = 200;

/** Insert batch size; a full catalog's worth of rows is a handful of calls. */
const INSERT_CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Resolves compact card numbers to card ids.
 *
 * The one matching rule: a row matches if its number is in the catalog,
 * exactly. No fuzzy name matching — a wrong guess would tell a player the
 * counter has a card the store never listed.
 */
export async function cardsByCompactNumbers(
  numbers: string[],
): Promise<Map<string, string>> {
  if (numbers.length === 0 || !isSupabaseConfigured()) return new Map();

  const admin = getSupabaseAdmin();
  const found = new Map<string, string>();

  for (const batch of chunks(numbers, CHUNK)) {
    const { data, error } = await admin
      .from("cards")
      .select("id, compact_card_number")
      .in("compact_card_number", batch);

    if (error) {
      console.error("Could not look up cards by number", error);
      return new Map();
    }

    for (const row of data ?? []) {
      found.set(row.compact_card_number, row.id);
    }
  }

  return found;
}

/** A set name as letters and digits only, the way the database compares it. */
export function normalizeSetName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The spellings a set name is looked up under: whole, and without a
 * leading code. TCGplayer writes "SV07: Stellar Crown" where the
 * catalogue says "Stellar Crown".
 */
export function setNameCandidates(name: string): string[] {
  const whole = normalizeSetName(name);
  const colon = name.indexOf(":");
  const tail = colon === -1 ? "" : normalizeSetName(name.slice(colon + 1));
  return [...new Set([whole, tail].filter((value) => value.length > 0))];
}

/**
 * The catalogue numbers a printed number could be inside a set. The
 * importers pad some games' collector numbers to three digits (Pokémon,
 * Lorcana, Riftbound) and not others (Magic), and an export may or may
 * not carry the zeros, so every spelling is tried and only the catalogue
 * decides.
 */
export function setNumberCandidates(setCode: string, printed: string): string[] {
  const bare = printed.replace(/^0+(?=\d)/, "");
  const padded = /^\d+$/.test(bare) ? bare.padStart(3, "0") : bare;
  return [
    ...new Set(
      [printed, bare, padded].map((number) => compactNumber(`${setCode}-${number}`)),
    ),
  ];
}

/**
 * Every line's card, by line number.
 *
 * Two rules, both exact:
 *
 * - The printed number, within the line's game (or any game, when the
 *   file does not say). One Piece's OP01-016 and Flesh and Blood's WTR001
 *   name a card on their own.
 * - For a line that did not match: the set, from its name, then the
 *   number inside that set. Magic, Pokémon, Lorcana and Riftbound print
 *   numbers that repeat in every set, and the catalogue keys them
 *   SETCODE-NUMBER.
 *
 * No fuzzy name matching, as before: a wrong guess would tell a player
 * the counter has a card the store never listed.
 */
export async function resolveSinglesCards(
  lines: SinglesLine[],
): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  if (lines.length === 0 || !isSupabaseConfigured()) return found;

  const admin = getSupabaseAdmin();

  /* Cards by compact number, within a game or across all of them. */
  const lookUp = async (
    game: SinglesGame | null,
    numbers: string[],
  ): Promise<Map<string, string> | null> => {
    const byNumber = new Map<string, string>();
    for (const batch of chunks([...new Set(numbers)], CHUNK)) {
      let query = admin
        .from("cards")
        .select("id, compact_card_number")
        .in("compact_card_number", batch);
      if (game) query = query.eq("game", game);
      const { data, error } = await query;
      if (error) {
        console.error("Could not look up cards by number", error);
        return null;
      }
      for (const row of data ?? []) byNumber.set(row.compact_card_number, row.id);
    }
    return byNumber;
  };

  const byGame = new Map<SinglesGame | null, SinglesLine[]>();
  for (const line of lines) {
    byGame.set(line.game, [...(byGame.get(line.game) ?? []), line]);
  }

  for (const [game, group] of byGame) {
    const direct = await lookUp(
      game,
      group.map((line) => line.compactNumber),
    );
    if (!direct) return new Map();

    const rest: SinglesLine[] = [];
    for (const line of group) {
      const cardId = direct.get(line.compactNumber);
      if (cardId) found.set(line.line, cardId);
      else if (game && line.setName) rest.push(line);
    }
    if (!game || rest.length === 0) continue;

    /* The set codes behind the names this game's lines use. */
    const names = [...new Set(rest.flatMap((line) => setNameCandidates(line.setName)))];
    const codesByName = new Map<string, string[]>();
    for (const batch of chunks(names, CHUNK)) {
      const { data, error } = await admin.rpc("card_sets_by_name", {
        p_game: game,
        p_names: batch,
      });
      if (error) {
        console.error("Could not look up sets by name", error);
        return new Map();
      }
      for (const row of data ?? []) {
        const key = normalizeSetName(row.set_name);
        codesByName.set(key, [
          ...new Set([...(codesByName.get(key) ?? []), row.set_code]),
        ]);
      }
    }

    const candidatesByLine = new Map<number, string[]>();
    for (const line of rest) {
      const codes = setNameCandidates(line.setName).flatMap(
        (name) => codesByName.get(name) ?? [],
      );
      candidatesByLine.set(
        line.line,
        codes.flatMap((code) => setNumberCandidates(code, line.compactNumber)),
      );
    }

    const inSet = await lookUp(game, [...candidatesByLine.values()].flat());
    if (!inSet) return new Map();
    for (const [lineNumber, candidates] of candidatesByLine) {
      const cardId = candidates.map((candidate) => inSet.get(candidate)).find(Boolean);
      if (cardId) found.set(lineNumber, cardId);
    }
  }

  return found;
}

/**
 * Replaces a store's synced singles with a fresh set, and records the sync.
 *
 * Delete-then-insert rather than diffing: the export is the whole truth of
 * the counter, and a diff against stale rows can only preserve mistakes.
 * PostgREST offers no transaction across the two steps; if an insert fails
 * midway the sync record is not written, the store sees the error, and the
 * next upload replaces everything again — the failure mode is a missing
 * sync, never a silently wrong one.
 */
export async function replaceSingles(
  storeId: string,
  totalsByCard: Map<string, number>,
  stats: { linesSeen: number; cardsMatched: number; linesUnmatched: number },
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  const { error: clearError } = await admin
    .from("store_singles")
    .delete()
    .eq("store_id", storeId);

  if (clearError) {
    console.error("Could not clear the previous sync", clearError);
    return false;
  }

  const rows = [...totalsByCard.entries()].map(([cardId, quantity]) => ({
    store_id: storeId,
    card_id: cardId,
    quantity,
  }));

  for (const batch of chunks(rows, INSERT_CHUNK)) {
    const { error } = await admin.from("store_singles").insert(batch);
    if (error) {
      console.error("Could not write the synced singles", error);
      return false;
    }
  }

  const { error: syncError } = await admin.from("store_singles_syncs").upsert(
    {
      store_id: storeId,
      synced_at: new Date().toISOString(),
      lines_seen: stats.linesSeen,
      cards_matched: stats.cardsMatched,
      lines_unmatched: stats.linesUnmatched,
    },
    { onConflict: "store_id" },
  );

  if (syncError) {
    console.error("Could not record the sync", syncError);
    return false;
  }

  return true;
}

/** The store's latest sync, for the dashboard's stat card. */
export async function singlesSyncFor(
  storeId: string,
): Promise<StoreSinglesSyncRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("store_singles_syncs")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    console.error("Could not read the sync record", error);
    return null;
  }

  return data;
}

/**
 * Which of these cards the store's counter may have.
 *
 * The room's question, asked per render: the Flares on the board against
 * one store's synced stock. Returns a set of card ids — quantities stay
 * server-side, because "may have it, ask at the counter" is the whole
 * promise a day-old sync can honestly make.
 */
export async function counterAvailability(
  storeId: string,
  cardIds: string[],
): Promise<Set<string>> {
  if (cardIds.length === 0 || !isSupabaseConfigured()) return new Set();

  const admin = getSupabaseAdmin();
  const available = new Set<string>();

  for (const batch of chunks([...new Set(cardIds)], CHUNK)) {
    const { data, error } = await admin
      .from("store_singles")
      .select("card_id")
      .eq("store_id", storeId)
      .in("card_id", batch);

    if (error) {
      console.error("Could not check the counter's stock", error);
      return new Set();
    }

    for (const row of data ?? []) available.add(row.card_id);
  }

  return available;
}
