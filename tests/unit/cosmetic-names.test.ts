import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { redundantCosmeticWord, tidyCosmeticName } from "@/lib/players/cosmetic-names";
import { titleWords } from "@/components/players/worn";

/**
 * The founder's naming rule, enforced rather than remembered.
 *
 * He asked once, the shipped cosmetics were fixed, and the catalogue
 * written the very next round broke it thirteen times. So the rule now
 * has a test that walks every cosmetic name in every migration: a new
 * batch with "Edge" or "Name" stuck on the end fails here, before it
 * can reach a screen.
 */

const dir = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(dir)
  .sort()
  .map((file) => readFileSync(join(dir, file), "utf8"))
  .join("\n");

/**
 * Every cosmetic the migrations seed, with the name it ENDS UP with.
 *
 * Later `update ... set name` statements are applied over the seeded
 * value, because that is what the database will hold - a test that only
 * read the insert would fail on names already renamed.
 */
function seededCosmetics(): { slug: string; kind: string; name: string }[] {
  const byslug = new Map<string, { slug: string; kind: string; name: string }>();

  for (const row of sql.matchAll(
    /\('([a-z0-9-]{2,40})',\s*'([a-z]+)',\s*'((?:[^']|'')+)'/g,
  )) {
    const [, slug, kind, name] = row;
    /* Only rows that look like the cosmetics insert: a known kind. */
    if (!KNOWN_KINDS.has(kind)) continue;
    byslug.set(slug, { slug, kind, name: name.replace(/''/g, "'") });
  }

  for (const change of sql.matchAll(
    /update public\.cosmetics set name = '((?:[^']|'')+)'\s+where slug = '([a-z0-9-]+)'/g,
  )) {
    const [, name, slug] = change;
    const existing = byslug.get(slug);
    if (existing) existing.name = name.replace(/''/g, "'");
  }

  return [...byslug.values()];
}

const KNOWN_KINDS = new Set([
  "frame",
  "holo",
  "effect",
  "ring",
  "border",
  "pattern",
  "animation",
  "background",
  "scene",
  "nameplate",
  "title",
  "badge",
]);

describe("the cosmetic naming rule", () => {
  it("flags a name that repeats its own category", () => {
    expect(redundantCosmeticWord("frame", "Prism Edge")).toBe("Edge");
    expect(redundantCosmeticWord("holo", "Galaxy Holo")).toBe("Holo");
    expect(redundantCosmeticWord("nameplate", "Ember Name")).toBe("Name");
    expect(redundantCosmeticWord("border", "Neon Cyan Border")).toBe("Border");
  });

  it("leaves a name alone when the last word is not its category", () => {
    /* "Flame Edge" says WHERE the fire is; it is a fine animation name
       and only a bad border name. A blanket word-ban would lose that. */
    expect(redundantCosmeticWord("animation", "Flame Edge")).toBeNull();
    expect(redundantCosmeticWord("background", "Holographic Foil")).toBeNull();
    expect(redundantCosmeticWord("ring", "Gold Foil")).toBeNull();
    expect(redundantCosmeticWord("pattern", "Classic Rainbow")).toBeNull();
  });

  it("never strips a single-word name down to nothing", () => {
    expect(redundantCosmeticWord("nameplate", "Name")).toBeNull();
    expect(redundantCosmeticWord("frame", "Edge")).toBeNull();
  });

  it("tidies a name by dropping the redundant word", () => {
    expect(tidyCosmeticName("frame", "Prism Edge")).toBe("Prism");
    expect(tidyCosmeticName("nameplate", "Holographic Name")).toBe("Holographic");
    expect(tidyCosmeticName("animation", "Flame Edge")).toBe("Flame Edge");
  });

  it("EVERY cosmetic in the migrations obeys the rule", () => {
    const offenders = seededCosmetics()
      .map((row) => ({ ...row, word: redundantCosmeticWord(row.kind, row.name) }))
      .filter((row) => row.word !== null)
      .map((row) => `${row.slug} (${row.kind}): "${row.name}"`);

    expect(
      offenders,
      `These names repeat their own category. Drop the last word:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("reads a sensible number of cosmetics, so the scan cannot pass by finding none", () => {
    expect(seededCosmetics().length).toBeGreaterThan(200);
  });
});

describe("what a title chip says", () => {
  it("uses the seeded wording where there is some", () => {
    /* "Your line here" is not what the slug would spell out. */
    expect(titleWords("title-custom-tagline")).toBe("Your line here");
  });

  it("reads its own slug otherwise, rather than saying 'Title'", () => {
    /* The founder equipped Founder and the chip said "Title", because
       the fallback was that literal word. Every title dropped in
       through the console would have hit it. */
    expect(titleWords("title-founder")).toBe("Founder");
    expect(titleWords("title-grand-line")).toBe("Grand Line");
  });
});
