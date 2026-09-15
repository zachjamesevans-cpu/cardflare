import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `Tap` is the app's button, and for a long time it quietly ate half of
 * every style handed to it.
 *
 * It was `<Pressable><Animated.View style={style}>`: the Pressable was
 * the flex child of whatever row it sat in, and `style` went to the view
 * INSIDE it. Anything about how the button sits among its siblings -
 * `flex`, `alignSelf`, `margin` - was applied to a box within a
 * Pressable that had already shrunk to fit its content, so it did
 * nothing at all.
 *
 * That shipped three times. The display name that would not fill its
 * row, the collapsing header, and finally a Feed filter row sitting at
 * half the width of the screen with `flex: 1` on every segment. Each one
 * typechecked, and each was found by somebody looking at a phone.
 *
 * The fix is structural rather than careful: animate the Pressable
 * itself, so there is only one element and no inside for a style to land
 * in by mistake. This test exists so the wrapper cannot come back.
 */
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const ui = read("mobile/src/ui.tsx");
/* The body of Tap alone. Other components in this file animate views
   quite legitimately, and a loose slice would read them as Tap's. */
const start = ui.indexOf("export function Tap({");
const tap = ui.slice(start, ui.indexOf("\nexport ", start + 1));

describe("Tap is the pressable it animates", () => {
  it("animates the Pressable itself", () => {
    expect(ui).toContain(
      "const AnimatedPressable = Animated.createAnimatedComponent(Pressable);",
    );
    expect(tap).toContain("<AnimatedPressable");
  });

  it("puts the caller's style on that one element", () => {
    /* The whole point: `style` and the press transform land together, on
       the element that is also the flex child. */
    expect(tap).toMatch(/style=\{\[style, \{ transform: \[\{ scale \}\] \}\]\}/);
  });

  it("no longer wraps an inner Animated.View", () => {
    /* The regression, named. A wrapper here is how `flex: 1` stops
       meaning anything, in a way nothing else in the run can see. */
    expect(tap).not.toContain("<Animated.View");
  });

  it("keeps the styles that only a parent can honour working", () => {
    /*
     * The call sites that were broken by the old shape, so the fix is
     * pinned by the things it fixed rather than by its own mechanics.
     * Each of these asks to share a row evenly or to fill one; under the
     * wrapper every one of them sized to its own text instead.
     */
    for (const [path, needle] of [
      ["mobile/src/feed-filter-tabs.tsx", "flex: 1"],
      ["mobile/src/profile-header.tsx", "flex: 1"],
      ["mobile/src/screens/post-flare.tsx", "flex: 1"],
    ] as const) {
      const source = read(path);
      /* Some files hold several Taps; one of them has to be asking to
         share its row. */
      const asks = [...source.matchAll(/<Tap\b/g)].some((m) =>
        source.slice(m.index, m.index + 700).includes(needle),
      );
      expect(asks, `${path} no longer has a Tap asking for ${needle}`).toBe(true);
    }
  });
});
