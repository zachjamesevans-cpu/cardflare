import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FIRST_STEPS,
  FIRST_STEPS_FOLLOWS,
  firstStepsCount,
} from "../../src/lib/onboarding/intro";

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

describe("your first steps", () => {
  it("are four, each one the server can see done", () => {
    expect(FIRST_STEPS.map((step) => step.key)).toEqual([
      "post",
      "follow",
      "binder",
      "where",
    ]);
    expect(FIRST_STEPS_FOLLOWS).toBe(3);
    expect(firstStepsCount(2)).toBe("2 of 4 done");
  });

  it("go away when all are done or the account is two weeks old", () => {
    const repo = read("src/lib/feed/repository.ts");
    expect(repo).toContain("if (Object.values(done).every(Boolean)) return [];");
    expect(repo).toMatch(
      /async function stepsItem[\s\S]*?viewer\.created_at < since\(NEW_PLAYER_DAYS\)/,
    );
  });

  it("are drawn on both platforms", () => {
    expect(read("src/components/feed/feed-items.tsx")).toContain(
      'if (item.kind === "steps") {',
    );
    expect(read("mobile/src/screens/home.tsx")).toContain("<FirstStepsCard");
  });
});
