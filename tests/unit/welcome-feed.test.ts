import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A new player's Feed has things waiting in it. The founder: "i think we
 * need something that populates into someones feed when they first sign
 * up so that things are waiting for them", then "yeah it would be cool
 * if everyone automatically followed me ... they can unfollow as normal.
 * build it all. so when someone first signs in, they'll see my flares
 * and my posts."
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("every new player follows the founder", () => {
  it("follows @zach once, where an account is made, never failing the sign-up", () => {
    const welcome = read("src/lib/players/welcome-follow.ts");
    expect(welcome).toContain('export const WELCOME_HANDLE = "zach";');
    expect(welcome).toContain("await followPlayer(player.id, founder);");
    expect(welcome).toMatch(/catch \(caught\) \{\s*console\.error/);
    expect(read("src/lib/auth/signup.ts")).toContain(
      "await followWelcomeAccount(created.user.id);",
    );
    expect(read("src/lib/players/accounts.ts")).toContain(
      "await followWelcomeAccount(user.id);",
    );
  });

  it("is an ordinary follow: no notice per sign-up, unfollowed like any other", () => {
    const welcome = read("src/lib/players/welcome-follow.ts");
    expect(welcome).not.toContain("notifyNewFollower");
  });
});

describe("a new player's Feed is topped up with real posts", () => {
  const repo = read("src/lib/feed/repository.ts");

  it("from active players in their games, for two weeks", () => {
    expect(repo).toContain("const NEW_PLAYER_DAYS = 14;");
    expect(repo).toContain("async function popularAuthorsFor(");
    expect(repo).toContain(
      'label: name ? `Popular in ${name}` : "Popular on cardflare"',
    );
  });

  it("below everything they follow, under its own heading", () => {
    expect(repo).toMatch(
      /dedupeHunts\(\[[\s\S]*?\]\),\s*\),\s*\/\*[\s\S]*?\*\/\s*\.\.\.byPostedAt<HuntItem>\(popularHunts\)/,
    );
    expect(repo).toContain('popular: "Popular in your games",');
  });

  it("marked Suggested on the post, on both platforms", () => {
    expect(read("src/components/feed/flare-feed-card.tsx")).toContain(
      "{item.suggested && !item.yours && (",
    );
    expect(read("mobile/src/flare-feed-card.tsx")).toContain(
      "{item.suggested && !item.yours ? (",
    );
  });

  it("offers the same players to follow when nobody answers their wants", () => {
    expect(repo).toContain('note: popular.label.replace("Popular", "Active"),');
    expect(read("src/components/feed/feed-items.tsx")).toContain(
      "person.answers === 0 && person.note",
    );
    expect(read("mobile/src/screens/home.tsx")).toContain(
      "person.answers === 0 && person.note",
    );
  });
});

/* "let's remove the 'your first steps' stuff altogether. I like the
   little tutorials but giving ppl a checklist early on is kinda silly." */
describe("no first-steps checklist", () => {
  it("is on neither platform", () => {
    for (const file of [
      "src/lib/feed/repository.ts",
      "src/components/feed/feed-items.tsx",
      "mobile/src/screens/home.tsx",
      "src/lib/onboarding/intro.ts",
    ]) {
      expect(read(file), file).not.toContain("FIRST_STEPS");
      expect(read(file), file).not.toContain('kind: "steps"');
    }
  });
});
