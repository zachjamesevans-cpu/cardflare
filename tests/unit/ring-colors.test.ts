import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The catalogue rings render on both platforms.
 *
 * The website draws them in CSS, which a phone does not have, so for
 * twenty-five rings the app drew nothing at all while dropped-in file art
 * rendered fine. The app now carries one colour per ring, and this is what
 * stops the next batch shipping invisible: a ring added to the stylesheet
 * with no colour beside it fails here rather than on somebody's phone.
 *
 * The colour is also checked against the ring's own gradient, so it cannot
 * drift into something invented — it has to be a stop the website actually
 * paints.
 */

const CSS = readFileSync("src/app/cosmetic-art.css", "utf8");
const APP = readFileSync("mobile/src/player-avatar.tsx", "utf8");

/** Every avatar effect the stylesheet draws, and the particle it scatters. */
function aurasFromCss(): Map<string, string[]> {
  const auras = new Map<string, string[]>();

  for (const [, slug, body] of CSS.matchAll(
    /\.cfa-(aura-[a-z0-9-]+) \.cfx-aura-fx \{([^}]*)\}/g,
  )) {
    const particle = /--cfa-p-([a-z0-9-]+)/.exec(body);
    if (!particle) continue;

    /* The particle is an inline SVG; its fills are the effect's colours. */
    const defined = new RegExp(`--cfa-p-${particle[1]}:([^\n]*)`).exec(CSS);
    if (!defined) continue;

    auras.set(
      slug,
      [...defined[1].matchAll(/%23([0-9a-fA-F]{6})/g)].map(
        ([, hex]) => `#${hex.toLowerCase()}`,
      ),
    );
  }

  return auras;
}

/** The app's AURA_COLOR map, read the same way RING_COLOR is. */
function auraColorsFromApp(): Map<string, string> {
  const block =
    /export const AURA_COLOR: Record<string, string> = \{([\s\S]*?)\n\};/.exec(APP);
  expect(
    block,
    "AURA_COLOR should still be declared in the app's PlayerAvatar",
  ).not.toBeNull();

  const colors = new Map<string, string>();
  for (const [, slug, hex] of block![1].matchAll(
    /"([a-z0-9-]+)":\s*"(#[0-9a-fA-F]{6})"/g,
  )) {
    colors.set(slug, hex.toLowerCase());
  }

  return colors;
}

/** Every `.cfa-<slug>` rule that declares a band, with its colour stops. */
function bandsFromCss(): Map<string, string[]> {
  const bands = new Map<string, string[]>();

  for (const [, slug, body] of CSS.matchAll(/\.cfa-([a-z0-9-]+)[\s]*\{([^}]*)\}/g)) {
    const band = /--cfa-band:([\s\S]*?);/.exec(body);
    if (!band) continue;

    bands.set(
      slug,
      [...band[1].matchAll(/#[0-9a-fA-F]{6}/g)].map(([hex]) => hex.toLowerCase()),
    );
  }

  return bands;
}

/** The app's RING_COLOR map, read out of the source rather than imported:
    the app is a separate package and this suite does not build it. */
function ringColorsFromApp(): Map<string, string> {
  const block =
    /export const RING_COLOR: Record<string, string> = \{([\s\S]*?)\n\};/.exec(APP);
  expect(
    block,
    "RING_COLOR should still be declared in the app's PlayerAvatar",
  ).not.toBeNull();

  const colors = new Map<string, string>();
  for (const [, slug, hex] of block![1].matchAll(
    /"([a-z0-9-]+)":\s*"(#[0-9a-fA-F]{6})"/g,
  )) {
    colors.set(slug, hex.toLowerCase());
  }

  return colors;
}

describe("catalogue rings render in the app", () => {
  const bands = bandsFromCss();
  const colors = ringColorsFromApp();

  it("finds the rings it is meant to be checking", () => {
    /* A guard on the parsing, not on the product: a regex that quietly
       matched nothing would make every assertion below vacuously true. */
    expect(bands.size).toBeGreaterThan(20);
    expect(colors.size).toBeGreaterThan(20);
  });

  it("gives every ring the website draws a colour the app can draw", () => {
    const missing = [...bands.keys()].filter((slug) => !colors.has(slug));

    expect(
      missing,
      `these rings would be invisible on a phone: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  /*
   * The colour has to come from the ring, not from taste. Picking a stop
   * the website never paints would put a player in a ring that is one
   * colour on their laptop and a different one in their pocket.
   */
  it("takes each colour from that ring's own gradient", () => {
    const invented = [...colors.entries()].filter(
      ([slug, hex]) => bands.has(slug) && !bands.get(slug)!.includes(hex),
    );

    expect(
      invented.map(([slug, hex]) => `${slug} (${hex})`),
      "these colours are not stops in the ring's own band",
    ).toEqual([]);
  });

  it("does not carry a colour for a ring the website has dropped", () => {
    const stale = [...colors.keys()].filter((slug) => !bands.has(slug));

    expect(stale, `no longer in the stylesheet: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("avatar effects render in the app", () => {
  const auras = aurasFromCss();
  const colors = auraColorsFromApp();

  it("finds the effects it is meant to be checking", () => {
    expect(auras.size).toBeGreaterThan(5);
    expect(colors.size).toBeGreaterThan(5);
  });

  it("gives every effect the website draws a colour the app can draw", () => {
    const missing = [...auras.keys()].filter((slug) => !colors.has(slug));

    expect(
      missing,
      `these effects would be invisible on a phone: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  /* The halo is the colour of the thing that would have been floating, so
     it has to be a fill the particle actually paints. */
  it("takes each colour from that effect's own particle", () => {
    const invented = [...colors.entries()].filter(
      ([slug, hex]) => auras.has(slug) && !auras.get(slug)!.includes(hex),
    );

    expect(
      invented.map(([slug, hex]) => `${slug} (${hex})`),
      "these colours are not fills in the effect's own particle",
    ).toEqual([]);
  });
});
