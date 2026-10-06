import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The profile, edge to edge, on both platforms.
 *
 * The founder (2026-10-06): "I'd like the profile to extend all the way
 * over to the edges of the screen, allowing for more space slightly. In
 * the profile it's currently in its own block in a way." So on a phone
 * the block has no border and no corners, the cover meets the screen's
 * sides, the words keep 16 off them, and the Flares grid runs to them.
 * From `sm` up the website keeps its card.
 *
 * Read off the source, comments stripped, so a pin holds the code and
 * not the sentence explaining it.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

const app = {
  own: read("mobile/src/screens/profile.tsx"),
  theirs: read("mobile/src/screens/player-profile.tsx"),
  tabs: read("mobile/src/profile-tabs.tsx"),
  flares: read("mobile/src/profile-flares.tsx"),
};

const web = {
  header: read("src/components/players/profile-header.tsx"),
  own: read("src/app/profile/page.tsx"),
  theirs: read("src/app/p/[playerId]/page.tsx"),
  tabs: read("src/components/players/profile-tabs.tsx"),
};

/** From the profile's own ScrollView to the end of the block it holds. */
function appBlock(source: string): { scroll: string; block: string } {
  const measured = source.indexOf("setBlockBox({");
  expect(measured).toBeGreaterThan(-1);
  const open = source.lastIndexOf("<View", measured);
  const scroll = source.lastIndexOf("<ScrollView", open);
  const end = source.indexOf("<ProfileTabs", measured);
  expect(scroll).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(measured);
  return { scroll: source.slice(scroll, open), block: source.slice(open, end) };
}

describe("the app's profile runs edge to edge", () => {
  it("puts no gutter on either profile's ScrollView", () => {
    for (const source of [app.own, app.theirs]) {
      const { scroll } = appBlock(source);
      expect(scroll).not.toContain("paddingHorizontal");
      expect(scroll).not.toContain("gutter");
    }
  });

  it("draws the block with no border, no corners, and measures the scene off its whole box", () => {
    for (const source of [app.own, app.theirs]) {
      const { block } = appBlock(source);
      expect(block).not.toContain("<Card");
      const box = block.slice(0, block.indexOf("onLayout="));
      expect(box).not.toContain("borderWidth");
      expect(box).not.toContain("borderRadius");
      expect(block).toContain("setBlockBox({ w: width, h: height })");
      expect(block).toContain("corner={0}");
      expect(block).toContain("radius={0}");
      expect(block).toContain("paddingHorizontal: PROFILE_INSET");
    }
    /* Same block on both screens: what you see is what they see. */
    expect(appBlock(app.theirs).block.replace(/\s+/g, "")).toContain(
      appBlock(app.own).block.replace(/\s+/g, "").slice(0, 200),
    );
  });

  it("insets every pane's words but lets the Flares grid meet the sides", () => {
    expect(app.tabs).toContain("export const PROFILE_INSET = spacing(4);");
    expect(app.tabs).toContain('EDGE_TO_EDGE: readonly ProfileTab[] = ["flares"]');
    expect(app.tabs).toMatch(
      /paddingHorizontal:\s*EDGE_TO_EDGE\.includes\(pane\.key\)\s*\?\s*0\s*:\s*PROFILE_INSET/,
    );
    expect(app.flares).toContain("paddingHorizontal: PROFILE_INSET");
    expect(app.flares).toContain("window.width;");
    expect(app.flares).not.toContain("gutter");
  });
});

describe("the website's profile is full-bleed below sm", () => {
  it("drops the border and corners on a phone and keeps the card from sm up", () => {
    const block = /export const PROFILE_BLOCK =\s*"([^"]+)"/.exec(web.header)?.[1];
    expect(block).toBeDefined();
    const classes = (block ?? "").split(" ");
    for (const want of [
      "-mx-2",
      "px-4",
      "sm:mx-0",
      "sm:p-6",
      "sm:rounded-[var(--radius-card)]",
      "sm:border",
      "bg-surface",
    ]) {
      expect(classes, want).toContain(want);
    }
    /* Nothing unprefixed puts the card back on a phone. */
    expect(classes.filter((name) => /^(border|rounded|shadow)/.test(name))).toEqual([]);
  });

  it("draws both profile pages with that one block", () => {
    for (const page of [web.own, web.theirs]) {
      expect(page).toContain("<div className={PROFILE_BLOCK}>");
      expect(page).not.toContain('<Card className="relative flex flex-col');
    }
  });

  it("steps the strip out to the edges and insets the panes' words", () => {
    expect(web.tabs).toContain('className="-mx-4 flex flex-col sm:mx-0"');
    expect(web.tabs).toContain(
      'const EDGE_TO_EDGE: readonly ProfileTab[] = ["flares"]',
    );
    expect(web.tabs).toContain('!EDGE_TO_EDGE.includes(tab) && "px-4 sm:px-0"');
  });
});
