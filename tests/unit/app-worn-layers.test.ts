import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What is drawn in front of what, in the app.
 *
 * Two of the three glitches the founder reported off a real phone were
 * z-order, not art. The ring and the aura were both handed to one
 * component that rendered them before the face, and a face is opaque,
 * so a ring somebody had bought was invisible and an effect was, in his
 * words, "behind the avatar". The art was fine. The order was not.
 *
 * The rule, on both platforms: a RING goes UNDER the picture, because
 * the promise is that nothing worn ever lands on somebody's face - "the
 * ring kinda digs into the profile pic... please don't ever do that
 * again with these" - and an AURA goes OVER it, because floating around
 * the picture is the whole point of one. The website enforces it with a
 * mask; the app has no masks and enforces it with z-order, which means
 * the source order IS the rule and is worth a guard.
 *
 * Read off the source: the test runner is Node with no renderer (see
 * vitest.config.ts), so this proves the order is written, not that a
 * phone drew it. The visual pass is mobile/TESTING.md.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../mobile/src", path), "utf8");

/** A file with its comments stripped, so a guard cannot trip on the
    paragraph explaining the bug it guards against. */
const bare = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const avatar = bare(read("player-avatar.tsx"));
const zoom = bare(read("ui.tsx"));

/** Where a marker sits in a slice of source, asserted to be present. */
function at(source: string, marker: string, from = 0): number {
  const index = source.indexOf(marker, from);
  expect(index, `${marker} is missing`).toBeGreaterThan(-1);
  return index;
}

describe("a worn cosmetic, around a picture", () => {
  it("draws a catalogue ring under the face and its aura over it", () => {
    const start = at(avatar, "if (worn) {");
    const block = avatar.slice(start, avatar.indexOf("if (!band)", start));

    expect(at(block, "<WornRing")).toBeLessThan(at(block, "{face}"));
    expect(at(block, "<WornAura")).toBeGreaterThan(at(block, "{face}"));
  });

  it("draws a dropped-in file the same way round", () => {
    /* The two branches drew this differently once and only one of them
       was wrong, which is exactly how a rule quietly becomes two. */
    const start = at(avatar, "if (ringArt || auraArt) {");
    const block = avatar.slice(start, avatar.indexOf("const worn =", start));

    expect(at(block, "art={ringArt}")).toBeLessThan(at(block, "{face}"));
    expect(at(block, "art={auraArt}")).toBeGreaterThan(at(block, "{face}"));
  });

  it("never sizes a layer by hand where the geometry module exists", () => {
    /* The invisible ring came from arithmetic living in the component.
       Every layer's size and offset comes from avatar-geometry now, and
       tests/unit/app-avatar-geometry.test.ts checks those against the
       stylesheet. A component that starts doing its own sums again is
       a component that has stepped outside the guard. */
    expect(avatar).toMatch(/from "\.\/avatar-geometry"/);
    expect(bare(read("cosmetic-worn.tsx"))).toMatch(/from "\.\/avatar-geometry"/);
    expect(avatar).not.toMatch(/400 \/ 296/);
  });
});

describe("swiping a zoomed card", () => {
  /* Reported from a phone: "swiping between card flares immediately
     closes the card in the app". The zoom marked the swipe in
     onTouchEnd and read it in the Pressable's onPress - two different
     event systems, and the responder system dispatches first, so the
     press always won and the card closed. Marking it in onTouchMove
     makes the answer true before either handler can read it. */
  const start = at(zoom, "onTouchStart={(event) => {");
  /* Every touch handler on the backdrop, and nothing else: the gesture
     runs from the first handler to the panel it wraps. */
  const handlers = zoom.slice(start, at(zoom, "<Animated.View", start));

  it("decides that a drag is a swipe while the thumb is still down", () => {
    const move = zoom.indexOf("onTouchMove={(event) => {");
    expect(move, "the zoom has no onTouchMove").toBeGreaterThan(-1);

    const block = zoom.slice(move, zoom.indexOf("onTouchEnd=", move));
    expect(block).toMatch(/swiped\.current = true/);
  });

  it("does not wait until the touch ends to decide", () => {
    const end = at(zoom, "onTouchEnd={(event) => {");
    const block = zoom.slice(end, zoom.indexOf("}}", zoom.indexOf("go(", end)));

    expect(block).not.toMatch(/swiped\.current = true/);
  });

  it("clears the flag when the next touch starts, not when a press reads it", () => {
    /* Clearing it inside onPress left it set whenever onPress ran
       first, so the tap after a swipe silently refused to close. */
    const block = zoom.slice(start, at(zoom, "onTouchMove="));
    expect(block).toMatch(/swiped\.current = false/);
  });

  it("uses one threshold for both halves of the gesture", () => {
    /* Two literals could drift into a gap where a drag is neither a
       swipe nor a tap, and the card would just sit there. */
    expect(handlers).not.toMatch(/< 40\b/);
    expect(zoom).toMatch(/const SWIPE = 40;/);
  });
});
