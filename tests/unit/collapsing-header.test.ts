import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * The Feed's header, and the four things it has to do.
 *
 * The founder: "the 'card flare' text at top doesn't need to be glued
 * to the top ... on instagram, when you keep scrolling down, the
 * instagram logo disappears ... when you scroll back up ... it's just
 * blurred background for the header ... the goal is to have maximized
 * viewing space."
 *
 * The maths is worklets, which vitest cannot run, so these read the
 * source for the properties that make the behaviour right — and for the
 * two mistakes that were actually made building it.
 */
const header = await readFile("mobile/src/collapsing-header.tsx", "utf8");
const home = await readFile("mobile/src/screens/home.tsx", "utf8");

describe("what the header does", () => {
  it("overlays the list rather than sitting above it", async () => {
    /* This is where the space comes from. A navigator header is a strip
       ABOVE the screen and the content simply starts lower down, which
       is the thing being replaced. */
    expect(header).toContain('position: "absolute"');
    expect(header).toContain("BlurView");

    const app = await readFile("mobile/App.tsx", "utf8");
    expect(app).toContain("headerShown: false");
  });

  it("moves a pixel of header per pixel of scroll, both ways", () => {
    /* Scrolling down pushes it off; scrolling up brings it back from
       anywhere in the list, which is the part that makes it feel like a
       surface rather than a rule. One clamped accumulator does both. */
    expect(header).toContain("const delta = y - state.lastY.value");
    expect(header).toContain(
      "Math.min(Math.max(next, 0), HEADER_CONTENT_HEIGHT)",
    );
  });

  it("is always whole at the top of the list", () => {
    /* Including past the top on a rubber-band bounce, or a
       pull-to-refresh reveals a half-eaten bar. */
    expect(header).toContain("if (y <= 0)");
  });

  it("never rests half-eaten", () => {
    /* A bar stopped at forty percent is the one state that reads as a
       bug rather than a behaviour. */
    expect(header).toContain("settleHeader");
    expect(home).toContain("onScrollEndDrag={settle}");
    expect(home).toContain("onMomentumScrollEnd={settle}");
  });

  it("runs on the UI thread", () => {
    /* A header driven from JavaScript stutters against the very scroll
       it is following, which reads as cheaper than no animation. */
    expect(header).toContain('"worklet"');
    expect(home).toContain("useAnimatedScrollHandler");
    expect(home).toContain("scrollEventThrottle={16}");
  });
});

describe("the two mistakes made building it", () => {
  it("bounds the ScrollView's height", () => {
    /*
     * A ScrollView sizes to its content unless something bounds it. As
     * the screen's only child it inherited a bound; once the floating
     * header became a sibling it grew to the full height of the feed
     * and simply got clipped — a list with more content than fits and
     * no way to reach it.
     */
    expect(home).toContain("style={{ flex: 1 }}");
  });

  it("puts the search button's position on a wrapper, not on Tap", () => {
    /*
     * Tap applies its `style` to an inner Animated.View rather than to
     * the Pressable, so `position: absolute` there takes the icon out
     * of its own button's flow: the Pressable collapses, stays in the
     * row beside the title, and the glyph lands UNDER the wordmark.
     * Which is what it did.
     */
    const tapIndex = header.indexOf("<Tap");
    const styleOnTap = header.slice(tapIndex, tapIndex + 400);

    expect(styleOnTap).not.toContain('position: "absolute"');
    expect(header).toContain("top: insets.top,");
  });
});

describe("the list makes room for it", () => {
  it("starts its content below the floating bar", () => {
    expect(home).toContain(
      "paddingTop: insets.top + HEADER_CONTENT_HEIGHT + spacing(4)",
    );
  });

  it("hangs the refresh spinner below the bar, not behind it", () => {
    expect(home).toContain(
      "progressViewOffset={insets.top + HEADER_CONTENT_HEIGHT}",
    );
  });

  it("blurs the status bar too", () => {
    /* With the inset as margin above the bar, card text scrolled raw
       behind the clock — legible enough to read, messy enough to
       notice. The frosted surface runs to the very top instead. */
    expect(header).toContain("height: insets.top + HEADER_CONTENT_HEIGHT");
  });
});
