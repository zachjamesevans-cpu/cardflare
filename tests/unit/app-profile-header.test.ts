import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app's profile block, on both screens that draw it.
 *
 * A player sees this twice: their own Profile tab, and the block that
 * opens when somebody taps them. The founder's rule is that those are
 * the same thing — "what you see is what they see" — and the two files
 * drifted apart anyway, which is what this exists to stop.
 *
 * The drift cost half of everybody's face. The Profile tab carried
 * `marginTop: 96 - 48 - (110 + spacing(2))`, arithmetic left over from a
 * layout where something 110 tall sat above the picture. The cover is
 * absolutely positioned now, so that column is the card's first in-flow
 * child: minus seventy against a twenty-four pixel padding put the
 * picture forty-six pixels above the card, and the card clips overflow.
 *
 * Read off the source, because this project's test runner is Node with
 * no renderer (see vitest.config.ts). That is a real limit and worth
 * naming: this proves the rule is still WRITTEN, not that a phone drew
 * it. The visual pass is a build on a device.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../mobile/src/screens", path), "utf8");

const own = read("profile.tsx");
const theirs = read("player-profile.tsx");

/**
 * The block from the card's cover to the picture, on one screen, with
 * its comments stripped.
 *
 * Stripped because the comment explaining the bug quotes the arithmetic
 * that caused it, and a guard that trips on its own explanation is a
 * guard nobody can write the explanation for.
 */
function header(source: string): string {
  const start = source.indexOf("<CoverBanner");
  const end = source.indexOf("<PlayerAvatar", start);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the profile header", () => {
  it("never pulls the picture up out of the card", () => {
    /* The card clips its overflow, so a negative margin here is not a
       nudge — it is a crop, and it lands on somebody's face. */
    for (const source of [own, theirs]) {
      expect(header(source)).not.toMatch(/marginTop:\s*-/);
      expect(header(source)).not.toMatch(/marginTop:\s*[^,}]*-\s*\(/);
    }
  });

  it("gives the picture the same size on both screens", () => {
    const size = (source: string) =>
      /<PlayerAvatar[\s\S]*?size=\{(\d+)\}/.exec(source)?.[1];

    expect(size(own)).toBe("96");
    expect(size(theirs)).toBe(size(own));
  });

  it("gives the cover the same height on both screens", () => {
    const cover = (source: string) => /const COVER_HEIGHT = (\d+)/.exec(source)?.[1];

    expect(cover(own)).toBeDefined();
    expect(cover(theirs)).toBe(cover(own));
  });

  it("starts both blocks at the same padding", () => {
    /* The picture's distance from the top of the card is the whole of
       what went wrong, and it is this padding plus nothing else. */
    const padding = (source: string) =>
      /<Card style=\{\{ paddingTop: spacing\((\d+)\)/.exec(source)?.[1];

    expect(padding(own)).toBeDefined();
    expect(padding(theirs)).toBe(padding(own));
  });

  it("draws the cover behind the picture rather than above it", () => {
    /* `CoverBanner` is absolutely positioned. If it ever goes back into
       the flow, every offset below it changes meaning — which is how the
       stale arithmetic survived as long as it did. */
    const banner = readFileSync(
      resolve(import.meta.dirname, "../../mobile/src/showcase-zoom.tsx"),
      "utf8",
    );
    const block = banner.slice(banner.indexOf("export function CoverBanner"));

    expect(block).toMatch(/position:\s*"absolute"/);
  });
});
