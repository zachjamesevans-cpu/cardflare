import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { matchScore, rankBy } from "@/lib/search/rank";
import { avatarWearFor } from "./equips";
import { avatarPathFor, avatarSrc } from "./profile-image";

/**
 * A value inside a PostgREST `.or()` filter, quoted.
 *
 * The filter is a string the query builder assembles, and commas,
 * parentheses and dots are its grammar. Left bare, a query like
 * `zq,and(postal_code.like.941*)` would close the pattern early and
 * become its own arm of the OR, a way to read columns this search
 * never returns. PostgREST's rule: wrap the value in double quotes and
 * escape the quote and the backslash inside it. Then a comma is just a
 * comma, and a name with brackets in it finds itself.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Finding a player by name - the founder's ask: "I can search up
 * someone by username and see their profile and follow them."
 *
 * Deliberately shallow: name, picture and what the picture wears,
 * nothing else. The profile page is where the rest lives, and the
 * follow button lives there too. Only signed-in viewers reach this
 * (the route enforces it), so it is a directory for people already
 * inside, not for the open web.
 */

export interface FoundPlayer {
  playerId: string;
  displayName: string;
  /** The unique one. Two results may share a name; never a handle. */
  handle: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

const SEARCH_LIMIT = 12;

/** Lists in priority order, flattened, each id kept at its first place. */
export function mergeBestFirst<T>(lists: readonly (readonly T[])[], id: (item: T) => string): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const list of lists)
    for (const item of list) {
      const key = id(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  return merged;
}

export async function searchPlayersByName(query: string): Promise<FoundPlayer[]> {
  const trimmed = query.trim();
  if (!isSupabaseConfigured() || trimmed.length < 2) return [];

  /* Escape the LIKE wildcards so "100%" searches for a percent sign. */
  const escaped = trimmed.replace(/[\\%_]/g, "\\$&");
  /*
   * Either half of an identity finds somebody, because a person at a
   * counter will type whichever one they were told. A leading "@" is
   * dropped rather than searched for: it is how a handle is written, not
   * part of the handle itself.
   */
  const handleText = escaped.replace(/^@/, "").toLowerCase();

  /*
   * Three reads, best first, merged before the limit. One alphabetical
   * "contains" read capped at twelve could leave out the very person
   * whose name IS the search when a dozen others merely contain it -
   * searching "Al" and never seeing Al. So exact and starts-with are
   * asked for on their own and always make the cut.
   */
  const filters = [
    `display_name.ilike.${quoteFilterValue(escaped)},handle.ilike.${quoteFilterValue(handleText)}`,
    `display_name.ilike.${quoteFilterValue(`${escaped}%`)},handle.ilike.${quoteFilterValue(`${handleText}%`)}`,
    `display_name.ilike.${quoteFilterValue(`%${escaped}%`)},handle.ilike.${quoteFilterValue(`%${handleText}%`)}`,
  ];

  const results = await Promise.all(
    filters.map((filter) =>
      getSupabaseAdmin()
        .from("players")
        .select(
          "id, display_name, handle, avatar_url, avatar_animated, tier, equipped_avatar_frame",
        )
        .or(filter)
        .order("display_name")
        .limit(SEARCH_LIMIT),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("Could not search players", failed.error);
    return [];
  }

  const needle = trimmed.replace(/^@/, "");
  const rows = rankBy(
    mergeBestFirst(
      results.map((result) => result.data ?? []),
      (row) => row.id,
    ),
    (row) => matchScore(needle, [row.display_name, row.handle]),
  ).slice(0, SEARCH_LIMIT);
  if (rows.length === 0) return [];

  const wear = await avatarWearFor(rows.map((row) => row.id));

  return rows.map((row) => ({
    playerId: row.id,
    displayName: row.display_name,
    handle: row.handle,
    avatarUrl: avatarSrc(avatarPathFor(row)),
    frame: row.equipped_avatar_frame,
    ring: wear.get(row.id)?.ring ?? null,
    aura: wear.get(row.id)?.aura ?? null,
  }));
}
