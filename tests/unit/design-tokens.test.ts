import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AVATAR_HUE_COUNT } from "@/lib/players/avatar";

/**
 * Guards the palette against regressions.
 *
 * Colours are read from globals.css rather than duplicated here, so changing a
 * token and breaking contrast fails this test instead of shipping.
 */
const css = readFileSync(
  resolve(import.meta.dirname, "../../src/app/globals.css"),
  "utf8",
);

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Design token --color-${name} not found in globals.css`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/../g)!
    .map((pair) => {
      const value = parseInt(pair, 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];

  return (lighter + 0.05) / (darker + 0.05);
}

describe("design tokens", () => {
  it("defines every token the components rely on", () => {
    const required = [
      "canvas",
      "surface",
      "elevated",
      "border",
      "accent",
      "accent-hover",
      "accent-contrast",
      "text-primary",
      "text-secondary",
      "text-muted",
      "success",
      "warning",
      "danger",
    ];

    for (const name of required) {
      expect(() => token(name)).not.toThrow();
    }
  });

  describe.each([
    ["canvas", "canvas"],
    ["surface", "surface"],
    ["elevated", "elevated"],
  ])("text on %s", (_label, surface) => {
    it.each(["text-primary", "text-secondary", "text-muted"])(
      "%s meets WCAG AA for body text",
      (text) => {
        expect(contrastRatio(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
      },
    );

    it("accent text meets WCAG AA", () => {
      expect(contrastRatio(token("accent"), token(surface))).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  });

  it("primary button label contrasts with the accent fill", () => {
    expect(
      contrastRatio(token("accent-contrast"), token("accent")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["success", "warning", "danger"])(
    "%s status colour is legible on surface",
    (status) => {
      expect(contrastRatio(token(status), token("surface"))).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  /*
   * Avatar hues are picked from a session id, so no one reviews the pairing
   * before a player sees it. Every one has to be legible on every surface or
   * some players get an unreadable name and nobody finds out.
   */
  describe.each(["canvas", "surface", "elevated"])("avatar hues on %s", (surface) => {
    it.each([1, 2, 3, 4, 5, 6])("avatar-%i meets WCAG AA", (index) => {
      expect(
        contrastRatio(token(`avatar-${index}`), token(surface)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("has as many avatar hues as the code assigns from", () => {
    const defined = css.match(/--color-avatar-\d+:/g) ?? [];

    expect(defined).toHaveLength(AVATAR_HUE_COUNT);
  });

  it("keeps the focus ring distinguishable from the page", () => {
    expect(contrastRatio(token("accent"), token("canvas"))).toBeGreaterThanOrEqual(3);
  });

  it("honours reduced-motion preferences", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

/**
 * The Event Hub's five game accents.
 *
 * A timer panel is read from across a shop by somebody who is not
 * looking for it, so these have to clear AA against every surface they
 * can land on — not just the darkest one. Read from globals.css rather
 * than duplicated, so tuning a colour and breaking it fails here.
 */
describe("game accents", () => {
  const GAMES = [
    "game-one-piece",
    "game-pokemon",
    "game-lorcana",
    "game-riftbound",
    "game-flesh-and-blood",
  ];

  it.each(GAMES)("%s clears AA on canvas, surface and elevated", (name) => {
    const accent = token(name);

    for (const surface of ["canvas", "surface", "elevated"]) {
      expect(contrastRatio(accent, token(surface))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every game distinct from the CardFlare accent", () => {
    /* A game colour must never be mistaken for a CardFlare control —
       the same rule the avatar hues and the cosmetics follow. */
    const brand = token("accent");

    for (const name of GAMES) {
      expect(token(name)).not.toBe(brand);
    }
  });
});
