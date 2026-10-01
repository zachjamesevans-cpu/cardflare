import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Every TypeScript source under src, read once. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/**
 * A hunt is a standing list. The founder (2026-10-01): "Hunts aren't
 * exactly flares... they are just an ongoing list of things someone is
 * looking for. If they're added to a hunt, they stay there. If they
 * post a flare and add it to a hunt, then it's a flare that gets posted
 * to the feed too - but really, it always stays in their hunts screen."
 *
 * So nothing about a Flare's life — posting, closing, expiring, being
 * found, being removed — may remove a card from a hunt. These pin the
 * two places that could break it: the schema, and every write to the
 * request table.
 */
describe("a hunt card outlives its Flare", () => {
  it("the schema points from the Flare to the request, never back", () => {
    const migration = read("supabase/migrations/20261013090000_hunts_and_posts.sql");
    expect(migration).toMatch(
      /hunt_request_id uuid references public\.hunt_requests \(id\) on delete set null/,
    );
    /* A request goes only when its whole hunt does. */
    expect(migration).toMatch(
      /hunt_id uuid not null references public\.hunts \(id\) on delete cascade/,
    );
  });

  it("no code deletes a request row", () => {
    const offenders = sources(join(root, "src")).filter((path) => {
      const text = readFileSync(path, "utf8");
      return /from\("hunt_requests"\)\s*\.delete\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("neither platform tells a visitor a hunt card is 'not posted yet'", () => {
    expect(read("src/components/players/hunt-detail.tsx")).not.toContain(
      "Not posted yet",
    );
    expect(read("mobile/src/hunts-panel.tsx")).not.toContain("Not posted yet");
  });
});
