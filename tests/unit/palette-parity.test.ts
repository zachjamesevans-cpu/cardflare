import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * The website and the app paint with the same colours.
 *
 * AGENTS.md: "Any UI, copy, or feature change ships to the website AND
 * the Expo app in the same round." A palette lives in two files because
 * React Native cannot read a CSS custom property, and two files holding
 * the same values by hand is two files that drift — quietly, because
 * nobody has both on screen at once.
 *
 * Written the day the canvas went true black, which meant editing
 * `--color-canvas` in globals.css and `canvas` in theme.ts and
 * remembering to do both. The next person will change one.
 */
function webTokens(css: string): Map<string, string> {
  const block = css.slice(
    css.indexOf("@theme"),
    css.indexOf("\n}", css.indexOf("@theme")),
  );
  const found = new Map<string, string>();

  for (const [, name, value] of block.matchAll(
    /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g,
  )) {
    /* camelCase, the way the app spells the same token. */
    const key = name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    found.set(key, expand(value));
  }

  return found;
}

function appTokens(ts: string): Map<string, string> {
  const block = ts.slice(ts.indexOf("export const colors"), ts.indexOf("} as const"));
  const found = new Map<string, string>();

  for (const [, name, value] of block.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{3,8})"/g)) {
    found.set(name, expand(value));
  }

  return found;
}

/** #fff and #ffffff are the same colour; compare them as one. */
function expand(hex: string): string {
  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;

  return `#${full.toLowerCase()}`;
}

describe("the two palettes", () => {
  it("agree on every token they share", async () => {
    const [css, ts] = await Promise.all([
      readFile("src/app/globals.css", "utf8"),
      readFile("mobile/src/theme.ts", "utf8"),
    ]);

    const web = webTokens(css);
    const app = appTokens(ts);

    expect(web.size).toBeGreaterThan(8);
    expect(app.size).toBeGreaterThan(8);

    /* The intersection, not the union: the website carries avatar hues
       the app derives differently, and the app carries cosmetic colours
       the website keeps in cosmetic-art.css. Only the names that exist
       on both sides are a promise. */
    const disagreements: string[] = [];

    for (const [name, value] of app) {
      const other = web.get(name);
      if (other && other !== value) {
        disagreements.push(`${name}: app ${value} vs web ${other}`);
      }
    }

    expect(disagreements).toEqual([]);
  });

  it("both paint the page true black", async () => {
    /* The founder's ask, and the specific value this test was written
       to hold: "I want the background to be full black." */
    const [css, ts] = await Promise.all([
      readFile("src/app/globals.css", "utf8"),
      readFile("mobile/src/theme.ts", "utf8"),
    ]);

    expect(webTokens(css).get("canvas")).toBe("#000000");
    expect(appTokens(ts).get("canvas")).toBe("#000000");
  });

  it("keeps the ink on a lime fill off pure black", async () => {
    /* accentContrast is text ON the accent, not a background. Pure black
       on that lime is harsher than the charcoal, so it deliberately did
       NOT follow the canvas down. */
    const css = await readFile("src/app/globals.css", "utf8");

    expect(webTokens(css).get("accentContrast")).not.toBe("#000000");
  });
});
