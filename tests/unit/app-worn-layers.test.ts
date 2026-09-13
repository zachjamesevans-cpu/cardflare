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
  /*
   * The zoom is a RAIL now, and the founder walked it there in three
   * goes: "i think you should actually be able to swipe between them.
   * and it's like a smooth animation... right now it just fades to each
   * different card", then "i want my finger to move with the card... it
   * should move 1:1 with my finge[r]", and finally "think of the way
   * multiple pictures in one post work on instagram".
   *
   * What it took was not the ScrollView - that part is one component.
   * It was removing the two things fighting it, both asserted below,
   * because both were invisible in a screenshot and only showed up when
   * a frame was taken mid-drag with the finger still down.
   */

  it("turns the page with a rail that snaps to a card", () => {
    expect(zoom).toContain("<ScrollView");
    expect(zoom).toContain("snapToInterval={page}");
    /* One card per swipe, rather than a flick that skims four. */
    expect(zoom).toContain("disableIntervalMomentum");
    /* The page is a card plus the gap, so a snap lands on art. */
    expect(zoom).toMatch(/const page = hero \+ PEEK_GAP;/);
  });

  it("opens on the card that was tapped, not on the first one", () => {
    expect(zoom).toContain("contentOffset={{ x: position * page, y: 0 }}");
  });

  it("does not let the closer wrap the rail", () => {
    /*
     * THE BUG THAT MADE THE CARDS IMMOVABLE. The backdrop used to be a
     * Pressable around the whole modal, and a Pressable claims the touch
     * the moment a finger lands, so the ScrollView inside it was never
     * handed the pan - a frame shot mid-drag was pixel-identical to the
     * frame at rest. It sits BEHIND now, absolutely filled, with the
     * layer above passing stray taps through to it.
     */
    expect(zoom).toMatch(
      /<Pressable style=\{StyleSheet\.absoluteFill\} onPress=\{close\} \/>/,
    );
    expect(zoom).toMatch(/<View style=\{styles\.zoomFill\} pointerEvents="box-none">/);
  });

  it("lets nothing but the rail turn the page", () => {
    /* There was a second mechanism measuring thumb travel on release and
       calling `go()`. With the rail in place one swipe was acted on
       twice - it scrolled with the finger, then got thrown again. */
    expect(zoom).not.toContain("onTouchMove=");
    expect(zoom).not.toMatch(/const SWIPE = /);
  });

  it("gives the rail a box exactly one card tall", () => {
    /*
     * A horizontal ScrollView does not take a height from its own style
     * here: it grew to 665pt inside a panel that should have been 566,
     * which stretched the panel to 831pt of an 874pt screen and pushed
     * the title up under the dynamic island. Measured off a screenshot,
     * not guessed.
     *
     * Asserted on the CODE - `bare` strips comments, by design, so the
     * paragraph above is not something a guard can anchor to.
     */
    expect(zoom).toMatch(
      /height: Math\.round\(\(hero \* 88\) \/ 63\),\s*\}\}\s*>\s*<ScrollView/,
    );

    /* And the rail fills that box rather than negotiating its own size. */
    const rail = zoom.slice(
      zoom.indexOf("<ScrollView"),
      zoom.indexOf("contentContainerStyle", zoom.indexOf("<ScrollView")),
    );
    expect(rail).toContain("style={{ flex: 1 }}");
  });

  it("says which card you are on with the cards either side, not a counter", () => {
    /* "i dont think the '2 of 6' thing is necessary when viewing a full
       size card... you should be able to see the card to the left of it,
       and the right of, so it contextually tells you that you can
       swipe." */
    expect(zoom).not.toMatch(/\$\{at \+ 1\} of /);
    expect(zoom).toMatch(/const PEEK_WIDTH = \d+;/);
    expect(zoom).toMatch(/paddingHorizontal: sidePad/);
  });

  it("carries no chrome for a gesture that explains itself", () => {
    /*
     * "I still would like to be able to remove the 'arrows' when looking
     * at cards up top. no need to have those. then remove the vertical
     * space that is dead space." The chevrons and the counter before
     * them were both describing a rail you can see and feel, and they
     * cost a row between the title and the art.
     */
    expect(zoom).not.toContain("chevron-left");
    expect(zoom).not.toContain("chevron-right");
    expect(zoom).not.toMatch(/const go = /);
  });

  it("centres the card's own two lines over the card", () => {
    /* "center the text. so, for example, fire first and op15-020 should
       be centered on that screen." */
    expect(zoom).toMatch(/styles\.title, \{ textAlign: "center" \}/);
    expect(zoom).toMatch(/styles\.muted, \{ textAlign: "center" \}/);
  });

  it("still closes on a tap anywhere, including on the card", () => {
    /*
     * The label went to "Tap outside" while the rail was the only thing
     * a touch on the card could do, and the founder asked for the whole
     * behaviour back: "make it so that you can still tap anywhere to
     * close that screen. even though ther's a swipe thing now."
     *
     * A tap and a drag start identically, so the card cannot tell them
     * apart on its own - and React Native does NOT cancel the press for
     * us inside this rail; wrapping the cards in a Pressable and
     * trusting that closed the zoom on every swipe. The RAIL answers it
     * instead: `onScrollBeginDrag` only fires when a finger actually
     * moved it, so a press arriving with that flag down was a tap.
     *
     * `delaysContentTouches` has to be off for the card to hear the tap
     * at all - iOS holds a touch back to decide whether it is a scroll,
     * and a quick tap ended inside that window and reached nothing.
     */
    expect(zoom).toContain("Tap anywhere to close");
    expect(zoom).toContain("delaysContentTouches: false");
    expect(zoom).toContain("{...IMMEDIATE_TOUCHES}");
    expect(zoom).toMatch(/onScrollBeginDrag=\{\(\) => \{\s*scrolled\.current = true;/);
    expect(zoom).toMatch(/if \(scrolled\.current\) return;\s*close\(\);/);
  });
});
