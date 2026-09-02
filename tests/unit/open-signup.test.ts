import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { signupSchema, starterNameFromEmail } from "@/lib/auth/signup-schema";
import { GAME_SLUGS, TCG_GAMES, isGameSlug } from "@/lib/players/games-catalog";

/**
 * Open sign-up's rules, and the games catalogue pinned to the database
 * that has to accept it - the same one-list discipline as notification
 * kinds and cosmetic art.
 */

const sql = readdirSync(join(process.cwd(), "supabase/migrations"))
  .map((file) => readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"))
  .join("\n");

describe("the signup schema", () => {
  /* Everything an account is, asked once. The name and handle used to be
     a second screen behind a link, which is the seam the founder named. */
  const VALID = {
    email: "  Chunc@Example.com ",
    password: "hunter22hunter",
    displayName: "Steven B",
    handle: "steven_b",
  };

  it("accepts a normal address, password, name and handle", () => {
    const parsed = signupSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("chunc@example.com");
      expect(parsed.data.displayName).toBe("Steven B");
      expect(parsed.data.handle).toBe("steven_b");
    }
  });

  it("refuses a handle with a space, which is why handles exist", () => {
    expect(signupSchema.safeParse({ ...VALID, handle: "steven b" }).success).toBe(
      false,
    );
  });

  it("refuses a missing name", () => {
    expect(signupSchema.safeParse({ ...VALID, displayName: "" }).success).toBe(false);
  });

  it("refuses a short password", () => {
    expect(signupSchema.safeParse({ ...VALID, password: "short" }).success).toBe(false);
  });

  it("refuses a non-address", () => {
    expect(
      signupSchema.safeParse({ email: "not-an-email", password: "long enough" })
        .success,
    ).toBe(false);
  });
});

describe("the starter name", () => {
  it("comes from the address's local part", () => {
    expect(starterNameFromEmail("chunc@example.com")).toBe("chunc");
  });

  it("never comes out shorter than the players table allows", () => {
    expect(starterNameFromEmail("a@example.com").length).toBeGreaterThanOrEqual(2);
    expect(starterNameFromEmail("@example.com").length).toBeGreaterThanOrEqual(2);
  });

  it("never comes out longer than 40", () => {
    const long = `${"x".repeat(80)}@example.com`;
    expect(starterNameFromEmail(long).length).toBeLessThanOrEqual(40);
  });
});

describe("the games catalogue", () => {
  it("carries the founder's five plus Flesh and Blood, in the founder's order", () => {
    expect(TCG_GAMES.map((game) => game.label)).toEqual([
      "One Piece TCG",
      "Riftbound",
      "Lorcana",
      "Magic: The Gathering",
      "Pokémon",
      "Flesh and Blood",
    ]);
  });

  it("every slug is one the database will accept", () => {
    /* The LATEST check wins: the table was created with five and a
       later migration replaced the constraint with six. */
    const matches = [
      ...sql.matchAll(/player_games[\s\S]*?check \(game in \(([^)]+)\)\)/g),
    ];
    const last = matches.at(-1);
    expect(last, "player_games migration not found").toBeTruthy();
    const allowed = [...(last?.[1] ?? "").matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...GAME_SLUGS].sort());
  });

  it("isGameSlug refuses a game nobody launched with", () => {
    expect(isGameSlug("one-piece")).toBe(true);
    expect(isGameSlug("yugioh")).toBe(false);
  });
});
