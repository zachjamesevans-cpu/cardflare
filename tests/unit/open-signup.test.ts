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
  it("accepts a normal address and password", () => {
    const parsed = signupSchema.safeParse({
      email: "  Chunc@Example.com ",
      password: "hunter22hunter",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("chunc@example.com");
  });

  it("refuses a short password", () => {
    expect(signupSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(
      false,
    );
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
  it("carries the founder's five, in the founder's order", () => {
    expect(TCG_GAMES.map((game) => game.label)).toEqual([
      "One Piece TCG",
      "Riftbound",
      "Lorcana",
      "Magic: The Gathering",
      "Pokémon",
    ]);
  });

  it("every slug is one the database will accept", () => {
    const match = sql.match(
      /create table if not exists public\.player_games[\s\S]*?check \(game in \(([^)]+)\)\)/,
    );
    expect(match, "player_games migration not found").toBeTruthy();
    const allowed = [...(match?.[1] ?? "").matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...GAME_SLUGS].sort());
  });

  it("isGameSlug refuses a game nobody launched with", () => {
    expect(isGameSlug("one-piece")).toBe(true);
    expect(isGameSlug("yugioh")).toBe(false);
  });
});
