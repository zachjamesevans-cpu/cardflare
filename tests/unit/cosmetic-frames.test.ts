import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A frame is one slug living in five places: a catalogue row in a
 * migration, a class map for the avatar ring, a class map for the card
 * frame, the CSS that draws both, and the app's colour map. Nothing
 * ties them together at runtime — an unknown slug deliberately falls
 * through to no frame, so a missed entry would not crash, it would
 * quietly sell a border that never renders. That is fake functionality
 * with a price tag on it, which is the one thing this project must
 * never ship. So the set is checked here instead.
 *
 * Sources are read as text rather than imported: the two components
 * pull in next/image and React, and what is being verified is literal
 * map entries, not behaviour.
 */

const root = resolve(import.meta.dirname, "../..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const migrationsDir = resolve(root, "supabase/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"))
  .join("\n");

/* Every ('slug', 'frame', 'Name', 'Description', ...) row, all files. */
const rows = [
  ...migrations.matchAll(/\('([a-z0-9-]+)',\s*'frame',\s*'([^']*)',\s*'([^']*)'/g),
].map(([, slug, name, description]) => ({ slug, name, description }));

const avatarComponent = read("src/components/players/player-avatar.tsx");
const cardComponent = read("src/components/players/cosmetic-card.tsx");
const css = read("src/app/globals.css");
const mobileAvatar = read("mobile/src/player-avatar.tsx");
const mobileCard = read("mobile/src/cosmetic-card.tsx");

describe("the frame catalogue", () => {
  it("has the rows this suite expects to be guarding", () => {
    /* If a migration reshapes the insert and the regex goes blind, this
       fails loudly instead of every check below passing on nothing. */
    expect(rows.length).toBeGreaterThanOrEqual(9);
  });

  it.each(rows.filter((row) => row.slug !== "plain"))(
    "$slug is drawn everywhere it can be bought",
    ({ slug }) => {
      expect(avatarComponent).toContain(`"${slug}": "cf-avatar-frame-${slug}"`);
      expect(cardComponent).toContain(`"${slug}": "cf-frame-${slug}"`);
      expect(css).toContain(`.cf-avatar-frame-${slug}`);
      expect(css).toContain(`.cf-frame-${slug}::before`);
      expect(mobileAvatar).toContain(`"${slug}":`);
      expect(mobileCard).toContain(`"${slug}":`);
    },
  );

  it("keeps Plain meaning no frame in both maps", () => {
    expect(avatarComponent).toContain(`plain: ""`);
    expect(cardComponent).toContain(`plain: ""`);
  });

  it("puts no em dash in a name or description a player will read", () => {
    for (const { name, description } of rows) {
      expect(name).not.toContain("—");
      expect(description).not.toContain("—");
    }
  });
});
