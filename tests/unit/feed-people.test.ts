import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * Clicking a face, and saying when there is nothing behind it.
 *
 * The founder asked for two things in one message: "make sure that we
 * are able in the feed to click on profiles", and "if someone joins a
 * room as a guest, it should have 'guest' written after their profile
 * guest name". Both are answered by one field — `playerId` being null
 * or not — which is why they are tested together.
 */
describe("the session-based feed items carry an account", () => {
  it("both of them expose playerId", async () => {
    /* `recent` and `wanted` are built from player_sessions, and a
       session may or may not belong to an account. Without this field
       the Feed cannot tell a guest from a member at all — it only ever
       had a session id, which opens nothing. */
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    const wanted = repo.slice(
      repo.indexOf("export interface WantedItem"),
      repo.indexOf("export interface RecentItem"),
    );
    const recent = repo.slice(
      repo.indexOf("export interface RecentItem"),
      repo.indexOf("export interface RecentItem") + 2000,
    );

    expect(wanted).toContain("playerId: string | null");
    expect(recent).toContain("playerId: string | null");
  });

  it("fills it from the session's own player_id", async () => {
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    /* Both builders already read player_id to look up a face; this is
       the same value, carried one step further. */
    const filled = repo.match(/playerId: person\?\.player_id \?\? null/g) ?? [];
    expect(filled).toHaveLength(2);
  });
});

describe("a guest is never mistaken for a member", () => {
  it("the app treats undefined as unknown, not as guest", async () => {
    /*
     * The app and the server ship on different clocks. An older server
     * never sends `playerId`, and undefined must NOT paint a Guest chip
     * on a real account — labelling somebody a guest who is not is a
     * worse lie than showing no label at all.
     */
    const person = await readFile("mobile/src/feed-person.tsx", "utf8");

    expect(person).toContain("playerId === null");
    /* The type admits undefined, which is what makes the check above
       meaningful rather than decorative. */
    expect(person).toContain("string | null | undefined");
  });

  it("never links a row that has nowhere to go", async () => {
    const web = await readFile("src/components/feed/feed-person.tsx", "utf8");

    /* A link that goes nowhere is worse than no link. PersonLink
       returns a plain div for a guest, and GuestChip explains why. */
    expect(web).toContain("if (!playerId)");
    expect(web).toContain("GuestChip");
  });
});

describe("both platforms open a profile", () => {
  it("the website links to /p/[playerId]", async () => {
    const web = await readFile("src/components/feed/feed-person.tsx", "utf8");
    expect(web).toContain("`/p/${playerId}`");
  });

  it("the app navigates rather than opening a browser", async () => {
    /* The founder has already had to say once that a tab should not
       throw him into Safari. */
    const home = await readFile("mobile/src/screens/home.tsx", "utf8");
    const opens = home.match(/navigation\.navigate\("PlayerProfile"/g) ?? [];

    /* suggest, added, hunt, recent, wanted. */
    expect(opens.length).toBeGreaterThanOrEqual(5);
  });
});
