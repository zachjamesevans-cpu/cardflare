import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The card search runs in the database, so what can be checked here is
 * the text of the function the migrations leave behind. Two things
 * about it must stay true, and neither would fail loudly if broken:
 *
 * 1. The index and the ranking must agree on where noise starts. The
 *    candidate step asks the trigram index for "similar" using the
 *    `%` operator, which reads pg_trgm.similarity_threshold; the
 *    ranking keeps rows with a score at or above its own floor. If
 *    the threshold drifted above the floor, cards the ranking would
 *    have shown could never reach it, and nobody would notice until a
 *    misspelling that used to work stopped working.
 *
 * 2. The search must keep finding its candidates by index. The
 *    version that scored every card in the table was fine for one
 *    game and half a second per keystroke for six.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function latestSearchFunction(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let latest = "";
  for (const name of files) {
    const sql = readFileSync(join(MIGRATIONS, name), "utf8");
    const match = sql.match(
      /create (?:or replace )?function public\.search_cards\([\s\S]*?\$function\$;/,
    );
    if (match) latest = match[0];
  }
  return latest;
}

describe("the search_cards function", () => {
  const sql = latestSearchFunction();

  it("exists in the migrations", () => {
    expect(sql).not.toBe("");
  });

  it("sets the trigram threshold to the same floor the ranking keeps", () => {
    const threshold = sql.match(/set pg_trgm\.similarity_threshold = ([\d.]+)/);
    const floor = sql.match(/where s\.score >= ([\d.]+)/);
    expect(threshold?.[1]).toBeDefined();
    expect(floor?.[1]).toBeDefined();
    expect(Number(threshold?.[1])).toBe(Number(floor?.[1]));
  });

  it("gathers candidates through the trigram indexes before scoring", () => {
    expect(sql).toMatch(/candidates as \(/);
    expect(sql).toMatch(/c\.normalized_name % p\.term/);
    expect(sql).toMatch(/lower\(c\.canonical_card_number\) % p\.term/);
    /* The candidate ids are fetched by primary key, never by re-reading
       the table. */
    expect(sql).toMatch(/c\.id = any \(array\(select k\.id from candidates k\)\)/);
  });
});
