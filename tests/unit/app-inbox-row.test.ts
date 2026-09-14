import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ago, kindIcon, splitTitle } from "@/lib/notifications/inbox-row";

/**
 * The inbox row, the way Instagram lays it out: the person's face,
 * their name in bold, the time inline after the sentence.
 *
 * The website's helpers are imported; the app's copies (React Native
 * cannot import from `src/`) are read out of the screen's source and
 * held to the same text, so a change to what a row says on one
 * platform fails here until it reaches the other.
 */

const NOW = Date.parse("2026-09-14T12:00:00Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();

describe("the inbox clock", () => {
  it("counts the way Instagram does, with no 'ago'", () => {
    expect(ago(at(5), NOW)).toBe("now");
    expect(ago(at(4 * 60), NOW)).toBe("4m");
    expect(ago(at(3 * 3600), NOW)).toBe("3h");
    expect(ago(at(2 * 86400), NOW)).toBe("2d");
    expect(ago(at(27 * 86400), NOW)).toBe("3w");
  });

  it("never runs backwards on a clock skewed into the future", () => {
    expect(ago(at(-90), NOW)).toBe("now");
  });
});

describe("the bold name", () => {
  it("splits the actor's name off the front of the sentence", () => {
    expect(splitTitle("savannah followed you", "savannah")).toEqual({
      lead: "savannah",
      rest: " followed you",
    });
  });

  it("leaves a renamed player's old wording whole", () => {
    expect(splitTitle("savannah followed you", "sav")).toEqual({
      lead: null,
      rest: "savannah followed you",
    });
  });

  it("leaves a title with nobody in it whole", () => {
    expect(splitTitle("Trade confirmed: Charizard", null)).toEqual({
      lead: null,
      rest: "Trade confirmed: Charizard",
    });
  });
});

describe("the icon for a row with nobody behind it", () => {
  it("is the store for a board, the bell for anything else", () => {
    expect(kindIcon("board-open")).toBe("store");
    expect(kindIcon("early-board")).toBe("store");
    expect(kindIcon("offer-received")).toBe("bell");
  });
});

describe("the app's copy", () => {
  const web = readFileSync(
    resolve(import.meta.dirname, "../../src/lib/notifications/inbox-row.ts"),
    "utf8",
  );
  const app = readFileSync(
    resolve(import.meta.dirname, "../../mobile/src/screens/inbox.tsx"),
    "utf8",
  );

  /** A function's body, comments and whitespace aside. */
  function bodyOf(source: string, name: string): string {
    const match = source.match(
      new RegExp(`(?:export )?function ${name}\\([\\s\\S]*?\\n}\\n`),
    );
    if (!match) throw new Error(`No ${name} in the source`);
    return match[0]
      .replace(/^export /, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  it.each(["ago", "splitTitle", "kindIcon"])(
    "%s says the same on both platforms",
    (name) => {
      expect(bodyOf(app, name)).toBe(bodyOf(web, name));
    },
  );

  it("leads with the face and opens the profile from it", () => {
    expect(app).toContain("<PlayerAvatar");
    expect(app).toContain('navigation.navigate("PlayerProfile", { playerId })');
  });
});
